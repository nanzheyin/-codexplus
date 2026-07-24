# Legacy 导入 rollback 执行记录

日期：2026-07-19

状态：本地 rollback 能力和 retry 守卫补齐；未发布、未切换、未导入真实 Legacy 数据。

## 1. 本轮范围

- `prepare_legacy_import_transaction` 额外写入 `rollback-settings.json`，保存准备事务时的 Deck 设置快照。
- `rollback-manifest.json` 只保存快照路径、sha256 和是否可能含明文 secret 的元数据，不直接写入 secret 内容。
- 新增 `rollback_legacy_import_transaction` 核心函数和 Manager 命令。
- 维护页 Legacy 导入面板新增“回滚事务”按钮和回滚结果展示。
- 新增重复应用同一事务的 retry drill，确认不会重复写入 provider。
- 新增篡改 `rollback-settings.json` 的失败 drill，确认 sha256 不匹配时拒绝回滚且保持当前 Deck 设置不变。

## 2. 自动化结果

| 项目 | 结果 |
| --- | --- |
| `cargo fmt --all --check` | 通过 |
| `cargo test -p codex-plus-core legacy_import --lib` | 11 通过 |
| `cargo test -p codex-plus-core --lib` | 165 通过，1 ignored |
| `cargo test -p codex-plus-manager legacy_import --lib` | 5 通过 |
| `cargo test -p codex-plus-manager --test windows_subsystem manager_maintenance_route_exposes_legacy_import_transaction_flow` | 通过 |
| `npm run check` | 通过 |
| Google Chrome smoke `http://127.0.0.1:1420/` | Legacy 导入入口和布局可见；普通 Chrome 非 Tauri 宿主，不能证明后端 invoke 链路 |

## 3. 安全边界

- rollback 只恢复 Deck 设置文件快照，不修改 Legacy 源目录。
- 命令返回值不包含设置快照内容，不暴露 `sk-` 等 secret 文本。
- rollback 在恢复前校验本地备份 sha256，备份被篡改时拒绝恢复。
- `rollback-settings.json` 是本地事务恢复所需快照，可能包含准备事务时 Deck 设置里已有的 secret；正式切换前仍需要补安全存储策略和清理策略。

## 4. 仍未完成

- secrets 逐项确认并写入平台安全存储仍未完成。
- 外部路径和可执行配置逐项确认提交仍未完成。
- 真实失败注入和三次 rollback 演练仍未完成；当前只完成了重复 apply 与篡改备份的本地自动化 drill。
- 尚未在真实 Tauri 宿主中执行页面到命令的完整导入/回滚链路。
