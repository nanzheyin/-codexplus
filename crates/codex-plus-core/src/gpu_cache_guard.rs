use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, bail};

const GPU_CACHE_RELATIVE_PATH: &[&str] = &[
    "LocalCache",
    "Roaming",
    "Codex",
    "web",
    "Codex",
    "GPUPersistentCache",
];
const GPU_CACHE_BACKUP_DIR: &[&str] = &["backups", "gpu-persistent-cache"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpuCacheGuardAction {
    NotPackagedApp,
    SkippedAppRunning,
    AlreadyProtected,
    Created,
    ReplacedDirectory,
    NormalizedFile,
}

impl GpuCacheGuardAction {
    fn as_str(self) -> &'static str {
        match self {
            Self::NotPackagedApp => "not_packaged_app",
            Self::SkippedAppRunning => "skipped_app_running",
            Self::AlreadyProtected => "already_protected",
            Self::Created => "created",
            Self::ReplacedDirectory => "replaced_directory",
            Self::NormalizedFile => "normalized_file",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GpuCacheGuardResult {
    pub action: GpuCacheGuardAction,
    pub sentinel_path: Option<PathBuf>,
    pub backup_path: Option<PathBuf>,
}

impl GpuCacheGuardResult {
    fn without_paths(action: GpuCacheGuardAction) -> Self {
        Self {
            action,
            sentinel_path: None,
            backup_path: None,
        }
    }
}

pub fn packaged_app_family_name(app_dir: &Path) -> Option<String> {
    let app_user_model_id = crate::app_paths::packaged_app_user_model_id(app_dir)?;
    let (family, app_id) = app_user_model_id.split_once('!')?;
    if app_id.is_empty() || !is_safe_path_component(family) {
        return None;
    }
    Some(family.to_string())
}

pub fn gpu_cache_sentinel_path(app_dir: &Path, local_appdata: &Path) -> Option<PathBuf> {
    let family = packaged_app_family_name(app_dir)?;
    let package_root = local_appdata.join("Packages").join(family);
    let target = join_components(package_root.clone(), GPU_CACHE_RELATIVE_PATH);
    target.starts_with(&package_root).then_some(target)
}

pub fn protect_packaged_gpu_cache_at(
    app_dir: &Path,
    local_appdata: &Path,
    backup_root: &Path,
    app_running: bool,
) -> anyhow::Result<GpuCacheGuardResult> {
    let Some(family) = packaged_app_family_name(app_dir) else {
        return Ok(GpuCacheGuardResult::without_paths(
            GpuCacheGuardAction::NotPackagedApp,
        ));
    };
    if app_running {
        return Ok(GpuCacheGuardResult::without_paths(
            GpuCacheGuardAction::SkippedAppRunning,
        ));
    }

    let package_root = local_appdata.join("Packages").join(&family);
    let sentinel_path = join_components(package_root.clone(), GPU_CACHE_RELATIVE_PATH);
    if !sentinel_path.starts_with(&package_root) {
        bail!("GPU cache sentinel resolved outside the AppX package data directory");
    }
    let sentinel_parent = sentinel_path
        .parent()
        .context("GPU cache sentinel path has no parent")?;
    fs::create_dir_all(sentinel_parent).context("failed to create GPU cache parent directory")?;

    let metadata = match fs::symlink_metadata(&sentinel_path) {
        Ok(metadata) => Some(metadata),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error).context("failed to inspect GPU cache path"),
    };

    match metadata {
        None => {
            create_sentinel(&sentinel_path)?;
            Ok(GpuCacheGuardResult {
                action: GpuCacheGuardAction::Created,
                sentinel_path: Some(sentinel_path),
                backup_path: None,
            })
        }
        Some(metadata) if metadata.file_type().is_symlink() => {
            bail!("GPU cache path cannot be a symbolic link")
        }
        Some(metadata) if metadata.is_dir() => {
            let backup_path = move_cache_directory_to_backup(
                &sentinel_path,
                backup_root,
                &family,
                SystemTime::now(),
            )?;
            create_sentinel(&sentinel_path)?;
            Ok(GpuCacheGuardResult {
                action: GpuCacheGuardAction::ReplacedDirectory,
                sentinel_path: Some(sentinel_path),
                backup_path: Some(backup_path),
            })
        }
        Some(metadata) if metadata.is_file() => {
            if metadata.len() == 0 && has_required_sentinel_attributes(&metadata) {
                return Ok(GpuCacheGuardResult {
                    action: GpuCacheGuardAction::AlreadyProtected,
                    sentinel_path: Some(sentinel_path),
                    backup_path: None,
                });
            }
            normalize_existing_sentinel(&sentinel_path, &metadata)?;
            Ok(GpuCacheGuardResult {
                action: GpuCacheGuardAction::NormalizedFile,
                sentinel_path: Some(sentinel_path),
                backup_path: None,
            })
        }
        Some(_) => bail!("GPU cache path is neither a regular file nor a directory"),
    }
}

pub fn parse_appx_package_status_output(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}

pub fn validate_appx_package_status(package_status: &str) -> anyhow::Result<()> {
    if package_status.eq_ignore_ascii_case("Ok") {
        return Ok(());
    }
    bail!(
        "ChatGPT AppX package status is {package_status}; GPU cache protection cannot repair \
         a damaged AppX package"
    )
}

#[cfg(windows)]
pub fn protect_packaged_gpu_cache_before_launch(
    app_dir: &Path,
) -> anyhow::Result<GpuCacheGuardResult> {
    let result = protect_packaged_gpu_cache_before_launch_inner(app_dir);
    match &result {
        Ok(result) => {
            let _ = crate::diagnostic_log::append_diagnostic_log(
                "launcher.gpu_cache_guard",
                serde_json::json!({
                    "action": result.action.as_str(),
                    "backup_created": result.backup_path.is_some(),
                }),
            );
        }
        Err(error) => {
            let _ = crate::diagnostic_log::append_diagnostic_log(
                "launcher.gpu_cache_guard_failed",
                serde_json::json!({
                    "message": error.to_string(),
                }),
            );
        }
    }
    result
}

#[cfg(not(windows))]
pub fn protect_packaged_gpu_cache_before_launch(
    _app_dir: &Path,
) -> anyhow::Result<GpuCacheGuardResult> {
    Ok(GpuCacheGuardResult::without_paths(
        GpuCacheGuardAction::NotPackagedApp,
    ))
}

#[cfg(windows)]
fn protect_packaged_gpu_cache_before_launch_inner(
    app_dir: &Path,
) -> anyhow::Result<GpuCacheGuardResult> {
    let Some(family) = packaged_app_family_name(app_dir) else {
        return Ok(GpuCacheGuardResult::without_paths(
            GpuCacheGuardAction::NotPackagedApp,
        ));
    };
    if !crate::watcher::find_codex_processes().is_empty() {
        return Ok(GpuCacheGuardResult::without_paths(
            GpuCacheGuardAction::SkippedAppRunning,
        ));
    }

    let package_name = package_name_from_family(&family)
        .context("failed to derive the AppX package name from its family name")?;
    let package_status = query_appx_package_status(package_name)?;
    validate_appx_package_status(&package_status)?;

    let local_appdata = std::env::var_os("LOCALAPPDATA").context("LOCALAPPDATA is unavailable")?;
    let backup_root = join_components(crate::paths::default_app_state_dir(), GPU_CACHE_BACKUP_DIR);
    protect_packaged_gpu_cache_at(app_dir, Path::new(&local_appdata), &backup_root, false)
}

fn package_name_from_family(family: &str) -> Option<&str> {
    let (package_name, publisher_id) = family.rsplit_once('_')?;
    if package_name.is_empty()
        || publisher_id.is_empty()
        || !is_safe_path_component(package_name)
        || !is_safe_path_component(publisher_id)
    {
        return None;
    }
    Some(package_name)
}

#[cfg(windows)]
fn query_appx_package_status(package_name: &str) -> anyhow::Result<String> {
    use std::os::windows::process::CommandExt;

    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$package=Get-AppxPackage -Name $env:CODEXDECK_APPX_PACKAGE | Select-Object -First 1; \
             if ($null -eq $package) { Write-Output 'NotFound' } \
             else { Write-Output $package.Status }",
        ])
        .env("CODEXDECK_APPX_PACKAGE", package_name)
        .creation_flags(crate::windows_integration::CREATE_NO_WINDOW)
        .output()
        .context("failed to query ChatGPT AppX package status")?;
    if !output.status.success() {
        bail!("ChatGPT AppX package status query failed");
    }
    parse_appx_package_status_output(&String::from_utf8_lossy(&output.stdout))
        .context("ChatGPT AppX package status query returned no status")
}

fn move_cache_directory_to_backup(
    source: &Path,
    backup_root: &Path,
    family: &str,
    now: SystemTime,
) -> anyhow::Result<PathBuf> {
    fs::create_dir_all(backup_root).context("failed to create GPU cache backup directory")?;
    let timestamp = now
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    for suffix in 0..1000u16 {
        let name = if suffix == 0 {
            format!("{family}-{timestamp}")
        } else {
            format!("{family}-{timestamp}-{suffix}")
        };
        let backup_path = backup_root.join(name);
        match fs::symlink_metadata(&backup_path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::rename(source, &backup_path)
                    .context("failed to move the old GPU cache directory to backup")?;
                return Ok(backup_path);
            }
            Ok(_) => {}
            Err(error) => {
                return Err(error).context("failed to inspect GPU cache backup destination");
            }
        }
    }
    bail!("failed to allocate a unique GPU cache backup path")
}

fn create_sentinel(path: &Path) -> anyhow::Result<()> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .context("failed to create GPU cache sentinel file")?;
    set_required_sentinel_attributes(path)?;
    verify_sentinel(path)
}

fn normalize_existing_sentinel(path: &Path, metadata: &fs::Metadata) -> anyhow::Result<()> {
    make_file_writable(path, metadata)?;
    OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(path)
        .context("failed to normalize GPU cache sentinel file")?;
    set_required_sentinel_attributes(path)?;
    verify_sentinel(path)
}

fn verify_sentinel(path: &Path) -> anyhow::Result<()> {
    let metadata =
        fs::symlink_metadata(path).context("failed to verify GPU cache sentinel metadata")?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() != 0 {
        bail!("GPU cache sentinel verification failed");
    }
    if !has_required_sentinel_attributes(&metadata) {
        bail!("GPU cache sentinel attributes verification failed");
    }
    Ok(())
}

#[cfg(windows)]
fn make_file_writable(path: &Path, metadata: &fs::Metadata) -> anyhow::Result<()> {
    use std::os::windows::fs::MetadataExt;
    use windows::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_READONLY, FILE_FLAGS_AND_ATTRIBUTES, SetFileAttributesW,
    };
    use windows::core::PCWSTR;

    let attributes = metadata.file_attributes() & !FILE_ATTRIBUTE_READONLY.0;
    let wide_path = wide_null(path);
    unsafe {
        SetFileAttributesW(
            PCWSTR(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(attributes),
        )
    }
    .context("failed to make GPU cache sentinel writable")
}

#[cfg(unix)]
fn make_file_writable(path: &Path, metadata: &fs::Metadata) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = metadata.permissions();
    permissions.set_mode(permissions.mode() | 0o200);
    fs::set_permissions(path, permissions).context("failed to make GPU cache sentinel writable")
}

#[cfg(not(any(windows, unix)))]
fn make_file_writable(path: &Path, metadata: &fs::Metadata) -> anyhow::Result<()> {
    let mut permissions = metadata.permissions();
    permissions.set_readonly(false);
    fs::set_permissions(path, permissions).context("failed to make GPU cache sentinel writable")
}

#[cfg(windows)]
fn set_required_sentinel_attributes(path: &Path) -> anyhow::Result<()> {
    use std::os::windows::fs::MetadataExt;
    use windows::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_ARCHIVE, FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_READONLY,
        FILE_ATTRIBUTE_SYSTEM, FILE_FLAGS_AND_ATTRIBUTES, SetFileAttributesW,
    };
    use windows::core::PCWSTR;

    let current = fs::metadata(path)
        .context("failed to inspect GPU cache sentinel attributes")?
        .file_attributes();
    let required = FILE_ATTRIBUTE_ARCHIVE.0
        | FILE_ATTRIBUTE_HIDDEN.0
        | FILE_ATTRIBUTE_READONLY.0
        | FILE_ATTRIBUTE_SYSTEM.0;
    let wide_path = wide_null(path);
    unsafe {
        SetFileAttributesW(
            PCWSTR(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(current | required),
        )
    }
    .context("failed to set GPU cache sentinel attributes")
}

#[cfg(not(windows))]
fn set_required_sentinel_attributes(path: &Path) -> anyhow::Result<()> {
    let mut permissions = fs::metadata(path)
        .context("failed to inspect GPU cache sentinel permissions")?
        .permissions();
    permissions.set_readonly(true);
    fs::set_permissions(path, permissions).context("failed to set GPU cache sentinel permissions")
}

#[cfg(windows)]
fn has_required_sentinel_attributes(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    use windows::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_READONLY, FILE_ATTRIBUTE_SYSTEM,
    };

    let required = FILE_ATTRIBUTE_HIDDEN.0 | FILE_ATTRIBUTE_READONLY.0 | FILE_ATTRIBUTE_SYSTEM.0;
    metadata.file_attributes() & required == required
}

#[cfg(not(windows))]
fn has_required_sentinel_attributes(metadata: &fs::Metadata) -> bool {
    metadata.permissions().readonly()
}

#[cfg(windows)]
fn wide_null(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn join_components(mut root: PathBuf, components: &[&str]) -> PathBuf {
    for component in components {
        root.push(component);
    }
    root
}

fn is_safe_path_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}
