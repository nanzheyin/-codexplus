use std::path::{Path, PathBuf};

use codex_plus_core::gpu_cache_guard::{
    GpuCacheGuardAction, gpu_cache_sentinel_path, packaged_app_family_name,
    parse_appx_package_status_output, protect_packaged_gpu_cache_at, validate_appx_package_status,
};

fn packaged_app(root: &Path, identity: &str) -> PathBuf {
    root.join(format!("{identity}_26.506.2212.0_x64__2p2nqsd0c76g0/app"))
}

#[test]
fn creates_gpu_cache_sentinel_on_first_run() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = packaged_app(temp.path(), "OpenAI.Codex");
    let local_appdata = temp.path().join("local");
    let backups = temp.path().join("backups");

    let result = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, false).unwrap();
    let sentinel = result.sentinel_path.as_ref().unwrap();

    assert_eq!(result.action, GpuCacheGuardAction::Created);
    assert!(sentinel.is_file());
    assert_eq!(std::fs::metadata(sentinel).unwrap().len(), 0);
    assert!(
        std::fs::metadata(sentinel)
            .unwrap()
            .permissions()
            .readonly()
    );
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows::Win32::Storage::FileSystem::{
            FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_READONLY, FILE_ATTRIBUTE_SYSTEM,
        };

        let attributes = std::fs::metadata(sentinel).unwrap().file_attributes();
        let required =
            FILE_ATTRIBUTE_HIDDEN.0 | FILE_ATTRIBUTE_READONLY.0 | FILE_ATTRIBUTE_SYSTEM.0;
        assert_eq!(attributes & required, required);
    }
    assert!(!backups.exists());
}

#[test]
fn repeated_run_is_idempotent() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = packaged_app(temp.path(), "OpenAI.Codex");
    let local_appdata = temp.path().join("local");
    let backups = temp.path().join("backups");

    let first = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, false).unwrap();
    let second = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, false).unwrap();

    assert_eq!(first.action, GpuCacheGuardAction::Created);
    assert_eq!(second.action, GpuCacheGuardAction::AlreadyProtected);
    assert_eq!(first.sentinel_path, second.sentinel_path);
    assert!(!backups.exists());
}

#[test]
fn moves_existing_directory_to_backup_without_losing_contents() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = packaged_app(temp.path(), "OpenAI.Codex");
    let local_appdata = temp.path().join("local");
    let backups = temp.path().join("backups");
    let sentinel = gpu_cache_sentinel_path(&app_dir, &local_appdata).unwrap();
    std::fs::create_dir_all(&sentinel).unwrap();
    std::fs::write(sentinel.join("cache.db"), b"database").unwrap();
    std::fs::write(sentinel.join("cache.db-WAL"), b"wal").unwrap();

    let result = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, false).unwrap();
    let backup = result.backup_path.as_ref().unwrap();

    assert_eq!(result.action, GpuCacheGuardAction::ReplacedDirectory);
    assert!(sentinel.is_file());
    assert_eq!(std::fs::read(backup.join("cache.db")).unwrap(), b"database");
    assert_eq!(std::fs::read(backup.join("cache.db-WAL")).unwrap(), b"wal");
}

#[test]
fn running_app_skips_all_file_changes() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = packaged_app(temp.path(), "OpenAI.Codex");
    let local_appdata = temp.path().join("local");
    let backups = temp.path().join("backups");
    let sentinel = gpu_cache_sentinel_path(&app_dir, &local_appdata).unwrap();
    std::fs::create_dir_all(&sentinel).unwrap();
    std::fs::write(sentinel.join("cache.db"), b"active").unwrap();

    let result = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, true).unwrap();

    assert_eq!(result.action, GpuCacheGuardAction::SkippedAppRunning);
    assert_eq!(std::fs::read(sentinel.join("cache.db")).unwrap(), b"active");
    assert!(!backups.exists());
}

#[test]
fn non_appx_path_is_ignored() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = temp.path().join("portable/app");
    let local_appdata = temp.path().join("local");
    let backups = temp.path().join("backups");

    let result = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, false).unwrap();

    assert_eq!(result.action, GpuCacheGuardAction::NotPackagedApp);
    assert!(!local_appdata.exists());
    assert!(!backups.exists());
}

#[test]
fn derives_stable_and_beta_package_families() {
    let root = Path::new(r"C:\Program Files\WindowsApps");
    let stable = packaged_app(root, "OpenAI.Codex");
    let beta = packaged_app(root, "OpenAI.CodexBeta");

    assert_eq!(
        packaged_app_family_name(&stable).as_deref(),
        Some("OpenAI.Codex_2p2nqsd0c76g0")
    );
    assert_eq!(
        packaged_app_family_name(&beta).as_deref(),
        Some("OpenAI.CodexBeta_2p2nqsd0c76g0")
    );
}

#[test]
fn normalizes_an_existing_nonempty_file() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = packaged_app(temp.path(), "OpenAI.Codex");
    let local_appdata = temp.path().join("local");
    let backups = temp.path().join("backups");
    let sentinel = gpu_cache_sentinel_path(&app_dir, &local_appdata).unwrap();
    std::fs::create_dir_all(sentinel.parent().unwrap()).unwrap();
    std::fs::write(&sentinel, b"not a sentinel").unwrap();

    let result = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, false).unwrap();

    assert_eq!(result.action, GpuCacheGuardAction::NormalizedFile);
    assert_eq!(std::fs::metadata(&sentinel).unwrap().len(), 0);
    assert!(
        std::fs::metadata(&sentinel)
            .unwrap()
            .permissions()
            .readonly()
    );
}

#[test]
fn backup_failure_preserves_the_existing_cache_and_returns_an_error() {
    let temp = tempfile::tempdir().unwrap();
    let app_dir = packaged_app(temp.path(), "OpenAI.Codex");
    let local_appdata = temp.path().join("local");
    let backups = temp.path().join("backups");
    let sentinel = gpu_cache_sentinel_path(&app_dir, &local_appdata).unwrap();
    std::fs::create_dir_all(&sentinel).unwrap();
    std::fs::write(sentinel.join("cache.db"), b"preserved").unwrap();
    std::fs::write(&backups, b"blocks directory creation").unwrap();

    let error = protect_packaged_gpu_cache_at(&app_dir, &local_appdata, &backups, false)
        .expect_err("a backup failure must block launch");

    assert!(
        error
            .to_string()
            .contains("failed to create GPU cache backup directory")
    );
    assert!(sentinel.is_dir());
    assert_eq!(
        std::fs::read(sentinel.join("cache.db")).unwrap(),
        b"preserved"
    );
}

#[test]
fn parses_appx_health_status_for_remediation_detection() {
    assert_eq!(
        parse_appx_package_status_output("\r\nNeedsRemediation\r\n").as_deref(),
        Some("NeedsRemediation")
    );
    assert_eq!(
        parse_appx_package_status_output("\nOk\n").as_deref(),
        Some("Ok")
    );
    assert_eq!(parse_appx_package_status_output(" \r\n"), None);
}

#[test]
fn blocks_unhealthy_appx_package_instead_of_claiming_cache_repair() {
    validate_appx_package_status("Ok").unwrap();

    let error = validate_appx_package_status("Modified, NeedsRemediation")
        .expect_err("an unhealthy AppX package must block launch");

    assert!(error.to_string().contains("Modified, NeedsRemediation"));
    assert!(
        error
            .to_string()
            .contains("GPU cache protection cannot repair")
    );
}
