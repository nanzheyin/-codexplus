# Issue #1194 回复草稿

以下是 https://github.com/BigPizzaV3/CodexPlusPlus/issues/1194 的评论，可直接粘贴到 GitHub。

---

@xuweibing233 这个报错现在有完整的解决方案了。我和 @kanchengw 分别提了两个 PR 专门解决纯文本模型遇到图片和 reasoning 的问题：

👉 我的 PR：**https://github.com/BigPizzaV3/CodexPlusPlus/pull/1468**
👉 @kanchengw 的 PR：**https://github.com/BigPizzaV3/CodexPlusPlus/pull/1405**

### 现在可以做什么

**方案一：静默丢弃图片（strip）**

在 Codex++ 的供应商配置 → 模型列表中，给 DeepSeek-V4-pro 勾选「只支持文本」。之后 Codex++ 会在转发前自动丢掉所有 `input_image` 块，不会再报 `unknown variant image_url`。

> 注意：该功能仅对 **Chat Completions 协议**的中转生效。如果你用的是 Responses 协议（直连），则不会经过代理，图片原样发给上游。

**方案二：让视觉模型帮你"看图说话"（VL 中转）**

如果你不想丢图片，而是想让模型"看懂"图片内容：

1. 在 Codex++ 设置 → 视觉模型中转（VL）→ 启用
2. 配置一个支持图片的视觉模型（如 Qwen-VL-Plus、GPT-5.5 等）
3. 给 DeepSeek-V4-pro 勾选「只支持文本」

之后 Codex++ 会：
- 拦截请求中所有的图片
- 调用 VL 模型描述图片内容（带你的提问文字一起发给 VL，让描述更精准）
- 把文字描述替换图片，再交给 DeepSeek-V4-pro

这样纯文本模型也能"看懂"图片了，而且之前被图片污染的会话也能恢复（图片被替换为文字描述）。

### 和 @kanchengw 的 PR #1405 的关系

我们分别独立实现了同系列的功能，殊途同归：
- #1405 功能更全面（含 LRU 缓存、历史多轮分析、并发控制），适合深度使用
- #1468 更精简（单次处理、无新依赖），适合快速合并

两个实现的核心思路一致——在 proxy 层拦截图片 → 调 VL 描述 → 替换为文字。最终合并哪个由维护者决定，但对用户来说效果是一样的：纯文本模型不再报错，图片可被视觉模型描述替代。

### 总结

| 你的问题 | 现在的状态 |
|---------|-----------|
| DeepSeek-V4-pro 上传图片报 `unknown variant image_url` | ✅ 勾选「只支持文本」即可解决 |
| 想保留图片信息、让模型看懂图 | ✅ 配置 VL 视觉模型中转即可 |
| 之前被图片污染的会话 | ✅ 开启 VL 后，代理会自动替换图片为文字描述 |

---

@BigPizzaV3 两个 PR 解决的是同类问题，方便协调合并。
