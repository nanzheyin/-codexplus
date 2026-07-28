use std::path::Path;
use std::time::Duration;

use anyhow::{Context, bail};
use serde_json::json;

const MENU_LOCALIZATION_RETRIES: usize = 20;
const MENU_LOCALIZATION_RETRY_DELAY: Duration = Duration::from_millis(500);
const BOOTSTRAP_INSPECTOR_RETRIES: usize = 12;
const BOOTSTRAP_INSPECTOR_RETRY_DELAY: Duration = Duration::from_millis(250);
const BOOTSTRAP_INSPECTOR_QUERY_TIMEOUT: Duration = Duration::from_secs(1);
const BOOTSTRAP_RESUME_WATCHDOG_RETRIES: usize = 120;
const BOOTSTRAP_RESUME_WATCHDOG_DELAY: Duration = Duration::from_millis(500);

const MENU_LABEL_TRANSLATIONS: &[(&str, &str)] = &[
    ("File", "文件"),
    ("Edit", "编辑"),
    ("View", "视图"),
    ("Window", "窗口"),
    ("Help", "帮助"),
    ("Undo", "撤销"),
    ("Redo", "重做"),
    ("Cut", "剪切"),
    ("Copy", "复制"),
    ("Paste", "粘贴"),
    ("Delete", "删除"),
    ("Select All", "全选"),
    ("Copy conversation path", "复制对话路径"),
    ("Copy deeplink", "复制深度链接"),
    ("Copy session id", "复制会话 ID"),
    ("Copy working directory", "复制工作目录"),
    ("Close Tab", "关闭标签页"),
    ("Close", "关闭"),
    ("Reload Browser Page", "重新加载浏览器页面"),
    ("Force Reload Browser Page", "强制重新加载浏览器页面"),
    ("New Window", "新建窗口"),
    ("Open command menu", "打开命令菜单"),
    ("Search Chats…", "搜索对话..."),
    ("Search Files…", "搜索文件..."),
    ("Rename chat", "重命名对话"),
    ("Toggle File Tree", "切换文件树"),
    ("Start Trace Recording", "开始跟踪录制"),
    ("New Chat", "新建对话"),
    ("Quick Chat", "快速对话"),
    ("Open in New Window", "在新窗口中打开"),
    ("Archive chat", "归档对话"),
    ("Pin/unpin chat", "固定/取消固定对话"),
    ("Dictation", "听写"),
    ("Wake Pet", "唤醒助手"),
    ("Previous Chat", "上一个对话"),
    ("Next Chat", "下一个对话"),
    ("Settings…", "设置..."),
    ("Keyboard Shortcuts", "键盘快捷键"),
    ("Process Manager", "进程管理器"),
    ("Open Folder…", "打开文件夹..."),
    ("Toggle Sidebar", "切换边栏"),
    ("Toggle Bottom Panel", "切换底部面板"),
    ("Toggle Pinned Summary", "切换固定摘要"),
    ("Open Terminal", "打开终端"),
    ("Open Browser Tab", "打开浏览器标签页"),
    ("Toggle Browser Panel", "切换浏览器面板"),
    ("Toggle Side Panel", "切换侧边面板"),
    ("Find", "查找"),
    ("Focus Browser Address Bar", "聚焦浏览器地址栏"),
    ("Back", "后退"),
    ("Forward", "前进"),
    ("Go to Chat 1", "转到对话 1"),
    ("Go to Chat 2", "转到对话 2"),
    ("Go to Chat 3", "转到对话 3"),
    ("Go to Chat 4", "转到对话 4"),
    ("Go to Chat 5", "转到对话 5"),
    ("Go to Chat 6", "转到对话 6"),
    ("Go to Chat 7", "转到对话 7"),
    ("Go to Chat 8", "转到对话 8"),
    ("Go to Chat 9", "转到对话 9"),
    ("Log Out", "退出登录"),
    ("Reload Window", "重新加载窗口"),
    ("Zoom In", "放大"),
    ("Zoom Out", "缩小"),
    ("Actual Size", "实际大小"),
    ("Toggle Full Screen", "切换全屏"),
    ("Codex Documentation", "Codex 文档"),
    ("What's new", "更新内容"),
    ("Automations", "自动化"),
    ("Local Environments", "本地环境"),
    ("Worktrees", "工作树"),
    ("Skills", "技能"),
    ("Model Context Protocol", "模型上下文协议"),
    ("Troubleshooting", "故障排查"),
    ("Send Feedback", "发送反馈"),
    ("Check for Updates…", "检查更新..."),
    ("Updates Unavailable", "更新不可用"),
    ("Toggle Debug Menu", "切换调试菜单"),
    ("Open Deeplink from Clipboard", "从剪贴板打开深度链接"),
    ("Toggle Query Devtools", "切换查询 DevTools"),
    ("Toggle React Scan", "切换 React Scan"),
];

pub async fn install_native_menu_localizer(inspector_port: u16) -> anyhow::Result<()> {
    let mut last_error = None;
    for attempt in 1..=MENU_LOCALIZATION_RETRIES {
        match try_install_native_menu_localizer(inspector_port).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "native_menu.localization_retry_failed",
                    json!({
                        "inspector_port": inspector_port,
                        "attempt": attempt,
                        "message": last_error.as_ref().map(ToString::to_string).unwrap_or_default()
                    }),
                );
                tokio::time::sleep(MENU_LOCALIZATION_RETRY_DELAY).await;
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("native menu localization failed")))
}

pub async fn install_native_menu_localizer_with_service_tier_preload(
    inspector_port: u16,
    preload_path: &Path,
) -> anyhow::Result<()> {
    install_service_tier_preload_before_app(inspector_port, preload_path).await?;
    install_native_menu_localizer(inspector_port).await
}

pub fn native_menu_localizer_script() -> anyhow::Result<String> {
    let translations =
        serde_json::to_string(&MENU_LABEL_TRANSLATIONS.iter().copied().collect::<Vec<_>>())?;
    Ok(format!(
        r#"
(() => {{
  const translations = new Map({translations});
  const electron = process.mainModule?.require?.("electron");
  if (!electron?.Menu) return JSON.stringify({{ status: "skipped", reason: "electron-menu-unavailable" }});
  const Menu = electron.Menu;
  let changed = 0;
  const translateItem = (item) => {{
    if (!item) return;
    const nextLabel = translations.get(item.label);
    if (nextLabel && item.label !== nextLabel) {{
      item.label = nextLabel;
      changed += 1;
    }}
    if (item.submenu?.items) {{
      for (const child of item.submenu.items) translateItem(child);
    }}
  }};
  const translateMenu = (menu) => {{
    if (!menu?.items) return menu;
    for (const item of menu.items) translateItem(item);
    return menu;
  }};
  if (!globalThis.__codexPlusNativeMenuLocalizerInstalled) {{
    globalThis.__codexPlusNativeMenuLocalizerInstalled = true;
    const originalSetApplicationMenu = Menu.setApplicationMenu.bind(Menu);
    Menu.setApplicationMenu = (menu) => {{
      try {{ translateMenu(menu); }} catch {{}}
      return originalSetApplicationMenu(menu);
    }};
  }}
  const menu = Menu.getApplicationMenu();
  if (menu) {{
    translateMenu(menu);
    Menu.setApplicationMenu(menu);
  }}
  return JSON.stringify({{
    status: "ok",
    changed,
    topLabels: menu?.items?.map((item) => item.label) ?? []
  }});
}})()
"#
    ))
}

async fn try_install_native_menu_localizer(inspector_port: u16) -> anyhow::Result<()> {
    let target = main_process_inspector_target(inspector_port).await?;
    let websocket_url = target
        .web_socket_debugger_url
        .as_deref()
        .context("selected inspector target has no websocket URL")?;
    let script = native_menu_localizer_script()?;
    let result = crate::bridge::evaluate_script_with_await_promise(websocket_url, &script, true)
        .await
        .context("failed to evaluate native menu localizer")?;
    if let Some(exception) = result
        .get("result")
        .and_then(|value| value.get("exceptionDetails"))
    {
        bail!("native menu localizer threw: {exception}");
    }
    let _ = crate::diagnostic_log::append_diagnostic_log(
        "native_menu.localization_installed",
        json!({
            "inspector_port": inspector_port,
            "target_type": target.target_type,
            "target_title": target.title,
            "result": result
        }),
    );
    Ok(())
}

async fn install_service_tier_preload_before_app(
    inspector_port: u16,
    preload_path: &Path,
) -> anyhow::Result<()> {
    let script = crate::service_tier_preload::service_tier_preload_inspector_script(preload_path)?;
    let target = wait_for_main_process_inspector_target(inspector_port).await?;
    let websocket_url = target
        .web_socket_debugger_url
        .as_deref()
        .context("selected inspector target has no websocket URL")?;

    let result = match crate::bridge::evaluate_script_and_resume_debugger(websocket_url, &script)
        .await
        .context("failed to inject service tier preload before Electron bootstrap")
    {
        Ok(result) => result,
        Err(error) => {
            // 前一调用在脚本求值后会恢复进程；这里覆盖连接尚未建立、
            // 尚未能发送求值命令的情况，避免 `--inspect-brk` 让 Codex 卡住。
            if let Err(resume_error) = crate::bridge::resume_waiting_debugger(websocket_url).await {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "native_menu.service_tier_preload_resume_failed",
                    json!({
                        "inspector_port": inspector_port,
                        "message": resume_error.to_string(),
                    }),
                );
                start_bootstrap_resume_watchdog(inspector_port);
            }
            return Err(error);
        }
    };
    if let Some(exception) = result
        .get("result")
        .and_then(|value| value.get("exceptionDetails"))
    {
        bail!("service tier preload threw: {exception}");
    }
    let _ = crate::diagnostic_log::append_diagnostic_log(
        "native_menu.service_tier_preload_installed",
        json!({
            "inspector_port": inspector_port,
            "target_type": target.target_type,
            "target_title": target.title,
            "result": result
        }),
    );
    Ok(())
}

async fn wait_for_main_process_inspector_target(
    inspector_port: u16,
) -> anyhow::Result<crate::cdp::CdpTarget> {
    let mut last_error = None;
    for attempt in 1..=BOOTSTRAP_INSPECTOR_RETRIES {
        match tokio::time::timeout(
            BOOTSTRAP_INSPECTOR_QUERY_TIMEOUT,
            bootstrap_main_process_inspector_target(inspector_port),
        )
        .await
        {
            Ok(Ok(target)) => return Ok(target),
            Ok(Err(error)) => {
                last_error = Some(error);
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "native_menu.service_tier_preload_retry_failed",
                    json!({
                        "inspector_port": inspector_port,
                        "attempt": attempt,
                        "message": last_error.as_ref().map(ToString::to_string).unwrap_or_default()
                    }),
                );
                tokio::time::sleep(BOOTSTRAP_INSPECTOR_RETRY_DELAY).await;
            }
            Err(_) => {
                last_error = Some(anyhow::anyhow!(
                    "timed out waiting for the Node inspector target after {}ms",
                    BOOTSTRAP_INSPECTOR_QUERY_TIMEOUT.as_millis()
                ));
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "native_menu.service_tier_preload_retry_failed",
                    json!({
                        "inspector_port": inspector_port,
                        "attempt": attempt,
                        "message": last_error.as_ref().map(ToString::to_string).unwrap_or_default()
                    }),
                );
                tokio::time::sleep(BOOTSTRAP_INSPECTOR_RETRY_DELAY).await;
            }
        }
    }
    let error = last_error.unwrap_or_else(|| anyhow::anyhow!("service tier preload failed"));
    let resume_error = best_effort_resume_waiting_debugger(inspector_port)
        .await
        .err();
    if resume_error.is_some() {
        start_bootstrap_resume_watchdog(inspector_port);
    }
    let _ = crate::diagnostic_log::append_diagnostic_log(
        "native_menu.service_tier_preload_target_unavailable",
        json!({
            "inspector_port": inspector_port,
            "message": error.to_string(),
            "resume_error": resume_error.as_ref().map(ToString::to_string),
        }),
    );
    Err(error)
}

async fn best_effort_resume_waiting_debugger(inspector_port: u16) -> anyhow::Result<()> {
    let target = tokio::time::timeout(
        BOOTSTRAP_INSPECTOR_QUERY_TIMEOUT,
        bootstrap_main_process_inspector_target(inspector_port),
    )
    .await
    .context("timed out locating Node inspector target for debugger resume")??;
    let websocket_url = target
        .web_socket_debugger_url
        .as_deref()
        .context("selected inspector target has no websocket URL")?;
    crate::bridge::resume_waiting_debugger(websocket_url).await
}

fn start_bootstrap_resume_watchdog(inspector_port: u16) {
    tokio::spawn(async move {
        for attempt in 1..=BOOTSTRAP_RESUME_WATCHDOG_RETRIES {
            match best_effort_resume_waiting_debugger(inspector_port).await {
                Ok(()) => {
                    let _ = crate::diagnostic_log::append_diagnostic_log(
                        "native_menu.service_tier_preload_resume_watchdog_released",
                        json!({
                            "inspector_port": inspector_port,
                            "attempt": attempt,
                        }),
                    );
                    return;
                }
                Err(error) if attempt == BOOTSTRAP_RESUME_WATCHDOG_RETRIES => {
                    let _ = crate::diagnostic_log::append_diagnostic_log(
                        "native_menu.service_tier_preload_resume_watchdog_failed",
                        json!({
                            "inspector_port": inspector_port,
                            "attempt": attempt,
                            "message": error.to_string(),
                        }),
                    );
                }
                Err(_) => {}
            }
            tokio::time::sleep(BOOTSTRAP_RESUME_WATCHDOG_DELAY).await;
        }
    });
}

async fn bootstrap_main_process_inspector_target(
    inspector_port: u16,
) -> anyhow::Result<crate::cdp::CdpTarget> {
    let targets = crate::cdp::list_targets(inspector_port).await?;
    pick_bootstrap_main_process_inspector_target(&targets)
}

fn pick_bootstrap_main_process_inspector_target(
    targets: &[crate::cdp::CdpTarget],
) -> anyhow::Result<crate::cdp::CdpTarget> {
    targets
        .iter()
        .find(|target| {
            target
                .web_socket_debugger_url
                .as_deref()
                .is_some_and(|url| !url.is_empty())
                && target.target_type == "node"
        })
        .cloned()
        .context("No Electron main-process Node inspector target found")
}

async fn main_process_inspector_target(
    inspector_port: u16,
) -> anyhow::Result<crate::cdp::CdpTarget> {
    let targets = crate::cdp::list_targets(inspector_port).await?;
    targets
        .iter()
        .find(|target| {
            target
                .web_socket_debugger_url
                .as_deref()
                .is_some_and(|url| !url.is_empty())
                && target.target_type == "node"
        })
        .or_else(|| {
            targets.iter().find(|target| {
                target
                    .web_socket_debugger_url
                    .as_deref()
                    .is_some_and(|url| !url.is_empty())
            })
        })
        .cloned()
        .context("No Electron main-process inspector target found")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_menu_localizer_script_uses_runtime_menu_patch() {
        let script = native_menu_localizer_script().unwrap();

        assert!(script.contains("Menu.setApplicationMenu"));
        assert!(script.contains("Toggle Sidebar"));
        assert!(script.contains("切换边栏"));
        assert!(!script.contains("app.asar"));
    }

    #[test]
    fn service_tier_preload_starts_before_localizing_the_menu() {
        let source = include_str!("native_menu.rs");

        assert!(
            source
                .contains("install_service_tier_preload_before_app(inspector_port, preload_path)")
        );
        assert!(source.contains("evaluate_script_and_resume_debugger"));
        assert!(source.contains("resume_waiting_debugger"));
        assert!(source.contains("bootstrap_main_process_inspector_target"));
    }

    #[test]
    fn bootstrap_target_requires_node_inspector() {
        let renderer = crate::cdp::CdpTarget {
            id: "renderer".to_string(),
            target_type: "page".to_string(),
            title: "Codex".to_string(),
            url: "app://-/index.html".to_string(),
            web_socket_debugger_url: Some("ws://127.0.0.1:9329/page/renderer".to_string()),
        };
        let node = crate::cdp::CdpTarget {
            id: "main".to_string(),
            target_type: "node".to_string(),
            title: "ChatGPT".to_string(),
            url: "file://main.js".to_string(),
            web_socket_debugger_url: Some("ws://127.0.0.1:9329/node/main".to_string()),
        };

        let missing_node = pick_bootstrap_main_process_inspector_target(&[renderer.clone()])
            .expect_err("renderer inspector cannot release the paused Node main process");
        assert!(missing_node.to_string().contains("Node inspector target"));
        assert_eq!(
            pick_bootstrap_main_process_inspector_target(&[renderer, node])
                .expect("Node inspector should be selected")
                .id,
            "main"
        );
    }
}
