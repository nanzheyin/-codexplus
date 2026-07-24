#![cfg_attr(windows, windows_subsystem = "windows")]

#[allow(dead_code)]
#[path = "../../../codex-plus-launcher/src/main.rs"]
mod launcher_entry;

fn main() {
    let launcher_mode = std::env::args()
        .skip(1)
        .any(|arg| matches!(arg.as_str(), "--launch-codex" | "--helper-only"));
    if launcher_mode {
        if let Err(error) = launcher_entry::run() {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "app.launcher_mode_failed",
                serde_json::json!({ "error": error.to_string() }),
            );
        }
        return;
    }
    if let Ok(report) = codex_plus_core::paths::migrate_legacy_app_state_if_needed()
        && report.migrated()
    {
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.legacy_state_migrated",
            serde_json::json!({ "copied_files": report.copied_files }),
        );
    }
    for arg in std::env::args() {
        if arg.starts_with("codexdeck://") || arg.starts_with("codexplusplus://") {
            match codex_plus_core::provider_import::save_pending_provider_import_from_url(&arg) {
                Ok(request) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.provider_import_url.pending",
                        serde_json::json!({
                            "name": request.name,
                            "baseUrl": request.base_url
                        }),
                    );
                    focus_existing_manager_window();
                }
                Err(error) => {
                    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.provider_import_url.failed",
                        serde_json::json!({
                            "error": error.to_string()
                        }),
                    );
                }
            }
        }
    }
    if std::env::args().any(|arg| arg == "--show-update") {
        unsafe {
            std::env::set_var("CODEX_PLUS_SHOW_UPDATE", "1");
        }
    }
    codex_plus_manager_lib::run();
}

#[cfg(windows)]
fn focus_existing_manager_window() {
    let current_process_id = std::process::id();
    for process in codex_plus_core::windows_enumerate_processes() {
        if process.process_id == current_process_id {
            continue;
        }
        if process.exe_file.eq_ignore_ascii_case("codex-deck.exe") {
            let _ = codex_plus_core::windows_activate_process_window(process.process_id);
            break;
        }
    }
}

#[cfg(not(windows))]
fn focus_existing_manager_window() {}
