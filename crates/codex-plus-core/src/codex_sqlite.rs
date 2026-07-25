use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, ErrorCode, OpenFlags, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::json;

const LOG_MODEL_SUFFIX_CLEANUP_MARKER_FILE: &str =
    ".tmp/codex-plus/logs-model-suffix-cleanup-v1.json";
const LOG_MODEL_SUFFIX_CLEANUP_MAX_BYTES: u64 = 64 * 1024 * 1024;
const MEBIBYTE: u64 = 1024 * 1024;
const LOGS_DB_TARGET_PERCENT: u64 = 75;
const LOGS_DB_DELETE_BATCH_ROWS: i64 = 5_000;
const LOGS_DB_BUSY_TIMEOUT: Duration = Duration::from_millis(150);

pub fn default_codex_home_dir() -> PathBuf {
    crate::codex_home::default_codex_home_dir()
}

pub fn codex_session_db_path() -> PathBuf {
    codex_session_db_path_from_home(&default_codex_home_dir())
}

pub fn codex_session_db_path_from_home(home: &Path) -> PathBuf {
    let mut paths = codex_sqlite_dir_session_dbs(home);
    let legacy = legacy_state_db_path(home);
    if !paths.iter().any(|path| path == &legacy) {
        paths.push(legacy.clone());
    }
    paths
        .iter()
        .find(|path| sqlite_has_table(path, "threads"))
        .cloned()
        .or_else(|| paths.into_iter().next())
        .unwrap_or_else(|| legacy_state_db_path(home))
}

pub fn codex_session_db_paths_from_home(home: &Path) -> Vec<PathBuf> {
    let mut paths = codex_sqlite_dir_session_dbs(home);
    let legacy = legacy_state_db_path(home);
    if !paths.iter().any(|path| path == &legacy) {
        paths.push(legacy);
    }
    paths
}

pub fn codex_listable_session_db_paths_from_home(home: &Path) -> Vec<PathBuf> {
    let mut paths = codex_sqlite_dir_session_dbs(home)
        .into_iter()
        .filter(|path| has_listable_session_table(path))
        .collect::<Vec<_>>();
    let legacy = legacy_state_db_path(home);
    if has_listable_session_table(&legacy) && !paths.iter().any(|path| path == &legacy) {
        paths.push(legacy);
    }
    paths
}

/// codex 客户端日志数据库路径（固定文件名）。
pub fn codex_logs_db_path_from_home(home: &Path) -> PathBuf {
    home.join("logs_2.sqlite")
}

pub fn codex_sqlite_sidecar_paths(db_path: &Path) -> [PathBuf; 3] {
    [
        db_path.to_path_buf(),
        PathBuf::from(format!("{}-wal", db_path.to_string_lossy())),
        PathBuf::from(format!("{}-shm", db_path.to_string_lossy())),
    ]
}

pub fn relative_to_codex_home(home: &Path, path: &Path) -> PathBuf {
    path.strip_prefix(home).unwrap_or(path).to_path_buf()
}

fn legacy_state_db_path(home: &Path) -> PathBuf {
    home.join("state_5.sqlite")
}

fn codex_sqlite_dir_session_dbs(home: &Path) -> Vec<PathBuf> {
    let sqlite_dir = home.join("sqlite");
    let Ok(entries) = fs::read_dir(sqlite_dir) else {
        return Vec::new();
    };
    let mut candidates = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| is_sqlite_candidate(path))
        .filter(|path| has_session_table(path))
        .collect::<Vec<_>>();
    candidates.sort_by_key(|path| {
        (
            path.file_name()
                .map(|name| name != OsStr::new("codex-dev.db"))
                .unwrap_or(true),
            path.file_name().map(|name| name.to_os_string()),
        )
    });
    candidates
}

fn is_sqlite_candidate(path: &Path) -> bool {
    matches!(
        path.extension().and_then(OsStr::to_str),
        Some("db") | Some("sqlite") | Some("sqlite3")
    )
}

fn has_session_table(path: &Path) -> bool {
    [
        "threads",
        "local_thread_catalog",
        "automation_runs",
        "inbox_items",
        "sessions",
        "messages",
        "thread_dynamic_tools",
        "thread_goals",
        "thread_spawn_edges",
        "stage1_outputs",
        "agent_job_items",
    ]
    .iter()
    .any(|table| sqlite_has_table(path, table))
}

fn has_listable_session_table(path: &Path) -> bool {
    ["threads", "automation_runs"]
        .iter()
        .any(|table| sqlite_has_table(path, table))
}

fn sqlite_has_table(path: &Path, table: &str) -> bool {
    let Ok(db) = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
    else {
        return false;
    };
    db.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        [table],
        |_| Ok(()),
    )
    .is_ok()
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SanitizeModelSuffixResult {
    pub scanned: usize,
    pub updated: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LogModelSuffixCleanupResult {
    pub status: String,
    pub db_bytes: u64,
    pub updated: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LogsDbMaintenanceResult {
    pub status: String,
    pub db_bytes_before: u64,
    pub db_bytes_after: u64,
    pub max_bytes: u64,
    pub target_bytes: u64,
    pub estimated_live_bytes: u64,
    pub deleted_rows: u64,
}

/// 在 Codex 启动前限制 logs_2.sqlite 的磁盘占用。
///
/// 只删除 logs 表中最旧的遥测记录，不访问会话、消息或 rollout。写锁忙时立即跳过，
/// 由后续启动重试，避免数据库维护阻塞 Codex 启动。
pub fn maintain_logs_db_size(home: &Path, max_mb: u32) -> anyhow::Result<LogsDbMaintenanceResult> {
    let db_path = codex_logs_db_path_from_home(home);
    let max_bytes = u64::from(max_mb).saturating_mul(MEBIBYTE);
    let target_bytes = max_bytes.saturating_mul(LOGS_DB_TARGET_PERCENT) / 100;
    let db_bytes_before = sqlite_disk_bytes(&db_path);
    let skipped = |status: &str, db_bytes_after: u64| LogsDbMaintenanceResult {
        status: status.to_string(),
        db_bytes_before,
        db_bytes_after,
        max_bytes,
        target_bytes,
        estimated_live_bytes: 0,
        deleted_rows: 0,
    };

    if max_mb == 0 {
        return Ok(skipped("disabled", db_bytes_before));
    }
    if !db_path.exists() {
        return Ok(skipped("missing", 0));
    }
    if db_bytes_before <= max_bytes {
        return Ok(skipped("under_limit", db_bytes_before));
    }

    let mut conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    conn.busy_timeout(LOGS_DB_BUSY_TIMEOUT)?;
    if !connection_has_table(&conn, "logs")? {
        return Ok(skipped("missing_logs_table", db_bytes_before));
    }
    if let Err(error) = conn.execute_batch("BEGIN IMMEDIATE; ROLLBACK;") {
        if sqlite_error_is_busy(&error) {
            return Ok(skipped("skipped_busy", db_bytes_before));
        }
        return Err(error.into());
    }

    let order_by = logs_oldest_order_by(&conn)?;
    let mut estimated_live_bytes = sqlite_estimated_live_bytes(&conn)?;
    let mut deleted_rows = 0u64;
    let mut remaining_rows =
        conn.query_row("SELECT COUNT(*) FROM logs", [], |row| row.get::<_, i64>(0))? as u64;
    while estimated_live_bytes > target_bytes {
        let batch_rows = logs_delete_batch_rows(remaining_rows, estimated_live_bytes, target_bytes);
        if batch_rows == 0 {
            break;
        }
        let tx = match conn.transaction_with_behavior(TransactionBehavior::Immediate) {
            Ok(tx) => tx,
            Err(error) if sqlite_error_is_busy(&error) => {
                return Ok(LogsDbMaintenanceResult {
                    status: "partial_busy".to_string(),
                    db_bytes_before,
                    db_bytes_after: sqlite_disk_bytes(&db_path),
                    max_bytes,
                    target_bytes,
                    estimated_live_bytes,
                    deleted_rows,
                });
            }
            Err(error) => return Err(error.into()),
        };
        let sql = format!(
            "DELETE FROM logs WHERE rowid IN (SELECT rowid FROM logs ORDER BY {order_by} LIMIT ?1)"
        );
        let deleted = tx.execute(&sql, params![batch_rows])?;
        tx.commit()?;
        if deleted == 0 {
            break;
        }
        deleted_rows = deleted_rows.saturating_add(deleted as u64);
        remaining_rows = remaining_rows.saturating_sub(deleted as u64);
        estimated_live_bytes = sqlite_estimated_live_bytes(&conn)?;
    }

    checkpoint_logs_db(&conn)?;
    conn.execute_batch("VACUUM")?;
    checkpoint_logs_db(&conn)?;
    estimated_live_bytes = sqlite_estimated_live_bytes(&conn)?;
    drop(conn);

    let db_bytes_after = sqlite_disk_bytes(&db_path);
    Ok(LogsDbMaintenanceResult {
        status: if db_bytes_after <= max_bytes {
            "compacted".to_string()
        } else {
            "compacted_above_limit".to_string()
        },
        db_bytes_before,
        db_bytes_after,
        max_bytes,
        target_bytes,
        estimated_live_bytes,
        deleted_rows,
    })
}

fn sqlite_disk_bytes(db_path: &Path) -> u64 {
    codex_sqlite_sidecar_paths(db_path)
        .iter()
        .filter_map(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len())
        .sum()
}

fn connection_has_table(conn: &Connection, table: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
}

fn logs_oldest_order_by(conn: &Connection) -> rusqlite::Result<String> {
    let mut stmt = conn.prepare("PRAGMA table_info('logs')")?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut order = Vec::new();
    if columns.iter().any(|column| column == "ts") {
        order.push("ts ASC");
    }
    if columns.iter().any(|column| column == "ts_nanos") {
        order.push("ts_nanos ASC");
    }
    order.push("rowid ASC");
    Ok(order.join(", "))
}

fn sqlite_estimated_live_bytes(conn: &Connection) -> rusqlite::Result<u64> {
    let page_count = pragma_u64(conn, "page_count")?;
    let freelist_count = pragma_u64(conn, "freelist_count")?;
    let page_size = pragma_u64(conn, "page_size")?;
    Ok(page_count
        .saturating_sub(freelist_count)
        .saturating_mul(page_size))
}

fn logs_delete_batch_rows(remaining_rows: u64, live_bytes: u64, target_bytes: u64) -> i64 {
    if remaining_rows <= 1 || live_bytes <= target_bytes {
        return 0;
    }
    let excess_bytes = live_bytes.saturating_sub(target_bytes);
    let proportional_rows = remaining_rows
        .saturating_mul(excess_bytes)
        .saturating_add(live_bytes.saturating_sub(1))
        / live_bytes.max(1);
    proportional_rows
        .max(1)
        .min(LOGS_DB_DELETE_BATCH_ROWS as u64)
        .min(remaining_rows - 1) as i64
}

fn pragma_u64(conn: &Connection, name: &str) -> rusqlite::Result<u64> {
    conn.query_row(&format!("PRAGMA {name}"), [], |row| row.get::<_, i64>(0))
        .map(|value| value.max(0) as u64)
}

fn checkpoint_logs_db(conn: &Connection) -> anyhow::Result<()> {
    let busy = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
        row.get::<_, i64>(0)
    })?;
    if busy != 0 {
        anyhow::bail!("logs database checkpoint is busy");
    }
    Ok(())
}

fn sqlite_error_is_busy(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(sqlite_error, _)
            if matches!(sqlite_error.code, ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked)
    )
}

/// 扫描 codex session 数据库中的 threads 表，把 model 字段里带合法后缀的
/// 记录改写为剥离后缀的 slug，使 codex 模型选择器不再显示带后缀的历史项。
pub fn sanitize_thread_model_suffixes(home: &Path) -> anyhow::Result<SanitizeModelSuffixResult> {
    let mut result = SanitizeModelSuffixResult::default();
    for db_path in codex_session_db_paths_from_home(home) {
        if !db_path.exists() {
            continue;
        }
        let (scanned, updated) = sanitize_thread_model_suffixes_in_db(&db_path)?;
        result.scanned += scanned;
        result.updated += updated;
    }
    Ok(result)
}

/// 同时清理 threads.model 与 logs_2.sqlite 中残留的带后缀模型名。
/// 返回的 scanned/updated 只统计 threads 表的改动数量；日志清理仅作为副作用。
pub fn sanitize_historical_model_suffixes(
    home: &Path,
) -> anyhow::Result<SanitizeModelSuffixResult> {
    sanitize_thread_model_suffixes(home)
}

fn sanitize_thread_model_suffixes_in_db(db_path: &Path) -> anyhow::Result<(usize, usize)> {
    let mut conn = Connection::open(db_path)?;
    let tx = conn.transaction()?;
    let has_model = tx
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'threads' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .is_ok()
        && tx
            .query_row(
                "SELECT 1 FROM pragma_table_info('threads') WHERE name = 'model' LIMIT 1",
                [],
                |_| Ok(()),
            )
            .is_ok();
    if !has_model {
        return Ok((0, 0));
    }

    let mut stmt = tx.prepare("SELECT id, model FROM threads WHERE model LIKE '%[%'")?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    let scanned = rows.len();
    let mut updated = 0;
    for (id, model) in rows {
        let (slug, suffix_window) = crate::model_suffix::parse_model_suffix(&model);
        if suffix_window.is_some() && slug != model {
            tx.execute("UPDATE threads SET model = ?1 WHERE id = ?2", [&slug, &id])?;
            updated += 1;
        }
    }
    tx.commit()?;
    Ok((scanned, updated))
}

/// 清理 logs_2.sqlite 中 feedback_log_body 字段里包含模型后缀的日志。
/// 这些日志只是历史记录，不会直接影响模型选择器，但清理后可避免
/// 诊断/遥测中继续出现已废弃的带后缀模型名。
pub fn sanitize_logs_model_suffixes_once(
    home: &Path,
) -> anyhow::Result<LogModelSuffixCleanupResult> {
    let marker = logs_model_suffix_cleanup_marker_path(home);
    if marker.exists() {
        let db_bytes = fs::metadata(codex_logs_db_path_from_home(home))
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        return Ok(LogModelSuffixCleanupResult {
            status: "already_done".to_string(),
            db_bytes,
            updated: 0,
        });
    }
    let db_path = codex_logs_db_path_from_home(home);
    if !db_path.exists() {
        return Ok(LogModelSuffixCleanupResult {
            status: "missing".to_string(),
            db_bytes: 0,
            updated: 0,
        });
    }
    let db_bytes = fs::metadata(&db_path)?.len();
    if db_bytes > LOG_MODEL_SUFFIX_CLEANUP_MAX_BYTES {
        let result = LogModelSuffixCleanupResult {
            status: "skipped_too_large".to_string(),
            db_bytes,
            updated: 0,
        };
        write_logs_model_suffix_cleanup_marker(home, &result)?;
        return Ok(result);
    }
    let updated = sanitize_logs_model_suffixes(home)?;
    let result = LogModelSuffixCleanupResult {
        status: "cleaned".to_string(),
        db_bytes,
        updated,
    };
    write_logs_model_suffix_cleanup_marker(home, &result)?;
    Ok(result)
}

fn logs_model_suffix_cleanup_marker_path(home: &Path) -> PathBuf {
    home.join(LOG_MODEL_SUFFIX_CLEANUP_MARKER_FILE)
}

fn write_logs_model_suffix_cleanup_marker(
    home: &Path,
    result: &LogModelSuffixCleanupResult,
) -> anyhow::Result<()> {
    let path = logs_model_suffix_cleanup_marker_path(home);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let payload = json!({
        "version": 1,
        "status": result.status,
        "db_bytes": result.db_bytes,
        "updated": result.updated,
    });
    crate::settings::atomic_write(&path, serde_json::to_string_pretty(&payload)?.as_bytes())?;
    Ok(())
}

fn sanitize_logs_model_suffixes(home: &Path) -> anyhow::Result<usize> {
    let db_path = codex_logs_db_path_from_home(home);
    if !db_path.exists() {
        return Ok(0);
    }
    let mut conn = Connection::open(&db_path)?;
    let has_table = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'logs' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .is_ok();
    if !has_table {
        return Ok(0);
    }
    let has_body = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('logs') WHERE name = 'feedback_log_body' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .is_ok();
    if !has_body {
        return Ok(0);
    }
    // 用保守模式匹配：包含 '[' 且以 ']%' 或包含 '[1M]' 等常见后缀。
    // 这里只替换明确符合 parse_model_suffix 规则的模型名，避免误改无关日志文本。
    let mut stmt = conn
        .prepare("SELECT rowid, feedback_log_body FROM logs WHERE feedback_log_body LIKE '%[%'")?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    let tx = conn.transaction()?;
    let mut update = tx.prepare("UPDATE logs SET feedback_log_body = ?1 WHERE rowid = ?2")?;
    let mut updated = 0usize;
    for (rowid, body) in rows {
        let sanitized = sanitize_model_suffixes_in_text(&body);
        if sanitized != body {
            update.execute([&sanitized, &rowid.to_string()])?;
            updated += 1;
        }
    }
    drop(update);
    tx.commit()?;
    Ok(updated)
}

/// 在一段文本中把所有符合 "slug[<number>K|M]" 格式的模型窗口后缀替换为纯 slug。
/// 只处理明确看起来像窗口大小后缀的形式（如 [1M]、[200K]），避免误改普通数组下标。
pub(crate) fn sanitize_model_suffixes_in_text(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::with_capacity(text.len());
    let mut last = 0; // 上次已复制到 result 的字符索引
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '[' {
            // 向后找窗口后缀：数字 + K/M（大小写均可）
            let digits_start = i + 1;
            let mut j = digits_start;
            while j < chars.len() && chars[j].is_ascii_digit() {
                j += 1;
            }
            let has_digits = j > digits_start;
            let unit_seen = j < chars.len() && matches!(chars[j], 'K' | 'k' | 'M' | 'm');
            if unit_seen {
                j += 1;
            }
            if has_digits && unit_seen && j < chars.len() && chars[j] == ']' {
                // 向前找 slug
                let mut slug_start = i;
                while slug_start > 0 && is_model_id_char(chars[slug_start - 1]) {
                    slug_start -= 1;
                }
                if slug_start < i {
                    result.extend(chars[last..slug_start].iter());
                    result.extend(chars[slug_start..i].iter());
                    last = j + 1;
                    i = j + 1;
                    continue;
                }
            }
        }
        i += 1;
    }
    result.extend(chars[last..].iter());
    result
}

fn is_model_id_char(c: char) -> bool {
    c.is_alphanumeric() || c == '.' || c == '/' || c == '_' || c == '-' || c == ':'
}

#[cfg(test)]
mod tests {
    use super::sanitize_model_suffixes_in_text;

    #[test]
    fn strips_trailing_suffix_from_model_names() {
        assert_eq!(
            sanitize_model_suffixes_in_text("model=deepseek-v4-flash[1M]"),
            "model=deepseek-v4-flash"
        );
        assert_eq!(
            sanitize_model_suffixes_in_text("nvidia/nemotron-3-super-120b-a12b:free[1M]"),
            "nvidia/nemotron-3-super-120b-a12b:free"
        );
        assert_eq!(sanitize_model_suffixes_in_text("glm-5.2[1M]"), "glm-5.2");
    }

    #[test]
    fn leaves_non_model_brackets_unchanged() {
        assert_eq!(
            sanitize_model_suffixes_in_text("array[0] and foo[bar]"),
            "array[0] and foo[bar]"
        );
        assert_eq!(
            sanitize_model_suffixes_in_text("some [placeholder] text"),
            "some [placeholder] text"
        );
    }

    #[test]
    fn leaves_text_without_brackets_unchanged() {
        let text = "no suffix here";
        assert_eq!(sanitize_model_suffixes_in_text(text), text);
    }
}
