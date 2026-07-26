# Codex Deck 独立架构与渐进迁移计划

日期：2026-07-16

状态：已于 2026-07-16 获得用户“可以开发”授权，进入开发执行；**正式发布、正式切换和停止 Legacy 维护仍需另行确认。**

关联文档：

- `docs/plans/2026-07-16-codex-app-session-switch-performance-architecture-plan.md`

## 1. 本轮已确认的产品方向

### 1.1 已确认

1. 对外产品统一为 **Codex Deck**，不再把 Codex++ 作为新产品品牌。
2. Codex Deck 使用自己的架构，不以 `codex-plus-core` 作为新架构内部核心。
3. 建设期间现有版本继续可用，不用未完成的 Codex Deck 替换当前稳定版本。
4. Codex Deck 使用独立仓库建设；当前仓库保留为 Legacy 维护和迁移来源。
5. Codex Deck 内部按业务模块开发和分阶段验收，但不对用户分批切换产品。
6. 冻结迁移范围内的功能、品牌、数据导入和完整验收全部完成后，再一次性交付并切换到 Codex Deck。
7. 一次性交付采用功能等价迁移：当前稳定版本的全部用户可见能力必须进入首个正式 Codex Deck，除非用户逐项明确同意移除。
8. 内部开发采用基础架构优先：先完成 Runtime、认证 RPC、可观测性和 one-shot CDP，再迁移业务功能和界面。
9. 技术命名统一使用 Codex Deck 体系；旧 `codex-plus-*` 名称只允许出现在 Legacy 导入器、测试夹具、迁移文档和来源记录中。
10. 上游 CodexPlusPlus 只作为功能来源、行为参考和问题情报来源，是否吸收由 Codex Deck 自己决定。
11. Codex Deck 使用 `AGPL-3.0-only`；复用上游代码时保留来源、版权、许可证和修改记录。
12. 吸收上游功能时，先把功能转成 Codex Deck 的产品需求和验收契约，再按 Codex Deck 架构实现。
13. 旧 CodexPlusPlus 数据使用完整引导式一次性导入：非敏感配置自动转换，可执行内容和外部路径先预览，凭据逐项确认并迁入安全存储；旧数据不删除。
14. Codex Deck 正式切换成功后，Legacy 立即停止维护；保留最后安装包、源码和旧数据作为冻结的应急回退材料，但不再发布 Legacy 修复版本。
15. 功能等价基线使用开始重建前的本地最终 Legacy 版本，纳入当时已经完成并验收的本地功能，不以较旧的 GitHub 已发布版本代替。
16. 正式切换采用严格验收：功能矩阵 100% 通过、双平台真实链路通过、连续运行至少 2 小时、会话切换至少 100 次、完整导入与回滚演练至少 3 次，且不存在阻塞或严重已知缺陷。

### 1.2 这项决定的准确含义

这里的“双轨”是建设期双轨，不是分批发布迁移，也不是让两套核心永久共存：

```text
Codex++ Legacy
  -> Codex Deck 建设和验收期间保持当前用户可用
  -> 只做必要维护和迁移保障
  -> 不再成为 Codex Deck 新功能的默认落点
  -> 正式切换成功后立即停止维护
  -> 仅保留最后安装包、源码和旧数据作为冻结的应急回退材料

Codex Deck
  -> 独立仓库、新产品、新技术身份、新数据目录
  -> 新领域模型、新运行时、新接口
  -> 内部按模块开发和验收，不发布替换旧版的半成品
  -> 冻结迁移范围全部完成后一次性交付和切换
  -> 最终成为唯一主动演进的产品
```

内部“按模块开发”不等于在新模块中继续调用旧核心。每个迁移完成的模块，都必须在 Codex Deck 内形成独立实现和独立测试；旧代码只留在 Legacy 产品中。内部阶段只用于控制工程风险，不构成对用户的阶段性产品迁移。

## 2. 目标与非目标

### 2.1 目标

- 建立一个不依赖 `codex-plus-core` 的 Codex Deck 业务内核。
- 将供应商、模型、会话、增强功能、代理、设置和可观测性拆成清晰模块。
- 解决当前长期 CDP bridge、全局注入扫描和无界日志带来的性能退化风险。
- 让 Manager、Runtime、Codex App 适配器和渲染增强之间通过稳定契约通信。
- 允许现有用户以可预览、可备份、可回滚的方式迁移到 Codex Deck。
- 建立选择性吸收上游功能的流程，避免产品主线再次变成上游 fork 的被动跟随者。
- 为 Windows 和 macOS 分别保留平台适配层，不让平台细节污染业务规则。

### 2.2 非目标

- 不是把所有 `CodexPlusPlus` 字符串一次性替换为 `CodexDeck`。
- 不是在原 `codex-plus-core` 内继续拆文件后改名。
- 不是不加选择地复制上游全部功能；但首个正式 Codex Deck 版本必须完成双方冻结的迁移清单，不能用未完成版本替换 Legacy。
- 不是保持 Codex Deck 与旧版设置文件的永久双写或实时同步。
- 不是把上游 `main` 持续 rebase、merge 或 cherry-pick 到 Codex Deck 产品主线。
- 不是同时重写 Codex App；Codex App 仍是 Codex Deck 需要适配的外部桌面应用。
- 不是让 Legacy 和 Codex Deck 同时修改同一个 Codex Home。双轨表示可选择使用两者，不表示可以无协调地并发控制同一份配置。

### 2.3 功能等价迁移的定义

“功能等价”按用户结果验收，不要求复制旧代码、旧页面结构或旧数据模型。

已确认以开始重建前的本地最终 Legacy 版本作为功能等价基线。正式开发前必须将其冻结为可复现证据，包括唯一 commit、Legacy final tag、安装包、版本、默认设置和真实业务链路。基线盘点至少覆盖：

- Manager 当前可进入的工作台、供应商/中转、会话、上下文、增强、Zed、维护、关于和设置页面；
- Codex App 检测、启动、停止、更新、watcher、环境检查和平台安装能力；
- 供应商切换、模型目录、上下文窗口、协议适配、代理、聚合和轮换；
- 会话查询、搜索、导出、删除、项目归属、provider 修复和索引维护；
- MCP、skills、plugins 和插件市场相关能力；
- 当前可以启用的 renderer 增强及其设置、关闭和异常降级行为；
- 当前用户数据、供应商资料、通用配置、增强设置和必要状态的一次性导入。

每项能力都要进入功能等价矩阵，并记录：Legacy 操作入口、用户结果、数据影响、异常行为、Deck 归属模块、自动化证据和真实链路验收结果。

冻结基线时必须满足：

- 当前计划纳入的本地功能已经完成并通过 Legacy 验收，不能把半成品状态混入最终基线；
- 工作区中的用户改动逐项确认归属，不能由 agent 擅自丢弃、覆盖或排除；
- 基线对应单一 commit，并生成形如 `legacy-final-*` 的只读 tag；
- 保存对应 Windows、macOS 安装资产或明确记录某平台不适用的依据；
- 记录版本、构建工具链、配置 schema、默认设置和第三方依赖锁定信息；
- 基线功能矩阵经用户确认后冻结，后续发现遗漏必须重新走范围确认，不能静默扩大或缩小。

当前文档确认的是基线选择规则，不代表现在已经授权提交、打 tag、构建发布资产或整理用户改动。这些操作必须在用户明确“可以开发”后执行，并且发生在 Codex Deck 产品代码创建之前。

以下变化不算功能缺失：

- 为提高可用性而重新设计页面和操作流程；
- 将多个重复入口合并为一个清晰入口；
- 替换内部文件格式、RPC、数据库 schema 和进程结构；
- 修复旧版卡顿、资源泄漏、错误提示不清等缺陷；
- 删除无法触达的死代码、测试辅助代码和从未进入当前稳定产品的上游功能。

任何当前用户可触达功能的删除、降级或合并，只要会改变用户结果，都必须单独记录并取得用户明确确认，不能由工程实现自行决定。

## 3. 为什么不继续沿用当前核心

当前 `codex-plus-core` 已包含四十多个顶层模块，职责同时覆盖：

- Codex App 启动、进程、安装和更新；
- CDP、bridge、路由和 renderer 注入；
- 供应商、模型目录、配置改写和协议代理；
- 会话数据库、本地存储、插件和 Zed；
- 设置、状态、诊断日志、端口和平台集成。

其中 `launcher.rs`、`protocol_proxy.rs`、`relay_config.rs`、`settings.rs` 均已接近或超过十万字节。Manager 的 Tauri 命令层又直接调用大量 `codex_plus_core::*` API，使 UI、应用用例、存储和外部适配器难以独立变化。

这不是单纯的文件太大，而是所有权边界不清：

```text
UI 命令
  -> 直接调用大核心中的具体实现
  -> 具体实现同时读写文件、数据库、进程和网络
  -> 功能间共享全局状态和运行时副作用
  -> 一个局部变化容易影响启动、注入、日志和会话性能
```

如果只改名或继续在旧核心里叠加功能，Codex Deck 会继承同一组耦合关系，无法达到“架构与上游分开”的目标。

## 4. 架构方案比较

### 4.1 代码库组织方案

| 方案 | 做法 | 优点 | 主要问题 | 结论 |
| --- | --- | --- | --- | --- |
| A. 新建独立仓库 | 当前仓库保留 Legacy；Codex Deck 在新仓库建设，通过一次性导入迁移数据 | 品牌、历史、依赖、发布和上游策略最清楚 | 初期需要维护两个仓库和两条发布线 | **已确认** |
| B. 同仓双目录 | 在当前仓库增加 `legacy/` 与 `deck/` 两个产品根 | 迁移时查阅和共享测试样本方便 | Cargo、CI、许可证、品牌扫描和提交边界容易混杂 | 可作为短期过渡，不推荐作为终态 |
| C. 原地逐文件替换 | 保留当前目录和包名，逐步把旧实现换掉 | 初始动作少 | 很难证明新核心已经与旧架构解耦，发布过程风险最高 | 不推荐 |

已确认采用方案 A。Codex Deck 在独立仓库内按模块建设，所有冻结范围完成后再一次性向用户交付；当前仓库只承担 Legacy 维护、行为参考和迁移来源职责。

### 4.2 运行时组织方案

| 方案 | 做法 | 优点 | 主要问题 | 结论 |
| --- | --- | --- | --- | --- |
| A. 模块化单体 Runtime | 一个受监督的本地 Runtime 进程，内部按领域模块隔离 | 生命周期统一、部署简单、模块边界可测试 | 需要严格执行依赖规则，防止再次长成大核心 | **推荐** |
| B. Manager 内嵌所有能力 | 所有后端能力都放入 Tauri Manager 进程 | 进程少、初期直观 | Manager 关闭后增强能力中断，UI 与运行时重新耦合 | 不推荐 |
| C. 多个本地微服务 | 供应商、会话、代理、增强各自进程 | 故障隔离强 | 桌面端部署、升级、端口、安全和诊断成本过高 | 暂不采用 |

推荐的“模块化单体”不是另一个 `codex-plus-core`。区别在于它有明确的领域边界、单向依赖、端口接口和组合根，具体的 CDP、SQLite、文件系统与操作系统代码只能存在于适配器层。

## 5. 推荐总体架构

```text
┌───────────────────────────────────────────────────────────────┐
│ Codex Deck Manager                                           │
│ 页面、表单、命令状态、任务进度；不直接访问 Codex 文件或 SQLite │
└──────────────────────────────┬────────────────────────────────┘
                               │ 本地认证 RPC / 事件流
┌──────────────────────────────▼────────────────────────────────┐
│ Codex Deck Runtime                                           │
│                                                               │
│  ┌──────────────── Application ────────────────────────────┐  │
│  │ 用例、命令、查询、事务边界、任务编排、权限与并发规则      │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │ Ports                            │
│  ┌──────────────── Domain ──▼──────────────────────────────┐  │
│  │ Provider / Session / Enhancement / Settings / Proxy     │  │
│  │ 纯业务实体、值对象、策略、领域事件                        │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │ Adapters                          │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │ Codex Desktop / one-shot CDP / SQLite / Filesystem      │  │
│  │ HTTP / OS / Secrets / Update / Observability            │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬────────────────────────────────┘
                               │ 短时 bootstrap + 本地事件通道
┌──────────────────────────────▼────────────────────────────────┐
│ Codex App Renderer                                           │
│ bootstrap -> transport -> feature registry -> feature modules│
└───────────────────────────────────────────────────────────────┘

旧 CodexPlusPlus 数据
  -> deck-legacy-import 只读识别、预览、备份、转换
  -> Codex Deck 自有存储
  -> 不形成运行时依赖
```

### 5.1 建议目录

以下是目标结构草案，名称可在技术身份确认后冻结：

```text
apps/
  codex-deck-manager/       # Tauri 桌面管理界面
  codex-deck-runtime/       # 长期运行、受监督的本地运行时
  codex-deck-launcher/      # 启动/诊断 CLI，保持薄层

crates/
  deck-domain/              # 纯业务模型和规则
  deck-application/         # 用例、端口、命令/查询 DTO
  deck-runtime/             # 生命周期、任务监督、模块组合
  deck-infrastructure/      # 存储、网络、日志、密钥等通用适配器
  deck-codex-adapter/       # Codex Home、App、SQLite、CDP 适配
  deck-legacy-import/       # 旧版一次性导入

renderer/
  bootstrap/                # 幂等安装与版本握手
  transport/                # 与 Runtime 的认证连接
  features/                 # 按功能注册、挂载、卸载

contracts/
  rpc/                      # 版本化命令、查询和事件契约
  fixtures/                 # Codex/Legacy 格式测试样本

docs/
  adr/                      # 不可逆架构决策记录
  migration/                # 数据和功能迁移说明
```

### 5.2 强制依赖规则

```text
deck-domain
  -> 不依赖 Tauri、CDP、SQLite、文件系统、网络或 codex-plus crate

deck-application
  -> 只依赖 deck-domain 和抽象 Port

deck-*-adapter / deck-infrastructure
  -> 实现 Port，可以依赖外部库

apps/*
  -> 仅负责组合、进程入口和平台启动

deck-legacy-import
  -> 可以理解旧格式，但任何其他 Deck 模块不得依赖它
```

生产依赖图中禁止出现 `codex-plus-core` 和 `codex-plus-data`。旧格式名称只允许存在于导入器、测试夹具、迁移文档和来源记录中。

### 5.3 已确认的技术命名

| 对象 | 名称规则 |
| --- | --- |
| Git 仓库 | `codex-deck` |
| 对外产品 | `Codex Deck` |
| 主程序 | `codex-deck` |
| Runtime 进程 | `codex-deck-runtime` |
| Launcher/诊断入口 | `codex-deck-launcher`，最终也可由主程序提供子命令 |
| Manager 工程或前端包 | `codex-deck-manager` |
| Rust 领域与基础模块 | `deck-*`，例如 `deck-domain`、`deck-application` |
| 应用数据目录名 | `CodexDeck`，实际路径使用各平台标准应用数据位置 |
| RPC、日志和运行时标识 | `codex-deck.*` 或 `deck.*` 命名空间 |

旧 `codex-plus-*`、`codex_plus_*`、`CodexPlusPlus` 和 `.codex-session-delete` 不得成为 Codex Deck 的生产包名、进程名、数据目录或内部主命名空间。它们只允许出现在以下位置：

- `deck-legacy-import` 中对旧格式的只读识别；
- Legacy 测试夹具和迁移测试；
- 上游来源、版权、许可证和迁移文档；
- 明确标记为 Legacy 的诊断结果。

CI 需要扫描生产依赖、发布资产和安装元数据，防止旧技术身份被重新带入 Codex Deck。

### 5.4 已确认的发布与安装身份

| 对象 | 已确认身份 |
| --- | --- |
| GitHub namespace | `nanzheyin` |
| 目标仓库 | `nanzheyin/codex-deck` |
| 目标仓库地址 | `https://github.com/nanzheyin/codex-deck` |
| Bundle identifier | `io.github.nanzheyin.codexdeck` |
| 更新与正式下载 | `nanzheyin/codex-deck` 的 GitHub Releases |
| 安装产品族 | Codex Deck 独立产品族，不复用 CodexPlusPlus 的安装 ID |

Windows installer ID、macOS 签名主体和发布签名密钥需要在首次正式打包前生成或配置，但不得改变已经冻结的 `io.github.nanzheyin.codexdeck` 产品身份。签名证书中的主体名称以实际申请结果为准，不能在文档阶段虚构。

目标仓库目前只是计划中的发布位置。创建仓库、配置 GitHub Actions、申请签名、上传资产和启用更新源都属于后续开发或发布操作，不因本决策自动授权。

## 6. Runtime 与通信架构

### 6.1 Runtime 所有权

Runtime 是长期资源的唯一所有者，负责：

- Codex App 子进程与 target 发现；
- 本地 RPC 监听器和认证令牌；
- 协议代理及其端口；
- renderer 连接和功能实例；
- 后台任务、取消令牌和优雅退出；
- 有界日志、指标和健康状态。

任何长期任务必须由 supervisor 注册，并具备 `start / health / stop / join` 生命周期。禁止无法取消、无法等待退出的脱离任务。

### 6.2 控制面

推荐使用跨平台的本地认证控制面：

- 命令和查询使用版本化本地 RPC；
- 状态变化和任务进度使用 WebSocket 事件流；
- 监听 `127.0.0.1` 的随机端口，使用每次启动生成的高熵令牌；
- 令牌不写入 DOM、不写入 Codex localStorage、不出现在 URL 和普通日志中；
- 所有请求带协议版本、请求 ID、超时和可取消标识；
- Manager 和 renderer 都是客户端，不能直接触碰 Runtime 内部对象。

后续若本地 HTTP/WebSocket 在平台安全策略上遇到限制，可把 Manager 通道替换为 named pipe / Unix domain socket；业务接口和用例层不随传输方式改变。

### 6.3 CDP 只做一次性 bootstrap

新的 CDP 路径只承担“把 Deck 客户端装入目标页面”的职责：

```text
启动 Codex App
  -> 发现尚未登记的 page target
  -> 建立短时 CDP 连接
  -> 注册 new-document bootstrap
  -> 在当前 document 执行 bootstrap
  -> 等待 renderer 向 Runtime 完成版本握手
  -> 关闭 CDP WebSocket
```

业务请求、心跳和设置读取不再经过长期 CDP binding。Runtime 可以用低频、有上限的 target discovery 发现新窗口，但每次控制连接完成 bootstrap 后必须关闭。

同一个 target 只能有一个 active bootstrap generation。重装前先比较 build ID；renderer 的 feature registry 必须支持幂等 `mount` 和完整 `dispose`。

## 7. 业务模块边界

### 7.1 Provider 与 Model Catalog

负责供应商资料、协议、模型、上下文窗口、自动压缩阈值、连通性测试和激活策略。它输出“期望配置”，不直接散落写 `config.toml`、`auth.json` 和 catalog 文件。

具体文件变更由 Codex Config Adapter 生成变更集、预览 diff、创建快照后原子提交。

### 7.2 Session Library

负责会话查询、筛选、导出、删除、项目归属和 provider 修复。领域层只理解 Deck 的会话模型；Codex SQLite schema 由 adapter 转换，schema 变化不能扩散到 Manager。

写操作必须具备预览、备份、结果报告和幂等语义。

### 7.3 Enhancement

每项 renderer 功能是独立 feature module：

```text
feature manifest
  -> capability / selector scope / settings schema
  -> mount(context)
  -> onSettingsChanged(next)
  -> dispose()
  -> health()
```

禁止默认监听整个 `document.body` 后统一扫描全部功能。会话、composer、模型、插件和侧栏增强各自只观察最小 DOM scope；CSS 能完成的布局不使用持续 JavaScript 校正。

### 7.4 Proxy

协议转换、聚合、轮换和请求观测属于独立模块。它只能通过 Provider Port 获取已解析的运行配置，不能读取 UI 状态或直接修改供应商设置。

### 7.5 Context Packages

MCP、skills 和 plugins 统一建模为可安装的上下文包，但保留各自格式 adapter。安装过程必须可预览、校验来源、记录版本并可回滚。

### 7.6 Settings、Secrets 与 Observability

- 普通设置使用 Deck 自有、带 schema version 的存储。
- 密钥使用平台安全存储；不能混入普通 JSON 或诊断包。
- 日志异步、有界、轮转，默认不记录高频成功心跳。
- 指标聚合记录连接数、任务数、队列深度、错误率和 renderer 代价。
- 诊断导出必须先脱敏，并显示将包含哪些文件。

## 8. Legacy 共存与一次性导入

### 8.1 共存原则

Codex++ Legacy 与 Codex Deck 使用完全不同的：

- 可执行文件名和安装标识；
- bundle identifier；
- 数据、缓存和日志目录；
- Runtime 端口、锁和进程名；
- 更新源和发布资产。

Codex Deck 不写入 `~/.codex-session-delete`。新数据应进入平台标准应用数据目录，状态、缓存和日志分别存放。

### 8.2 共享 Codex Home 的限制

两套产品最终都会影响 Codex 的 `config.toml`、`auth.json`、catalog 或插件状态，因此不能无协调地同时管理同一个 Codex Home。

推荐规则：

1. Deck 首次接管前创建 Codex Home 快照。
2. Deck 使用 ownership lock 标记当前管理者和运行实例。
3. 检测到 Legacy 相关进程时，禁止 Deck 执行配置写操作，只允许查看和导入。
4. Legacy 后续可增加一个最小维护补丁，使其识别同一 ownership lock；这是共存安全补丁，不是把两套架构重新连接。
5. 回退到 Legacy 前，由 Deck 恢复接管前快照或生成明确的回退变更集。

### 8.3 导入流程

```text
扫描旧数据（只读）
  -> 显示可导入内容和冲突
  -> 用户选择范围
  -> 备份旧数据与当前 Codex Home
  -> 转换为 Deck schema
  -> 写入临时事务区并校验
  -> 原子切换到 Deck 数据
  -> 输出逐项结果和回滚点
```

已确认采用完整引导式导入，按风险分为三组：

| 导入组 | 内容 | 默认行为 |
| --- | --- | --- |
| 非敏感配置 | 供应商资料、模型与上下文设置、通用配置、增强开关、界面偏好 | 在总预览中列出后自动转换 |
| 可执行或外部影响项 | MCP、skills、plugins、外部路径、Zed 等集成、环境修改 | 逐项显示来源、目标和风险，经用户确认后导入 |
| 敏感信息 | API Key、bearer token、登录凭据及其他 secrets | 不静默复制；逐项确认后写入平台安全存储，普通日志和设置 JSON 不保留明文 |

Codex 原生会话继续以 Codex 自己的数据库和文件为唯一事实来源。Codex Deck 通过新的 Session Adapter 读取它们，不复制整份会话数据库，也不创建会与 Codex 原生数据分叉的 Deck 会话副本。

以下内容默认不导入：

- Legacy 诊断日志，包括当前已达到数 GB 的 `codex-plus.log`；
- 健康状态、进程 ID、端口、锁、缓存和临时文件；
- 已失效的下载包、更新中间文件和崩溃残留；
- 无法识别来源或无法通过 schema 校验的数据。

导入器需要维护逐项 ledger，使中断后可以安全重试，并明确区分“尚未导入”“已经导入”“用户跳过”和“导入失败”。只有所有已选择项目校验成功后才提交 Deck 数据；任一关键步骤失败时恢复本次导入前状态。

导入是复制和转换，不删除旧数据。导入完成后两边数据不再自动同步。

## 9. 上游功能吸收机制

### 9.1 仓库关系

```text
CodexPlusPlus upstream mirror（只读）
  -> 发现功能、修复和兼容性变化
  -> 进入 Deck Feature Intake 清单
  -> 产品价值、风险、许可和架构评审
  -> Deck 需求 + 验收契约
  -> Deck 自有实现
```

Codex Deck 产品分支不直接 rebase 上游。当前 `AGENTS.md` 中的上游 rebase 规则仍适用于 Legacy 仓库；若确认建立独立 Deck 仓库，新仓库需要自己的规则文件。

### 9.2 每项上游功能的记录

| 字段 | 说明 |
| --- | --- |
| 来源 | 上游仓库、版本、commit 或 issue |
| 用户价值 | 解决什么真实问题，是否符合 Deck 方向 |
| 行为契约 | 输入、输出、错误、边界和真实验收场景 |
| Deck 归属 | 应进入哪个领域模块和 adapter |
| 实现策略 | 独立实现、格式兼容、隔离 vendoring 或不采用 |
| 许可与来源 | 是否参考或复用了受版权保护的代码 |
| 性能预算 | 是否引入 observer、后台任务、网络或磁盘成本 |
| 生命周期 | 安装、启用、禁用、升级和卸载如何收口 |

### 9.3 许可边界

已确认 Codex Deck 使用 `AGPL-3.0-only`。品牌独立、仓库独立和架构独立不会消除许可证义务，也不与继续采用 AGPL 冲突。

- 新仓库根目录必须包含完整的 AGPL-3.0-only 许可证声明和必要版权信息；
- 功能思想和用户行为仍应先转成 Deck 需求与验收契约，避免把上游结构当成默认设计；
- 直接复制、修改或组合上游代码时，来源台账必须记录仓库、commit、原文件、版权声明、许可证和 Deck 修改摘要；
- 复用代码必须进入 Deck 已定义的领域或 adapter 边界，不能以许可兼容为理由依赖 `codex-plus-core` 或把旧核心整体搬入；
- 每次正式发布必须能够对应到可获得的完整源代码版本、构建说明和许可证清单；
- 第三方依赖需要执行许可证兼容检查并生成归属清单，未知或不兼容许可证不能进入发布资产；
- 后续若考虑改为其他许可证、闭源或双许可证，必须重新完成权利来源审计并单独决策，不能默认为本次授权的一部分。

本文只记录工程风险，不替代正式法律意见。

## 10. 模块迁移映射

| 现有能力 | Deck 目标归属 | 迁移方式 |
| --- | --- | --- |
| `settings.rs` | Domain Settings + Settings Adapter | 重新定义 schema；旧格式只由 importer 解析 |
| `relay_config.rs` / `model_catalog.rs` | Provider + Codex Config Adapter | 从行为契约重做，写入采用变更集和快照 |
| `protocol_proxy.rs` / relay rotation | Proxy | 独立模块实现，不读取 UI 或旧全局设置 |
| `launcher.rs` | Runtime Supervisor + Codex Desktop Adapter | 按显式生命周期重做 |
| `bridge.rs` / `cdp.rs` / `routes.rs` | one-shot CDP + RPC Gateway | 不迁移长期 bridge 结构 |
| `renderer-inject.js` | Renderer Feature Registry | 按 feature 拆分并要求 dispose |
| `codex_sqlite.rs` / local storage | Session / Codex Storage Adapter | schema 转换隔离在 adapter |
| `plugin_marketplace.rs` | Context Packages | 先定义来源、安装、升级和回滚模型 |
| `diagnostic_log.rs` / status | Observability | 异步有界日志、轮转和聚合指标 |
| install / update / platform code | Platform Adapters | 按 Windows、macOS 分开实现和验收 |
| Manager `App.tsx` / Tauri commands | Feature UI + RPC Client | UI 不再直接调用底层文件和数据库实现 |

迁移完成标准不是“新界面能调用旧功能”，而是该业务能力已经由 Deck 的领域、用例、adapter 和验收测试共同拥有。

## 11. 分阶段计划

以下阶段是 Codex Deck 的内部建设和验收检查点，不是对用户发布半成品的节奏。任何单独阶段完成，都不代表可以替换 Legacy；只有冻结迁移清单全部完成并通过总验收后，才执行一次性正式切换。

### 阶段 0：冻结关键决策

- 记录独立仓库决策，并明确 Legacy 仓库与 Deck 仓库的单向关系。
- 固化已确认的技术名称、GitHub 发布主体、bundle ID 和数据目录；签名主体留待首次正式打包前配置。
- 固化已确认的 AGPL-3.0-only 许可证、上游来源台账和第三方归属规则。
- 确认首个 Deck 可用版本必须包含的业务能力。
- 建立 ADR、功能清单和 Legacy 基线验收。

退出条件：产品边界、非目标、仓库边界和一次性正式交付范围无歧义。

### 阶段 1：独立骨架与 Runtime 基础

- 创建 Deck workspace、依赖规则和 CI。
- 建立 Domain、Application、Ports、Adapters 和 composition root。
- 实现 Runtime 单实例、任务监督、本地认证 RPC、事件流和健康状态。
- 实现有界日志、轮转、脱敏和诊断摘要。
- 建立最小 Manager，只显示 Runtime 和 Codex App 状态。

退出条件：关闭 Manager 后 Runtime 行为符合设计；重启、崩溃和升级均不会残留任务或端口。

### 阶段 2：one-shot CDP 与最小渲染框架

- 实现 target discovery、短时 bootstrap 和版本握手。
- 实现 renderer transport、feature registry、mount/dispose 和健康检查。
- 首先只提供一个无 DOM 全局扫描的状态功能，验证完整链路。
- 建立连接数、日志速率、内存和会话切换开销基线。

退出条件：长期业务 CDP WebSocket 为 0；连续运行和切换会话时连接、任务与日志不持续增长。

### 阶段 3：内部首个可用纵向切片

推荐先迁移：

- Deck 设置存储；
- Provider 与 Model Catalog；
- Codex 配置预览、快照和原子应用；
- Codex App 启动、停止和状态；
- Legacy 供应商与相关设置导入。

这批能力能形成“安装 Deck -> 导入或创建供应商 -> 启动 Codex -> 正常使用”的最小闭环。

退出条件：用户不需要运行 Legacy 后端即可完成首要供应商和启动流程，并可恢复到接管前配置。

### 阶段 4：Session Library

- 会话列表、搜索、筛选和详情。
- 导出、删除、项目归属和 provider 修复。
- Codex SQLite 版本适配和真实数据备份。

退出条件：真实会话链路验收通过；所有写操作均有预览、备份和逐项结果。

### 阶段 5：Renderer 增强模块

- 按用户价值逐项迁移宽屏、滚动恢复、服务档位、项目移动等能力。
- 每项功能拥有独立 selector scope、性能预算、设置和 dispose 测试。
- 新安装的功能默认值由真实性能基线决定；Legacy 导入用户保留原有增强开关，任何因安全或性能原因无法保留的值必须在导入预览中单独说明并确认。

退出条件：连续切换会话不随时间退化，关闭功能后 observer、timer、listener 和连接全部释放。

### 阶段 6：Context、Proxy 与扩展能力

- 协议代理、聚合和轮换。
- MCP、skills、plugins 和插件市场。
- Zed、移动中继等能力必须在冻结清单时明确“迁移”或“不迁移”，不能以未定义的后续版本规避一次性交付范围。

退出条件：每个被吸收能力都通过 Deck 功能 intake、许可和真实链路验收；未被选择的上游功能不构成阻塞。

### 阶段 7：品牌切换与 Legacy 收口

- 确认阶段 1 至阶段 6 及冻结迁移清单已经全部通过总验收。
- 一次性发布完全独立的 Codex Deck 安装包和更新渠道，不公开发布替换 Legacy 的半成品版本。
- 在正式切换流程中一次性完成旧数据导入、Codex Home 接管、品牌切换和结果校验。
- 切换前至少完成 3 次完整导入与回滚演练，并验证双产品冲突提示；失败时恢复接管前快照并继续使用 Legacy。
- 总验收报告完成后仍需用户明确批准正式切换，自动化流程不得自行触发产品接管或 Legacy 停止维护。
- 正式切换成功后立即停止 Legacy 维护，不再增加功能、兼容修复或发布新安装包。
- 将 Legacy 仓库和最后发布资产设为只读保留；不删除用户旧数据，也不承诺其继续兼容未来 Codex App 版本。

退出条件：Codex Deck 在一次正式交付中完整接管冻结范围，真实业务链路通过，回滚路径已经在切换前验证，Legacy 已进入只读停止维护状态。

## 12. 验收与架构守卫

以下是正式切换的硬门槛，不是建议项。任一门槛未通过，Codex Deck 只能继续内部开发和修复，不得替换 Legacy。

### 12.1 功能等价

- 冻结的 Legacy 功能矩阵必须 100% 通过，不接受以“后续版本补齐”代替。
- 每项功能都要同时具备自动化证据和真实用户链路结果；不适合自动化的项目必须记录人工验收证据。
- 页面和流程可以重做，但用户结果发生删除、降级或不兼容变化时必须有单独确认记录。
- 所有设置开关都要验证启用、变更、禁用、重启恢复和异常降级。

### 12.2 独立性

- Deck 生产依赖中不存在 `codex-plus-core` 或 `codex-plus-data`。
- 非 importer 和来源记录中不存在旧数据目录、旧 bundle ID、旧进程名。
- Deck 发布资产不会覆盖或升级 Legacy 安装。
- 上游同步不会直接改变 Deck 产品分支。

### 12.3 性能与生命周期

- 同一 target 的 bootstrap generation 唯一。
- 长期业务 CDP 连接数为 0。
- 所有 Runtime 后台任务可枚举、取消并等待退出。
- 正式候选版本连续运行至少 2 小时，并在固定会话样本上完成至少 100 次切换。
- 后 20 次切换的中位数和 P95 不得比前 20 次恶化超过 20%，并排除 Codex 原生网络和内容差异后再判定。
- 经过 15 分钟预热后，最后 30 分钟内存中位数不得比第一个稳定 30 分钟高出超过 20%，且连接、observer、timer 和任务数量不得呈持续上升趋势。
- 空闲状态不得因成功心跳持续写日志；默认日志按 `10 MiB x 3` 轮转，错误、重连和状态变化仍可追踪。
- 相对不启动 Deck 的官方 Codex 基线，Deck 引入的会话首屏中位额外开销目标不超过 50ms，P95 目标不超过 100ms。
- 会话切换期间由 Deck 引入的单个主线程长任务不得超过 50ms；超出时必须定位并消除或取得明确例外确认。

### 12.4 数据与回滚

- 导入前可预览项目、冲突、敏感项和目标位置。
- 导入失败不改变旧数据和当前生效配置。
- 导入成功后有报告、快照和可验证回滚点。
- Legacy 与 Deck 的数据不会静默双写。
- Deck 配置提交采用临时文件、校验和原子替换。
- 正式切换前至少完成 3 次完整导入与回滚演练：全量格式夹具、最终 Legacy 数据副本、隔离 Codex Home 中的发布候选演练。
- 三次演练都必须保存导入 ledger、前后校验结果、快照位置、回滚结果和未导入项目说明。
- 凭据迁移必须验证安全存储写入、读取、撤销和诊断脱敏，普通设置、日志和导出包中不得出现明文 secrets。

### 12.5 真实链路

- 真实 Codex App 启停、供应商切换和请求成功。
- 真实会话查询、导出、删除及恢复验证完成。
- Windows 和 macOS 必须分别完成真实安装、启动、更新、卸载、与 Legacy 并存以及 Codex App 完整调用链路验收，CI 打包不能代替实际运行。
- Provider、Model Catalog、代理、Context、renderer 增强、Zed 和维护功能按冻结矩阵逐项走真实链路。
- 自动化测试只作为证据之一，不能替代真实页面、文件、SQLite、日志和完整调用链路。

### 12.6 缺陷与正式切换门槛

- 未解决 P0 缺陷必须为 0：数据丢失、安全泄露、无法启动、无法导入或无法回滚均属于 P0。
- 未解决 P1 缺陷必须为 0：冻结范围内主要功能不可用、持续性能退化、配置破坏或跨平台发布不可用均属于 P1。
- P2 及以下缺陷必须列入总验收报告；只允许不影响功能等价、数据安全和迁移结果的低风险问题，并需用户明确接受。
- Windows、macOS、源代码、许可证清单和更新元数据必须对应同一个 release commit，并记录 SHA。
- 总验收报告必须逐项给出证据路径、残余风险和回滚入口；用户明确批准后才能执行正式切换。

## 13. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 双轨被理解为两套产品可同时写 Codex Home | 明确 ownership lock、进程检测、快照和接管流程 |
| 新架构再次长成大核心 | 依赖图测试、模块 owner、Port 契约和 ADR 审查 |
| 渐进迁移长期停留在调用旧核心 | 禁止 Deck 生产依赖旧 crate；按纵向切片验收 |
| 冻结范围过大导致一次性交付周期失控 | 开发前完成全量功能盘点和取舍；内部按纵向切片逐项验收，但所有保留项完成前不正式切换 |
| Codex 私有 DOM 或 SQLite schema 变化 | 变化隔离在 adapter，使用版本探测和契约夹具 |
| 上游好功能被遗漏 | 维护功能 intake 清单和周期性 upstream mirror 审阅 |
| 直接复用上游代码引起许可不清 | 来源台账、独立实现优先、必要时单独许可评审 |
| 两条发布线让用户混淆 | 独立名称、图标、安装 ID、数据目录和迁移提示 |
| 为性能修复而过早迁移全部 renderer 功能 | 先建最小 bootstrap/transport，再逐项加入有预算的 feature |
| 正式切换后 Legacy 立即停止维护，遗漏问题无旧版修复兜底 | 提高切换前总验收门槛，完整演练导入、回滚和所有真实业务链路；未通过时禁止切换 |

## 14. 当前决策记录

### D-001：迁移方式

- 状态：**已确认**
- 决策：建设期间现有版本继续可用；Codex Deck 内部按业务模块开发和验收，冻结范围全部完成后再一次性交付、导入和切换。
- 原因：用户只经历一次完整迁移，同时用内部阶段检查降低一次性重写失控的风险。
- 约束：内部阶段不能通过在 Deck 内长期调用 Legacy 核心来实现，也不能把未完成版本用于替换 Legacy。

### D-002：代码库边界

- 状态：**已确认**
- 决策：Codex Deck 使用独立仓库；当前仓库成为 Legacy 维护和迁移来源。
- 取舍：会增加短期双仓维护成本，但最符合“自己的架构和原来上游分开”。

### D-003：正式迁移范围

- 状态：**已确认**
- 决策：采用功能等价迁移。当前稳定版本全部用户可见能力必须进入首个正式 Codex Deck；需要删除、降级或改变用户结果时逐项确认。
- 边界：功能等价不要求复制旧 UI、旧代码、旧架构、旧缺陷或当前稳定产品中无法触达的死代码。

### D-004：内部开发顺序

- 状态：**已确认**
- 决策：采用基础架构优先。先完成 Runtime、认证 RPC、可观测性和 one-shot CDP；第一个内部纵向切片是 Provider、Model Catalog、配置快照与 Codex 启动；随后完成会话、renderer 增强、Context、Proxy 和其余冻结能力。
- 约束：基础模块会先完成内部验收，但不会单独发布替换 Legacy；界面不得为了提前成形而重新依赖旧核心；只有完整迁移清单全部通过后才一次性交付。

### D-005：技术身份

- 状态：**已确认**
- 决策：仓库使用 `codex-deck`，产品使用 `Codex Deck`，主程序使用 `codex-deck`，Runtime 使用 `codex-deck-runtime`，Rust 模块使用 `deck-*`，平台数据目录名使用 `CodexDeck`。
- 约束：旧技术名称只允许存在于 Legacy 导入、测试夹具、迁移文档和来源记录中，不能进入 Deck 生产依赖和发布身份。

### D-006：发布主体与安装身份

- 状态：**已确认**
- 决策：使用 GitHub namespace `nanzheyin`；目标仓库为 `nanzheyin/codex-deck`；bundle identifier 为 `io.github.nanzheyin.codexdeck`；更新和正式下载使用该仓库的 GitHub Releases。
- 约束：Codex Deck 使用全新的安装产品族，不覆盖 CodexPlusPlus；平台签名主体以未来实际证书为准，但不改变已冻结的产品身份。

### D-007：许可证与来源策略

- 状态：**已确认**
- 决策：Codex Deck 使用 `AGPL-3.0-only`；允许选择性复用许可证兼容的上游代码，但必须保留来源、版权、许可证和修改记录。
- 约束：代码复用不得破坏 Deck 独立模块边界；正式发布需要提供对应源代码、构建说明和第三方许可证归属清单。

### D-008：Legacy 数据导入范围

- 状态：**已确认**
- 决策：采用完整引导式导入。非敏感配置经总预览后自动转换；插件、外部路径和集成逐项确认；凭据逐项确认后进入平台安全存储；Codex 原生会话数据库不复制。
- 约束：导入前创建快照，失败恢复本次导入前状态，旧数据不删除；Legacy 日志、缓存、进程状态和临时文件不导入。

### D-009：Legacy 回滚维护期限

- 状态：**已确认**
- 决策：Codex Deck 正式切换成功后，Legacy 立即停止维护，不再发布功能、修复或兼容更新。
- 保留：最后安装包、源码、发布记录和用户旧数据以只读方式保留，作为冻结的应急回退材料。
- 风险：Legacy 不承诺兼容切换后的未来 Codex App 版本，因此所有功能等价、导入和回滚验证必须在正式切换前完成。

### D-010：Legacy 功能等价基线

- 状态：**已冻结**
- 决策：使用开始重建前的本地最终 Legacy 版本，纳入届时已经完成并验收的本地功能，不使用较旧的 GitHub 已发布版本代替。
- 交付物：产品代码 commit `10a0663522bb765036ad340a7acbbab1a355247c`、`legacy-final-v1.2.47-20260716` tag、本地 Windows release 二进制与哈希、构建信息、逐项功能矩阵和自动化基线结果。
- 约束：用户现有改动不得被擅自排除、覆盖或回滚；半成品功能不得混入最终基线。

### D-011：正式切换验收强度

- 状态：**已确认**
- 决策：采用严格验收。功能矩阵 100% 通过；Windows、macOS 真实链路通过；连续运行至少 2 小时；会话切换至少 100 次；完整导入与回滚至少演练 3 次；P0、P1 未解决缺陷均为 0。
- 约束：任一硬门槛未通过都禁止正式切换；总验收通过后仍需用户明确批准，不能由构建或更新流程自动停止 Legacy。

## 15. 开发授权边界

用户已经明确授权“可以开发”。Legacy 功能基线和验收矩阵已冻结，下一步可以创建独立 Codex Deck 产品代码。

本次开发授权不等于正式发布或迁移授权。完成全部严格验收后，仍需用户明确批准，才能发布、执行正式数据导入、切换产品并停止 Legacy 维护。
