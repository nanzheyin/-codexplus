# Legacy Final 功能等价矩阵

日期：2026-07-16

状态：Legacy 基线冻结清单；Codex Deck 正式切换前必须 100% 完成所有“必须迁移”项。

基线产品代码：`10a0663522bb765036ad340a7acbbab1a355247c`

计划标签：`legacy-final-v1.2.47-20260716`

最近增量记录：

- `docs/execution-logs/2026-07-18-legacy-import-transaction-and-ui.md`
- `docs/execution-logs/2026-07-19-legacy-import-rollback.md`

这些记录仅表示本地开发和烟测进度，不授权发布、切换或导入真实数据。

## 1. 等价判定规则

- 等价按用户结果判断，不要求复制旧 UI、旧文件结构或旧进程结构。
- “必须迁移”表示首个正式 Codex Deck 缺少该能力时禁止切换。
- 无法触达的死代码、测试工具和未进入当前产品的上游功能不属于等价范围。
- 修复卡顿、资源泄漏、错误提示和不安全存储不算破坏等价。
- 删除、降级、合并任何可触达能力时，必须单独取得用户确认并更新本矩阵。
- 每项 Deck 验收同时需要自动化证据和真实业务链路证据。

状态值：

```text
baseline      Legacy 基线能力已识别
not_started   Deck 尚未实现
in_progress   Deck 正在实现，不能发布
verified      自动化与真实链路均通过
waived        用户明确同意不迁移，并附决策记录
```

## 2. Manager 与应用生命周期

| ID | Legacy 用户能力 | 主要证据 | Deck 目标模块 | 要求 | Deck 状态 |
| --- | --- | --- | --- | --- | --- |
| APP-001 | Manager 单实例、主窗口、托盘显示/隐藏/退出 | `lib.rs` single-instance/tray source / `windows_subsystem` tests | manager + runtime | 必须迁移 | in_progress |
| APP-002 | 启动时读取版本、更新提示和运行概览 | `backend_version`、`startup_options`、`load_overview` / command tests | application/query | 必须迁移 | in_progress |
| APP-003 | 检测 Codex App 路径和版本 | `app_paths.rs` / `load_overview_uses_saved_codex_app_path_and_version` | codex adapter | 必须迁移 | verified |
| APP-004 | 启动、重启、激活已有 Codex App | `launch_codex_plus_spawns_helper_binary_with_trimmed_request_fields` / `restart_codex_plus_runs_stop_hook_before_spawning_new_launcher` / `launcher.rs` lifecycle tests | runtime supervisor | 必须迁移 | verified |
| APP-005 | 自定义 Codex 路径和附加启动参数 | `codexAppPath`、`codexExtraArgs` / `launcher_appends_extra_codex_arguments_after_debug_arguments` / command launch tests | settings + codex adapter | 必须迁移 | verified |
| APP-006 | 增强总开关关闭后仍可只做供应商/启动管理 | `launch_lifecycle_skips_helper_and_injection_when_enhancements_disabled` / `launch_lifecycle_runs_enabled_maintenance_without_applying_relay_profile` | application policy | 必须迁移 | verified |
| APP-007 | Manager 和 Runtime 健康状态、降级状态 | `load_overview` command tests / `bridge_backend_status_writes_diagnostic_log` / launcher degraded-mode tests | observability | 必须迁移 | verified |

## 3. 供应商、模型与配置

| ID | Legacy 用户能力 | 主要证据 | Deck 目标模块 | 要求 | Deck 状态 |
| --- | --- | --- | --- | --- | --- |
| PRO-001 | 加载、保存、重置设置并保留未知兼容字段 | `load_settings`、`save_settings`、`reset_settings` / settings、provider_import、relay_switch tests | settings | 必须迁移 | verified |
| PRO-002 | 多供应商创建、编辑、删除、选择和排序 | `App.tsx` relay profile list controls / `windows_subsystem` UI smoke / settings persistence tests | provider | 必须迁移 | in_progress |
| PRO-003 | 官方登录模式 | `RelayMode::Official` / official clear/auth restore relay tests / Provider Doctor official skip | provider + codex config | 必须迁移 | verified |
| PRO-004 | 官方登录混入 API | `officialMixApiKey` / official-mix relay config and storage tests | provider + secrets | 必须迁移 | verified |
| PRO-005 | 纯 API 模式 | `RelayMode::PureApi` / pure API apply and command injection tests | provider + proxy | 必须迁移 | verified |
| PRO-006 | Responses 与 Chat Completions 两种协议 | `RelayProtocol` / `protocol_proxy.rs` conversion tests / chat protocol apply tests | proxy | 必须迁移 | verified |
| PRO-007 | 聚合供应商 | aggregate profile injection / `aggregate_proxy_fails_over_to_next_member_in_same_request` | provider + proxy | 必须迁移 | verified |
| PRO-008 | 故障转移、按会话、按请求、权重轮转 | `relay_rotation.rs` failover/conversation/request/weighted tests | proxy/rotation | 必须迁移 | verified |
| PRO-009 | 切换供应商前保存当前配置并创建备份 | `switch_relay_profile_in_home` / `relay_switch.rs` tests / unknown-field rollback regression | application transaction | 必须迁移 | verified |
| PRO-010 | 应用、清理 relay/pure API 注入 | `apply_and_clear_relay_injection_round_trip_between_pure_api_and_official_login` / aggregate injection test | codex config adapter | 必须迁移 | verified |
| PRO-011 | 配置预览、读取和保存 config/auth 文件 | `read_relay_files` / `save_relay_file` / command round-trip tests | codex config adapter | 必须迁移 | verified |
| PRO-012 | 通用配置提取与合并 | `extract_relay_common_config` / relay common/context merge tests | provider/config | 必须迁移 | verified |
| PRO-013 | 从当前 Codex 配置回填供应商 | `backfill_relay_profile_from_live` / `backfill_relay_profile_from_home_with_common` / `relay_switch.rs` tests | codex config adapter | 必须迁移 | verified |
| PRO-014 | 供应商连通性和模型测试 | `test_relay_profile` / local HTTP command test | provider diagnostics | 必须迁移 | verified |
| PRO-015 | 延迟测量 | `measure_relay_latency_command_uses_local_http_server` / `relay_latency.rs` tests | provider diagnostics | 必须迁移 | verified |
| PRO-016 | Provider Doctor | `diagnose_relay_profile_reports_model_and_request_checks` / official-login skip test | provider diagnostics | 必须迁移 | verified |
| PRO-017 | 拉取供应商模型列表 | `fetch_relay_profile_models_uses_versioned_base_url_without_double_v1` | model catalog | 必须迁移 | verified |
| PRO-018 | 默认模型、测试模型、User-Agent | `RelayProfile` fields / relay test command / proxy User-Agent tests | provider | 必须迁移 | verified |
| PRO-019 | 每模型上下文窗口和自动压缩阈值 | `model_suffix.rs` / relay catalog context-window tests | model catalog | 必须迁移 | verified |
| PRO-020 | 生成和切换 `model_catalog_json` | relay config/model catalog tests / self-generated catalog replacement tests | codex config adapter | 必须迁移 | verified |
| PRO-021 | 模型插入模式和模型列表文本格式 | `RelayModelInsertMode` / model list suffix migration and catalog tests | model catalog | 必须迁移 | verified |
| PRO-022 | 按模型图像支持和图片剥离 | `stripImages`、`modelImageSupport` / `protocol_proxy.rs` image support tests | proxy/transform | 必须迁移 | verified |
| PRO-023 | 按模型 reasoning 支持和剥离 | `modelReasoningSupport` / reasoning strip and passthrough tests | proxy/transform | 必须迁移 | verified |
| PRO-024 | VL 图片描述、模型、窗口、token 和协议设置 | `VisionRelayConfig` / VL fallback and image-description proxy tests | proxy/vision | 必须迁移 | verified |
| PRO-025 | cc-switch/TOML/链接供应商导入及待确认流程 | `ccs_import.rs` / `provider_import.rs` / manager cc-switch import tests | legacy import + provider | 必须迁移 | verified |

## 4. 会话管理

| ID | Legacy 用户能力 | 主要证据 | Deck 目标模块 | 要求 | Deck 状态 |
| --- | --- | --- | --- | --- | --- |
| SES-001 | 扫描当前和兼容 schema 的本地会话 | `list_local_sessions` / `storage_adapter.rs` tests | session adapter | 必须迁移 | verified |
| SES-002 | 会话搜索、筛选、分页和详情展示 | `App.tsx` sessions route / `windows_subsystem` UI smoke | session query | 必须迁移 | in_progress |
| SES-003 | 单条和批量删除会话 | `delete_local_session` / `storage_adapter.rs` / bridge route tests | session command | 必须迁移 | verified |
| SES-004 | Markdown 导出 | `MarkdownExportService` / `/export-markdown` bridge tests | session export | 必须迁移 | verified |
| SES-005 | Token 用量历史及模型后缀清理 | `codex_thread_usage_history` / `sanitize_historical_model_suffixes` / `codex_sqlite.rs` tests | session adapter | 必须迁移 | verified |
| SES-006 | Provider metadata 目标发现和同步 | `load_provider_sync_targets` / `sync_providers_now` / `provider_sync.rs` tests | session/provider sync | 必须迁移 | verified |
| SES-007 | Provider 同步前备份和逐项结果 | `run_provider_sync` / backup + rollback tests | session transaction | 必须迁移 | verified |
| SES-008 | 会话索引清理预览和应用 | `preview_session_index_cleanup` / `apply_session_index_cleanup` / `provider_sync.rs` tests | session maintenance | 必须迁移 | verified |
| SES-009 | 项目归属和项目间移动 | renderer project move | session/project | 必须迁移 | not_started |
| SES-010 | 不复制 Codex 原生会话库，以其为唯一事实来源 | 已确认架构决策 | session adapter | 必须保持 | not_started |

## 5. MCP、Skills、Plugins 与用户脚本

| ID | Legacy 用户能力 | 主要证据 | Deck 目标模块 | 要求 | Deck 状态 |
| --- | --- | --- | --- | --- | --- |
| CTX-001 | 全局列出 MCP、Skills、Plugins | context route / `ContextScreen` / relay_config tests | context packages | 必须迁移 | verified |
| CTX-002 | 读取当前 Codex live context | `read_live_context_entries` / bridge routes | codex config adapter | 必须迁移 | verified |
| CTX-003 | 同步 live context 与通用配置 | `sync_live_context_entries` / relay_config tests | context transaction | 必须迁移 | verified |
| CTX-004 | 新增、编辑、启停和删除 context 项 | `upsert_context_entry` / `delete_context_entry` / relay_config tests | context packages | 必须迁移 | verified |
| CTX-005 | 供应商切换时合并全局 context | relay context tests / provider switch tests | application policy | 必须迁移 | verified |
| CTX-006 | 插件市场状态和本地修复 | `plugin_marketplace_status` / `repair_plugin_marketplace` | plugin adapter | 必须迁移 | verified |
| CTX-007 | 远程插件市场状态和修复 | `remote_plugin_marketplace_status` / `repair_remote_plugin_marketplace` | plugin adapter | 必须迁移 | verified |
| SCR-001 | 用户脚本清单、市场刷新和安装 | `refresh_script_market` / `install_market_script` / local HTTP tests | script packages | 必须迁移 | verified |
| SCR-002 | 用户脚本启停、删除和元数据 | `set_user_script_enabled` / `delete_user_script` / bridge routes | script packages | 必须迁移 | verified |
| SCR-003 | 用户脚本热重载设置 | `userScriptHotReload` / reload bridge tests | enhancement runtime | 必须迁移 | verified |

## 6. Codex Renderer 增强

| ID | Legacy 用户能力 | 主要证据 | Deck 目标模块 | 要求 | Deck 状态 |
| --- | --- | --- | --- | --- | --- |
| ENH-001 | 各增强独立开关和运行时设置同步 | BackendSettings update tests / `injection_script_loads_backend_settings_before_initial_scan` | feature registry | 必须迁移 | verified |
| ENH-002 | 插件市场解锁和兼容版本门控 | plugin marketplace command tests / version-gated plugin unlock cdp tests | plugin feature | 必须迁移 | verified |
| ENH-003 | 插件自动展开 | `injection_script_disables_plugin_auto_expand_in_relay_mode` / manager UI smoke | plugin feature | 必须迁移 | verified |
| ENH-004 | 自定义模型白名单和模型元数据 | `injection_script_unlocks_custom_model_catalog` / `model_ui_metadata_exposes_fast_service_tier_capability` | model feature | 必须迁移 | verified |
| ENH-005 | 会话删除、批量删除和更多菜单动作 | `delete_local_session` tests / `manager_sessions_route_exposes_search_filter_pagination_and_cleanup_actions` / cdp action-button tests | session feature | 必须迁移 | verified |
| ENH-006 | Markdown 导出和保存路径选择 | markdown export tests / `injection_script_prompts_for_markdown_export_path_when_supported` | session feature | 必须迁移 | verified |
| ENH-007 | 富文本粘贴转纯文本 | `paste_fix_settings.rs` / injection script paste-fix global test | composer feature | 必须迁移 | verified |
| ENH-008 | 强制中文界面 | `force_chinese_locale_settings.rs` | locale feature | 必须迁移 | verified |
| ENH-009 | 快速启动 | `launcher_fast_startup_adds_statsig_fast_fail_argument_when_enabled` | bootstrap feature | 必须迁移 | verified |
| ENH-010 | 原生菜单位置和本地化 | native menu lib tests / launcher native-menu inspector tests | native menu feature | 必须迁移 | verified |
| ENH-011 | 项目移动和 projectless 窗口保护 | `codex_app_state.rs` / projectless and project-move cdp tests | project feature | 必须迁移 | verified |
| ENH-012 | 线程 ID 徽标 | `injection_script_exposes_sidebar_thread_id_badge_control` | session feature | 必须迁移 | verified |
| ENH-013 | 会话宽度 | `injection_script_exposes_conversation_view_width_control` | layout feature | 必须迁移 | verified |
| ENH-014 | 会话滚动位置恢复 | `injection_script_restores_thread_scroll_positions` | scroll feature | 必须迁移 | verified |
| ENH-015 | 服务层级选择、请求覆盖和徽标 | service_tier_preload tests / fast service tier cdp tests | composer/protocol feature | 必须迁移 | verified |
| ENH-016 | Goals 和压缩后续跑保护 | goal resume guard protocol tests / goals feature config tests | goal feature | 必须迁移 | verified |
| ENH-017 | Stepwise 建议、刷新、直发及独立 API 设置 | stepwise lib tests / cdp Stepwise menu/refresh/direct-send tests | stepwise feature | 必须迁移 | verified |
| ENH-018 | 自定义图片覆盖层及 fit/opacity | image overlay asset/settings tests / cdp overlay config tests | overlay feature | 必须迁移 | verified |
| ENH-019 | Windows 实时鼠标查看覆盖图能力 | pet real mouse cdp capability/update/stop tests | platform feature | 必须迁移 | verified |
| ENH-020 | Upstream 分支下拉和 worktree 创建 | `upstream_worktree.rs` / branch dropdown cdp tests | worktree feature | 必须迁移 | verified |
| ENH-021 | Zed Remote 项目发现、打开、记忆和策略 | 功能、页面、bridge 与持久化入口已移除 | removed | 明确不迁移 | removed |
| ENH-022 | bridge 请求错误、超时和降级提示 | `bridge_routes.rs` / `injection_script_times_out_backend_bridge_calls_and_falls_back_to_helper` | renderer transport | 必须迁移并改进 | verified |
| ENH-023 | 关闭功能时释放 observer、timer、listener 和连接 | `App.tsx` pending-provider-import polling gated by `relayProfilesEnabled`; progress timers clear in `finally`; still needs injected observer/listener proof | feature lifecycle | 必须新增守卫 | in_progress |

## 7. 安装、更新与维护

| ID | Legacy 用户能力 | 主要证据 | Deck 目标模块 | 要求 | Deck 状态 |
| --- | --- | --- | --- | --- | --- |
| OPS-001 | Windows/macOS 入口安装与卸载 | `windows_subsystem` installer/workflow smoke / `installers` requires elevated runtime for full execution | platform installer | 必须迁移 | in_progress |
| OPS-002 | 快捷方式修复 | `repair_shortcuts` / installer entrypoint smoke | platform installer | 必须迁移 | in_progress |
| OPS-003 | Watcher 安装、卸载、启用和禁用 | `watcher.rs` install-plan/process/filter/enable-disable tests | runtime/platform | 必须迁移 | verified |
| OPS-004 | 环境冲突检测和选择性移除 | `env_conflict_commands_ignore_codex_home_and_remove_openai_vars` | diagnostics | 必须迁移 | verified |
| OPS-005 | 最新日志查看 | `read_latest_logs_redacts_existing_sensitive_text` / diagnostic log paths / manager lib tests | observability | 必须迁移 | verified |
| OPS-006 | 脱敏诊断复制/导出 | `copy_diagnostics_redacts_sensitive_settings` / `append_diagnostic_log_redacts_sensitive_values` | observability | 必须迁移并改进 | verified |
| OPS-007 | 前端诊断事件写入 | `write_diagnostic_event` / `bridge_backend_status_writes_diagnostic_log` / `append_diagnostic_log_rate_limits_repeated_events` | observability | 必须迁移并限流 | verified |
| OPS-008 | 设置和图片覆盖层设置重置 | `reset_settings` / `reset_image_overlay_settings` / settings command tests | settings | 必须迁移 | verified |
| OPS-009 | Release 更新检查和执行 | update commands/tests exist; `updater` test binary requires elevation in local run | update adapter | 必须迁移 | in_progress |
| OPS-010 | Windows NSIS、macOS x64/arm64 DMG | `windows_subsystem` workflow/package smoke; no live GitHub Release run verified | release | 必须迁移 | in_progress |
| OPS-011 | 系统代理、代理失败直连、本地回环直连 | `http_client` proxy tests / update direct-retry test | infrastructure/http | 必须迁移 | verified |
| OPS-012 | 日志异步、有界、轮转和脱敏 | `append_diagnostic_log_rotates_when_log_exceeds_limit` / redaction and rate-limit tests; async writer still pending | observability | 必须改进 | in_progress |

## 8. Legacy 一次性导入

| ID | 导入能力 | Deck 验收标准 | 要求 | Deck 状态 |
| --- | --- | --- | --- | --- |
| IMP-001 | 只读发现 `.codex-session-delete` 和 Legacy schema | `legacy_import.rs` read-only preview tests / `preview_legacy_import` command fixture / maintenance UI entry | 必须实现 | in_progress |
| IMP-002 | 总预览和冲突报告 | `LegacyImportPreview` lists automatic, confirmation, secret, excluded and conflict groups; maintenance UI displays summary/evidence | 必须实现 | in_progress |
| IMP-003 | 自动转换非敏感设置 | `apply_legacy_import_transaction` imports only selected `nonSensitiveConfig` and strips secret-bearing fields | 必须实现 | in_progress |
| IMP-004 | 可执行内容逐项确认 | Preview marks MCP/plugins/user scripts/external paths as confirmation-required; secure confirmation UI/commit still pending | 必须实现 | in_progress |
| IMP-005 | secrets 逐项确认并写入平台安全存储 | Preview detects secrets without exposing values; apply leaves selected secrets as `pendingConfirmation`; secure-store commit still pending | 必须实现 | in_progress |
| IMP-006 | Codex 原生会话不复制 | Preview excludes `sessions`、`state*.sqlite` and `session_index.jsonl`; adapter proof still pending | 必须实现 | in_progress |
| IMP-007 | 快照、临时事务区、原子提交和失败回滚 | `prepare_legacy_import_transaction` writes preview/ledger/rollback manifest and `rollback-settings.json`; `apply`/`rollback` are limited to app-state transaction dirs; rollback verifies backup sha256 before restore; live three rollback drills still pending | 必须实现 | in_progress |
| IMP-008 | 可重试 ledger | `LegacyImportLedger` records pending/skipped/excluded/failed; apply updates success/pendingConfirmation; rollback marks success as rolledBack; repeated apply retry drill avoids duplicate provider rows; interruption/failure retry drill still pending | 必须实现 | in_progress |
| IMP-009 | 不导入日志、缓存、PID、端口、锁和临时文件 | Preview excludes logs/cache/pid/port/lock/temp entries without reading contents | 必须实现 | in_progress |
| IMP-010 | 导入完成后不双写 | Deck 不再运行时依赖 Legacy 数据 | 必须实现 | not_started |

## 9. Tauri 命令面基线

当前 Manager 注册 70 个业务/维护命令和 3 个窗口生命周期命令。Deck 可以重新设计 RPC 名称，但功能矩阵必须覆盖这些用户结果：

```text
backend_version
startup_options
load_overview
launch_codex_plus
restart_codex_plus
load_settings
save_settings
load_ccs_providers
import_ccs_providers
load_pending_provider_import
confirm_pending_provider_import
dismiss_pending_provider_import
preview_legacy_import
prepare_legacy_import_transaction
apply_legacy_import_transaction
rollback_legacy_import_transaction
list_local_sessions
delete_local_session
load_provider_sync_targets
preview_session_index_cleanup
apply_session_index_cleanup
sync_providers_now
refresh_script_market
install_market_script
set_user_script_enabled
delete_user_script
open_external_url
install_entrypoints
uninstall_entrypoints
repair_shortcuts
plugin_marketplace_status
repair_plugin_marketplace
remote_plugin_marketplace_status
repair_remote_plugin_marketplace
check_update
perform_update
load_watcher_state
install_watcher
uninstall_watcher
enable_watcher
disable_watcher
read_latest_logs
copy_diagnostics
reset_settings
reset_image_overlay_settings
relay_status
read_relay_files
check_env_conflicts
remove_env_conflicts
save_relay_file
write_diagnostic_event
backfill_relay_profile_from_live
list_context_entries
read_live_context_entries
sync_live_context_entries
upsert_context_entry
delete_context_entry
extract_relay_common_config
test_relay_profile
measure_relay_latency
diagnose_relay_profile
test_stepwise_settings
fetch_relay_profile_models
switch_relay_profile
apply_relay_injection
apply_pure_api_injection
clear_relay_injection
manager_exit_app
manager_hide_to_tray
update_tray_labels
```

## 10. 正式切换总门槛

- 本文所有“必须迁移”项状态为 `verified` 或带用户决策记录的 `waived`。
- `not_started`、`in_progress` 或只有自动化没有真实链路证据时禁止切换。
- Windows、macOS、导入、回滚、2 小时稳定运行和 100 次会话切换满足架构计划的严格门槛。
- P0、P1 未解决缺陷均为 0。
- 用户审阅总验收报告并明确批准正式切换。
