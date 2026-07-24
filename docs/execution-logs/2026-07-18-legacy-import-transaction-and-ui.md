# Legacy 导入事务与维护页入口执行记录

日期：2026-07-18

状态：本地开发增量完成；未发布、未切换、未导入真实数据。

## 1. 本轮范围

- 增加 Legacy 导入 apply 命令：只接受 Deck app-state 下 `legacy-import-transactions` 事务目录。
- 将 Legacy 导入接入维护页：只读预览、低风险非敏感项勾选、事务准备、事务应用入口。
- 继续保持 secrets、外部路径、可执行配置为待确认项；不自动导入。
- 修正诊断日志限流测试的并发噪声断言，只统计本测试事件。

## 2. 自动化结果

| 项目 | 结果 |
| --- | --- |
| `cargo fmt --all --check` | 通过 |
| `cargo test -p codex-plus-core legacy_import --lib` | 8 通过 |
| `cargo test -p codex-plus-core --lib` | 162 通过，1 ignored |
| `cargo test -p codex-plus-manager legacy_import --lib` | 4 通过 |
| `cargo test -p codex-plus-manager --lib` | 54 通过 |
| `cargo test -p codex-plus-manager --test windows_subsystem` | 28 通过 |
| `npm run check` | 通过 |

## 3. Chrome 页面烟测

- 浏览器：Google Chrome。
- 页面：`http://127.0.0.1:1420/`。
- 桌面视口：维护页可打开，`Legacy 导入` 分类可见，Legacy 导入面板包含目录输入、选择目录、生成预览按钮和只读安全说明；无横向溢出。
- 移动视口：`390 x 844` 下维护页和 Legacy 导入面板可见，目录输入与两个按钮可用宽度内展示；无横向溢出。
- 限制：普通 Chrome 不是 Tauri 宿主，会出现 `Cannot read properties of undefined (reading 'invoke')`，因此本烟测只证明前端可见性和响应式布局，不代表后端真实 Tauri 链路验收完成。

## 4. 未完成门槛

- secrets 写入平台安全存储仍未实现。
- 外部路径、可执行配置的逐项确认提交仍未实现。
- 回滚执行和三次迁移演练仍未完成。
- 未在真实 Legacy 数据目录上执行导入。
- 未进行正式发布、GitHub Release 打包验证或生产冒烟检查。
