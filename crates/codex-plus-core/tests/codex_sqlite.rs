use codex_plus_core::codex_sqlite::{
    codex_listable_session_db_paths_from_home, codex_session_db_paths_from_home,
    maintain_logs_db_size, sanitize_historical_model_suffixes, sanitize_logs_model_suffixes_once,
};
use rusqlite::Connection;

fn create_threads_table(conn: &Connection) {
    conn.execute(
        "CREATE TABLE threads (
            id TEXT PRIMARY KEY,
            model TEXT,
            updated_at INTEGER
        )",
        [],
    )
    .unwrap();
}

fn create_large_logs_database(path: &std::path::Path, rows: i64) {
    let mut conn = Connection::open(path).unwrap();
    conn.execute_batch(
        "CREATE TABLE logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            ts_nanos INTEGER NOT NULL,
            feedback_log_body BLOB NOT NULL
        );
        CREATE INDEX logs_timestamp_idx ON logs(ts, ts_nanos);",
    )
    .unwrap();
    let tx = conn.transaction().unwrap();
    for index in 0..rows {
        tx.execute(
            "INSERT INTO logs (ts, ts_nanos, feedback_log_body) VALUES (?1, ?2, zeroblob(2048))",
            rusqlite::params![index, index],
        )
        .unwrap();
    }
    tx.commit().unwrap();
}

#[test]
fn listable_session_db_paths_include_supported_session_schemas() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    let sqlite_dir = home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let threads_path = sqlite_dir.join("state_5.sqlite");
    let automation_path = sqlite_dir.join("automation_1.sqlite");
    Connection::open(&threads_path)
        .unwrap()
        .execute("CREATE TABLE threads (id TEXT PRIMARY KEY)", [])
        .unwrap();
    Connection::open(&automation_path)
        .unwrap()
        .execute(
            "CREATE TABLE automation_runs (thread_id TEXT PRIMARY KEY)",
            [],
        )
        .unwrap();

    let paths = codex_listable_session_db_paths_from_home(&home);

    assert_eq!(paths.len(), 2);
    assert!(paths.contains(&threads_path));
    assert!(paths.contains(&automation_path));
}

#[test]
fn listable_session_db_paths_exclude_goals_and_memories_databases() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    let sqlite_dir = home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let goals_path = sqlite_dir.join("goals_1.sqlite");
    let memories_path = sqlite_dir.join("memories_1.sqlite");
    Connection::open(&goals_path)
        .unwrap()
        .execute("CREATE TABLE thread_goals (thread_id TEXT PRIMARY KEY)", [])
        .unwrap();
    Connection::open(&memories_path)
        .unwrap()
        .execute("CREATE TABLE messages (id TEXT PRIMARY KEY)", [])
        .unwrap();

    let paths = codex_listable_session_db_paths_from_home(&home);

    assert!(paths.is_empty());
}

#[test]
fn broad_session_db_discovery_keeps_auxiliary_databases() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    let sqlite_dir = home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let goals_path = sqlite_dir.join("goals_1.sqlite");
    let memories_path = sqlite_dir.join("memories_1.sqlite");
    Connection::open(&goals_path)
        .unwrap()
        .execute("CREATE TABLE thread_goals (thread_id TEXT PRIMARY KEY)", [])
        .unwrap();
    Connection::open(&memories_path)
        .unwrap()
        .execute("CREATE TABLE messages (id TEXT PRIMARY KEY)", [])
        .unwrap();

    let paths = codex_session_db_paths_from_home(&home);

    assert!(paths.contains(&goals_path));
    assert!(paths.contains(&memories_path));
}

#[test]
fn sanitize_strips_suffix_from_thread_model() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();
    let db_path = home.join("state_5.sqlite");
    let conn = Connection::open(&db_path).unwrap();
    create_threads_table(&conn);
    conn.execute(
        "INSERT INTO threads (id, model, updated_at) VALUES (?1, ?2, ?3)",
        ["t1", "deepseek/deepseek-v4-flash[1M]", "1000"],
    )
    .unwrap();
    drop(conn);

    let result = sanitize_historical_model_suffixes(&home).unwrap();
    assert_eq!(result.scanned, 1);
    assert_eq!(result.updated, 1);

    let conn = Connection::open(&db_path).unwrap();
    let model: String = conn
        .query_row("SELECT model FROM threads WHERE id = 't1'", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(model, "deepseek/deepseek-v4-flash");
}

#[test]
fn sanitize_skips_models_without_suffix() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();
    let db_path = home.join("state_5.sqlite");
    let conn = Connection::open(&db_path).unwrap();
    create_threads_table(&conn);
    conn.execute(
        "INSERT INTO threads (id, model, updated_at) VALUES (?1, ?2, ?3)",
        ["t1", "gpt-5.5", "1000"],
    )
    .unwrap();
    drop(conn);

    let result = sanitize_historical_model_suffixes(&home).unwrap();
    assert_eq!(result.scanned, 0);
    assert_eq!(result.updated, 0);
}

#[test]
fn sanitize_skips_invalid_suffixes() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();
    let db_path = home.join("state_5.sqlite");
    let conn = Connection::open(&db_path).unwrap();
    create_threads_table(&conn);
    conn.execute(
        "INSERT INTO threads (id, model, updated_at) VALUES (?1, ?2, ?3)",
        ["t1", "foo[bar]", "1000"],
    )
    .unwrap();
    drop(conn);

    let result = sanitize_historical_model_suffixes(&home).unwrap();
    assert_eq!(result.scanned, 1);
    assert_eq!(result.updated, 0);
}

#[test]
fn sanitize_handles_null_model() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();
    let db_path = home.join("state_5.sqlite");
    let conn = Connection::open(&db_path).unwrap();
    create_threads_table(&conn);
    conn.execute(
        "INSERT INTO threads (id, model, updated_at) VALUES (?1, ?2, ?3)",
        rusqlite::params!["t1", rusqlite::types::Null, "1000"],
    )
    .unwrap();
    drop(conn);

    let result = sanitize_historical_model_suffixes(&home).unwrap();
    assert_eq!(result.scanned, 0);
    assert_eq!(result.updated, 0);
}

#[test]
fn sanitize_cleans_suffix_from_logs() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();

    // logs_2.sqlite 不需要 threads 表，只需要 logs 表。
    let logs_path = home.join("logs_2.sqlite");
    let conn = Connection::open(&logs_path).unwrap();
    conn.execute(
        "CREATE TABLE logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            ts_nanos INTEGER NOT NULL,
            level TEXT NOT NULL,
            target TEXT NOT NULL,
            feedback_log_body TEXT,
            module_path TEXT,
            file TEXT,
            line INTEGER,
            thread_id TEXT,
            process_uuid TEXT,
            estimated_bytes INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO logs (ts, ts_nanos, level, target, feedback_log_body)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        [
            "1",
            "1",
            "INFO",
            "codex_models_manager::cache",
            r#"session_loop{model="deepseek-v4-flash[1M]"}: Unknown model deepseek-v4-flash[1M] is used."#,
        ],
    )
    .unwrap();
    drop(conn);

    let result = sanitize_logs_model_suffixes_once(&home).unwrap();
    assert_eq!(result.status, "cleaned");
    assert_eq!(result.updated, 1);

    let conn = Connection::open(&logs_path).unwrap();
    let body: String = conn
        .query_row(
            "SELECT feedback_log_body FROM logs WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        !body.contains("[1M]"),
        "expected suffix to be stripped from logs, got: {body}"
    );
    assert!(body.contains("deepseek-v4-flash"));
    assert!(
        home.join(".tmp/codex-plus/logs-model-suffix-cleanup-v1.json")
            .exists()
    );
}

#[test]
fn startup_sanitize_does_not_scan_logs_database() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();

    let logs_path = home.join("logs_2.sqlite");
    let conn = Connection::open(&logs_path).unwrap();
    conn.execute(
        "CREATE TABLE logs (id INTEGER PRIMARY KEY, feedback_log_body TEXT)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO logs (id, feedback_log_body) VALUES (1, 'deepseek-v4-flash[1M]')",
        [],
    )
    .unwrap();
    drop(conn);

    let result = sanitize_historical_model_suffixes(&home).unwrap();
    assert_eq!(result.scanned, 0);
    assert_eq!(result.updated, 0);

    let conn = Connection::open(&logs_path).unwrap();
    let body: String = conn
        .query_row(
            "SELECT feedback_log_body FROM logs WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(body, "deepseek-v4-flash[1M]");
}

#[test]
fn logs_sanitize_once_skips_when_marker_exists() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    let marker = home.join(".tmp/codex-plus/logs-model-suffix-cleanup-v1.json");
    std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
    std::fs::write(&marker, "{}").unwrap();

    let result = sanitize_logs_model_suffixes_once(&home).unwrap();

    assert_eq!(result.status, "already_done");
    assert_eq!(result.updated, 0);
}

#[test]
fn logs_sanitize_once_skips_large_logs_database() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();
    let logs_path = home.join("logs_2.sqlite");
    let file = std::fs::File::create(&logs_path).unwrap();
    file.set_len(70 * 1024 * 1024).unwrap();
    drop(file);

    let result = sanitize_logs_model_suffixes_once(&home).unwrap();

    assert_eq!(result.status, "skipped_too_large");
    assert_eq!(result.updated, 0);
    assert_eq!(result.db_bytes, 70 * 1024 * 1024);
    assert!(
        home.join(".tmp/codex-plus/logs-model-suffix-cleanup-v1.json")
            .exists()
    );
}

#[test]
fn logs_database_maintenance_is_opt_in_and_skips_missing_database() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");

    let disabled = maintain_logs_db_size(&home, 0).unwrap();
    assert_eq!(disabled.status, "disabled");

    let missing = maintain_logs_db_size(&home, 2).unwrap();
    assert_eq!(missing.status, "missing");
}

#[test]
fn logs_database_maintenance_deletes_oldest_rows_and_compacts() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();
    let logs_path = home.join("logs_2.sqlite");
    create_large_logs_database(&logs_path, 3_000);
    let state_path = home.join("state_5.sqlite");
    let state = Connection::open(&state_path).unwrap();
    state
        .execute("CREATE TABLE threads (id TEXT PRIMARY KEY)", [])
        .unwrap();
    state
        .execute("INSERT INTO threads (id) VALUES ('keep-me')", [])
        .unwrap();
    drop(state);

    let before = std::fs::metadata(&logs_path).unwrap().len();
    assert!(before > 2 * 1024 * 1024);

    let result = maintain_logs_db_size(&home, 2).unwrap();

    assert_eq!(result.status, "compacted");
    assert!(result.deleted_rows > 0);
    assert!(result.db_bytes_after < result.db_bytes_before);
    assert!(result.db_bytes_after <= result.max_bytes);
    let logs = Connection::open(&logs_path).unwrap();
    let remaining: i64 = logs
        .query_row("SELECT COUNT(*) FROM logs", [], |row| row.get(0))
        .unwrap();
    let oldest_ts: Option<i64> = logs
        .query_row("SELECT MIN(ts) FROM logs", [], |row| row.get(0))
        .unwrap();
    assert!(remaining < 3_000);
    assert!(oldest_ts.is_some_and(|value| value > 0));
    let state = Connection::open(&state_path).unwrap();
    let thread_id: String = state
        .query_row("SELECT id FROM threads", [], |row| row.get(0))
        .unwrap();
    assert_eq!(thread_id, "keep-me");
}

#[test]
fn logs_database_maintenance_skips_when_write_lock_is_busy() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(&home).unwrap();
    let logs_path = home.join("logs_2.sqlite");
    create_large_logs_database(&logs_path, 1_000);
    let lock = Connection::open(&logs_path).unwrap();
    lock.execute_batch("BEGIN IMMEDIATE").unwrap();

    let result = maintain_logs_db_size(&home, 1).unwrap();

    assert_eq!(result.status, "skipped_busy");
    assert_eq!(result.deleted_rows, 0);
    lock.execute_batch("ROLLBACK").unwrap();
}
