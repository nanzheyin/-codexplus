# Codex Deck 第一阶段独立化计划与验收

## 目标

以现有 Codex++ fork 为兼容基础，先建立 Codex Deck 的独立产品身份、安装边界和数据目录。内部 Rust crate、Provider ID、上游协议字段在本阶段保留，后续再逐步替换架构。

## 本阶段范围

- 产品名为 `Codex Deck`，Manager 名为 `Codex Deck 管理工具`。
- Windows 只交付一个 `codex-deck.exe`；默认打开管理界面，`--launch-codex` 启动 Codex，`--helper-only` 运行协议代理。
- Windows 安装目录、快捷方式、卸载注册表项和 `codexdeck://` 协议使用独立命名空间。
- macOS App bundle、Bundle ID、DMG 和内部可执行文件使用 Codex Deck 命名。
- 主状态目录从旧的 `~/.codex-session-delete` 切换到 `~/.codex-deck`。
- 新目录不存在、为空或只含运行日志时，只复制旧目录中的 `settings.json` 和 `pending-provider-import.json`；旧目录不删除、不移动、不覆盖新配置。
- 拒绝把符号链接或非常规文件作为迁移来源。
- 更新器同时识别 Codex Deck 新安装包和旧 Codex++ 安装包。
- 供应商工作区提供供应商、本地中转和本机文件三个紧凑标签；OAuth 账号入口合并到新增供应商流程，本机文件页原文读取 `~/.codex/config.toml` 与 `~/.codex/auth.json`。
- 首次加载设置时，若供应商仓库为空或当前供应商为空，结构化解析 live TOML/JSON 并自动生成当前供应商；已有非空供应商不覆盖。
- 本地中转只监听 `127.0.0.1`，提供鉴权后的 Responses/Chat Completions 入口，并通过 `~/.codex-deck/local-relay.json` 保存本机状态。
- 本地中转供应商池直接引用供应商列表中的配置；每个成员可单独选择是否参与调用。新增成员和旧配置默认参与，暂停成员保留在池中但不进入路由；运行中修改先作为草稿，点击“应用配置”后才重启中转并生效。

## 非目标

- 本阶段不重命名内部 crate、旧 Provider ID、协议代理字段或上游来源地址。
- 本阶段不实现多实例供应商运行，也不改变用户 live 文件的自动写入策略；仅在用户手动保存或切换时写入。
- 本阶段不提交、推送或发布 GitHub Release。

## 验收标准

1. 核心库编译通过，路径单元测试覆盖新目录、首次复制、已有新配置不覆盖和非常规文件拒绝。
2. `cargo test -p codex-plus-core --lib` 通过。
3. 安装计划只输出一个 Codex Deck 业务二进制、一个桌面快捷方式、卸载键和指向统一 exe 的协议入口。
4. CI 和本地打包脚本只引用统一 EXE、App bundle 和安装包名称。
5. 启动入口在迁移失败时不删除旧目录，也不输出配置文件内容或密钥。
6. 空供应商会从 live config/auth 自动导入；已有供应商、缺失文件和非法 TOML/JSON 均有回归测试，错误结果不包含密钥。
7. 本地中转启动后 `/backend/status` 返回 200，安装目录只有 `codex-deck.exe` 与 `uninstall.exe`。
8. 本地中转只在成功独占监听端口后显示运行；启动时 live config/auth 指向 localhost 和本地 Key，停止后恢复直接供应商并释放端口。
9. 供应商页不再显示独立账号卡和直接/中转模式卡；直接供应商在列表选择，中转启停只位于本地中转页头，桌面及最小窗口宽度均无横向溢出。
10. 供应商池成员开关关闭后显示“已暂停”且不进入中转路由；至少保留一个配置完整的参与成员才能启动或应用。运行中修改显示“待应用”，在点击“应用配置”前不得写入 `disabledProviderIds` 或改变当前监听进程。

## 2026-07-22 本地交付记录

- `cargo test -p codex-plus-core --lib`：183 passed，1 ignored（公网 Release 检查）。
- `cargo test -p codex-plus-manager --lib`：64 passed。
- `cargo test -p codex-plus-core --test relay_config`：115 passed。
- `npm run check --prefix apps/codex-plus-manager` 与 `npm run vite:build --prefix apps/codex-plus-manager`：通过。
- 实机读取 `~/.codex/config.toml` / `auth.json` 后生成 1 个活动供应商；完整原文已进入供应商存档，未在命令输出中展示凭据。
- 供应商界面实机验收：本机配置页自动加载 2 个非空原文编辑器；新增供应商只提供 API Key 与 OAuth，OAuth 提供本机 config/auth 导入和浏览器登录。
- 供应商信息架构实机验收：账号入口合并到 OAuth 新增流程，顶部收为供应商/本地中转/本机文件三个 32px 高紧凑标签，删除直接/中转模式卡；1180x820 与 960x720 均无横向溢出，中转启停位于页头。
- 本地中转占用保护实机验收：`57321` 被旧安装版占用时保持已停止并返回端口绑定失败，不再复用其他进程的 helper。
- 本地中转完整链路实机验收：修复版独占 `57322`，live config/auth 切换到 localhost 与本地 Key，`/v1/models` 和 `gpt-5.6-sol` 的 `/v1/responses` 均返回 200；切回直接模式后源配置恢复且端口释放。
- 供应商池参与开关实机验收：桌面尺寸下标题、参与统计和添加框保持单行，成员行显示显式开关；暂停唯一成员后状态变为“已暂停”、计数变为 `0 / 1` 且启动按钮禁用。运行中暂停显示“待应用”，`local-relay.json` 的修改时间和 `disabledProviderIds` 均未变化，`57322` 继续由原中转进程监听；恢复草稿后停止中转，配置和端口均回到验收前状态。
- 最小窗口实机验收：窗口外框 `963x751`（内容区 `960x720`），侧栏自动收起；供应商池标题、统计、添加框、成员状态、参与开关和操作按钮均可见，无重叠或横向溢出。
- 新增回归测试：带鉴权 helper 拒绝已占用端口、停止后释放自有端口、源供应商原始配置必须被 localhost 中转地址覆盖；针对性测试与 `cargo fmt -p codex-plus-core -- --check` 通过。
- 新增回归测试：旧 JSON 缺少暂停字段时默认全部参与；暂停 ID 规范化并限制在池成员范围；路由排除暂停成员；全部暂停时拒绝启动，暂停且配置不完整的成员不阻塞其他成员。`cargo fmt --all -- --check` 与 `git diff --check` 通过。
- 本地安装包：`dist/windows/CodexDeck-1.2.47-local5-windows-x64-setup.exe`，SHA256 `D801BFC12EDD55B41A2464532766B7EF73D14E3DC2CBFB925AF31E80A06F2762`；目录中只保留这一份 setup，打包暂存目录只保留 `codex-deck.exe`。
- 安装后 release EXE 哈希 `57C668AD74DD1045C89238253A3824ECD765B1E4ACA27C2FEFFD513CD82A12DE` 与暂存文件一致，注册表版本为 `1.2.47-local5`；安装目录只包含 `codex-deck.exe` 和 `uninstall.exe`，桌面快捷方式存在，`codexdeck://` 指向已安装 EXE，正式版进程和首页启动正常。

## 已知风险

- 旧的用户脚本配置目录仍由现有功能使用，后续需要单独设计迁移和隔离策略。
- 全量 Windows 集成测试中的 `requireAdministrator` 清单仍依赖提权环境；本地 Rust/前端回归和真实安装链路已完成。
