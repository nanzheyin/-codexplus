# 纯文本模型图片处理方案设计

> 日期：2026-07-09
> 关联 Issue：[#1194](https://github.com/BigPizzaV3/CodexPlusPlus/issues/1194)（Bug）、[#1191](https://github.com/BigPizzaV3/CodexPlusPlus/issues/1191)（Feature）
> 状态：调研 + 设计，待实施

## 一、背景

Codex++ 原生面向 GPT-5.5（支持视觉）。但用户常配置纯文本模型（DeepSeek V4、GLM-5.2 等），这些模型不支持 `image_url` 输入，运行中出现两类问题：

1. **主动插图报错**：用户在对话框上传图片，模型返回 JSON 解析异常。
2. **模型自截图报错**：Codex 在视觉识别任务中会自己截图并发回对话框，纯文本模型同样无法处理。

Issue #1194 的报错为：

```
Failed to deserialize the JSON body into the target type: messages[4]: unknown variant `image_url`, expected `text`
```

维护者 BigPizzaV3 在两个 Issue 中均建议：按供应商/模型配置 `strip_images`，在转发前移除或替换图片 block；不要全局默认移除，以免影响支持多模态的上游。

## 二、根因分析

报错根源在 Responses -> Chat Completions 的协议转换层。

关键文件：`crates/codex-plus-core/src/protocol_proxy.rs`

转换函数 `responses_content_to_chat_content`（L2161）把 Responses API 的 `input_image` 块转成 Chat Completions 的 `image_url` content block：

```rust
// protocol_proxy.rs L2187-2195
"input_image" => {
    if let Some(image_url) = part.get("image_url") {
        let image_url = if image_url.is_object() {
            image_url.clone()
        } else {
            json!({ "url": image_url.as_str().unwrap_or_default() })
        };
        chat_parts.push(json!({ "type": "image_url", "image_url": image_url }));
        has_non_text_part = true;
    }
}
```

DeepSeek V4 这类纯文本模型不接受 `image_url` 格式，反序列化失败。

**关键观察：两个触发场景共用同一条转换路径。** 用户主动插图的图片、以及模型自截图的图片，都作为 `input_image` 进入 Responses API 请求，再经转换层处理。因此在转换层统一处理即可同时覆盖两个场景，无需分两套逻辑。

## 三、架构与数据流

### 3.1 调用链

```
Codex App 发送 Responses API 请求
  -> open_responses_proxy_request_with_settings_and_user_agent  (async, L496)
       -> relay_rotation::select_relay_for_request  -> 得到 RelayProfile
       -> upstream_request_parts(relay, request_json)  (L735, 同步)
            match relay.protocol:
              Responses      -> 透传 request_json
              ChatCompletions -> responses_to_chat_completions(request_json)  (L133)
                                  -> append_responses_input(input, &mut messages)
                                       -> responses_content_to_chat_content(role, content)  (L2161)
                                            input_image -> image_url  ← 报错点
```

### 3.2 关键代码位置

| 位置 | 文件 | 行号 | 说明 |
|------|------|------|------|
| 主转换入口 | `protocol_proxy.rs` | L133 | `responses_to_chat_completions(body: Value) -> Result<Value>`，目前只接收 body |
| 协议分流 | `protocol_proxy.rs` | L735 | `upstream_request_parts(relay, request_json)`，**同时持有 relay 和 model** |
| 图片转换 | `protocol_proxy.rs` | L2161 | `responses_content_to_chat_content(_role, content)`，`_role` 未使用 |
| 图片块处理 | `protocol_proxy.rs` | L2187 | `input_image` -> `image_url`，注入点 |
| 唯一调用点 | `protocol_proxy.rs` | L1978 | `append_responses_input` 内 `_` 分支调用转换函数 |
| RelayProfile | `settings.rs` | L43 | 中转配置结构体 |
| per-model 先例 | `settings.rs` | L89 | `model_windows: String`（JSON map，PR #1197） |
| 协议枚举 | `settings.rs` | L155 | `RelayProtocol::Responses \| ChatCompletions` |
| 前端 per-model UI | `App.tsx` | L4218 | `modelWindowRows` 表格（模型名 / 上下文窗口 / 删除） |
| 前端 map 工具 | `model-windows.ts` | L1 | map <-> 文本表格互转 |
| 供应商预设 | `presets.ts` | L40 | DeepSeek 走 `chatCompletions`，含 `deepseek-v4-pro` |
| 原生模型目录 | `codex-models.json` | - | GPT-5.5 有 `input_modalities: [text, image]` |
| 自定义模型目录 | `model_catalog.rs` | - | 无任何图片能力字段 |

### 3.3 重要分层区分

- `model_windows` / `context_window` 作用于 Codex 读取的 `config.toml`（由 `relay_config.rs` 写入），影响 Codex App 自身的上下文截断行为。
- 图片转换发生在 `protocol_proxy` 层，拦截的是 Codex 发出的真实 API 请求。
- 两者是不同层，不要混淆。本方案的注入点在 protocol_proxy 层。

## 四、实施方案

按「止血压错 -> 图片理解增值」分三层，可独立实施、可叠加。

### 路径 A：strip_images 防错（MVP，优先实施）

在转换 `input_image` 时，若目标模型不支持图片，替换为文本占位 `[图片已省略]` 或直接丢弃。

#### A.1 后端改动

**第一步：线程化模型能力。** `upstream_request_parts` 同时持有 `relay` 与 `request_json`，可据此判断目标模型是否支持图片。需把判断结果沿调用链传下去：

```rust
// protocol_proxy.rs L735 upstream_request_parts 改造
fn upstream_request_parts(
    relay: &crate::settings::RelayProfile,
    request_json: Value,
) -> anyhow::Result<(String, Value, UpstreamWireApi)> {
    let model = request_json
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("");
    let supports_image = model_supports_image(relay, model); // 新增
    match relay.protocol {
        RelayProtocol::Responses => Ok((..., request_json, ...)),
        RelayProtocol::ChatCompletions => Ok((
            chat_completions_url(&relay.base_url),
            responses_to_chat_completions(request_json, supports_image)?, // 加参数
            UpstreamWireApi::ChatCompletions,
        )),
    }
}
```

签名链路改动（逐层加 `supports_image: bool` 参数）：

1. `responses_to_chat_completions(body: Value)` -> `(body: Value, supports_image: bool)`（L133）
2. 内部调用 `append_responses_input(input, &mut messages)` -> 加 `supports_image`
3. `append_responses_input` 内 L1978 调用 `responses_content_to_chat_content(role, content)` -> 加 `supports_image`
4. `responses_content_to_chat_content(_role, content)` -> `(role, content, supports_image)`（L2161）

注意：`responses_to_chat_completions` 还有其他调用方（如 `chat_completion_to_response` 系列是反向，不涉及；但需全局搜索确认所有调用点都补上参数，可用默认 `true` 兼容多模态）。

**第二步：转换分支替换。** 在 `responses_content_to_chat_content` 的 `input_image` 分支：

```rust
"input_image" => {
    if supports_image {
        // 原逻辑：转成 image_url
        if let Some(image_url) = part.get("image_url") { ... }
    } else {
        // 纯文本模型：替换为占位文本，不设置 has_non_text_part
        chat_parts.push(json!({ "type": "text", "text": "[图片已省略]" }));
    }
}
```

不设 `has_non_text_part` 时，content 会自动坍缩为纯字符串（见 L2199-2205），正好符合纯文本模型对 `content: string` 的期望。

#### A.2 配置设计

两种粒度，建议 MVP 先做 profile 级，进阶做 per-model：

**MVP - profile 级开关：**

```rust
// settings.rs RelayProfile 新增字段
#[serde(rename = "stripImages", default)]
pub strip_images: bool,
```

`model_supports_image(relay, model)` 逻辑：`!relay.strip_images`。简单直接，匹配 owner 在 Issue 里的建议。

**进阶 - per-model 能力 map（复用 model_windows 先例）：**

```rust
// settings.rs RelayProfile 新增字段
#[serde(rename = "modelImageSupport", default, skip_serializing_if = "String::is_empty")]
pub model_image_support: String, // JSON map: { "deepseek-v4-pro": false, "glm-5.2": false }
```

`model_supports_image(relay, model)` 逻辑：查 map，未配置默认 `true`（支持图片）。这样同一供应商下视觉模型与文本模型可共存。

> 注意：Responses 透传路径（非 ChatCompletions）下 `input_image` 不经转换，会原样传给上游。若需覆盖纯文本模型走 Responses API 的情况，要在透传分支也做 strip。但 DeepSeek/GLM 均走 ChatCompletions，属边缘情况，可列为后续。

#### A.3 前端改动

若做 profile 级开关：在 `App.tsx` 中转编辑器表单加一个 checkbox/toggle，绑定 `stripImages` 字段。

若做 per-model：复用 `modelWindowRows` 表格（App.tsx L4218），在「模型名称 / 上下文窗口」旁加一列「图片支持」复选框，数据结构扩展 `ModelWindowRow` 加 `imageSupport: boolean`，序列化进 `modelImageSupport` map。

### 路径 B：视觉模型中转（图片理解，进阶）

不丢弃图片，而是调 VL 模型（Kimi 2.6 / MiniMax M3 / Qwen-VL 等）做 OCR + 描述，把文本注入回 prompt。三个落点：

#### B.1 内嵌进 Codex++ 内核（推荐进阶方案）

**核心洞察：避免把 `responses_to_chat_completions` 改成 async。** 该函数是同步的，但其调用方 `upstream_request_parts` 又被 async 函数 `open_responses_proxy_request_with_settings_and_user_agent`（L496）调用。因此把 VL 预处理放在 async 外层即可：

```
async 上层：
  request_json = analyze_images_with_vl(request_json, vl_config).await  // 新增 async 预处理
  upstream_request_parts(relay, request_json)  // 同步转换，此时图片已变文本
```

`analyze_images_with_vl` 遍历 `request_json["input"]`（或 ChatCompletions 的 `messages`）中的 `input_image` 块，调 VL API 拿描述，替换为 `input_text` 块。替换后再走原有同步转换，`input_text` 自然转成 `text`，纯文本模型可接受。

VL 配置进 RelayProfile 或全局 BackendSettings：

```rust
pub struct VisionRelayConfig {
    pub enabled: bool,
    pub api_key: String,
    pub model: String,      // 如 "qwen-vl-plus"、"kimi-2.6"
    pub base_url: String,
}
```

难点：流式请求的图片处理时机、VL 调用失败时的降级（退化为 strip）、data URL base64 图片的体积控制。

技术栈：Rust + 已有 reqwest/tokio 依赖，无需新增。

#### B.2 外部网关（零侵入替代）

单独跑一个代理，Codex++ 把 base_url 指向它，网关拦截含图片请求、调 VL、替换后转发上游。Codex++ 零改动。

现成项目：[kanchengw/image-router](https://github.com/kanchengw/image-router)，Python + FastAPI + httpx，同时处理 `messages` 和 `input` 两种 key（ChatCompletions 与 Responses 两条路径都覆盖），默认 Qwen-VL-Plus。集成只需把 Codex++ base_url 指向 `http://127.0.0.1:23456`。

缺点：多一个进程要安装维护，VL key 单独配，不适合打包进 Codex++ 发行版。适合快速验证 VL 中转实用性。

#### B.3 Codex 插件/skill

在 agent 层面，遇到图片任务时用工具调 VL 模型、结果以文本回灌（Issue 评论提及的 claude-vision-skill 思路）。Codex++ 有 `user_scripts.rs` / `plugin_marketplace.rs` 脚本/插件基础设施可挂载。

局限：依赖 agent 主动调用，行为不如 B1/B2 确定，适合「按需识图」而非「自动兜底所有图片」。

### 路径 C：配置 UI 标记（A/B 的前端载体）

即 A.3 / B.1 的配置界面。在模型配置界面给能力做标记（勾选「图片理解」「视频理解」），驱动 A 的 strip 决策和 B 的中转。复用 `modelWindowRows` 表格 UI 加复选框列即可。或做成独立插件配置、不走 Codex++ 配置页。此层非独立方案，是 A/B 的配置前端。

## 五、技术栈与工作量

| 路径 | 技术栈 | 工作量 | 风险 |
|------|--------|--------|------|
| A strip_images | Rust（protocol_proxy + settings）+ React | 约 2-3 天 | 低 |
| B1 内嵌 VL 中转 | Rust + reqwest/tokio（async 预处理） | 约 4-6 天 | 中（流式 + 错误降级） |
| B2 外部网关 | Python FastAPI（现成 image-router） | 半天（集成 + 文档） | 低，但多进程 |
| B3 插件/skill | 脚本/插件机制 | 2-4 天 | 中（依赖 agent） |
| C 配置 UI 标记 | React（复用 modelWindowRows） | 0.5-1 天 | 低 |

## 六、验证方法

- **单元测试**：在 `crates/codex-plus-core/tests/protocol_proxy.rs` 新增用例，参考现有 `responses_request_converts_to_chat_completions` 测试模式。构造含 `input_image` 的 Responses body，分别验证 `supports_image=true`（保留 image_url）和 `false`（替换为占位文本、content 坍缩为字符串）。当前测试文件无图片用例，需新增。
- **集成验证**：配置 DeepSeek-v4-pro（chatCompletions 协议），开启 strip_images，上传图片应不再报错；模型自截图场景同理。
- **回归**：对 GPT-5.5 等多模态模型，确认 `supports_image=true` 时图片仍正常传递。

## 七、实施顺序建议

1. **先做 A + C**：strip_images 防错 + 配置 UI 标记。这是 owner 在两个 Issue 明确建议的方向，工作量小、风险低，立刻让 #1194 不再报错，因两场景共用转换路径而全覆盖。
2. **再做 B1**：给纯文本模型补「看图」能力。A 与 B1 可叠加--模型不支持图片时走 VL 中转，VL 不可用时退化为 strip。这个 fallback 链路在 `upstream_request_parts` 串联：先尝试 VL 预处理，失败则 strip。
3. **B2 作为快速验证**：若想先验证 VL 中转效果再决定是否内嵌，直接拿 image-router 跑，改 base_url 即可，不动 Codex++ 内核。

## 八、风险与注意事项

- `responses_to_chat_completions` 改签名后，需全局搜索所有调用点补参数（`rg "responses_to_chat_completions"`），多模态默认 `true` 兼容。
- Responses 透传路径的图片不经过转换，A 的 MVP 仅覆盖 ChatCompletions 路径；若要全覆盖需在透传分支也加 strip。
- VL 中转（B1）会增加请求延迟（多一次 VL API 往返），需考虑超时与用户感知。
- base64 data URL 图片体积大，VL 调用前需做体积控制（image-router 有 4MB 阈值参考）。
- per-model 配置 map 的序列化要兼容旧配置文件（`#[serde(default)]`）。
