# Codex App 会话切换性能治理架构计划

日期：2026-07-16

状态：讨论稿，待继续确认；**本文档不授权开发，不包含产品代码修改。**

## 1. 业务问题与已确认现象

用户反馈的对象是 Codex App 本体，不是 Codex Deck 管理器：

- 从侧边栏切换到另一条会话后，聊天内容显示较慢。
- 重启 Codex Deck 和 Codex App 后会暂时变快。
- 使用一段时间后，切换会话会再次逐渐变慢。

这组现象说明问题更接近“运行时资源或监听器持续累积”，而不是固定的网络延迟或单个会话首次加载时间。

## 2. 明确依据、合理推断与待确认项

### 2.1 代码与现场明确依据

2026-07-16 在当前 Windows 环境完成只读检查，得到以下证据：

1. Codex 调试端口当时有约 20 个 CDP target，其中 3 个为 page target。
2. `codex-plus-plus` 到同一 CDP 调试端口存在 77 条 `ESTABLISHED` 连接。
3. `bridge::install_bridge` 每次安装都会：
   - 新建 CDP WebSocket；
   - 执行 `Runtime.enable` 和 `Runtime.addBinding`；
   - 注入 bridge 及渲染脚本；
   - 使用 `tokio::spawn` 启动长期监听任务；
   - 返回时不保留可供上层取消、替换和等待退出的任务句柄。
4. bridge watchdog 每 5 秒检查一次健康状态；检查失败时会重新执行注入。
5. 重注入没有显式执行以下生命周期操作：
   - 取消并等待旧 bridge 任务退出；
   - 关闭旧 WebSocket；
   - 按 target 保证唯一 bridge；
   - 移除旧的 `Page.addScriptToEvaluateOnNewDocument` 注册项。
6. 诊断日志 `~/.codex-session-delete/codex-plus.log` 当时约为 3.56 GB。
7. 10 秒观测窗口内日志增长 328,084 字节，约 32.04 KiB/s。
8. 最近有效样本约 49.56 秒内产生 4,290 条事件，约 86.55 条/秒。
9. 高频 bridge 路径包括：
   - `/diagnostics/log`
   - `/backend/status`
   - `/codex-model-catalog`
10. 当前日志实现会在每次事件发生时同步打开文件并追加一行，没有文件大小上限和轮转策略。
11. 当前启用的页面增强包括：
   - 切换对话保留位置；
   - 宽屏对话；
   - 项目移动；
   - 服务档位控件。
12. `renderer-inject.js` 使用全局 `MutationObserver` 监听 `document.body` 的子树变化，并在相关变化后运行统一扫描流程。
13. 宽屏对话另有一个全局 `MutationObserver`，每次变化会安排最多 16 帧布局校正，并每 350ms 轮询一次。
14. 滚动恢复会在会话切换后的 `0 / 80 / 220 / 500 / 1000 / 1800 / 2800ms` 多次尝试同步和恢复。

关键代码位置：

- `crates/codex-plus-core/src/bridge.rs`
- `crates/codex-plus-core/src/launcher.rs`
- `crates/codex-plus-core/src/diagnostic_log.rs`
- `crates/codex-plus-core/src/routes.rs`
- `assets/inject/renderer-inject.js`
- `apps/codex-plus-launcher/src/main.rs`

### 2.2 基于证据的高可信推断

当前最可能存在两层放大：

```text
旧 bridge 连接未回收
  -> 同一 Runtime binding 事件被多条 CDP 会话接收
  -> 同一前端请求被重复处理
  -> 重复执行业务、Runtime.evaluate 和诊断日志写入
  -> Codex 渲染主线程与本地磁盘持续承压
```

同时，会话切换本身会产生大量 DOM 变化：

```text
Codex 原生会话内容开始挂载
  -> 全局 MutationObserver 触发
  -> 统一扫描多个无关功能
  -> 宽屏布局连续校正
  -> 滚动恢复多轮重试
  -> 与 Codex 原生首屏渲染竞争主线程
```

“重启后暂时恢复、使用后逐渐变慢”与 bridge、脚本注册、观察器或任务累积的特征一致。

### 2.3 尚未完全证明的部分

以下结论仍需通过专项基准或跟踪确认，不能仅凭当前证据直接宣称：

- 77 条连接中每一条是否都在处理同一个 binding 请求。
- bridge 重复处理、日志写入和 DOM 扫描各自占会话切换延迟的比例。
- 不经 Codex Deck 直接启动官方 Codex 时的稳定基线。
- 会话长度、图片数量、代码块数量和 SQLite 数据规模对原生加载时间的影响。
- 宽屏对话与滚动恢复关闭后，用户感知延迟可以降低多少。

## 3. 目标与非目标

### 3.1 目标

1. 一个 Codex page target 在任意时刻最多拥有一个有效业务 bridge。
2. 重注入必须替换旧运行时，不能新增无法回收的长期任务。
3. 空闲心跳和成功路径不能持续制造高频日志或高频磁盘写入。
4. Codex 原生会话首屏渲染拥有最高优先级，增强功能必须延后且按需执行。
5. 关闭的增强功能不注册观察器、不扫描 DOM、不启动定时器。
6. 会话增强按功能隔离，单个功能失效不能拖慢整个页面。
7. 建立可重复的性能基线，能够区分官方 Codex、bridge 和页面增强各自的成本。
8. 保留现有供应商切换、协议代理、会话管理和可选页面增强能力。

### 3.2 非目标

- 不重写 Codex 官方应用内部的 React、状态管理或会话存储实现。
- 不修改官方 Codex 的 `app.asar`。
- 不在本任务中改造 Codex Deck 管理器视觉界面。
- 不在本任务中调整按模型上下文窗口功能。
- 不删除或迁移用户会话数据。
- 不自动删除当前 3.56 GB 诊断日志；清理现有日志属于单独的用户确认操作。
- 在没有官方 Codex 基线证据前，不把所有延迟都归因于 Codex++。

## 4. 推荐总体架构

```text
┌──────────────────────── Codex Renderer ────────────────────────┐
│ Codex 原生渲染                                                  │
│   │                                                             │
│   ├─ 唯一 JS bridge binding                                     │
│   └─ Feature Runtime Registry                                   │
│        ├─ Sidebar Session Actions                               │
│        ├─ Thread Scroll Restore                                 │
│        ├─ Conversation Width                                    │
│        ├─ Service Tier Controls                                 │
│        └─ Plugin / Model Enhancements                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │ 1 target : 1 connection
                              v
┌────────────────────── BridgeSupervisor ─────────────────────────┐
│ target id / generation / state                                  │
│ CDP actor task + command channel                                 │
│ shutdown signal + JoinHandle                                    │
│ health state + reconnect policy                                 │
└─────────────────────────────┬───────────────────────────────────┘
                              v
┌──────────────────── Application Services ───────────────────────┐
│ settings / sessions / model catalog / runtime commands          │
└─────────────────────────────┬───────────────────────────────────┘
                              v
┌──────────────────── Bounded Diagnostic Pipeline ────────────────┐
│ event policy -> bounded queue -> buffered writer -> rotation     │
└─────────────────────────────────────────────────────────────────┘
```

## 5. BridgeSupervisor 设计

### 5.1 单一所有权

启动器必须持有 bridge 的完整生命周期，而不是由 `install_bridge` 创建脱离上层控制的后台任务。

建议运行时状态：

```text
BridgeRuntime
├─ target_id
├─ websocket_url
├─ generation
├─ shutdown_sender
├─ task_handle
├─ state: starting | healthy | reconnecting | stopped
└─ registered_script_ids
```

规则：

- 相同 target 的并发 `ensure_bridge` 必须合并为一次操作。
- target 不变且 bridge 健康时，不重新连接、不重新注入。
- target 变化或连接失效时，先通知旧任务退出，再等待其结束，最后创建新任务。
- 退出时尽量发送 WebSocket close frame；即使 close 失败，也必须释放 socket 和任务。
- 旧 generation 收到的请求必须丢弃，不能再执行业务或写成功日志。

### 5.2 CDP actor

推荐由一个任务独占 CDP WebSocket，通过有界 channel 接收命令：

```text
BridgeCommand
├─ Evaluate
├─ AddNewDocumentScript
├─ RemoveNewDocumentScript
├─ HealthCheck
└─ Shutdown
```

这样可以保证：

- 所有 CDP command id 在一个连接内统一分配。
- 健康检查复用现有连接，不再每 5 秒创建新 WebSocket。
- binding 事件和主动命令不会由多个任务竞争同一个 socket。
- 队列满时可以返回明确错误，而不是无限积压。

### 5.3 注入脚本生命周期

- 保存 `Page.addScriptToEvaluateOnNewDocument` 返回的 identifier。
- 替换 bridge 时执行 `Page.removeScriptToEvaluateOnNewDocument` 移除旧注册。
- 页面内设置带 generation 的 sentinel，避免相同脚本重复安装监听器和观察器。
- 新 generation 启动后，旧 generation 的回调、定时器和 observer 必须统一 cleanup。
- watchdog 只负责声明“需要恢复”，实际连接和替换统一交给 BridgeSupervisor。

## 6. 诊断日志架构

### 6.1 当前问题

当前每个 bridge 请求可能产生：

```text
bridge.request
业务事件或 renderer 事件
bridge.response
bridge.resolve_start
bridge.resolve_ok
```

其中 `/diagnostics/log` 本身也会触发 bridge 包装日志，形成明显的日志放大。成功心跳、成功 resolve 和高频扫描状态不应该默认逐条落盘。

### 6.2 推荐设计

1. 使用一个长期 writer 复用文件句柄和缓冲区。
2. 生产者使用有界非阻塞队列；队列满时丢弃低优先级事件并累计 dropped 计数。
3. 错误、状态变化、重连和用户主动操作保留完整日志。
4. 成功心跳只在状态发生变化时记录。
5. `/diagnostics/log` 不再记录完整的 bridge request/resolve 包装事件。
6. 重复错误按事件名和关键维度在时间窗口内聚合。
7. 达到大小上限后轮转，保留数量可配置。
8. 应用退出或严重错误时执行有限时间的 flush。

推荐默认值，仍待用户确认：

```text
单文件上限：10 MiB
保留文件数：3
低优先级队列：2048 条
重复成功心跳：不落盘
重复错误聚合窗口：30 秒
```

## 7. Renderer 增强架构

### 7.1 从统一全局扫描改为功能注册表

建议接口形态：

```text
FeatureRuntime
├─ id
├─ isEnabled(settings)
├─ mount(scopes)
├─ onThreadWillChange(context)
├─ onThreadDidRender(context)
├─ onRelevantMutations(records)
└─ dispose()
```

功能边界：

- 会话按钮和项目移动只观察侧边栏容器。
- 服务档位只观察 composer 容器。
- 插件增强只在插件页面挂载。
- 模型白名单只响应模型选择器或相关请求，不响应聊天内容变化。
- 宽屏对话优先使用 CSS 变量和稳定容器，避免全局属性 observer。
- 滚动恢复只观察当前会话滚动容器，不再扫描侧边栏和整个 document。

### 7.2 会话切换关键路径

推荐时序：

```text
用户点击会话
  -> 只保存旧会话滚动位置
  -> 放行 Codex 原生导航和首屏渲染
  -> 检测新 conversation root / 首个 turn 已提交
  -> requestAnimationFrame 确认首屏
  -> 空闲阶段挂载非关键增强
  -> 如有历史位置，执行一次受控滚动恢复
```

原则：

- 会话点击捕获阶段不执行全页面查询。
- 新会话首屏前不安装徽标、不排序侧边栏、不刷新插件或模型状态。
- 不使用固定的 7 轮恢复定时器；改为“容器就绪 + 尺寸稳定”触发，设置总超时。
- 用户产生滚轮、触摸或键盘滚动意图后，立即取消恢复。
- 尽量取消对全局 `scrollTo`、`scrollBy`、`scrollIntoView` 的长期 monkey patch；确需保留时必须限定 generation 和作用域。

### 7.3 调度与预算

- 全局只保留一个 MutationCoordinator。
- observer 回调只收集并分类 mutation，不直接执行重任务。
- 当前会话首屏相关任务用 `requestAnimationFrame`。
- 非关键增强用 `requestIdleCallback`，并提供兼容回退。
- 单个任务设置时间预算，超出后让出主线程并在下一空闲片段继续。
- 所有全量查询必须限定根节点并具备缓存失效规则。

## 8. 分阶段实施计划

### 阶段 0：建立可重复基线

- 对比直接启动官方 Codex 与经 Codex Deck 启动。
- 分别记录刚重启、使用 15 分钟、使用 30 分钟后的会话切换表现。
- 选择短会话、长文本会话、含图片会话和含大量代码块会话作为固定样本。
- 记录点击会话到首个内容出现、首屏稳定、恢复滚动完成三个时间点。
- 记录 CDP target 数、连接数、日志事件速率、日志增长速率、CPU 和长任务。
- 单独关闭宽屏对话、滚动恢复后做 A/B，确定各自成本。

交付证据：基线记录、采样方法、测试会话类型和原始数值；不记录会话正文和密钥。

### 阶段 1：Bridge 单例与生命周期

- 先补 mock CDP 集成测试，复现重复安装后连接未回收。
- 引入 BridgeSupervisor 和可取消 BridgeRuntime。
- 健康检查改为复用 actor 连接。
- 管理新文档脚本 identifier，替换时清理旧注册。
- 增加 generation 防止旧 handler 继续处理请求。
- 保持现有 bridge 路由协议不变，降低业务回归范围。

阶段验收：连续运行和多次重注入后，目标页面的业务 bridge 数保持为 1，连接数量不随时间增长。

### 阶段 2：日志限流与轮转

- 定义事件等级与保留策略。
- 引入有界队列和复用 writer。
- 去除成功心跳和成功 resolve 的逐条日志。
- 对 `/diagnostics/log` 使用专用轻量路径。
- 增加大小轮转、聚合和 dropped 统计。
- 现有超大日志的处理单独取得用户确认，不由升级过程自动删除。

阶段验收：空闲状态日志增长接近零，文件大小受上限约束，错误与重连仍可追踪。

### 阶段 3：会话切换关键路径隔离

- 将统一扫描拆为功能注册表。
- 会话、composer、插件和模型功能使用局部 scope。
- 宽屏对话改为 CSS 优先、局部 ResizeObserver 兜底。
- 滚动恢复改为就绪事件驱动和单次恢复。
- 关闭功能时彻底 dispose observer、timer 和事件监听器。

阶段验收：切换会话期间不运行无关插件、模型、Zed 或侧边栏全量任务。

### 阶段 4：真实链路回归与发布

- 完成 Rust 单测、bridge mock 集成测试和注入脚本契约测试。
- 在真实 Codex App 中逐项验证现有增强功能。
- 连续切换至少 60 次会话，运行至少 30 分钟，确认连接和日志稳定。
- 检查供应商切换、协议代理、会话删除/导出/移动、插件、模型和服务档位。
- 更新对应测试文档、执行日志和交付记录。
- 集成验收完成后，按仓库规则另行取得合并与部署确认。

## 9. 测试与验收矩阵

### 9.1 自动化测试

| 范围 | 验收项 |
| --- | --- |
| BridgeSupervisor | 相同 target 的并发 ensure 只创建一个 runtime |
| BridgeSupervisor | 替换 runtime 时旧任务收到 shutdown 并完成退出 |
| BridgeSupervisor | 旧 generation 的请求不会进入业务服务 |
| CDP mock | 健康检查不会创建新的长期连接 |
| CDP mock | 重注入后旧的新文档脚本 identifier 被移除 |
| Logger | 队列满时低优先级事件不会阻塞调用线程 |
| Logger | 文件达到上限后按策略轮转 |
| Logger | 高频成功心跳被抑制，状态变化仍记录 |
| Renderer | 关闭功能后 observer、timer 和 listener 被释放 |
| Renderer | 会话内容 mutation 不触发插件、Zed 和模型全量扫描 |
| Renderer | 用户滚动会取消待执行的滚动恢复 |

### 9.2 真实链路验收

| 场景 | 需要观察的结果 |
| --- | --- |
| 官方 Codex 直接启动 | 建立不含 Codex++ 注入的基线 |
| Codex Deck 冷启动 | 首次切换与直接启动差异可解释 |
| 连续运行 30 分钟 | 连接数、日志速率和内存不持续增长 |
| 连续切换 60 次 | 不出现逐步变慢、错会话或空白页 |
| 长文本/代码会话 | 首屏先显示，增强功能不阻塞内容 |
| 含图片会话 | 图片加载不触发无界全局扫描 |
| 滚动恢复开启 | 恢复位置正确且不阻塞首屏 |
| 滚动恢复关闭 | 不注册相关监听器和 timer |
| 宽屏对话开启 | 布局稳定，无连续抖动或长期 rAF 循环 |
| Bridge 断线重连 | 旧连接退出，新连接唯一，功能恢复 |
| 日志轮转 | 错误可查，文件大小不突破保留策略 |

### 9.3 建议性能门槛

以下为讨论用门槛，需在阶段 0 得到基线后最终确认：

- 同一 Codex page target 的业务 bridge 长连接：稳定为 1。
- 30 分钟内 bridge 连接数量：不增长。
- 空闲成功心跳：不逐条写日志。
- 默认日志总量：受配置的轮转上限约束。
- Codex++ 注入对会话首屏的额外中位开销：目标不超过 50ms。
- 会话切换期间由 Codex++ 产生的单个主线程长任务：目标不超过 50ms。
- 连续 60 次切换的后 10 次，不得明显慢于前 10 次。

如果官方 Codex 自身在超长会话中超过绝对时间门槛，则以“Codex++ 相对额外开销”和“是否随时间退化”为主要判定标准。

## 10. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 错误关闭唯一可用 bridge | 先启动候选 runtime，完成握手后再切换所有权；失败保留旧 runtime |
| 多个 ensure 并发产生竞态 | supervisor 内串行化状态变更并合并并发请求 |
| 清理旧脚本导致新页面未注入 | 保存 identifier 与 generation，增加新页面导航集成测试 |
| 日志限流遗漏关键故障 | 错误、重连和状态变化不采样，只抑制重复成功事件 |
| 有界队列丢日志 | 暴露 dropped 计数，并在后续高优先级事件中附带摘要 |
| 私有 DOM 结构随 Codex 更新变化 | 功能按模块失败，选择器失效不能触发全局重试风暴 |
| CSS 宽屏方案无法完全对齐 | 优先性能和稳定性，局部 ResizeObserver 作为受控兜底 |
| 滚动恢复行为变化 | 保留设置开关，真实验证长会话、底部和中间位置 |
| 只修 bridge 但原生 Codex 仍慢 | 阶段 0 保留官方直接启动基线，分开报告原生与注入成本 |

## 11. 回滚方案

- BridgeSupervisor 与现有 bridge 路由协议解耦，发生问题时可回退 runtime 管理层，不回退数据格式。
- Renderer 功能必须继续受现有设置开关控制，可按功能关闭，不需要整体禁用所有增强。
- 日志新管线保留严重错误的同步兜底，但不能在正常路径恢复无界逐条写入。
- 不修改用户会话数据库，因此回滚不涉及会话数据迁移。
- 不自动清理旧日志，避免回滚时丢失故障证据。

## 12. 待用户继续讨论的决策

1. **会话首屏与滚动恢复的优先级**
   - 推荐：先显示内容，再恢复位置。
   - 取舍：位置可能晚几十到几百毫秒稳定，但不会阻塞首屏。
2. **宽屏对话的实现原则**
   - 推荐：接受轻微像素差异，换取 CSS 优先和更少布局计算。
   - 取舍：不同 Codex 版本下不一定始终绝对居中。
3. **日志保留策略**
   - 推荐：10 MiB × 3 个文件。
   - 取舍：足够排查近期问题，但不适合保存数月历史。
4. **昂贵增强功能的默认值**
   - 推荐：新安装默认关闭滚动恢复和宽屏对话，已有用户设置不强制改变。
   - 取舍：新用户默认体验更接近官方 Codex，需要主动开启增强。
5. **性能门槛**
   - 推荐：阶段 0 实测后再冻结绝对毫秒数，先把“不随时间退化”作为硬门槛。
6. **现有 3.56 GB 日志的处理**
   - 推荐：完成必要取证后单独确认清理或归档，不在本计划的代码实施中自动处理。

## 13. 开发授权边界

本文档只用于收敛问题和讨论架构。后续必须先确认：

- 功能范围与非目标；
- 上述六项待决策内容；
- 性能基线和最终验收门槛；
- 测试边界与回滚方式。

用户明确确认“可以开发”之前，不修改 bridge、launcher、日志或注入脚本代码。
