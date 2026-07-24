use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{Map, Value, json};

static TEST_LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static TEST_LOG_LIMITS: OnceLock<Mutex<Option<LogLimits>>> = OnceLock::new();
static TEST_RATE_LIMIT: OnceLock<Mutex<Option<RateLimitConfig>>> = OnceLock::new();
static LOG_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static EVENT_RATE_STATE: OnceLock<Mutex<HashMap<String, RateLimitBucket>>> = OnceLock::new();

const REDACTED: &str = "[redacted]";
const MAX_STRING_CHARS: usize = 4096;
const DEFAULT_MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
const DEFAULT_ROTATED_LOG_FILES: usize = 4;
const DEFAULT_RATE_LIMIT_WINDOW_MS: u64 = 60_000;
const DEFAULT_RATE_LIMIT_MAX_PER_WINDOW: u32 = 240;
const DEFAULT_HIGH_FREQUENCY_MAX_PER_WINDOW: u32 = 60;

#[derive(Debug, Clone, Copy)]
struct LogLimits {
    max_bytes: u64,
    rotated_files: usize,
}

#[derive(Debug, Clone, Copy)]
struct RateLimitConfig {
    window_ms: u64,
    max_per_window: u32,
}

#[derive(Debug, Clone, Copy)]
struct RateLimitBucket {
    window_start_ms: u64,
    count: u32,
}

#[derive(Debug, Clone, Serialize)]
struct DiagnosticRecord {
    timestamp_ms: u64,
    pid: u32,
    event: String,
    detail: Value,
}

pub fn append_diagnostic_log(event: &str, detail: impl Serialize) -> std::io::Result<()> {
    let event = sanitize_event(event);
    if diagnostic_event_rate_limited(&event) {
        return Ok(());
    }

    let path = diagnostic_log_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let detail = serde_json::to_value(detail).unwrap_or_else(|error| {
        json!({
            "serialization_error": error.to_string()
        })
    });
    let detail = sanitize_diagnostic_value(detail);
    let record = DiagnosticRecord {
        timestamp_ms: now_ms(),
        pid: std::process::id(),
        event,
        detail,
    };
    let line = serde_json::to_string(&record).unwrap_or_else(|error| {
        json!({
            "timestamp_ms": now_ms(),
            "pid": std::process::id(),
            "event": "diagnostic_log.serialization_failed",
            "detail": {
                "message": error.to_string()
            }
        })
        .to_string()
    });

    let _guard = LOG_WRITE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    rotate_log_if_needed(&path, line.len() as u64 + 1)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    writeln!(file, "{line}")?;
    Ok(())
}

pub fn sanitize_diagnostic_value(value: Value) -> Value {
    sanitize_value(value)
}

pub fn sanitize_diagnostic_text(text: &str) -> String {
    redact_sensitive_text(text)
}

pub fn diagnostic_log_path() -> PathBuf {
    if let Some(lock) = TEST_LOG_PATH.get() {
        if let Ok(guard) = lock.lock() {
            if let Some(path) = &*guard {
                return path.clone();
            }
        }
    }
    crate::paths::default_diagnostic_log_path()
}

#[doc(hidden)]
pub fn set_diagnostic_log_path_for_tests(path: Option<PathBuf>) {
    let lock = TEST_LOG_PATH.get_or_init(|| Mutex::new(None));
    *lock.lock().expect("test log path lock poisoned") = path;
}

fn sanitize_value(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let sanitized = map
                .into_iter()
                .map(|(key, value)| {
                    let value = if sensitive_key(&key) && value_is_secret_like(&value) {
                        Value::String(REDACTED.to_string())
                    } else {
                        sanitize_value(value)
                    };
                    (key, value)
                })
                .collect::<Map<_, _>>();
            Value::Object(sanitized)
        }
        Value::Array(values) => Value::Array(values.into_iter().map(sanitize_value).collect()),
        Value::String(value) => Value::String(redact_sensitive_text(&truncate_string(&value))),
        other => other,
    }
}

fn value_is_secret_like(value: &Value) -> bool {
    matches!(value, Value::String(_) | Value::Array(_) | Value::Object(_))
}

fn sensitive_key(key: &str) -> bool {
    let key = key
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect::<String>();
    matches!(
        key.as_str(),
        "apikey"
            | "relayapikey"
            | "openaikey"
            | "openaiapikey"
            | "authorization"
            | "authtoken"
            | "bearertoken"
            | "accesstoken"
            | "refreshtoken"
            | "idtoken"
            | "password"
            | "secret"
            | "clientsecret"
            | "credential"
            | "credentials"
            | "authcontents"
            | "tokens"
    ) || key.ends_with("apikey")
        || key.ends_with("secret")
        || key.ends_with("password")
        || key.ends_with("credential")
        || key.ends_with("credentials")
        || key.ends_with("authtoken")
        || key.ends_with("accesstoken")
        || key.ends_with("refreshtoken")
        || key.ends_with("idtoken")
}

fn truncate_string(value: &str) -> String {
    if value.chars().count() <= MAX_STRING_CHARS {
        return value.to_string();
    }
    let prefix = value.chars().take(MAX_STRING_CHARS).collect::<String>();
    format!("{prefix}...[truncated]")
}

fn redact_sensitive_text(value: &str) -> String {
    let mut text = value.to_string();
    for marker in [
        "sk-",
        "sess-",
        "Bearer ",
        "bearer ",
        "OPENAI_API_KEY=",
        "OPENAI_API_KEY\":\"",
        "OPENAI_API_KEY=\\\"",
        "OPENAI_API_KEY = \"",
        "OPENAI_API_KEY = \\\"",
        "experimental_bearer_token = \"",
        "experimental_bearer_token = \\\"",
        "access_token\":\"",
        "access_token\\\":\\\"",
        "refresh_token\":\"",
        "refresh_token\\\":\\\"",
        "id_token\":\"",
        "id_token\\\":\\\"",
    ] {
        text = redact_after_marker(&text, marker);
    }
    text
}

fn redact_after_marker(input: &str, marker: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(index) = rest.find(marker) {
        let (prefix, tail) = rest.split_at(index);
        output.push_str(prefix);
        output.push_str(marker);
        output.push_str(REDACTED);
        let token_start = marker.len();
        let token_len = tail[token_start..]
            .char_indices()
            .find_map(|(offset, ch)| token_delimiter(ch).then_some(offset))
            .unwrap_or_else(|| tail[token_start..].len());
        rest = &tail[token_start + token_len..];
    }
    output.push_str(rest);
    output
}

fn token_delimiter(ch: char) -> bool {
    ch.is_whitespace() || matches!(ch, '"' | '\'' | ',' | ';' | ')' | ']' | '}')
}

fn sanitize_event(event: &str) -> String {
    let sanitized = event
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.' | ':') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let sanitized = sanitized.trim_matches(['.', '_', '-', ':']).trim();
    if sanitized.is_empty() {
        "diagnostic.event".to_string()
    } else {
        sanitized.chars().take(128).collect()
    }
}

fn diagnostic_event_rate_limited(event: &str) -> bool {
    let config = rate_limit_config(event);
    if config.max_per_window == 0 {
        return true;
    }

    let now = now_ms();
    let mut state = EVENT_RATE_STATE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let bucket = state
        .entry(event.to_string())
        .or_insert_with(|| RateLimitBucket {
            window_start_ms: now,
            count: 0,
        });
    if now.saturating_sub(bucket.window_start_ms) >= config.window_ms {
        bucket.window_start_ms = now;
        bucket.count = 0;
    }
    if bucket.count >= config.max_per_window {
        return true;
    }
    bucket.count += 1;
    false
}

fn rate_limit_config(event: &str) -> RateLimitConfig {
    if let Some(lock) = TEST_RATE_LIMIT.get() {
        if let Ok(guard) = lock.lock() {
            if let Some(config) = *guard {
                return config;
            }
        }
    }
    let max_per_window = if matches!(
        event,
        "bridge.request"
            | "bridge.response"
            | "bridge.resolve_start"
            | "bridge.resolve_ok"
            | "bridge.reject_start"
            | "bridge.reject_ok"
    ) {
        DEFAULT_HIGH_FREQUENCY_MAX_PER_WINDOW
    } else {
        DEFAULT_RATE_LIMIT_MAX_PER_WINDOW
    };
    RateLimitConfig {
        window_ms: DEFAULT_RATE_LIMIT_WINDOW_MS,
        max_per_window,
    }
}

fn rotate_log_if_needed(path: &PathBuf, next_line_bytes: u64) -> std::io::Result<()> {
    let limits = log_limits();
    if limits.rotated_files == 0 || limits.max_bytes == 0 {
        return Ok(());
    }
    let current_len = std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
    if current_len.saturating_add(next_line_bytes) <= limits.max_bytes {
        return Ok(());
    }

    for index in (1..=limits.rotated_files).rev() {
        let source = if index == 1 {
            path.clone()
        } else {
            rotated_log_path(path, index - 1)
        };
        if !source.exists() {
            continue;
        }
        let target = rotated_log_path(path, index);
        if target.exists() {
            std::fs::remove_file(&target)?;
        }
        std::fs::rename(source, target)?;
    }
    Ok(())
}

fn rotated_log_path(path: &PathBuf, index: usize) -> PathBuf {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return path.with_extension(format!("log.{index}"));
    };
    path.with_file_name(format!("{file_name}.{index}"))
}

fn log_limits() -> LogLimits {
    if let Some(lock) = TEST_LOG_LIMITS.get() {
        if let Ok(guard) = lock.lock() {
            if let Some(limits) = *guard {
                return limits;
            }
        }
    }
    LogLimits {
        max_bytes: DEFAULT_MAX_LOG_BYTES,
        rotated_files: DEFAULT_ROTATED_LOG_FILES,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
fn set_log_limits_for_tests(limits: Option<LogLimits>) {
    let lock = TEST_LOG_LIMITS.get_or_init(|| Mutex::new(None));
    *lock.lock().expect("test log limits lock poisoned") = limits;
}

#[cfg(test)]
fn set_rate_limit_for_tests(config: Option<RateLimitConfig>) {
    let lock = TEST_RATE_LIMIT.get_or_init(|| Mutex::new(None));
    *lock.lock().expect("test rate limit lock poisoned") = config;
    if let Some(state) = EVENT_RATE_STATE.get() {
        state.lock().expect("rate state lock poisoned").clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    struct DiagnosticLogTestGuard;

    impl DiagnosticLogTestGuard {
        fn set(path: PathBuf) -> Self {
            set_diagnostic_log_path_for_tests(Some(path));
            set_log_limits_for_tests(None);
            set_rate_limit_for_tests(None);
            Self
        }
    }

    impl Drop for DiagnosticLogTestGuard {
        fn drop(&mut self) {
            set_diagnostic_log_path_for_tests(None);
            set_log_limits_for_tests(None);
            set_rate_limit_for_tests(None);
        }
    }

    #[test]
    fn append_diagnostic_log_redacts_sensitive_values() {
        let _lock = TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let log_path = temp.path().join("codex-plus.log");
        let _guard = DiagnosticLogTestGuard::set(log_path.clone());

        append_diagnostic_log(
            "manager.secret_check",
            json!({
                "apiKey": "sk-live-secret",
                "authorization": "Bearer live-token",
                "hasBearerToken": true,
                "configContents": "experimental_bearer_token = \"sk-config-secret\"",
                "nested": {
                    "tokens": {
                        "access_token": "session-token"
                    }
                }
            }),
        )
        .unwrap();

        let contents = std::fs::read_to_string(log_path).unwrap();
        assert!(contents.contains(REDACTED));
        assert!(contents.contains("\"hasBearerToken\":true"));
        assert!(!contents.contains("sk-live-secret"));
        assert!(!contents.contains("live-token"));
        assert!(!contents.contains("sk-config-secret"));
        assert!(!contents.contains("session-token"));
    }

    #[test]
    fn sanitize_diagnostic_text_redacts_existing_log_text() {
        let _lock = TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let text = r#"OPENAI_API_KEY="sk-env-secret" Authorization: Bearer live-token"#;
        let sanitized = sanitize_diagnostic_text(text);

        assert!(sanitized.contains(REDACTED));
        assert!(!sanitized.contains("sk-env-secret"));
        assert!(!sanitized.contains("live-token"));
    }

    #[test]
    fn append_diagnostic_log_rotates_when_log_exceeds_limit() {
        let _lock = TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let log_path = temp.path().join("codex-plus.log");
        let _guard = DiagnosticLogTestGuard::set(log_path.clone());
        set_log_limits_for_tests(Some(LogLimits {
            max_bytes: 450,
            rotated_files: 2,
        }));

        for index in 0..8 {
            append_diagnostic_log(
                "manager.rotate",
                json!({ "index": index, "message": "small" }),
            )
            .unwrap();
        }

        assert!(log_path.exists());
        assert!(rotated_log_path(&log_path, 1).exists());
        assert!(std::fs::metadata(&log_path).unwrap().len() <= 450);
        assert!(
            std::fs::metadata(rotated_log_path(&log_path, 1))
                .unwrap()
                .len()
                <= 450
        );
        assert!(!rotated_log_path(&log_path, 3).exists());
    }

    #[test]
    fn append_diagnostic_log_rate_limits_repeated_events() {
        let _lock = TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let log_path = temp.path().join("codex-plus.log");
        let _guard = DiagnosticLogTestGuard::set(log_path.clone());
        set_rate_limit_for_tests(Some(RateLimitConfig {
            window_ms: 60_000,
            max_per_window: 2,
        }));

        for index in 0..5 {
            append_diagnostic_log("manager.noisy", json!({ "index": index })).unwrap();
        }

        let contents = std::fs::read_to_string(log_path).unwrap();
        let noisy_lines = contents
            .lines()
            .filter(|line| line.contains(r#""event":"manager.noisy""#))
            .count();
        assert_eq!(noisy_lines, 2);
    }

    #[test]
    fn append_diagnostic_log_limits_high_frequency_bridge_events() {
        let _lock = TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let log_path = temp.path().join("codex-plus.log");
        let _guard = DiagnosticLogTestGuard::set(log_path.clone());

        for index in 0..100 {
            append_diagnostic_log("bridge.request", json!({ "index": index })).unwrap();
        }

        let contents = std::fs::read_to_string(log_path).unwrap();
        let bridge_lines = contents
            .lines()
            .filter(|line| line.contains(r#""event":"bridge.request""#))
            .count();
        assert_eq!(bridge_lines, DEFAULT_HIGH_FREQUENCY_MAX_PER_WINDOW as usize);
    }
}
