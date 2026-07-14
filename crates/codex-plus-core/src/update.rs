use std::path::{Path, PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_REPOSITORY: &str = "xiamingjie123/-codexplus";
pub const DEFAULT_LATEST_JSON_URL: &str =
    "https://github.com/xiamingjie123/-codexplus/releases/latest/download/latest.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Release {
    pub version: String,
    pub url: String,
    pub body: String,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateCheck {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_summary: String,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
    pub update_available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateInstall {
    pub release: Release,
    pub installer_path: PathBuf,
    pub launched: bool,
}

pub fn parse_version_tag(value: &str) -> anyhow::Result<Vec<u64>> {
    let normalized = value.trim().trim_start_matches(['v', 'V']);
    let mut digits = String::new();
    for ch in normalized.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            digits.push(ch);
        } else {
            break;
        }
    }
    if digits.is_empty() {
        anyhow::bail!("Invalid version tag: {value}");
    }
    digits
        .split('.')
        .map(|part| part.parse::<u64>().map_err(Into::into))
        .collect()
}

pub fn is_newer_version(candidate: &str, current: &str) -> anyhow::Result<bool> {
    let mut left = parse_version_tag(candidate)?;
    let mut right = parse_version_tag(current)?;
    let len = left.len().max(right.len());
    left.resize(len, 0);
    right.resize(len, 0);
    Ok(left > right)
}

pub fn release_from_github_payload(payload: &Value) -> anyhow::Result<Release> {
    let version = payload
        .get("tag_name")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("release payload missing tag_name"))?
        .to_string();
    let assets = payload
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|asset| {
            Some((
                asset.get("name")?.as_str()?.to_string(),
                asset.get("browser_download_url")?.as_str()?.to_string(),
            ))
        })
        .collect::<Vec<_>>();
    let selected = select_update_asset(&assets);
    Ok(Release {
        version,
        url: payload
            .get("html_url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        body: payload
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        asset_name: selected.as_ref().map(|asset| asset.name.clone()),
        asset_url: selected.map(|asset| asset.browser_download_url),
    })
}

pub fn release_from_latest_json_payload(payload: &Value) -> anyhow::Result<Release> {
    let version = payload
        .get("version")
        .or_else(|| payload.get("tag_name"))
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("latest.json missing version"))?
        .to_string();
    let assets = payload
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|asset| {
            let name = asset.get("name")?.as_str()?.to_string();
            let url = asset
                .get("url")
                .or_else(|| asset.get("browser_download_url"))?
                .as_str()?
                .to_string();
            Some((name, url))
        })
        .collect::<Vec<_>>();
    let selected = select_update_asset(&assets);
    Ok(Release {
        version,
        url: payload
            .get("url")
            .or_else(|| payload.get("html_url"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        body: payload
            .get("body")
            .or_else(|| payload.get("release_summary"))
            .or_else(|| payload.get("notes"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        asset_name: selected.as_ref().map(|asset| asset.name.clone()),
        asset_url: selected.map(|asset| asset.browser_download_url),
    })
}

pub fn select_update_asset(assets: &[(String, String)]) -> Option<ReleaseAsset> {
    let named = assets
        .iter()
        .filter(|(name, url)| !name.trim().is_empty() && !url.trim().is_empty());
    let mut best: Option<(u8, &str, &str)> = None;
    for (name, url) in named {
        let rank = platform_asset_rank(&name.to_ascii_lowercase());
        if rank >= 2 {
            continue;
        }
        if best.map_or(true, |(r, _, _)| rank < r) {
            best = Some((rank, name.as_str(), url.as_str()));
        }
    }
    best.map(|(_, name, url)| ReleaseAsset {
        name: name.to_string(),
        browser_download_url: url.to_string(),
    })
}

fn update_request(
    client: &reqwest::Client,
    url: &str,
    accept: Option<&'static str>,
) -> reqwest::RequestBuilder {
    let request = client.get(url);
    match accept {
        Some(accept) => request.header(reqwest::header::ACCEPT, accept),
        None => request,
    }
}

async fn send_update_get_with_clients(
    url: &str,
    accept: Option<&'static str>,
    primary: &reqwest::Client,
    direct_fallback: Option<&reqwest::Client>,
) -> anyhow::Result<reqwest::Response> {
    match update_request(primary, url, accept).send().await {
        Ok(response) => Ok(response),
        Err(primary_error) => {
            let Some(direct_fallback) = direct_fallback else {
                return Err(primary_error).context("发送更新请求失败");
            };
            update_request(direct_fallback, url, accept)
                .send()
                .await
                .with_context(|| format!("默认网络请求失败（{primary_error:#}），直连重试也失败"))
        }
    }
}

async fn send_update_get(
    url: &str,
    accept: Option<&'static str>,
) -> anyhow::Result<reqwest::Response> {
    let user_agent = format!("Codex++/{}", crate::version::VERSION);
    let primary = crate::http_client::client_for_url(&user_agent, url)?;
    if crate::http_client::is_local_url(url) {
        return send_update_get_with_clients(url, accept, &primary, None).await;
    }
    let direct = crate::http_client::direct_client(&user_agent)?;
    send_update_get_with_clients(url, accept, &primary, Some(&direct)).await
}

pub async fn fetch_latest_release(latest_json_url: &str) -> anyhow::Result<Release> {
    let payload = send_update_get(latest_json_url, Some("application/json"))
        .await?
        .error_for_status()
        .context("更新清单返回错误状态")?
        .json::<Value>()
        .await
        .context("解析更新清单失败")?;
    release_from_latest_json_payload(&payload)
}

pub async fn check_for_update(current_version: &str) -> anyhow::Result<UpdateCheck> {
    let release = fetch_latest_release(DEFAULT_LATEST_JSON_URL).await?;
    let update_available = is_newer_version(&release.version, current_version)?;
    Ok(UpdateCheck {
        current_version: current_version.to_string(),
        latest_version: Some(release.version),
        release_summary: release.body,
        asset_name: release.asset_name,
        asset_url: release.asset_url,
        update_available,
    })
}

pub async fn perform_update(
    release: &Release,
    download_dir: &Path,
) -> anyhow::Result<UpdateInstall> {
    let url = release
        .asset_url
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("没有可下载的 Release asset"))?;
    let bytes = send_update_get(url, None)
        .await?
        .error_for_status()
        .context("安装包下载返回错误状态")?
        .bytes()
        .await
        .context("读取安装包下载内容失败")?;
    let installer_path = download_asset_to(release, &bytes, download_dir)?;
    launch_installer(&installer_path)?;
    Ok(UpdateInstall {
        release: release.clone(),
        installer_path,
        launched: true,
    })
}

pub fn download_asset_to(
    release: &Release,
    bytes: &[u8],
    download_dir: &Path,
) -> anyhow::Result<PathBuf> {
    let name = release
        .asset_name
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("没有可下载的 Release asset"))?;
    let safe = safe_asset_name(name)?;
    std::fs::create_dir_all(download_dir)?;
    let path = download_dir.join(safe);
    std::fs::write(&path, bytes)?;
    Ok(path)
}

pub fn safe_asset_name(name: &str) -> anyhow::Result<String> {
    if name.trim().is_empty() {
        anyhow::bail!("非法 Release asset 文件名: {name}");
    }
    let path = Path::new(name);
    if path.components().count() != 1 {
        anyhow::bail!("非法 Release asset 文件名: {name}");
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow::anyhow!("非法 Release asset 文件名: {name}"))?;
    if file_name == "." || file_name == ".." {
        anyhow::bail!("非法 Release asset 文件名: {name}");
    }
    Ok(file_name.to_string())
}

fn platform_asset_rank(name: &str) -> u8 {
    // 0 = exact match (current OS + native arch)
    // 1 = same OS, other arch (acceptable fallback, e.g. x86_64 on arm64 or vice versa)
    // 2 = wrong platform
    if cfg!(target_os = "macos") {
        if !is_macos_installer_asset(name) {
            return 2;
        }
        if is_macos_native_arch_asset(name) {
            return 0;
        }
        return 1;
    }
    if cfg!(windows) && is_windows_installer_asset(name) {
        return 0;
    }
    2
}

fn is_macos_native_arch_asset(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let native_arch_token = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        _ => return true, // unknown arch — accept anything
    };
    // Modern filename shape: `...-macos-x64.dmg` or `...-macos-arm64.dmg`
    if lower.contains(&format!("-{native_arch_token}.")) {
        return true;
    }
    // Old filename shape: `CodexPlusPlus_1.0.9_x64.dmg`
    if lower.contains(&format!("_{native_arch_token}.")) {
        return true;
    }
    // Newer but alternative shape: `..._x64.dmg` (no `macos-` token)
    let other_token = if native_arch_token == "x64" {
        "arm64"
    } else {
        "x64"
    };
    if lower.contains(&format!("_{other_token}.")) || lower.contains(&format!("-{other_token}.")) {
        return false;
    }
    // No arch token at all — assume it matches the current arch.
    true
}

fn is_windows_installer_asset(name: &str) -> bool {
    name.contains("codex")
        && name.contains("plus")
        && (name.ends_with(".msi")
            || name.ends_with("-setup.exe")
            || name.ends_with("_setup.exe")
            || name.ends_with("setup.exe")
            || name.ends_with("installer.exe"))
}

fn is_macos_installer_asset(name: &str) -> bool {
    // Loose shape check; arch preference is handled by platform_asset_rank
    // via is_macos_native_arch_asset.
    name.contains("codex") && name.contains("plus") && name.ends_with(".dmg")
}

pub fn launch_installer(path: &Path) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new(path)
            .creation_flags(crate::windows_integration::CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("启动安装包失败：{error}"))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("打开 DMG 失败：{error}"))
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let _ = path;
        anyhow::bail!("当前平台不支持启动安装包")
    }
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_LATEST_JSON_URL, fetch_latest_release, send_update_get_with_clients};
    use serde_json::Value;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn update_request_retries_direct_after_proxy_send_failure() {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = vec![0u8; 2048];
            let _ = stream.read(&mut request).await.unwrap();
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}",
                )
                .await
                .unwrap();
        });

        let broken_proxy = reqwest::Proxy::all("http://127.0.0.1:1").unwrap();
        let primary = reqwest::Client::builder()
            .proxy(broken_proxy)
            .build()
            .unwrap();
        let direct = reqwest::Client::builder().no_proxy().build().unwrap();
        let response = send_update_get_with_clients(
            &format!("http://{address}/latest.json"),
            Some("application/json"),
            &primary,
            Some(&direct),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), reqwest::StatusCode::OK);
        assert_eq!(
            response.json::<Value>().await.unwrap(),
            serde_json::json!({"ok": true})
        );
        server.await.unwrap();
    }

    #[tokio::test]
    #[ignore = "requires access to the public GitHub Release"]
    async fn live_update_manifest_is_reachable() {
        let release = fetch_latest_release(DEFAULT_LATEST_JSON_URL)
            .await
            .expect("fetch public latest.json");

        assert!(!release.version.trim().is_empty());
        assert!(release.url.contains("/releases/tag/"));
        assert!(release.asset_name.is_some());
        assert!(release.asset_url.is_some());
    }
}
