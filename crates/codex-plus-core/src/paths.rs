use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::product_identity::{APP_STATE_DIR, LEGACY_APP_STATE_DIR};

const SETTINGS_FILE: &str = "settings.json";
const LATEST_STATUS_FILE: &str = "latest-status.json";
const DIAGNOSTIC_LOG_FILE: &str = "codex-plus.log";
const PENDING_PROVIDER_IMPORT_FILE: &str = "pending-provider-import.json";
const LEGACY_STATE_FILES: &[&str] = &[SETTINGS_FILE, PENDING_PROVIDER_IMPORT_FILE];

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct LegacyAppStateMigration {
    pub copied_files: Vec<String>,
}

impl LegacyAppStateMigration {
    pub fn migrated(&self) -> bool {
        !self.copied_files.is_empty()
    }
}

pub fn default_app_state_dir() -> PathBuf {
    if let Some(path) = app_state_dir_for_tests() {
        return path;
    }
    if let Some(home_dir) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        return home_dir.join(APP_STATE_DIR);
    }

    PathBuf::from(APP_STATE_DIR)
}

pub fn default_legacy_app_state_dir() -> PathBuf {
    if let Some(home_dir) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        return home_dir.join(LEGACY_APP_STATE_DIR);
    }

    PathBuf::from(LEGACY_APP_STATE_DIR)
}

pub fn migrate_legacy_app_state_if_needed() -> std::io::Result<LegacyAppStateMigration> {
    migrate_legacy_app_state_at(&default_legacy_app_state_dir(), &default_app_state_dir())
}

pub fn migrate_legacy_app_state_at(
    legacy_root: &Path,
    target_root: &Path,
) -> std::io::Result<LegacyAppStateMigration> {
    if legacy_root == target_root {
        return Ok(LegacyAppStateMigration::default());
    }

    match fs::symlink_metadata(target_root) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Codex Deck state directory cannot be a symbolic link",
            ));
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Codex Deck state path is not a directory",
            ));
        }
        Ok(_) => {
            let mut runtime_only = true;
            for entry in fs::read_dir(target_root)? {
                let entry = entry?;
                if entry.file_name() != DIAGNOSTIC_LOG_FILE {
                    runtime_only = false;
                    break;
                }
                let metadata = fs::symlink_metadata(entry.path())?;
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "Codex Deck runtime log is not a regular file",
                    ));
                }
            }
            if !runtime_only {
                return Ok(LegacyAppStateMigration::default());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }

    match fs::symlink_metadata(legacy_root) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "legacy Codex++ state directory cannot be a symbolic link",
            ));
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "legacy Codex++ state path is not a directory",
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LegacyAppStateMigration::default());
        }
        Err(error) => return Err(error),
    }

    let mut source_files = Vec::new();
    for file_name in LEGACY_STATE_FILES {
        let source = legacy_root.join(file_name);
        match fs::symlink_metadata(&source) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("legacy state file {file_name} cannot be a symbolic link"),
                ));
            }
            Ok(metadata) if !metadata.is_file() => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("legacy state file {file_name} is not a regular file"),
                ));
            }
            Ok(_) => source_files.push((source, *file_name)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }

    if source_files.is_empty() {
        return Ok(LegacyAppStateMigration::default());
    }

    fs::create_dir_all(target_root)?;
    let mut copied_files = Vec::with_capacity(source_files.len());
    for (source, file_name) in source_files {
        let destination = target_root.join(file_name);
        let bytes = fs::read(source)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        file.write_all(&bytes)?;
        copied_files.push(file_name.to_string());
    }

    Ok(LegacyAppStateMigration { copied_files })
}

pub fn default_settings_path() -> PathBuf {
    if let Some(path) = settings_path_for_tests() {
        return path;
    }
    default_app_state_dir().join(SETTINGS_FILE)
}

pub fn default_latest_status_path() -> PathBuf {
    default_app_state_dir().join(LATEST_STATUS_FILE)
}

pub fn default_diagnostic_log_path() -> PathBuf {
    default_app_state_dir().join(DIAGNOSTIC_LOG_FILE)
}

pub fn default_pending_provider_import_path() -> PathBuf {
    default_app_state_dir().join(PENDING_PROVIDER_IMPORT_FILE)
}

fn settings_path_for_tests() -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|path| path.clone())
}

static SETTINGS_PATH_FOR_TESTS: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static APP_STATE_DIR_FOR_TESTS: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn set_settings_path_for_tests(path: Option<PathBuf>) -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|mut current| std::mem::replace(&mut *current, path))
}

fn app_state_dir_for_tests() -> Option<PathBuf> {
    APP_STATE_DIR_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|path| path.clone())
}

pub fn set_app_state_dir_for_tests(path: Option<PathBuf>) -> Option<PathBuf> {
    APP_STATE_DIR_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|mut current| std::mem::replace(&mut *current, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_path_uses_app_state_directory() {
        let path = default_settings_path();

        assert!(path.ends_with(".codex-deck/settings.json"));
    }

    #[test]
    fn default_latest_status_path_uses_app_state_directory() {
        let path = default_latest_status_path();

        assert!(path.ends_with(".codex-deck/latest-status.json"));
    }

    #[test]
    fn default_diagnostic_log_path_uses_app_state_directory() {
        let path = default_diagnostic_log_path();

        assert!(path.ends_with(".codex-deck/codex-plus.log"));
    }

    #[test]
    fn default_pending_provider_import_path_uses_app_state_directory() {
        let path = default_pending_provider_import_path();

        assert!(path.ends_with(".codex-deck/pending-provider-import.json"));
    }

    #[test]
    fn legacy_state_is_copied_only_when_new_directory_is_empty() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join(".codex-session-delete");
        let target = temp.path().join(".codex-deck");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join(DIAGNOSTIC_LOG_FILE), b"runtime-log").unwrap();
        std::fs::write(legacy.join(SETTINGS_FILE), b"legacy-settings").unwrap();
        std::fs::write(legacy.join(PENDING_PROVIDER_IMPORT_FILE), b"legacy-pending").unwrap();

        let report = migrate_legacy_app_state_at(&legacy, &target).unwrap();
        assert_eq!(
            report.copied_files,
            vec![SETTINGS_FILE, PENDING_PROVIDER_IMPORT_FILE]
        );
        assert_eq!(
            std::fs::read(target.join(SETTINGS_FILE)).unwrap(),
            b"legacy-settings"
        );
        assert_eq!(
            std::fs::read(target.join(PENDING_PROVIDER_IMPORT_FILE)).unwrap(),
            b"legacy-pending"
        );
        assert!(legacy.join(SETTINGS_FILE).exists());

        std::fs::write(target.join(SETTINGS_FILE), b"new-settings").unwrap();
        std::fs::write(legacy.join(SETTINGS_FILE), b"changed-legacy").unwrap();
        let report = migrate_legacy_app_state_at(&legacy, &target).unwrap();
        assert!(!report.migrated());
        assert_eq!(
            std::fs::read(target.join(SETTINGS_FILE)).unwrap(),
            b"new-settings"
        );
    }

    #[test]
    fn legacy_state_rejects_non_regular_compatible_files() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join(".codex-session-delete");
        let target = temp.path().join(".codex-deck");
        std::fs::create_dir_all(legacy.join(SETTINGS_FILE)).unwrap();

        let error = migrate_legacy_app_state_at(&legacy, &target).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    }
}
