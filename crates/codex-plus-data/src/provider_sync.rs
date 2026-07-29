use fs2::FileExt;
use rusqlite::{Connection, OptionalExtension, params_from_iter, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DEFAULT_PROVIDER: &str = "openai";
const SESSION_DIRS: [&str; 2] = ["sessions", "archived_sessions"];
const BACKUP_KEEP_COUNT: usize = 5;
const PROVIDER_SYNC_LOCK_VERSION: u64 = 2;
const PROVIDER_SYNC_LOCK_RETRY_COUNT: usize = 30;
const PROVIDER_SYNC_LOCK_RETRY_DELAY: Duration = Duration::from_millis(100);
const LEGACY_LOCK_CREATION_GRACE: Duration = Duration::from_secs(2);
const LEGACY_LOCK_UNKNOWN_PROCESS_GRACE: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderSyncStatus {
    Disabled,
    Partial,
    Skipped,
    Synced,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderSyncResult {
    pub status: ProviderSyncStatus,
    pub message: String,
    pub target_provider: String,
    pub backup_dir: Option<PathBuf>,
    pub changed_session_files: usize,
    pub skipped_locked_rollout_files: Vec<PathBuf>,
    pub sqlite_rows_updated: usize,
    pub sqlite_provider_rows_updated: usize,
    pub sqlite_catalog_provider_rows_updated: usize,
    pub sqlite_catalog_rows_inserted: usize,
    pub sqlite_catalog_state_rows_updated: usize,
    pub sqlite_user_event_rows_updated: usize,
    pub sqlite_cwd_rows_updated: usize,
    pub duplicate_thread_rows_merged: usize,
    pub updated_workspace_roots: usize,
    pub encrypted_content_warning: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIndexCleanupCandidate {
    pub id: String,
    pub thread_name: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIndexCleanupPreview {
    pub snapshot_sha256: String,
    pub candidates: Vec<SessionIndexCleanupCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIndexCleanupResult {
    pub pruned_entries: usize,
    pub backup_dir: Option<PathBuf>,
    pub app_state_pruned: bool,
    pub app_state_backup_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeletedThreadReferencePruneResult {
    pub pruned_session_index_entries: usize,
    pub session_index_backup_dir: Option<PathBuf>,
    pub app_state_pruned: bool,
    pub app_state_backup_dir: Option<PathBuf>,
}

#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct SessionIndexCleanupApplyError {
    pub message: String,
    pub backup_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderSyncTargetSource {
    Config,
    Rollout,
    Sqlite,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSyncTargetOption {
    pub id: String,
    pub sources: Vec<ProviderSyncTargetSource>,
    pub is_current_provider: bool,
    pub is_manual: bool,
    pub is_saved: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSyncTargetList {
    pub current_provider: String,
    pub targets: Vec<ProviderSyncTargetOption>,
}

#[derive(Debug, Clone)]
struct SessionChange {
    path: PathBuf,
    original_text: String,
    next_text: String,
    original_session_meta_lines: Vec<String>,
    thread_id: Option<String>,
    cwd: Option<String>,
    has_user_event: bool,
    rewrite_needed: bool,
    original_mtime: Option<SystemTime>,
}

#[derive(Debug, Default)]
struct RolloutRewrite {
    next_text: String,
    rewrite_needed: bool,
    thread_id: Option<String>,
    cwd: Option<String>,
    providers: Vec<String>,
    original_session_meta_lines: Vec<String>,
    session_meta_count: usize,
}

#[derive(Debug, Default)]
struct SessionChanges {
    changes: Vec<SessionChange>,
    skipped_locked_rollout_files: Vec<PathBuf>,
    encrypted_content_counts: HashMap<String, usize>,
}

#[derive(Debug, Default)]
struct AppliedSessionChanges {
    changes: Vec<SessionChange>,
    skipped_locked_rollout_files: Vec<PathBuf>,
}

#[derive(Debug, Clone)]
struct SessionIndexPlan {
    path: PathBuf,
    original_bytes: Vec<u8>,
    original_text: String,
    snapshot_sha256: String,
    candidates: Vec<SessionIndexCleanupCandidate>,
}

#[derive(Debug, Clone)]
struct CatalogRecoveryRecord {
    thread_id: String,
    display_title: String,
    source_created_at: f64,
    source_updated_at: f64,
    cwd: String,
    git_branch: Option<String>,
    thread_source: Option<String>,
    source_rank: u8,
    metadata_updated_at: f64,
}

#[derive(Debug, Default)]
struct CatalogRecoveryPlan {
    records: HashMap<String, CatalogRecoveryRecord>,
    duplicate_thread_rows_by_id: HashMap<String, usize>,
}

#[derive(Debug, Clone, Default)]
struct SessionIndexMetadata {
    title: String,
    updated_at: Option<f64>,
}

#[derive(Debug, Default)]
struct SqliteUpdateCounts {
    provider_rows: usize,
    catalog_provider_rows: usize,
    catalog_inserted_rows: usize,
    catalog_state_rows: usize,
    duplicate_thread_rows_merged: usize,
    user_event_rows: usize,
    cwd_rows: usize,
}

impl SqliteUpdateCounts {
    fn total(&self) -> usize {
        self.provider_rows
            + self.catalog_inserted_rows
            + self.catalog_state_rows
            + self.user_event_rows
            + self.cwd_rows
    }

    fn add(&mut self, other: Self) {
        self.provider_rows += other.provider_rows;
        self.catalog_provider_rows += other.catalog_provider_rows;
        self.catalog_inserted_rows += other.catalog_inserted_rows;
        self.catalog_state_rows += other.catalog_state_rows;
        self.duplicate_thread_rows_merged += other.duplicate_thread_rows_merged;
        self.user_event_rows += other.user_event_rows;
        self.cwd_rows += other.cwd_rows;
    }
}

pub fn run_provider_sync(codex_home: Option<&Path>) -> ProviderSyncResult {
    run_provider_sync_with_target(codex_home, None)
}

pub fn run_provider_sync_with_target(
    codex_home: Option<&Path>,
    explicit_target_provider: Option<&str>,
) -> ProviderSyncResult {
    let home = codex_home
        .map(Path::to_path_buf)
        .unwrap_or_else(codex_plus_core::codex_sqlite::default_codex_home_dir);
    if !home.exists() {
        return result(
            ProviderSyncStatus::Skipped,
            format!("Codex home not found: {}", home.to_string_lossy()),
            DEFAULT_PROVIDER,
            None,
            0,
            0,
        );
    }
    let target_provider =
        match resolve_target_provider(&home.join("config.toml"), explicit_target_provider) {
            Ok(provider) => provider,
            Err(message) => {
                return result(
                    ProviderSyncStatus::Skipped,
                    message,
                    DEFAULT_PROVIDER,
                    None,
                    0,
                    0,
                );
            }
        };
    let lock_dir = home.join("tmp/provider-sync.lock");
    let _lock = match acquire_lock(&lock_dir) {
        Ok(lock) => lock,
        Err(error) => {
            let message = if error.kind() == std::io::ErrorKind::WouldBlock {
                "另一个历史会话同步任务正在运行，请稍后重试。".to_string()
            } else {
                format!("无法启动历史会话同步：{error}")
            };
            return result(
                ProviderSyncStatus::Skipped,
                message,
                &target_provider,
                None,
                0,
                0,
            );
        }
    };
    let sync_result = (|| -> anyhow::Result<ProviderSyncResult> {
        let collected = collect_session_changes(&home, &target_provider)?;
        let encrypted_content_warning =
            build_encrypted_content_warning(&collected.encrypted_content_counts, &target_provider);
        let rewrite_changes = collected
            .changes
            .iter()
            .filter(|change| change.rewrite_needed)
            .cloned()
            .collect::<Vec<_>>();
        let thread_ids_with_user_events = collected
            .changes
            .iter()
            .filter(|change| change.has_user_event)
            .filter_map(|change| change.thread_id.clone())
            .collect::<HashSet<_>>();
        let projectless_thread_ids =
            load_projectless_thread_ids(&home.join(".codex-global-state.json"))?;
        let cwd_by_thread_id = collected
            .changes
            .iter()
            .filter_map(|change| Some((change.thread_id.clone()?, change.cwd.clone()?)))
            .filter(|(thread_id, _)| !projectless_thread_ids.contains(thread_id))
            .collect::<HashMap<_, _>>();
        let sqlite_paths = codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home);
        let catalog_recovery =
            build_catalog_recovery_plan(&home, &sqlite_paths, &collected.changes)?;
        let sqlite_update_counts = count_sqlite_updates_for_paths(
            &sqlite_paths,
            &target_provider,
            &thread_ids_with_user_events,
            &cwd_by_thread_id,
            &catalog_recovery,
        )?;
        let global_state_update_count =
            count_global_state_updates(&home.join(".codex-global-state.json"))?;
        if rewrite_changes.is_empty()
            && sqlite_update_counts.total() == 0
            && global_state_update_count == 0
        {
            let mut synced = result(
                if collected.skipped_locked_rollout_files.is_empty() {
                    ProviderSyncStatus::Synced
                } else {
                    ProviderSyncStatus::Partial
                },
                if collected.skipped_locked_rollout_files.is_empty() {
                    "Session recovery already up to date"
                } else {
                    "Session recovery incomplete because some rollout files are in use"
                },
                &target_provider,
                None,
                0,
                0,
            );
            synced.skipped_locked_rollout_files = collected.skipped_locked_rollout_files;
            synced.encrypted_content_warning = encrypted_content_warning;
            return Ok(synced);
        }
        let backup_dir = create_backup(&home, &target_provider, &rewrite_changes)?;
        let applied = apply_session_changes(&rewrite_changes)?;
        let apply_result = (|| -> anyhow::Result<(SqliteUpdateCounts, usize)> {
            let sqlite_updates = apply_sqlite_update_for_paths(
                &sqlite_paths,
                &target_provider,
                &thread_ids_with_user_events,
                &cwd_by_thread_id,
                &catalog_recovery,
            )?;
            let updated_workspace_roots =
                apply_global_state_update(&home.join(".codex-global-state.json"))?;
            prune_backups(&home)?;
            Ok((sqlite_updates, updated_workspace_roots))
        })();
        let (sqlite_updates, updated_workspace_roots) = match apply_result {
            Ok(counts) => counts,
            Err(err) => {
                let _ = restore_session_changes(&applied.changes);
                return Err(err);
            }
        };
        let mut synced = result(
            ProviderSyncStatus::Synced,
            "Session recovery complete",
            &target_provider,
            Some(backup_dir),
            applied.changes.len(),
            sqlite_updates.total(),
        );
        synced.skipped_locked_rollout_files = collected.skipped_locked_rollout_files;
        synced
            .skipped_locked_rollout_files
            .extend(applied.skipped_locked_rollout_files);
        synced.skipped_locked_rollout_files.sort();
        synced.skipped_locked_rollout_files.dedup();
        if !synced.skipped_locked_rollout_files.is_empty() {
            synced.status = ProviderSyncStatus::Partial;
            synced.message =
                "Session recovery incomplete because some rollout files are in use".to_string();
        }
        synced.sqlite_provider_rows_updated = sqlite_updates.provider_rows;
        synced.sqlite_catalog_provider_rows_updated = sqlite_updates.catalog_provider_rows;
        synced.sqlite_catalog_rows_inserted = sqlite_updates.catalog_inserted_rows;
        synced.sqlite_catalog_state_rows_updated = sqlite_updates.catalog_state_rows;
        synced.sqlite_user_event_rows_updated = sqlite_updates.user_event_rows;
        synced.sqlite_cwd_rows_updated = sqlite_updates.cwd_rows;
        synced.duplicate_thread_rows_merged = sqlite_updates.duplicate_thread_rows_merged;
        synced.updated_workspace_roots = updated_workspace_roots;
        synced.encrypted_content_warning = encrypted_content_warning;
        Ok(synced)
    })();
    sync_result.unwrap_or_else(|err| {
        result(
            ProviderSyncStatus::Skipped,
            format!("Provider sync skipped: {err}"),
            &target_provider,
            None,
            0,
            0,
        )
    })
}

fn result(
    status: ProviderSyncStatus,
    message: impl Into<String>,
    target_provider: &str,
    backup_dir: Option<PathBuf>,
    changed_session_files: usize,
    sqlite_rows_updated: usize,
) -> ProviderSyncResult {
    ProviderSyncResult {
        status,
        message: message.into(),
        target_provider: target_provider.to_string(),
        backup_dir,
        changed_session_files,
        skipped_locked_rollout_files: Vec::new(),
        sqlite_rows_updated,
        sqlite_provider_rows_updated: 0,
        sqlite_catalog_provider_rows_updated: 0,
        sqlite_catalog_rows_inserted: 0,
        sqlite_catalog_state_rows_updated: 0,
        sqlite_user_event_rows_updated: 0,
        sqlite_cwd_rows_updated: 0,
        duplicate_thread_rows_merged: 0,
        updated_workspace_roots: 0,
        encrypted_content_warning: None,
    }
}

pub fn load_provider_sync_targets(codex_home: Option<&Path>) -> ProviderSyncTargetList {
    let home = codex_home
        .map(Path::to_path_buf)
        .unwrap_or_else(codex_plus_core::codex_sqlite::default_codex_home_dir);
    let current_provider = read_current_provider(&home.join("config.toml"));
    let mut sources: HashMap<String, HashSet<ProviderSyncTargetSource>> = HashMap::new();

    fn add_sources(
        sources: &mut HashMap<String, HashSet<ProviderSyncTargetSource>>,
        ids: impl IntoIterator<Item = String>,
        source: ProviderSyncTargetSource,
    ) {
        for id in ids {
            if !is_valid_provider_id_for_discovery(&id) {
                continue;
            }
            sources.entry(id).or_default().insert(source);
        }
    }

    add_sources(
        &mut sources,
        list_configured_provider_ids(&home.join("config.toml")),
        ProviderSyncTargetSource::Config,
    );
    add_sources(
        &mut sources,
        [current_provider.clone()],
        ProviderSyncTargetSource::Config,
    );
    if let Ok(ids) = rollout_provider_ids(&home) {
        add_sources(&mut sources, ids, ProviderSyncTargetSource::Rollout);
    }
    for db_path in codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home) {
        if let Ok(ids) = sqlite_provider_ids(&db_path) {
            add_sources(&mut sources, ids, ProviderSyncTargetSource::Sqlite);
        }
    }

    let mut targets = sources
        .into_iter()
        .map(|(id, source_set)| {
            let mut source_list = source_set.into_iter().collect::<Vec<_>>();
            source_list.sort();
            ProviderSyncTargetOption {
                is_current_provider: id == current_provider,
                is_manual: source_list.contains(&ProviderSyncTargetSource::Manual),
                is_saved: false,
                id,
                sources: source_list,
            }
        })
        .collect::<Vec<_>>();
    targets.sort_by(|left, right| {
        right
            .is_current_provider
            .cmp(&left.is_current_provider)
            .then_with(|| left.id.cmp(&right.id))
    });

    ProviderSyncTargetList {
        current_provider,
        targets,
    }
}

fn read_current_provider(path: &Path) -> String {
    let Ok(text) = fs::read_to_string(path) else {
        return DEFAULT_PROVIDER.to_string();
    };
    let provider = root_toml_string_value(&text, "model_provider").unwrap_or_default();
    if provider.trim().is_empty() {
        DEFAULT_PROVIDER.to_string()
    } else {
        provider
    }
}

fn resolve_target_provider(
    config_path: &Path,
    explicit_target_provider: Option<&str>,
) -> Result<String, String> {
    if let Some(raw) = explicit_target_provider {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Ok(read_current_provider(config_path));
        }
        if !is_valid_explicit_provider_id(trimmed) {
            return Err(format!("Invalid provider sync target: {trimmed:?}"));
        }
        return Ok(trimmed.to_string());
    }
    Ok(read_current_provider(config_path))
}

fn is_valid_explicit_provider_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.'))
}

fn list_configured_provider_ids(path: &Path) -> Vec<String> {
    let mut ids = HashSet::new();
    ids.insert(DEFAULT_PROVIDER.to_string());
    let Ok(text) = fs::read_to_string(path) else {
        return sorted_provider_ids(ids);
    };
    for line in text.lines() {
        let stripped = line.trim();
        let Some(section) = stripped
            .strip_prefix("[model_providers.")
            .and_then(|rest| rest.strip_suffix(']'))
        else {
            continue;
        };
        let id = section.trim();
        if is_valid_provider_id_for_discovery(id) {
            ids.insert(id.to_string());
        }
    }
    sorted_provider_ids(ids)
}

fn sorted_provider_ids(ids: HashSet<String>) -> Vec<String> {
    let mut ids = ids
        .into_iter()
        .filter(|id| !id.trim().is_empty())
        .collect::<Vec<_>>();
    ids.sort();
    ids
}

fn is_valid_provider_id_for_discovery(value: &str) -> bool {
    !value.trim().is_empty() && !value.chars().any(char::is_control)
}

fn root_toml_string_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let stripped = line.trim();
        if stripped.starts_with('[') {
            break;
        }
        let Some(raw) = toml_key_raw_value(stripped, key) else {
            continue;
        };
        return toml_string_value(raw);
    }
    None
}

fn toml_key_raw_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let rest = line.strip_prefix(key)?.trim_start();
    rest.strip_prefix('=').map(str::trim_start)
}

fn toml_string_value(raw: &str) -> Option<String> {
    let quote = raw.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let mut value = String::new();
    let mut escaping = false;
    for ch in raw[quote.len_utf8()..].chars() {
        if quote == '"' && escaping {
            value.push(ch);
            escaping = false;
        } else if quote == '"' && ch == '\\' {
            escaping = true;
        } else if ch == quote {
            return Some(value);
        } else {
            value.push(ch);
        }
    }
    None
}

struct ProviderSyncLock {
    owner_file: fs::File,
}

impl Drop for ProviderSyncLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.owner_file);
    }
}

fn acquire_lock(path: &Path) -> std::io::Result<ProviderSyncLock> {
    for attempt in 0..=PROVIDER_SYNC_LOCK_RETRY_COUNT {
        match try_acquire_lock(path) {
            Ok(lock) => return Ok(lock),
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    && attempt < PROVIDER_SYNC_LOCK_RETRY_COUNT =>
            {
                thread::sleep(PROVIDER_SYNC_LOCK_RETRY_DELAY);
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("provider sync lock retry loop always returns")
}

fn try_acquire_lock(path: &Path) -> std::io::Result<ProviderSyncLock> {
    fs::create_dir_all(path.parent().unwrap_or_else(|| Path::new(".")))?;
    let directory_existed = match fs::create_dir(path) {
        Ok(()) => false,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => true,
        Err(error) => return Err(error),
    };
    let directory_age = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok());
    let owner_path = path.join("owner.json");
    let owner_existed = owner_path.exists();
    let mut owner_file = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&owner_path)?;
    FileExt::try_lock_exclusive(&owner_file).map_err(normalize_lock_error)?;

    if legacy_lock_might_be_active(
        &mut owner_file,
        directory_existed,
        owner_existed,
        directory_age,
    )? {
        let _ = FileExt::unlock(&owner_file);
        return Err(std::io::Error::new(
            std::io::ErrorKind::WouldBlock,
            "legacy provider sync lock is still active",
        ));
    }

    owner_file.set_len(0)?;
    owner_file.seek(SeekFrom::Start(0))?;
    owner_file.write_all(
        json!({
            "lockVersion": PROVIDER_SYNC_LOCK_VERSION,
            "pid": std::process::id(),
            "startedAt": now_secs(),
        })
        .to_string()
        .as_bytes(),
    )?;
    owner_file.flush()?;
    Ok(ProviderSyncLock { owner_file })
}

fn normalize_lock_error(error: std::io::Error) -> std::io::Error {
    if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() {
        std::io::Error::new(
            std::io::ErrorKind::WouldBlock,
            "provider sync lock is already held",
        )
    } else {
        error
    }
}

fn legacy_lock_might_be_active(
    owner_file: &mut fs::File,
    directory_existed: bool,
    owner_existed: bool,
    directory_age: Option<Duration>,
) -> std::io::Result<bool> {
    if !directory_existed {
        return Ok(false);
    }
    if !owner_existed {
        return Ok(directory_age.is_some_and(|age| age < LEGACY_LOCK_CREATION_GRACE));
    }

    owner_file.seek(SeekFrom::Start(0))?;
    let mut text = String::new();
    owner_file.read_to_string(&mut text)?;
    let Ok(owner) = serde_json::from_str::<Value>(&text) else {
        return Ok(directory_age.is_some_and(|age| age < LEGACY_LOCK_CREATION_GRACE));
    };
    if owner.get("lockVersion").and_then(Value::as_u64) == Some(PROVIDER_SYNC_LOCK_VERSION) {
        return Ok(false);
    }
    let Some(process_id) = owner
        .get("pid")
        .and_then(Value::as_u64)
        .and_then(|pid| u32::try_from(pid).ok())
        .filter(|pid| *pid != 0)
    else {
        return Ok(directory_age.is_some_and(|age| age < LEGACY_LOCK_CREATION_GRACE));
    };
    Ok(match process_id_is_running(process_id) {
        Some(running) => running,
        None => owner
            .get("startedAt")
            .and_then(Value::as_u64)
            .map(|started_at| now_secs().saturating_sub(started_at))
            .is_some_and(|age| age < LEGACY_LOCK_UNKNOWN_PROCESS_GRACE.as_secs()),
    })
}

fn process_id_is_running(process_id: u32) -> Option<bool> {
    if process_id == std::process::id() {
        return Some(true);
    }
    #[cfg(windows)]
    {
        return codex_plus_core::windows_process_id_is_running(process_id);
    }
    #[cfg(target_os = "linux")]
    {
        return Some(Path::new("/proc").join(process_id.to_string()).exists());
    }
    #[cfg(all(unix, not(target_os = "linux")))]
    {
        return std::process::Command::new("/bin/ps")
            .args(["-p", &process_id.to_string(), "-o", "pid="])
            .output()
            .ok()
            .map(|output| output.status.success() && !output.stdout.is_empty());
    }
    #[allow(unreachable_code)]
    None
}

fn collect_session_changes(home: &Path, target_provider: &str) -> anyhow::Result<SessionChanges> {
    let mut collected = SessionChanges::default();
    for path in rollout_files(home)? {
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) if is_locked_io_error(&error) => {
                collected.skipped_locked_rollout_files.push(path);
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        let rewrite = rewrite_rollout_session_meta_providers(&text, target_provider)?;
        if rewrite.session_meta_count == 0 {
            continue;
        }
        let has_user_event = text.contains("\"user_message\"") || text.contains("\"user_input\"");
        if text.contains("encrypted_content") {
            for provider in &rewrite.providers {
                *collected
                    .encrypted_content_counts
                    .entry(provider.clone())
                    .or_insert(0) += 1;
            }
        }
        let original_mtime = fs::metadata(&path).and_then(|m| m.modified()).ok();
        collected.changes.push(SessionChange {
            path,
            original_text: text,
            next_text: rewrite.next_text,
            original_session_meta_lines: rewrite.original_session_meta_lines,
            thread_id: rewrite.thread_id,
            cwd: rewrite.cwd,
            has_user_event,
            rewrite_needed: rewrite.rewrite_needed,
            original_mtime,
        });
    }
    Ok(collected)
}

fn rewrite_rollout_session_meta_providers(
    text: &str,
    target_provider: &str,
) -> anyhow::Result<RolloutRewrite> {
    let mut rewrite = RolloutRewrite::default();
    for segment in text.split_inclusive('\n') {
        let (line, line_ending) = split_line_ending(segment);
        let mut next_line = line.to_string();
        if !line.trim().is_empty() {
            if let Ok(mut record) = serde_json::from_str::<Value>(line) {
                if record.get("type").and_then(Value::as_str) == Some("session_meta") {
                    let Some(payload) = record.get_mut("payload").and_then(Value::as_object_mut)
                    else {
                        rewrite.next_text.push_str(&next_line);
                        rewrite.next_text.push_str(line_ending);
                        continue;
                    };
                    rewrite.session_meta_count += 1;
                    rewrite.original_session_meta_lines.push(line.to_string());
                    if rewrite.thread_id.is_none() {
                        rewrite.thread_id = payload
                            .get("id")
                            .and_then(Value::as_str)
                            .map(ToString::to_string);
                    }
                    if rewrite.cwd.is_none() {
                        rewrite.cwd = payload
                            .get("cwd")
                            .and_then(Value::as_str)
                            .and_then(to_desktop_workspace_path);
                    }
                    let provider = payload
                        .get("model_provider")
                        .and_then(Value::as_str)
                        .unwrap_or("(missing)")
                        .to_string();
                    rewrite.providers.push(provider);
                    if payload.get("model_provider").and_then(Value::as_str)
                        != Some(target_provider)
                    {
                        payload.insert("model_provider".to_string(), json!(target_provider));
                        next_line = serde_json::to_string(&record)?;
                        rewrite.rewrite_needed = true;
                    }
                }
            }
        }
        rewrite.next_text.push_str(&next_line);
        rewrite.next_text.push_str(line_ending);
    }
    Ok(rewrite)
}

fn rollout_files(home: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for dirname in SESSION_DIRS {
        let root = home.join(dirname);
        if root.exists() {
            collect_rollout_files(&root, &mut files)?;
        }
    }
    files.sort();
    Ok(files)
}

fn collect_live_thread_ids(
    home: &Path,
    sqlite_paths: &[PathBuf],
) -> anyhow::Result<HashSet<String>> {
    let mut ids = HashSet::new();
    for path in rollout_files(home)? {
        if let Some(id) = path
            .file_name()
            .and_then(|name| name.to_str())
            .and_then(rollout_thread_id_from_filename)
        {
            ids.insert(id);
        }
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) if is_locked_io_error(&error) => continue,
            Err(error) => return Err(error.into()),
        };
        for segment in text.split_inclusive('\n') {
            let (line, _) = split_line_ending(segment);
            let Ok(record) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            if record.get("type").and_then(Value::as_str) != Some("session_meta") {
                continue;
            }
            if let Some(id) = record
                .get("payload")
                .and_then(Value::as_object)
                .and_then(|payload| payload.get("id"))
                .and_then(Value::as_str)
                .filter(|id| !id.trim().is_empty())
            {
                ids.insert(id.to_string());
            }
        }
    }
    for path in sqlite_paths {
        ids.extend(sqlite_thread_ids(path)?);
    }
    Ok(ids)
}

fn rollout_thread_id_from_filename(name: &str) -> Option<String> {
    let stem = name.strip_prefix("rollout-")?.strip_suffix(".jsonl")?;
    let bytes = stem.as_bytes();
    if bytes.len() < 36 {
        return None;
    }
    let candidate = &stem[stem.len() - 36..];
    let valid = candidate
        .chars()
        .enumerate()
        .all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        });
    valid.then(|| candidate.to_string())
}

fn sqlite_thread_ids(path: &Path) -> anyhow::Result<HashSet<String>> {
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let db = Connection::open(path)?;
    let mut ids = HashSet::new();
    for (table, column) in [
        ("threads", "id"),
        ("local_thread_catalog", "thread_id"),
        ("automation_runs", "thread_id"),
        ("inbox_items", "thread_id"),
        ("sessions", "id"),
        ("messages", "session_id"),
        ("thread_dynamic_tools", "thread_id"),
        ("thread_goals", "thread_id"),
        ("thread_spawn_edges", "parent_thread_id"),
        ("thread_spawn_edges", "child_thread_id"),
        ("stage1_outputs", "thread_id"),
        ("agent_job_items", "assigned_thread_id"),
    ] {
        if !table_columns(&db, table)?.contains(column) {
            continue;
        }
        let mut stmt = db.prepare(&format!(
            "SELECT DISTINCT {column} FROM {table} WHERE COALESCE({column}, '') <> ''"
        ))?;
        ids.extend(
            stmt.query_map([], |row| row.get::<_, String>(0))?
                .collect::<rusqlite::Result<HashSet<_>>>()?,
        );
    }
    Ok(ids)
}

fn plan_session_index_cleanup(
    path: &Path,
    live_thread_ids: &HashSet<String>,
) -> anyhow::Result<Option<SessionIndexPlan>> {
    if !path.exists() {
        return Ok(None);
    }
    let original_bytes = fs::read(path)?;
    let original_text = String::from_utf8(original_bytes.clone())?;
    let mut candidates = Vec::new();
    for segment in original_text.split_inclusive('\n') {
        let (line, _) = split_line_ending(segment);
        if let Some(candidate) = known_session_index_candidate(line)
            && !live_thread_ids.contains(&candidate.id)
        {
            candidates.push(candidate);
        }
    }
    Ok(Some(SessionIndexPlan {
        path: path.to_path_buf(),
        snapshot_sha256: sha256_hex(&original_bytes),
        original_bytes,
        original_text,
        candidates,
    }))
}

fn known_session_index_candidate(line: &str) -> Option<SessionIndexCleanupCandidate> {
    let record = serde_json::from_str::<Value>(line).ok()?;
    let object = record.as_object()?;
    if object.len() != 3
        || !["id", "thread_name", "updated_at"]
            .iter()
            .all(|key| object.contains_key(*key))
    {
        return None;
    }
    let id = object.get("id")?.as_str()?.trim();
    let thread_name = object.get("thread_name")?.as_str()?;
    let updated_at = object.get("updated_at")?.as_str()?;
    if id.is_empty() || updated_at.trim().is_empty() {
        return None;
    }
    Some(SessionIndexCleanupCandidate {
        id: id.to_string(),
        thread_name: thread_name.to_string(),
        updated_at: updated_at.to_string(),
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn filtered_session_index_text(
    plan: &SessionIndexPlan,
    selected_ids: &HashSet<String>,
) -> (String, usize) {
    let mut next_text = String::with_capacity(plan.original_text.len());
    let mut removed_entries = 0;
    for segment in plan.original_text.split_inclusive('\n') {
        let (line, line_ending) = split_line_ending(segment);
        let remove = known_session_index_candidate(line)
            .is_some_and(|candidate| selected_ids.contains(&candidate.id));
        if remove {
            removed_entries += 1;
        } else {
            next_text.push_str(line);
            next_text.push_str(line_ending);
        }
    }
    (next_text, removed_entries)
}

pub fn preview_session_index_cleanup(
    codex_home: Option<&Path>,
) -> anyhow::Result<SessionIndexCleanupPreview> {
    let home = codex_home
        .map(Path::to_path_buf)
        .unwrap_or_else(codex_plus_core::codex_sqlite::default_codex_home_dir);
    let sqlite_paths = codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home);
    let live_thread_ids = collect_live_thread_ids(&home, &sqlite_paths)?;
    let plan = plan_session_index_cleanup(&home.join("session_index.jsonl"), &live_thread_ids)?;
    Ok(match plan {
        Some(plan) => SessionIndexCleanupPreview {
            snapshot_sha256: plan.snapshot_sha256,
            candidates: plan.candidates,
        },
        None => SessionIndexCleanupPreview {
            snapshot_sha256: sha256_hex(&[]),
            candidates: Vec::new(),
        },
    })
}

pub fn apply_session_index_cleanup(
    codex_home: Option<&Path>,
    expected_snapshot_sha256: &str,
    confirmed_thread_ids: &[String],
) -> Result<SessionIndexCleanupResult, SessionIndexCleanupApplyError> {
    let require_stopped_app = codex_home.is_none();
    if require_stopped_app {
        ensure_codex_app_stopped(None)?;
    }
    let home = codex_home
        .map(Path::to_path_buf)
        .unwrap_or_else(codex_plus_core::codex_sqlite::default_codex_home_dir);
    let lock_dir = home.join("tmp/provider-sync.lock");
    let _lock = acquire_lock(&lock_dir).map_err(|error| cleanup_apply_error(error, None))?;
    (|| {
        let sqlite_paths = codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(&home);
        let live_thread_ids = collect_live_thread_ids(&home, &sqlite_paths)
            .map_err(|error| cleanup_apply_error(error, None))?;
        let plan = plan_session_index_cleanup(&home.join("session_index.jsonl"), &live_thread_ids)
            .map_err(|error| cleanup_apply_error(error, None))?
            .ok_or_else(|| cleanup_apply_error("session_index.jsonl 不存在，无法清理", None))?;
        if plan.snapshot_sha256 != expected_snapshot_sha256 {
            return Err(cleanup_apply_error(
                "session_index.jsonl 已在预览后发生变化；为避免覆盖 Codex 新内容，本次清理已中止，请重新预览",
                None,
            ));
        }
        let candidate_ids = plan
            .candidates
            .iter()
            .map(|candidate| candidate.id.as_str())
            .collect::<HashSet<_>>();
        let selected_ids = confirmed_thread_ids
            .iter()
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(ToString::to_string)
            .collect::<HashSet<_>>();
        if selected_ids
            .iter()
            .any(|id| !candidate_ids.contains(id.as_str()))
        {
            return Err(cleanup_apply_error(
                "确认列表已过期或包含非候选任务；本次清理未执行，请重新预览",
                None,
            ));
        }
        let (next_text, removed_entries) = filtered_session_index_text(&plan, &selected_ids);
        if removed_entries == 0 {
            return Ok(SessionIndexCleanupResult {
                pruned_entries: 0,
                backup_dir: None,
                app_state_pruned: false,
                app_state_backup_dir: None,
            });
        }
        let backup_dir = create_session_index_cleanup_backup(&home, &plan, removed_entries)?;
        if require_stopped_app {
            ensure_codex_app_stopped(Some(backup_dir.clone()))?;
        }
        let current_bytes = fs::read(&plan.path)
            .map_err(|error| cleanup_apply_error(error, Some(backup_dir.clone())))?;
        if current_bytes != plan.original_bytes {
            return Err(cleanup_apply_error(
                "session_index.jsonl 在写入前再次发生变化；未覆盖 Codex 新内容，请重新预览",
                Some(backup_dir),
            ));
        }
        codex_plus_core::settings::atomic_write(&plan.path, next_text.as_bytes()).map_err(
            |error| {
                cleanup_apply_error(
                    format!(
                        "原子写入 session_index.jsonl 失败；原文件未被主动覆盖，可从备份目录手动恢复：{error}"
                    ),
                    Some(backup_dir.clone()),
                )
            },
        )?;
        let selected_ids = selected_ids.into_iter().collect::<Vec<_>>();
        let app_state_prune = codex_plus_core::codex_app_state::prune_app_state_thread_references(
            &home,
            &selected_ids,
        )
        .map_err(|error| cleanup_apply_error(error, Some(backup_dir.clone())))?;
        let _ = prune_backups(&home);
        Ok(SessionIndexCleanupResult {
            pruned_entries: removed_entries,
            backup_dir: Some(backup_dir),
            app_state_pruned: app_state_prune.changed,
            app_state_backup_dir: app_state_prune.backup_path,
        })
    })()
}

pub fn prune_deleted_thread_references(
    codex_home: &Path,
    thread_ids: &[String],
) -> anyhow::Result<DeletedThreadReferencePruneResult> {
    prune_deleted_thread_references_inner(codex_home, thread_ids, true)
}

pub fn prune_deleted_thread_references_permanently(
    codex_home: &Path,
    thread_ids: &[String],
) -> anyhow::Result<DeletedThreadReferencePruneResult> {
    prune_deleted_thread_references_inner(codex_home, thread_ids, false)
}

fn prune_deleted_thread_references_inner(
    codex_home: &Path,
    thread_ids: &[String],
    create_undo_backup: bool,
) -> anyhow::Result<DeletedThreadReferencePruneResult> {
    let thread_ids = thread_id_match_set(thread_ids);
    if thread_ids.is_empty() {
        return Ok(DeletedThreadReferencePruneResult::default());
    }
    let (pruned_session_index_entries, session_index_backup_dir) =
        prune_deleted_session_index_entries(codex_home, &thread_ids, create_undo_backup)?;
    let selected_ids = thread_ids.iter().cloned().collect::<Vec<_>>();
    let app_state_prune = if create_undo_backup {
        codex_plus_core::codex_app_state::prune_app_state_thread_references(
            codex_home,
            &selected_ids,
        )?
    } else {
        codex_plus_core::codex_app_state::prune_app_state_thread_references_permanently(
            codex_home,
            &selected_ids,
        )?
    };
    Ok(DeletedThreadReferencePruneResult {
        pruned_session_index_entries,
        session_index_backup_dir,
        app_state_pruned: app_state_prune.changed,
        app_state_backup_dir: app_state_prune.backup_path,
    })
}

fn prune_deleted_session_index_entries(
    home: &Path,
    thread_ids: &HashSet<String>,
    create_undo_backup: bool,
) -> anyhow::Result<(usize, Option<PathBuf>)> {
    let path = home.join("session_index.jsonl");
    if !path.exists() {
        return Ok((0, None));
    }
    let original_bytes = fs::read(&path)?;
    let original_text = String::from_utf8(original_bytes.clone())?;
    let snapshot_sha256 = sha256_hex(&original_bytes);
    let plan = SessionIndexPlan {
        path,
        snapshot_sha256,
        original_bytes,
        original_text,
        candidates: Vec::new(),
    };
    let (next_text, removed_entries) = filtered_session_index_text(&plan, thread_ids);
    if removed_entries == 0 {
        return Ok((0, None));
    }
    let backup_dir = if create_undo_backup {
        Some(
            create_session_index_cleanup_backup(home, &plan, removed_entries)
                .map_err(|error| anyhow::anyhow!(error.message))?,
        )
    } else {
        None
    };
    codex_plus_core::settings::atomic_write(&plan.path, next_text.as_bytes())
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    Ok((removed_entries, backup_dir))
}

fn thread_id_match_set(thread_ids: &[String]) -> HashSet<String> {
    let mut result = HashSet::new();
    for thread_id in thread_ids {
        let trimmed = thread_id.trim();
        if trimmed.is_empty() {
            continue;
        }
        let bare = trimmed
            .strip_prefix("local:")
            .or_else(|| trimmed.strip_prefix("local%3A"))
            .or_else(|| trimmed.strip_prefix("local%3a"))
            .unwrap_or(trimmed);
        result.insert(bare.to_string());
        result.insert(format!("local:{bare}"));
        result.insert(format!("local%3A{bare}"));
        result.insert(format!("local%3a{bare}"));
    }
    result
}

fn ensure_codex_app_stopped(
    backup_dir: Option<PathBuf>,
) -> Result<(), SessionIndexCleanupApplyError> {
    let running_processes = codex_plus_core::watcher::find_codex_processes();
    if running_processes.is_empty() {
        return Ok(());
    }
    Err(cleanup_apply_error(
        format!(
            "Codex App / ChatGPT 仍在运行（进程：{}）；请完全退出 App 后重新预览并确认清理",
            running_processes
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ),
        backup_dir,
    ))
}

fn cleanup_apply_error(
    message: impl std::fmt::Display,
    backup_dir: Option<PathBuf>,
) -> SessionIndexCleanupApplyError {
    SessionIndexCleanupApplyError {
        message: message.to_string(),
        backup_dir,
    }
}

fn rollout_provider_ids(home: &Path) -> anyhow::Result<Vec<String>> {
    let mut ids = HashSet::new();
    for path in rollout_files(home)? {
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) if is_locked_io_error(&error) => continue,
            Err(error) => return Err(error.into()),
        };
        for segment in text.split_inclusive('\n') {
            let (line, _) = split_line_ending(segment);
            let Ok(record) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            if record.get("type").and_then(Value::as_str) != Some("session_meta") {
                continue;
            }
            let Some(provider) = record
                .get("payload")
                .and_then(Value::as_object)
                .and_then(|payload| payload.get("model_provider"))
                .and_then(Value::as_str)
            else {
                continue;
            };
            if is_valid_provider_id_for_discovery(provider) {
                ids.insert(provider.to_string());
            }
        }
    }
    Ok(sorted_provider_ids(ids))
}

fn collect_rollout_files(root: &Path, files: &mut Vec<PathBuf>) -> anyhow::Result<()> {
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if path.is_dir() {
            collect_rollout_files(&path, files)?;
        } else if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("rollout-") && name.ends_with(".jsonl"))
        {
            files.push(path);
        }
    }
    Ok(())
}

fn split_line_ending(segment: &str) -> (&str, &str) {
    if let Some(line) = segment.strip_suffix("\r\n") {
        (line, "\r\n")
    } else if let Some(line) = segment.strip_suffix('\n') {
        (line, "\n")
    } else {
        (segment, "")
    }
}

fn to_desktop_workspace_path(value: &str) -> Option<String> {
    let stripped = value.trim();
    if stripped.is_empty() {
        return None;
    }
    let lower = stripped.to_ascii_lowercase();
    if lower.starts_with(r"\\?\unc\") {
        return Some(format!(r"\\{}", stripped[8..].replace('/', r"\")));
    }
    if stripped.starts_with(r"\\?\") {
        return Some(stripped[4..].replace('\\', "/"));
    }
    Some(stripped.to_string())
}

fn is_locked_io_error(error: &std::io::Error) -> bool {
    matches!(error.kind(), std::io::ErrorKind::PermissionDenied)
        || matches!(error.raw_os_error(), Some(32 | 33))
}

fn build_encrypted_content_warning(
    encrypted_content_counts: &HashMap<String, usize>,
    target_provider: &str,
) -> Option<String> {
    let risky_providers = encrypted_content_counts
        .iter()
        .filter(|(provider, count)| provider.as_str() != target_provider && **count > 0)
        .map(|(provider, _)| provider.as_str())
        .collect::<Vec<_>>();
    if risky_providers.is_empty() {
        return None;
    }
    let total = encrypted_content_counts.values().sum::<usize>();
    Some(format!(
        "检测到 {total} 个会话文件包含来自 {} 的 encrypted_content。可见会话元数据已同步到 {target_provider}，但继续或压缩这些历史可能出现 invalid_encrypted_content；需要可靠续聊时请切回原供应商/账号或开启新会话。",
        risky_providers.join(", ")
    ))
}

fn create_backup(
    home: &Path,
    target_provider: &str,
    changes: &[SessionChange],
) -> anyhow::Result<PathBuf> {
    let backup_root = home.join("backups_state/provider-sync");
    let mut backup_dir = backup_root.join(timestamp_name());
    let mut suffix = 0;
    while backup_dir.exists() {
        suffix += 1;
        backup_dir = backup_root.join(format!("{}-{suffix}", timestamp_name()));
    }
    fs::create_dir_all(&backup_dir)?;
    for name in [
        "config.toml",
        ".codex-global-state.json",
        ".codex-global-state.json.bak",
    ] {
        let source = home.join(name);
        if source.exists() {
            fs::copy(&source, backup_dir.join(name))?;
        }
    }
    let db_dir = backup_dir.join("db");
    let mut db_files = Vec::new();
    for db_path in codex_plus_core::codex_sqlite::codex_session_db_paths_from_home(home) {
        for source in codex_plus_core::codex_sqlite::codex_sqlite_sidecar_paths(&db_path) {
            if !source.exists() {
                continue;
            }
            let relative = codex_plus_core::codex_sqlite::relative_to_codex_home(home, &source);
            let target = db_dir.join(&relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&source, &target)?;
            db_files.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
    let manifest = changes
        .iter()
        .map(|change| {
            json!({
                "path": change.path.to_string_lossy(),
                "originalSessionMetaLines": change.original_session_meta_lines,
            })
        })
        .collect::<Vec<_>>();
    fs::write(
        backup_dir.join("session-meta-backup.json"),
        serde_json::to_string_pretty(&manifest)?,
    )?;
    fs::write(
        backup_dir.join("metadata.json"),
        serde_json::to_string_pretty(&json!({
            "version": 1,
            "namespace": "provider-sync",
            "codexHome": home.to_string_lossy(),
            "targetProvider": target_provider,
            "createdAt": chrono::Utc::now().to_rfc3339(),
            "dbFiles": db_files,
            "changedSessionFiles": changes.len(),
            "managedBy": "Codex++ provider sync"
        }))?,
    )?;
    Ok(backup_dir)
}

fn create_session_index_cleanup_backup(
    home: &Path,
    plan: &SessionIndexPlan,
    removed_entries: usize,
) -> Result<PathBuf, SessionIndexCleanupApplyError> {
    let backup_root = home.join("backups_state/provider-sync");
    let mut backup_dir = backup_root.join(timestamp_name());
    let mut suffix = 0;
    while backup_dir.exists() {
        suffix += 1;
        backup_dir = backup_root.join(format!("{}-{suffix}", timestamp_name()));
    }
    fs::create_dir_all(&backup_dir).map_err(|error| cleanup_apply_error(error, None))?;
    fs::write(backup_dir.join("session_index.jsonl"), &plan.original_bytes)
        .map_err(|error| cleanup_apply_error(error, Some(backup_dir.clone())))?;
    let metadata = serde_json::to_string_pretty(&json!({
        "version": 1,
        "namespace": "provider-sync-session-index-cleanup",
        "codexHome": home.to_string_lossy(),
        "createdAt": chrono::Utc::now().to_rfc3339(),
        "snapshotSha256": plan.snapshot_sha256,
        "prunedSessionIndexEntries": removed_entries,
        "managedBy": "Codex++ provider sync"
    }))
    .map_err(|error| cleanup_apply_error(error, Some(backup_dir.clone())))?;
    fs::write(backup_dir.join("metadata.json"), metadata)
        .map_err(|error| cleanup_apply_error(error, Some(backup_dir.clone())))?;
    Ok(backup_dir)
}

fn apply_session_changes(changes: &[SessionChange]) -> anyhow::Result<AppliedSessionChanges> {
    let mut applied = AppliedSessionChanges::default();
    for change in changes {
        match fs::write(&change.path, &change.next_text) {
            Ok(()) => {}
            Err(error) if is_locked_io_error(&error) => {
                applied
                    .skipped_locked_rollout_files
                    .push(change.path.clone());
                continue;
            }
            Err(error) => return Err(error.into()),
        }
        restore_file_mtime(&change.path, change.original_mtime);
        applied.changes.push(change.clone());
    }
    Ok(applied)
}

fn restore_session_changes(changes: &[SessionChange]) -> anyhow::Result<()> {
    for change in changes {
        fs::write(&change.path, &change.original_text)?;
        restore_file_mtime(&change.path, change.original_mtime);
    }
    Ok(())
}

fn restore_file_mtime(path: &Path, mtime: Option<SystemTime>) {
    let Some(mtime) = mtime else { return };
    let Ok(file) = fs::File::options().write(true).open(path) else {
        return;
    };
    let times = std::fs::FileTimes::new().set_modified(mtime);
    let _ = file.set_times(times);
}

fn build_catalog_recovery_plan(
    home: &Path,
    sqlite_paths: &[PathBuf],
    session_changes: &[SessionChange],
) -> anyhow::Result<CatalogRecoveryPlan> {
    let mut plan = CatalogRecoveryPlan::default();
    for change in session_changes {
        let Some(thread_id) = change
            .thread_id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
        else {
            continue;
        };
        let source_updated_at = change
            .original_mtime
            .and_then(system_time_seconds)
            .unwrap_or_else(now_seconds_f64);
        merge_catalog_recovery_record(
            &mut plan.records,
            CatalogRecoveryRecord {
                thread_id: thread_id.to_string(),
                display_title: String::new(),
                source_created_at: source_updated_at,
                source_updated_at,
                cwd: change.cwd.clone().unwrap_or_default(),
                git_branch: None,
                thread_source: None,
                source_rank: 0,
                metadata_updated_at: source_updated_at,
            },
        );
    }

    let session_index = load_session_index_metadata(&home.join("session_index.jsonl"))?;
    for (thread_id, metadata) in session_index {
        let Some(record) = plan.records.get_mut(&thread_id) else {
            continue;
        };
        if record.display_title.trim().is_empty() && !metadata.title.trim().is_empty() {
            record.display_title = metadata.title;
        }
        if let Some(updated_at) = metadata.updated_at {
            record.source_updated_at = record.source_updated_at.max(updated_at);
        }
    }

    let mut seen_thread_rows = HashSet::new();
    for path in sqlite_paths {
        load_thread_recovery_records(path, home, &mut plan, &mut seen_thread_rows)?;
    }
    Ok(plan)
}

fn load_session_index_metadata(
    path: &Path,
) -> anyhow::Result<HashMap<String, SessionIndexMetadata>> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let text = fs::read_to_string(path)?;
    let mut metadata = HashMap::new();
    for line in text.lines() {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(object) = record.as_object() else {
            continue;
        };
        let Some(thread_id) = object
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty())
        else {
            continue;
        };
        let title = object
            .get("thread_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        let updated_at = object
            .get("updated_at")
            .and_then(Value::as_str)
            .and_then(parse_timestamp_seconds);
        metadata.insert(
            thread_id.to_string(),
            SessionIndexMetadata { title, updated_at },
        );
    }
    Ok(metadata)
}

fn load_thread_recovery_records(
    path: &Path,
    home: &Path,
    plan: &mut CatalogRecoveryPlan,
    seen_thread_rows: &mut HashSet<String>,
) -> anyhow::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    let db = Connection::open(path)?;
    let columns = table_columns(&db, "threads")?;
    if !columns.contains("id") {
        return Ok(());
    }
    let expression = |column: &str, fallback: &str| {
        if columns.contains(column) {
            format!("\"{}\"", column.replace('"', "\"\""))
        } else {
            fallback.to_string()
        }
    };
    let title = expression("title", "''");
    let name = expression("name", "NULL");
    let cwd = expression("cwd", "''");
    let created_at = expression("created_at", "NULL");
    let updated_at = expression("updated_at", "NULL");
    let created_at_ms = expression("created_at_ms", "NULL");
    let updated_at_ms = expression("updated_at_ms", "NULL");
    let rollout_path = expression("rollout_path", "NULL");
    let git_branch = expression("git_branch", "NULL");
    let thread_source = expression("thread_source", "NULL");
    let sql = format!(
        "SELECT id, {title}, {name}, {cwd}, {created_at}, {updated_at}, \
         {created_at_ms}, {updated_at_ms}, {rollout_path}, {git_branch}, {thread_source} \
         FROM threads WHERE COALESCE(id, '') <> ''"
    );
    let mut statement = db.prepare(&sql)?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            row.get::<_, Option<f64>>(4)?,
            row.get::<_, Option<f64>>(5)?,
            row.get::<_, Option<f64>>(6)?,
            row.get::<_, Option<f64>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, Option<String>>(10)?,
        ))
    })?;
    for row in rows {
        let (
            thread_id,
            title,
            name,
            cwd,
            created_at,
            updated_at,
            created_at_ms,
            updated_at_ms,
            rollout_path,
            git_branch,
            thread_source,
        ) = row?;
        let known_rollout = plan.records.contains_key(&thread_id);
        if !known_rollout
            && !rollout_path
                .as_deref()
                .is_some_and(|value| recovery_rollout_path_exists(home, value))
        {
            continue;
        }
        if !seen_thread_rows.insert(thread_id.clone()) {
            *plan
                .duplicate_thread_rows_by_id
                .entry(thread_id.clone())
                .or_default() += 1;
        }
        let fallback_time = rollout_path
            .as_deref()
            .and_then(|value| recovery_rollout_path(home, value))
            .and_then(|path| fs::metadata(path).ok())
            .and_then(|metadata| metadata.modified().ok())
            .and_then(system_time_seconds)
            .unwrap_or_else(now_seconds_f64);
        let source_created_at =
            timestamp_from_columns(created_at_ms, created_at).unwrap_or(fallback_time);
        let source_updated_at = timestamp_from_columns(updated_at_ms, updated_at)
            .unwrap_or(fallback_time)
            .max(source_created_at);
        merge_catalog_recovery_record(
            &mut plan.records,
            CatalogRecoveryRecord {
                thread_id,
                display_title: if name.trim().is_empty() { title } else { name },
                source_created_at,
                source_updated_at,
                cwd,
                git_branch: non_empty_string(git_branch),
                thread_source: non_empty_string(thread_source),
                source_rank: 1,
                metadata_updated_at: source_updated_at,
            },
        );
    }
    Ok(())
}

fn merge_catalog_recovery_record(
    records: &mut HashMap<String, CatalogRecoveryRecord>,
    candidate: CatalogRecoveryRecord,
) {
    let Some(existing) = records.get_mut(&candidate.thread_id) else {
        records.insert(candidate.thread_id.clone(), candidate);
        return;
    };
    existing.source_created_at =
        positive_min(existing.source_created_at, candidate.source_created_at);
    let candidate_is_newer = candidate.source_rank > existing.source_rank
        || (candidate.source_rank == existing.source_rank
            && candidate.metadata_updated_at >= existing.metadata_updated_at);
    existing.source_updated_at = existing.source_updated_at.max(candidate.source_updated_at);
    if (candidate_is_newer || existing.display_title.trim().is_empty())
        && !candidate.display_title.trim().is_empty()
    {
        existing.display_title = candidate.display_title;
    }
    if (candidate_is_newer || existing.cwd.trim().is_empty()) && !candidate.cwd.trim().is_empty() {
        existing.cwd = candidate.cwd;
    }
    if candidate_is_newer || existing.git_branch.is_none() {
        if candidate.git_branch.is_some() {
            existing.git_branch = candidate.git_branch;
        }
    }
    if candidate_is_newer || existing.thread_source.is_none() {
        if candidate.thread_source.is_some() {
            existing.thread_source = candidate.thread_source;
        }
    }
    if candidate_is_newer {
        existing.source_rank = candidate.source_rank;
        existing.metadata_updated_at = candidate.metadata_updated_at;
    }
}

fn recovery_rollout_path_exists(home: &Path, raw: &str) -> bool {
    recovery_rollout_path(home, raw).is_some_and(|path| path.is_file())
}

fn recovery_rollout_path(home: &Path, raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = PathBuf::from(trimmed);
    Some(if path.is_absolute() {
        path
    } else {
        home.join(path)
    })
}

fn timestamp_from_columns(milliseconds: Option<f64>, seconds: Option<f64>) -> Option<f64> {
    milliseconds
        .filter(|value| *value > 0.0)
        .map(|value| value / 1000.0)
        .or_else(|| seconds.filter(|value| *value > 0.0))
}

fn parse_timestamp_seconds(value: &str) -> Option<f64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.timestamp_millis() as f64 / 1000.0)
}

fn system_time_seconds(value: SystemTime) -> Option<f64> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs_f64())
}

fn now_seconds_f64() -> f64 {
    system_time_seconds(SystemTime::now()).unwrap_or_default()
}

fn positive_min(left: f64, right: f64) -> f64 {
    match (left > 0.0, right > 0.0) {
        (true, true) => left.min(right),
        (true, false) => left,
        (false, true) => right,
        (false, false) => 0.0,
    }
}

fn non_empty_string(value: Option<String>) -> Option<String> {
    value.filter(|item| !item.trim().is_empty())
}

fn table_columns(db: &Connection, table: &str) -> anyhow::Result<HashSet<String>> {
    let mut stmt = db.prepare(&format!(
        "PRAGMA table_info(\"{}\")",
        table.replace('"', "\"\"")
    ))?;
    Ok(stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<HashSet<_>>>()?)
}

fn sqlite_provider_ids(path: &Path) -> anyhow::Result<Vec<String>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let db = Connection::open(path)?;
    let mut ids = HashSet::new();
    for table in ["threads", "local_thread_catalog"] {
        let columns = table_columns(&db, table)?;
        if !columns.contains("model_provider") {
            continue;
        }
        let mut stmt = db.prepare(&format!(
            "SELECT DISTINCT COALESCE(model_provider, '') FROM {table} \
             WHERE COALESCE(model_provider, '') <> ''"
        ))?;
        for item in stmt.query_map([], |row| row.get::<_, String>(0))? {
            let id = item?;
            if is_valid_provider_id_for_discovery(&id) {
                ids.insert(id);
            }
        }
    }
    Ok(sorted_provider_ids(ids))
}

fn catalog_recovery_schema_supported(columns: &HashSet<String>) -> bool {
    [
        "host_id",
        "thread_id",
        "display_title",
        "source_created_at",
        "source_updated_at",
        "cwd",
        "source_kind",
        "model_provider",
        "observation_sequence",
    ]
    .iter()
    .all(|column| columns.contains(*column))
}

fn catalog_host_kinds(db: &Connection) -> anyhow::Result<HashMap<String, String>> {
    let columns = table_columns(db, "local_thread_catalog_hosts")?;
    let mut hosts = HashMap::new();
    if columns.contains("host_id") && columns.contains("host_kind") {
        let mut statement = db.prepare(
            "SELECT host_id, host_kind FROM local_thread_catalog_hosts \
             WHERE COALESCE(host_id, '') <> ''",
        )?;
        for row in statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })? {
            let (host_id, host_kind) = row?;
            hosts.insert(host_id, host_kind);
        }
    }
    if !hosts.values().any(|kind| kind == "local") {
        hosts.insert("local".to_string(), "local".to_string());
    }
    Ok(hosts)
}

fn catalog_recovery_assignments(
    db: &Connection,
    plan: &CatalogRecoveryPlan,
) -> anyhow::Result<Vec<(String, CatalogRecoveryRecord)>> {
    let columns = table_columns(db, "local_thread_catalog")?;
    if !catalog_recovery_schema_supported(&columns) || plan.records.is_empty() {
        return Ok(Vec::new());
    }
    let mut existing_ids = HashSet::new();
    let mut statement = db.prepare(
        "SELECT DISTINCT thread_id FROM local_thread_catalog \
         WHERE COALESCE(thread_id, '') <> ''",
    )?;
    for thread_id in statement.query_map([], |row| row.get::<_, String>(0))? {
        existing_ids.insert(thread_id?);
    }
    let hosts = catalog_host_kinds(db)?;
    let mut assignments = plan
        .records
        .values()
        .filter(|record| !existing_ids.contains(&record.thread_id))
        .map(|record| (catalog_host_for_record(&hosts, record), record.clone()))
        .collect::<Vec<_>>();
    assignments.sort_by(|left, right| left.1.thread_id.cmp(&right.1.thread_id));
    Ok(assignments)
}

fn catalog_host_for_record(
    hosts: &HashMap<String, String>,
    record: &CatalogRecoveryRecord,
) -> String {
    let wsl_hosts = hosts
        .iter()
        .filter(|(_, kind)| kind.as_str() == "wsl")
        .map(|(host_id, _)| host_id.as_str())
        .collect::<Vec<_>>();
    if cwd_looks_like_wsl(&record.cwd) && !wsl_hosts.is_empty() {
        if let Some(distribution) = wsl_distribution_from_cwd(&record.cwd)
            && let Some(host_id) = wsl_hosts
                .iter()
                .find(|host_id| host_id.to_ascii_lowercase().contains(&distribution))
        {
            return (*host_id).to_string();
        }
        if wsl_hosts.len() == 1 {
            return wsl_hosts[0].to_string();
        }
    }
    hosts
        .iter()
        .find(|(_, kind)| kind.as_str() == "local")
        .map(|(host_id, _)| host_id.clone())
        .unwrap_or_else(|| "local".to_string())
}

fn cwd_looks_like_wsl(cwd: &str) -> bool {
    let normalized = cwd.trim().replace('\\', "/").to_ascii_lowercase();
    normalized.starts_with('/')
        || normalized.starts_with("//wsl$/")
        || normalized.starts_with("//wsl.localhost/")
}

fn wsl_distribution_from_cwd(cwd: &str) -> Option<String> {
    let normalized = cwd.trim().replace('\\', "/");
    let components = normalized
        .trim_start_matches('/')
        .split('/')
        .collect::<Vec<_>>();
    if components.len() < 2
        || !matches!(
            components[0].to_ascii_lowercase().as_str(),
            "wsl$" | "wsl.localhost"
        )
    {
        return None;
    }
    Some(components[1].to_ascii_lowercase())
}

fn catalog_reconciliation_hosts(
    db: &Connection,
    assignments: &[(String, CatalogRecoveryRecord)],
) -> anyhow::Result<HashSet<String>> {
    let state_columns = table_columns(db, "local_thread_catalog_sync_state")?;
    if ![
        "host_id",
        "watermark_updated_at",
        "initial_build_complete",
        "observation_sequence",
    ]
    .iter()
    .all(|column| state_columns.contains(*column))
    {
        return Ok(HashSet::new());
    }
    let hosts = catalog_host_kinds(db)?;
    let mut candidates = assignments
        .iter()
        .map(|(host_id, _)| host_id.clone())
        .collect::<HashSet<_>>();
    let catalog_columns = table_columns(db, "local_thread_catalog")?;
    if catalog_columns.contains("host_id") {
        let mut statement = db.prepare(
            "SELECT DISTINCT host_id FROM local_thread_catalog \
             WHERE COALESCE(host_id, '') <> ''",
        )?;
        for host_id in statement.query_map([], |row| row.get::<_, String>(0))? {
            let host_id = host_id?;
            if hosts
                .get(&host_id)
                .is_none_or(|kind| matches!(kind.as_str(), "local" | "wsl"))
            {
                candidates.insert(host_id);
            }
        }
    }
    let assigned_hosts = assignments
        .iter()
        .map(|(host_id, _)| host_id.as_str())
        .collect::<HashSet<_>>();
    candidates.retain(|host_id| {
        assigned_hosts.contains(host_id.as_str())
            || catalog_state_needs_reconciliation(db, host_id, &state_columns).unwrap_or(true)
    });
    Ok(candidates)
}

fn catalog_state_needs_reconciliation(
    db: &Connection,
    host_id: &str,
    state_columns: &HashSet<String>,
) -> anyhow::Result<bool> {
    let (max_updated_at, max_sequence) = db.query_row(
        "SELECT MAX(source_updated_at), MAX(observation_sequence) \
         FROM local_thread_catalog WHERE host_id = ?1",
        [host_id],
        |row| Ok((row.get::<_, Option<f64>>(0)?, row.get::<_, Option<i64>>(1)?)),
    )?;
    let Some(max_sequence) = max_sequence else {
        return Ok(false);
    };
    let last_full = if state_columns.contains("last_full_reconciled_at") {
        "last_full_reconciled_at"
    } else {
        "1"
    };
    let sql = format!(
        "SELECT watermark_updated_at, initial_build_complete, observation_sequence, {last_full} \
         FROM local_thread_catalog_sync_state WHERE host_id = ?1"
    );
    let state = db
        .query_row(&sql, [host_id], |row| {
            Ok((
                row.get::<_, Option<f64>>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })
        .optional()?;
    let Some((watermark, initial_complete, observation_sequence, last_full)) = state else {
        return Ok(true);
    };
    Ok(initial_complete != 1
        || observation_sequence < max_sequence
        || watermark.unwrap_or_default() < max_updated_at.unwrap_or_default()
        || last_full.is_none())
}

fn missing_catalog_host_rows(
    db: &Connection,
    assignments: &[(String, CatalogRecoveryRecord)],
) -> anyhow::Result<usize> {
    let columns = table_columns(db, "local_thread_catalog_hosts")?;
    if !columns.contains("host_id") || !columns.contains("host_kind") {
        return Ok(0);
    }
    let assigned_hosts = assignments
        .iter()
        .map(|(host_id, _)| host_id.as_str())
        .collect::<HashSet<_>>();
    let mut missing = 0;
    for host_id in assigned_hosts {
        let exists: i64 = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_thread_catalog_hosts WHERE host_id = ?1)",
            [host_id],
            |row| row.get(0),
        )?;
        if exists == 0 && host_id == "local" {
            missing += 1;
        }
    }
    Ok(missing)
}

fn count_sqlite_updates(
    path: &Path,
    target_provider: &str,
    user_event_thread_ids: &HashSet<String>,
    cwd_by_thread_id: &HashMap<String, String>,
    catalog_recovery: &CatalogRecoveryPlan,
) -> anyhow::Result<SqliteUpdateCounts> {
    if !path.exists() {
        return Ok(SqliteUpdateCounts::default());
    }
    let db = Connection::open(path)?;
    let columns = table_columns(&db, "threads")?;
    let catalog_columns = table_columns(&db, "local_thread_catalog")?;
    let mut counts = SqliteUpdateCounts::default();
    if columns.contains("model_provider") {
        counts.provider_rows += db.query_row(
            "SELECT COUNT(*) FROM threads WHERE COALESCE(model_provider, '') <> ?1",
            [target_provider],
            |row| row.get::<_, i64>(0),
        )? as usize;
    }
    if catalog_columns.contains("model_provider") {
        counts.catalog_provider_rows = db.query_row(
            "SELECT COUNT(*) FROM local_thread_catalog \
             WHERE COALESCE(model_provider, '') <> ?1",
            [target_provider],
            |row| row.get::<_, i64>(0),
        )? as usize;
        counts.provider_rows += counts.catalog_provider_rows;
    }
    if columns.contains("has_user_event") {
        for thread_id in user_event_thread_ids {
            counts.user_event_rows += db.query_row(
                "SELECT COUNT(*) FROM threads WHERE id = ?1 AND COALESCE(has_user_event, 0) <> 1",
                [thread_id],
                |row| row.get::<_, i64>(0),
            )? as usize;
        }
    }
    if columns.contains("cwd") {
        for (thread_id, cwd) in cwd_by_thread_id {
            counts.cwd_rows += db.query_row(
                "SELECT COUNT(*) FROM threads WHERE id = ?1 AND COALESCE(cwd, '') <> ?2",
                (thread_id, cwd),
                |row| row.get::<_, i64>(0),
            )? as usize;
        }
    }
    let assignments = catalog_recovery_assignments(&db, catalog_recovery)?;
    counts.catalog_inserted_rows = assignments.len();
    counts.catalog_state_rows = catalog_reconciliation_hosts(&db, &assignments)?.len()
        + missing_catalog_host_rows(&db, &assignments)?;
    Ok(counts)
}

fn count_sqlite_updates_for_paths(
    paths: &[PathBuf],
    target_provider: &str,
    user_event_thread_ids: &HashSet<String>,
    cwd_by_thread_id: &HashMap<String, String>,
    catalog_recovery: &CatalogRecoveryPlan,
) -> anyhow::Result<SqliteUpdateCounts> {
    let mut total = SqliteUpdateCounts::default();
    for path in paths {
        total.add(count_sqlite_updates(
            path,
            target_provider,
            user_event_thread_ids,
            cwd_by_thread_id,
            catalog_recovery,
        )?);
    }
    Ok(total)
}

fn insert_catalog_recovery_record(
    tx: &rusqlite::Transaction<'_>,
    columns: &HashSet<String>,
    host_id: &str,
    record: &CatalogRecoveryRecord,
    target_provider: &str,
    observation_sequence: i64,
) -> anyhow::Result<usize> {
    let mut insert_columns = vec![
        "host_id",
        "thread_id",
        "display_title",
        "source_created_at",
        "source_updated_at",
        "cwd",
        "source_kind",
        "model_provider",
        "observation_sequence",
    ];
    let created_at = if record.source_created_at > 0.0 {
        record.source_created_at
    } else {
        now_seconds_f64()
    };
    let updated_at = record.source_updated_at.max(created_at);
    let display_title = if record.display_title.trim().is_empty() {
        "Recovered session"
    } else {
        record.display_title.trim()
    };
    let mut values = vec![
        SqlValue::Text(host_id.to_string()),
        SqlValue::Text(record.thread_id.clone()),
        SqlValue::Text(display_title.to_string()),
        SqlValue::Real(created_at),
        SqlValue::Real(updated_at),
        SqlValue::Text(record.cwd.clone()),
        SqlValue::Text("vscode".to_string()),
        SqlValue::Text(target_provider.to_string()),
        SqlValue::Integer(observation_sequence),
    ];
    if columns.contains("source_detail") {
        insert_columns.push("source_detail");
        values.push(SqlValue::Null);
    }
    if columns.contains("git_branch") {
        insert_columns.push("git_branch");
        values.push(
            record
                .git_branch
                .clone()
                .map(SqlValue::Text)
                .unwrap_or(SqlValue::Null),
        );
    }
    if columns.contains("missing_candidate") {
        insert_columns.push("missing_candidate");
        values.push(SqlValue::Integer(0));
    }
    if columns.contains("thread_source") {
        insert_columns.push("thread_source");
        values.push(
            record
                .thread_source
                .clone()
                .map(SqlValue::Text)
                .unwrap_or(SqlValue::Null),
        );
    }
    let placeholders = (1..=values.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT OR IGNORE INTO local_thread_catalog ({}) VALUES ({placeholders})",
        insert_columns.join(", ")
    );
    Ok(tx.execute(&sql, params_from_iter(values.iter()))?)
}

fn catalog_next_observation_sequence(db: &Connection, host_id: &str) -> anyhow::Result<i64> {
    let catalog_max = db.query_row(
        "SELECT COALESCE(MAX(observation_sequence), 0) FROM local_thread_catalog WHERE host_id = ?1",
        [host_id],
        |row| row.get::<_, i64>(0),
    )?;
    let state_columns = table_columns(db, "local_thread_catalog_sync_state")?;
    let state_max =
        if state_columns.contains("host_id") && state_columns.contains("observation_sequence") {
            db.query_row(
                "SELECT COALESCE(MAX(observation_sequence), 0) \
             FROM local_thread_catalog_sync_state WHERE host_id = ?1",
                [host_id],
                |row| row.get::<_, i64>(0),
            )?
        } else {
            0
        };
    Ok(catalog_max.max(state_max))
}

fn reconcile_catalog_state(
    tx: &rusqlite::Transaction<'_>,
    host_id: &str,
    state_columns: &HashSet<String>,
) -> anyhow::Result<usize> {
    if ![
        "host_id",
        "watermark_updated_at",
        "initial_build_complete",
        "observation_sequence",
    ]
    .iter()
    .all(|column| state_columns.contains(*column))
    {
        return Ok(0);
    }
    let (watermark, observation_sequence) = tx.query_row(
        "SELECT MAX(source_updated_at), MAX(observation_sequence) \
         FROM local_thread_catalog WHERE host_id = ?1",
        [host_id],
        |row| Ok((row.get::<_, Option<f64>>(0)?, row.get::<_, Option<i64>>(1)?)),
    )?;
    let (Some(watermark), Some(observation_sequence)) = (watermark, observation_sequence) else {
        return Ok(0);
    };
    if state_columns.contains("last_full_reconciled_at") {
        Ok(tx.execute(
            "INSERT INTO local_thread_catalog_sync_state \
             (host_id, watermark_updated_at, initial_build_complete, observation_sequence, last_full_reconciled_at) \
             VALUES (?1, ?2, 1, ?3, ?4) \
             ON CONFLICT(host_id) DO UPDATE SET \
               watermark_updated_at = CASE \
                 WHEN local_thread_catalog_sync_state.watermark_updated_at IS NULL \
                   OR local_thread_catalog_sync_state.watermark_updated_at < excluded.watermark_updated_at \
                 THEN excluded.watermark_updated_at \
                 ELSE local_thread_catalog_sync_state.watermark_updated_at END, \
               initial_build_complete = 1, \
               observation_sequence = MAX(local_thread_catalog_sync_state.observation_sequence, excluded.observation_sequence), \
               last_full_reconciled_at = excluded.last_full_reconciled_at",
            (host_id, watermark, observation_sequence, now_secs() as i64),
        )?)
    } else {
        Ok(tx.execute(
            "INSERT INTO local_thread_catalog_sync_state \
             (host_id, watermark_updated_at, initial_build_complete, observation_sequence) \
             VALUES (?1, ?2, 1, ?3) \
             ON CONFLICT(host_id) DO UPDATE SET \
               watermark_updated_at = CASE \
                 WHEN local_thread_catalog_sync_state.watermark_updated_at IS NULL \
                   OR local_thread_catalog_sync_state.watermark_updated_at < excluded.watermark_updated_at \
                 THEN excluded.watermark_updated_at \
                 ELSE local_thread_catalog_sync_state.watermark_updated_at END, \
               initial_build_complete = 1, \
               observation_sequence = MAX(local_thread_catalog_sync_state.observation_sequence, excluded.observation_sequence)",
            (host_id, watermark, observation_sequence),
        )?)
    }
}

fn apply_sqlite_update(
    path: &Path,
    target_provider: &str,
    user_event_thread_ids: &HashSet<String>,
    cwd_by_thread_id: &HashMap<String, String>,
    catalog_recovery: &CatalogRecoveryPlan,
) -> anyhow::Result<SqliteUpdateCounts> {
    if !path.exists() {
        return Ok(SqliteUpdateCounts::default());
    }
    let mut db = Connection::open(path)?;
    let columns = table_columns(&db, "threads")?;
    let catalog_columns = table_columns(&db, "local_thread_catalog")?;
    let state_columns = table_columns(&db, "local_thread_catalog_sync_state")?;
    let assignments = catalog_recovery_assignments(&db, catalog_recovery)?;
    let reconciliation_hosts = catalog_reconciliation_hosts(&db, &assignments)?;
    let host_columns = table_columns(&db, "local_thread_catalog_hosts")?;
    let mut next_sequence = assignments
        .iter()
        .map(|(host_id, _)| {
            Ok((
                host_id.clone(),
                catalog_next_observation_sequence(&db, host_id)?,
            ))
        })
        .collect::<anyhow::Result<HashMap<_, _>>>()?;
    let tx = db.transaction()?;
    let mut counts = SqliteUpdateCounts::default();
    if columns.contains("model_provider") {
        counts.provider_rows += tx.execute(
            "UPDATE threads SET model_provider = ?1 WHERE COALESCE(model_provider, '') <> ?1",
            [target_provider],
        )?;
    }
    if catalog_columns.contains("model_provider") {
        counts.catalog_provider_rows = tx.execute(
            "UPDATE local_thread_catalog SET model_provider = ?1 \
             WHERE COALESCE(model_provider, '') <> ?1",
            [target_provider],
        )?;
        counts.provider_rows += counts.catalog_provider_rows;
    }
    if columns.contains("has_user_event") {
        for thread_id in user_event_thread_ids {
            counts.user_event_rows += tx.execute(
                "UPDATE threads SET has_user_event = 1 WHERE id = ?1 AND COALESCE(has_user_event, 0) <> 1",
                [thread_id],
            )?;
        }
    }
    if columns.contains("cwd") {
        for (thread_id, cwd) in cwd_by_thread_id {
            counts.cwd_rows += tx.execute(
                "UPDATE threads SET cwd = ?1 WHERE id = ?2 AND COALESCE(cwd, '') <> ?1",
                (cwd, thread_id),
            )?;
        }
    }
    if host_columns.contains("host_id") && host_columns.contains("host_kind") {
        for host_id in assignments
            .iter()
            .map(|(host_id, _)| host_id.as_str())
            .collect::<HashSet<_>>()
        {
            let host_exists: i64 = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM local_thread_catalog_hosts WHERE host_id = ?1)",
                [host_id],
                |row| row.get(0),
            )?;
            if host_id == "local" && host_exists == 0 {
                counts.catalog_state_rows += tx.execute(
                    "INSERT OR IGNORE INTO local_thread_catalog_hosts (host_id, host_kind) \
                     VALUES ('local', 'local')",
                    [],
                )?;
            }
        }
    }
    for (host_id, record) in &assignments {
        let sequence = next_sequence.entry(host_id.clone()).or_default();
        let candidate_sequence = sequence.saturating_add(1);
        let inserted = insert_catalog_recovery_record(
            &tx,
            &catalog_columns,
            host_id,
            record,
            target_provider,
            candidate_sequence,
        )?;
        if inserted > 0 {
            *sequence = candidate_sequence;
            counts.catalog_inserted_rows += inserted;
            counts.duplicate_thread_rows_merged += catalog_recovery
                .duplicate_thread_rows_by_id
                .get(&record.thread_id)
                .copied()
                .unwrap_or_default();
        }
    }
    for host_id in reconciliation_hosts {
        counts.catalog_state_rows += reconcile_catalog_state(&tx, &host_id, &state_columns)?;
    }
    tx.commit()?;
    Ok(counts)
}

fn apply_sqlite_update_for_paths(
    paths: &[PathBuf],
    target_provider: &str,
    user_event_thread_ids: &HashSet<String>,
    cwd_by_thread_id: &HashMap<String, String>,
    catalog_recovery: &CatalogRecoveryPlan,
) -> anyhow::Result<SqliteUpdateCounts> {
    let mut total = SqliteUpdateCounts::default();
    for path in paths {
        total.add(apply_sqlite_update(
            path,
            target_provider,
            user_event_thread_ids,
            cwd_by_thread_id,
            catalog_recovery,
        )?);
    }
    Ok(total)
}

fn load_global_state(path: &Path) -> anyhow::Result<Map<String, Value>> {
    if !path.exists() {
        return Ok(Map::new());
    }
    Ok(serde_json::from_str::<Value>(&fs::read_to_string(path)?)?
        .as_object()
        .cloned()
        .unwrap_or_default())
}

fn load_projectless_thread_ids(path: &Path) -> anyhow::Result<HashSet<String>> {
    let state = load_global_state(path)?;
    let mut ids = HashSet::new();
    if let Some(items) = state
        .get("projectless-thread-ids")
        .and_then(Value::as_array)
    {
        for item in items {
            if let Some(id) = item.as_str().filter(|id| !id.trim().is_empty()) {
                ids.insert(id.to_string());
            }
        }
    }
    Ok(ids)
}

fn normalized_global_state(state: &Map<String, Value>) -> Map<String, Value> {
    let mut next = Map::new();
    if let Some(value) = state.get("electron-saved-workspace-roots") {
        next.insert(
            "electron-saved-workspace-roots".to_string(),
            json!(dedupe_paths(path_array(value))),
        );
    }
    if let Some(value) = state.get("project-order") {
        next.insert(
            "project-order".to_string(),
            json!(dedupe_paths(path_array(value))),
        );
    }
    if let Some(value) = state.get("active-workspace-roots") {
        let normalized = dedupe_paths(path_array(value));
        let next_value = if value.is_array() {
            json!(normalized)
        } else if let Some(first) = normalized.first() {
            json!(first)
        } else {
            value.clone()
        };
        next.insert("active-workspace-roots".to_string(), next_value);
    }
    if let Some(value) = state
        .get("electron-workspace-root-labels")
        .and_then(Value::as_object)
    {
        let mut labels = Map::new();
        for (key, item) in value {
            labels.insert(
                to_desktop_workspace_path(key).unwrap_or_else(|| key.clone()),
                item.clone(),
            );
        }
        next.insert(
            "electron-workspace-root-labels".to_string(),
            Value::Object(labels),
        );
    }
    if let Some(open_targets) = state
        .get("open-in-target-preferences")
        .and_then(Value::as_object)
    {
        let mut next_open_targets = open_targets.clone();
        if let Some(per_path) =
            copy_resolved_object_keys(open_targets.get("perPath").and_then(Value::as_object))
        {
            next_open_targets.insert("perPath".to_string(), Value::Object(per_path));
        }
        next.insert(
            "open-in-target-preferences".to_string(),
            Value::Object(next_open_targets),
        );
    }
    next
}

fn copy_resolved_object_keys(value: Option<&Map<String, Value>>) -> Option<Map<String, Value>> {
    let value = value?;
    let mut next = Map::new();
    for (key, item) in value {
        next.insert(
            to_desktop_workspace_path(key).unwrap_or_else(|| key.clone()),
            item.clone(),
        );
    }
    Some(next)
}

fn count_global_state_updates(path: &Path) -> anyhow::Result<usize> {
    let state = load_global_state(path)?;
    let next = normalized_global_state(&state);
    Ok(next
        .iter()
        .filter(|(key, value)| state.get(*key) != Some(*value))
        .count())
}

fn apply_global_state_update(path: &Path) -> anyhow::Result<usize> {
    let mut state = load_global_state(path)?;
    let next = normalized_global_state(&state);
    let count = next
        .iter()
        .filter(|(key, value)| state.get(*key) != Some(*value))
        .count();
    if count > 0 {
        for (key, value) in next {
            state.insert(key, value);
        }
        let text = serde_json::to_string_pretty(&Value::Object(state))?;
        fs::write(path, &text)?;
        if let Some(parent) = path.parent() {
            fs::write(parent.join(".codex-global-state.json.bak"), text)?;
        }
    }
    Ok(count)
}

fn path_array(value: &Value) -> Vec<String> {
    if let Some(items) = value.as_array() {
        items
            .iter()
            .filter_map(Value::as_str)
            .filter(|item| !item.trim().is_empty())
            .map(ToString::to_string)
            .collect()
    } else if let Some(value) = value.as_str().filter(|item| !item.trim().is_empty()) {
        vec![value.to_string()]
    } else {
        Vec::new()
    }
}

fn dedupe_paths(paths: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for path in paths {
        let Some(desktop) = to_desktop_workspace_path(&path) else {
            continue;
        };
        let comparable = desktop
            .replace('/', r"\")
            .trim_end_matches('\\')
            .to_ascii_lowercase();
        if seen.insert(comparable) {
            result.push(desktop);
        }
    }
    result
}

fn prune_backups(home: &Path) -> anyhow::Result<()> {
    let root = home.join("backups_state/provider-sync");
    if !root.exists() {
        return Ok(());
    }
    let mut managed = Vec::new();
    for entry in fs::read_dir(&root)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(text) = fs::read_to_string(path.join("metadata.json")) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if value.get("managedBy").and_then(Value::as_str) == Some("Codex++ provider sync") {
            managed.push(path);
        }
    }
    managed.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    for path in managed.into_iter().skip(BACKUP_KEEP_COUNT) {
        let _ = fs::remove_dir_all(path);
    }
    Ok(())
}

fn timestamp_name() -> String {
    chrono::Local::now().format("%Y%m%d%H%M%S").to_string()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
