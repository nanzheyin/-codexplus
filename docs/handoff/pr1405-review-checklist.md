# BigPizzaV3 对 PR #1405 的 Review 意见 — 对照检查 strip-images-feature

> 维护者 BigPizzaV3 在 #1405 提了 6 条阻塞意见。以下逐条对照检查我们的分支是否需要修改。

---

## Review 1：Responses 模式不经过代理，VLM 不会执行

**维护者原话**：
> 普通 Responses 供应商不会经过本地 57321 代理，因此 UI 虽然允许开启 VLM，但 VLM 逻辑实际不会执行。当前代理只在 Chat Completions 或聚合模式启动。请明确支持范围：要么让启用 VLM 的 Responses 配置也经过代理，要么限制 UI 并明确说明仅支持 Chat/聚合模式。

**#1405 的处理**：UI 侧对 `protocol === "responses" && !isAggregateRelayProfile` 的配置禁用 VLM checkbox + tooltip 提示。

**我们的状态**：✅ 已处理

- Response 格式纯透传，不经过 proxy，VL 不会触发——这是我们明确的设计决策
- 前端已加注释："以下仅在选择 Chat Completions 协议时生效"
- VL 设置区的协议 tab 也加了提示："仅 Chat Completions 格式的请求会触发 VL 处理"
- **不需要额外修改**

---

## Review 2：HTTP 请求没有超时

**维护者原话**：
> VLM HTTP 请求没有显式连接、响应头和总超时。VLM 服务不返回时，整个 Codex 请求以及聚合故障切换都会一直等待。请增加有界超时和可诊断的错误处理。

**#1405 的处理**：连接超时 5s + 单请求超时 30s + 总超时 120s（tokio::select!）

**我们的状态**：⚠️ 需要修改

当前 `describe_image_with_vl` 使用 `proxied_client(user_agent)` 创建的 reqwest client，没有显式设置超时。如果 VL API 不响应，整个请求会一直挂起。

**需要改**：给 `describe_image_with_vl` 中的 HTTP client 加超时：

```rust
let client = crate::http_client::proxied_client(user_agent)?
    .timeout(Duration::from_secs(30));  // 或从 vl_config 读取
```

**严重程度**：中等。如果用户 VL 配置的 API 地址不可达，会导致 Codex 卡死。

---

## Review 3：历史图片处理

**维护者原话**：
> 当前只分析最新用户消息，却会删除所有历史图片。VLM 描述只存在于本次转发请求，没有写回 Codex 会话；下一轮追问历史图片时，原图和描述都会丢失。需要缓存/重放历史图片描述，或者重新分析历史图片，不能直接静默删除。

**#1405 的处理**：两阶段分析 + LRU 缓存（500 条，24h TTL）+ 历史轮次分析 + X-governed 注入预算

**我们的状态**：⚠️ 部分处理

- 当前实现：context_window 窗口内的图调 VL → 替换为文字描述；窗口外的图直接 strip。每次请求独立处理
- **没有**历史图片缓存机制
- **没有**将 VL 描述写回 Codex 会话

**实际影响**：
- 如果用户开了新会话，只有当前轮有图 → 没问题
- 如果用户在旧会话里追问之前发过的图 → VL 描述已经丢失（上一轮被替换为文字后，Codex 会话里存的还是原 input_image，但这次不会再调 VL 去描述了？不对——每次请求都重新走 proxy，每次都会重新调 VL 描述窗口内的图。所以只要图片还在 context_window 范围内，每次请求都会重新 VL 描述）

**重新审视**：我们的实现实际上是"每次都重新调 VL"，而不是"缓存+复用"。这意味着：
- ✅ 同一个会话里的图片，只要在 context_window 内，每次请求都会重新 VL 描述（不会丢失）
- ❌ 但每次都重新调 VL，浪费费用（没有缓存）
- ❌ context_window 外的图片直接 strip，如果用户滚动到更早的图片，会丢失

**要不要改**：这取决于定位。我们的方案偏"轻量"，如果用户期望的是"完整的历史图片处理"，需要加缓存。目前可以标注为已知局限。

---

## Review 4：全部失败判断不可达

**维护者原话**：
> analyze_all 的"全部失败"判断目前不可达：每个失败批次也会向 results 写入错误字符串，因此 results.is_empty() 不会成立。结果是原图被删除，原始 VLM 错误正文被注入提示词，然后请求仍继续发送。请明确采用 fail-closed、保留原图或结构化占位策略，并避免把完整上游错误正文注入模型上下文。

**#1405 的处理**：改为 fail-closed（全部失败 → 保留图片），错误正文截断 256 chars

**我们的状态**：✅ 不受此问题影响

我们的实现不涉及 `analyze_all` 的批量失败判断逻辑。`apply_vl_with_fallback` 的设计是：
- VL 成功 → 返回 `(true, vl_body)` → 后续 strip no-op
- VL 失败 → 返回 `(false, original_body)` → 降级 strip（丢弃图片）

这个逻辑是二元成功/失败，不存在"部分失败写入错误字符串导致全部失败判断不可达"的问题。VL 错误信息记录在诊断日志中，不会注入模型上下文。

**不需要修改**。

---

## Review 5：UI 校验 — Key/Model/URL 为空时静默跳过

**维护者原话**：
> 开启 VLM 后，Key、模型或 Base URL 为空时后端会静默跳过处理，用户仍会看到开关已开启。请在保存和运行时增加校验及明确错误提示。VLM API Key 输入框也应使用 password 类型。

**#1405 的处理**：
- 前端：Key/Model/URL 任一为空时显示警告"VLM 配置不完整"
- API Key 输入框改为 `type="password"`

**我们的状态**：⚠️ 需要修改

当前前端 VL 设置区的 API Key 输入框需要检查是否用了 password 类型。另外，VL 配置不完整时的提示可以加强。

**需要改**：
1. VL API Key 输入框改为 `type="password"`
2. 可选：保存时如果 enabled=true 但 key/model/url 为空，显示警告

让我确认一下当前的 API Key 输入框类型：

**严重程度**：低（UI 体验优化）。

---

## Review 6：并发/图片上限/错误截断

**维护者原话**：
> join_all 会同时启动所有图片批次，没有图片数量、并发数和错误响应体大小限制，可能造成突发费用和内存/上下文膨胀。请增加有界并发、图片上限和错误正文截断。

**#1405 的处理**：单请求并发 3 + 全局 5 + batch_size 5 + 图片上限 10 + 深度 50 轮 + 错误截断 256

**我们的状态**：⚠️ 部分处理

- 当前实现：`analyze_images_with_vl` 对窗口内的图片逐张串行调 VL（for 循环），没有并发。**慢但安全**
- 图片数量通过 `context_window` 间接限制（token 预算），没有显式的图片数量上限
- 没有错误正文截断

**需要改**：可以在 VL 处理前加一个图片数量上限（如 10 张），超出部分直接 strip。错误正文截断也可加。

**严重程度**：中等。如果用户一次发很多图片，串行调 VL 会很慢；没有数量上限可能造成费用问题。

---

## 总结：我们需要改的地方

| 优先级 | Review 条目 | 当前状态 | 需要改吗 |
|--------|-----------|---------|---------|
| 🔴 高 | Review 2：HTTP 超时 | ❌ 无超时 | **必须改** — VL API 不可达会导致 Codex 卡死 |
| 🟡 中 | Review 6：图片数量上限 | ⚠️ 仅 context_window 间接限制 | **建议改** — 加显式图片数量上限（如 10 张） |
| 🟡 中 | Review 6：并发控制 | ✅ 串行无并发问题 | 不需要 — 串行虽慢但安全 |
| 🟢 低 | Review 5：API Key 密码框 | ⚠️ 待确认 | **建议改** — 体验优化 |
| 🟢 低 | Review 5：配置不完整警告 | ⚠️ 待加强 | 可选 — 目前 enabled=false 时不检查 |
| ✅ 已满足 | Review 1：Response 模式限制 | ✅ 已标注 | 不需要 |
| ✅ 已满足 | Review 3：历史图片 | ✅ 每次重调 VL | 不需要（设计差异） |
| ✅ 已满足 | Review 4：失败判断不可达 | ✅ 二元成功/失败 | 不需要 |

**核心要改的只有 3 处**：加 HTTP 超时、加图片数量上限、API Key 输入框改 password 类型。