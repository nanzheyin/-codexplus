use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::settings::SettingsStore;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportPreview {
    pub source_root: String,
    pub found: bool,
    pub schema: LegacyImportSchema,
    pub summary: LegacyImportSummary,
    pub items: Vec<LegacyImportItem>,
    pub conflicts: Vec<LegacyImportConflict>,
    pub excluded: Vec<LegacyImportExcluded>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportSchema {
    pub settings_json_found: bool,
    pub settings_json_valid: bool,
    pub settings_key_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportSummary {
    pub automatic_items: usize,
    pub confirmation_items: usize,
    pub secret_items: usize,
    pub executable_or_external_items: usize,
    pub excluded_items: usize,
    pub conflicts: usize,
    pub codex_native_session_sources: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportTransaction {
    pub transaction_root: String,
    pub preview_path: String,
    pub ledger_path: String,
    pub rollback_manifest_path: String,
    pub ledger: LegacyImportLedger,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportLedger {
    pub source_root: String,
    pub created_at_ms: u64,
    pub entries: Vec<LegacyImportLedgerEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportLedgerEntry {
    pub item_id: String,
    pub group: String,
    pub source_path: String,
    pub source_key: String,
    pub target: String,
    pub selected: bool,
    pub status: String,
    pub requires_confirmation: bool,
    pub risk: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportItem {
    pub id: String,
    pub group: String,
    pub source_path: String,
    pub source_key: String,
    pub target: String,
    pub action: String,
    pub requires_confirmation: bool,
    pub risk: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportConflict {
    pub id: String,
    pub severity: String,
    pub source_path: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportExcluded {
    pub id: String,
    pub category: String,
    pub source_path: String,
    pub reason: String,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportApplyResult {
    pub settings_path: String,
    pub ledger_path: String,
    pub imported: usize,
    pub skipped: usize,
    pub pending_confirmation: usize,
    pub failed: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportRollbackResult {
    pub settings_path: String,
    pub ledger_path: String,
    pub rollback_manifest_path: String,
    pub backup_path: String,
    pub restored: bool,
    pub entries_marked_rolled_back: usize,
    pub backup_sha256_verified: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyImportRollbackManifest {
    created_at_ms: u64,
    settings: Option<LegacyImportSettingsSnapshot>,
    contains_plaintext_secrets: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyImportSettingsSnapshot {
    path: String,
    existed: bool,
    sha256: String,
    backup_path: String,
    backup_sha256: String,
    captured_contents: bool,
}

pub fn default_legacy_import_root() -> PathBuf {
    directories::BaseDirs::new()
        .map(|dirs| dirs.home_dir().join(".codex-session-delete"))
        .unwrap_or_else(|| PathBuf::from(".codex-session-delete"))
}

pub fn preview_legacy_import(source_root: &Path) -> anyhow::Result<LegacyImportPreview> {
    let mut preview = LegacyImportPreview {
        source_root: source_root.to_string_lossy().to_string(),
        found: source_root.is_dir(),
        schema: LegacyImportSchema::default(),
        summary: LegacyImportSummary::default(),
        items: Vec::new(),
        conflicts: Vec::new(),
        excluded: Vec::new(),
    };

    if !preview.found {
        refresh_summary(&mut preview);
        return Ok(preview);
    }

    scan_settings(source_root, &mut preview)?;
    scan_root_entries(source_root, &mut preview)?;
    refresh_summary(&mut preview);
    Ok(preview)
}

pub fn default_legacy_import_transaction_root(app_state_root: &Path) -> PathBuf {
    app_state_root
        .join("legacy-import-transactions")
        .join(format!("tx-{}", now_ms()))
}

pub fn prepare_legacy_import_transaction(
    source_root: &Path,
    transaction_root: &Path,
    current_settings_path: Option<&Path>,
    selected_item_ids: &[String],
) -> anyhow::Result<LegacyImportTransaction> {
    ensure_empty_transaction_root(transaction_root)?;
    let preview = preview_legacy_import(source_root)?;
    let selected = selected_item_ids.iter().cloned().collect::<BTreeSet<_>>();
    let ledger = build_ledger(&preview, &selected);
    let preview_path = transaction_root.join("preview.json");
    let ledger_path = transaction_root.join("ledger.json");
    let rollback_manifest_path = transaction_root.join("rollback-manifest.json");
    let rollback_settings_path = transaction_root.join("rollback-settings.json");

    crate::settings::atomic_write(
        &preview_path,
        serde_json::to_string_pretty(&preview)?.as_bytes(),
    )?;
    crate::settings::atomic_write(
        &ledger_path,
        serde_json::to_string_pretty(&ledger)?.as_bytes(),
    )?;
    write_rollback_manifest(
        &rollback_manifest_path,
        &rollback_settings_path,
        current_settings_path,
    )?;

    Ok(LegacyImportTransaction {
        transaction_root: transaction_root.to_string_lossy().to_string(),
        preview_path: preview_path.to_string_lossy().to_string(),
        ledger_path: ledger_path.to_string_lossy().to_string(),
        rollback_manifest_path: rollback_manifest_path.to_string_lossy().to_string(),
        ledger,
    })
}

pub fn apply_legacy_import_transaction(
    transaction_root: &Path,
    store: SettingsStore,
) -> anyhow::Result<LegacyImportApplyResult> {
    let preview_path = transaction_root.join("preview.json");
    let ledger_path = transaction_root.join("ledger.json");
    let preview: LegacyImportPreview = serde_json::from_str(
        &std::fs::read_to_string(&preview_path)
            .with_context(|| format!("failed to read {}", preview_path.to_string_lossy()))?,
    )
    .context("legacy import preview is invalid")?;
    let mut ledger: LegacyImportLedger = serde_json::from_str(
        &std::fs::read_to_string(&ledger_path)
            .with_context(|| format!("failed to read {}", ledger_path.to_string_lossy()))?,
    )
    .context("legacy import ledger is invalid")?;
    let legacy_settings = read_legacy_settings_object(Path::new(&preview.source_root))?;
    let payload = build_non_sensitive_apply_payload(&legacy_settings, &ledger);

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut pending_confirmation = 0usize;
    let mut failed = 0usize;

    if !payload.is_empty() {
        store.update(Value::Object(payload))?;
    }

    for entry in &mut ledger.entries {
        match entry.status.as_str() {
            "pending" if entry.group == "nonSensitiveConfig" => {
                entry.status = "success".to_string();
                imported += 1;
            }
            "pending" if entry.requires_confirmation => {
                entry.status = "pendingConfirmation".to_string();
                pending_confirmation += 1;
            }
            "pending" => {
                entry.status = "skipped".to_string();
                skipped += 1;
            }
            "skipped" | "excluded" => skipped += 1,
            "failed" => failed += 1,
            "success" => imported += 1,
            "pendingConfirmation" => pending_confirmation += 1,
            _ => skipped += 1,
        }
    }

    crate::settings::atomic_write(
        &ledger_path,
        serde_json::to_string_pretty(&ledger)?.as_bytes(),
    )?;

    Ok(LegacyImportApplyResult {
        settings_path: store.path().to_string_lossy().to_string(),
        ledger_path: ledger_path.to_string_lossy().to_string(),
        imported,
        skipped,
        pending_confirmation,
        failed,
    })
}

pub fn rollback_legacy_import_transaction(
    transaction_root: &Path,
    store: SettingsStore,
) -> anyhow::Result<LegacyImportRollbackResult> {
    let ledger_path = transaction_root.join("ledger.json");
    let rollback_manifest_path = transaction_root.join("rollback-manifest.json");
    let manifest: LegacyImportRollbackManifest = serde_json::from_str(
        &std::fs::read_to_string(&rollback_manifest_path).with_context(|| {
            format!(
                "failed to read {}",
                rollback_manifest_path.to_string_lossy()
            )
        })?,
    )
    .context("legacy import rollback manifest is invalid")?;
    let Some(settings_snapshot) = manifest.settings else {
        bail!("legacy import rollback settings snapshot is missing");
    };
    let backup_path = PathBuf::from(&settings_snapshot.backup_path);
    let backup_bytes = std::fs::read(&backup_path)
        .with_context(|| format!("failed to read {}", backup_path.to_string_lossy()))?;
    let backup_sha256 = sha256_hex(&backup_bytes);
    if backup_sha256 != settings_snapshot.backup_sha256 {
        bail!("legacy import rollback settings backup checksum mismatch");
    }

    crate::settings::atomic_write(store.path(), &backup_bytes)?;

    let mut entries_marked_rolled_back = 0usize;
    if ledger_path.is_file() {
        let mut ledger: LegacyImportLedger = serde_json::from_str(
            &std::fs::read_to_string(&ledger_path)
                .with_context(|| format!("failed to read {}", ledger_path.to_string_lossy()))?,
        )
        .context("legacy import ledger is invalid")?;
        for entry in &mut ledger.entries {
            if entry.status == "success" {
                entry.status = "rolledBack".to_string();
                entries_marked_rolled_back += 1;
            }
        }
        crate::settings::atomic_write(
            &ledger_path,
            serde_json::to_string_pretty(&ledger)?.as_bytes(),
        )?;
    }

    Ok(LegacyImportRollbackResult {
        settings_path: store.path().to_string_lossy().to_string(),
        ledger_path: ledger_path.to_string_lossy().to_string(),
        rollback_manifest_path: rollback_manifest_path.to_string_lossy().to_string(),
        backup_path: backup_path.to_string_lossy().to_string(),
        restored: true,
        entries_marked_rolled_back,
        backup_sha256_verified: true,
    })
}

fn scan_settings(source_root: &Path, preview: &mut LegacyImportPreview) -> anyhow::Result<()> {
    let settings_path = source_root.join("settings.json");
    if !settings_path.exists() {
        preview.conflicts.push(LegacyImportConflict {
            id: "missing-settings-json".to_string(),
            severity: "warning".to_string(),
            source_path: settings_path.to_string_lossy().to_string(),
            message: "settings.json not found; only file-level exclusions can be previewed"
                .to_string(),
        });
        return Ok(());
    }

    preview.schema.settings_json_found = true;
    let contents = std::fs::read_to_string(&settings_path).with_context(|| {
        format!(
            "failed to read legacy settings {}",
            settings_path.to_string_lossy()
        )
    })?;
    let value = match serde_json::from_str::<Value>(&contents) {
        Ok(Value::Object(map)) => {
            preview.schema.settings_json_valid = true;
            preview.schema.settings_key_count = map.len();
            map
        }
        Ok(_) | Err(_) => {
            preview.conflicts.push(LegacyImportConflict {
                id: "invalid-settings-json".to_string(),
                severity: "error".to_string(),
                source_path: settings_path.to_string_lossy().to_string(),
                message: "settings.json is not a valid object and will not be imported".to_string(),
            });
            return Ok(());
        }
    };

    scan_setting_object(&settings_path, &value, preview);
    Ok(())
}

fn read_legacy_settings_object(source_root: &Path) -> anyhow::Result<Map<String, Value>> {
    let settings_path = source_root.join("settings.json");
    let Value::Object(settings) = serde_json::from_str::<Value>(
        &std::fs::read_to_string(&settings_path)
            .with_context(|| format!("failed to read {}", settings_path.to_string_lossy()))?,
    )
    .context("legacy settings is invalid")?
    else {
        bail!("legacy settings is not an object");
    };
    Ok(settings)
}

fn build_non_sensitive_apply_payload(
    legacy_settings: &Map<String, Value>,
    ledger: &LegacyImportLedger,
) -> Map<String, Value> {
    let mut payload = Map::new();
    let mut relay_profiles = Vec::new();
    let mut aggregate_profiles = Vec::new();

    for entry in &ledger.entries {
        if !entry.selected || entry.status != "pending" || entry.group != "nonSensitiveConfig" {
            continue;
        }
        if let Some(index) = indexed_source_key(&entry.source_key, "relayProfiles") {
            if let Some(value) = legacy_settings
                .get("relayProfiles")
                .and_then(Value::as_array)
                .and_then(|profiles| profiles.get(index))
                .and_then(sanitize_non_sensitive_value)
            {
                relay_profiles.push(value);
            }
            continue;
        }
        if let Some(index) = indexed_source_key(&entry.source_key, "aggregateRelayProfiles") {
            if let Some(value) = legacy_settings
                .get("aggregateRelayProfiles")
                .and_then(Value::as_array)
                .and_then(|profiles| profiles.get(index))
                .and_then(sanitize_non_sensitive_value)
            {
                aggregate_profiles.push(value);
            }
            continue;
        }
        if let Some(value) = legacy_settings
            .get(&entry.source_key)
            .and_then(sanitize_non_sensitive_value)
        {
            payload.insert(entry.source_key.clone(), value);
        }
    }

    if !relay_profiles.is_empty() {
        payload.insert("relayProfiles".to_string(), Value::Array(relay_profiles));
    }
    if !aggregate_profiles.is_empty() {
        payload.insert(
            "aggregateRelayProfiles".to_string(),
            Value::Array(aggregate_profiles),
        );
    }
    payload
}

fn indexed_source_key(source_key: &str, array_key: &str) -> Option<usize> {
    let prefix = format!("{array_key}[");
    source_key
        .strip_prefix(&prefix)?
        .strip_suffix(']')?
        .parse::<usize>()
        .ok()
}

fn sanitize_non_sensitive_value(value: &Value) -> Option<Value> {
    match value {
        Value::Object(map) => {
            let mut clean = Map::new();
            for (key, value) in map {
                if setting_key_is_secret(key) {
                    continue;
                }
                if key == "configContents"
                    && value.as_str().map(contains_secret_text).unwrap_or_default()
                {
                    continue;
                }
                if let Some(value) = sanitize_non_sensitive_value(value) {
                    clean.insert(key.clone(), value);
                }
            }
            Some(Value::Object(clean))
        }
        Value::Array(values) => Some(Value::Array(
            values
                .iter()
                .filter_map(sanitize_non_sensitive_value)
                .collect(),
        )),
        Value::String(text) if contains_secret_text(text) => None,
        other => Some(other.clone()),
    }
}

fn ensure_empty_transaction_root(transaction_root: &Path) -> anyhow::Result<()> {
    if transaction_root.exists() {
        let mut entries = std::fs::read_dir(transaction_root).with_context(|| {
            format!(
                "failed to inspect transaction directory {}",
                transaction_root.to_string_lossy()
            )
        })?;
        if entries.next().is_some() {
            bail!(
                "legacy import transaction directory is not empty: {}",
                transaction_root.to_string_lossy()
            );
        }
    }
    std::fs::create_dir_all(transaction_root).with_context(|| {
        format!(
            "failed to create transaction directory {}",
            transaction_root.to_string_lossy()
        )
    })?;
    Ok(())
}

fn build_ledger(preview: &LegacyImportPreview, selected: &BTreeSet<String>) -> LegacyImportLedger {
    let mut entries = Vec::new();
    for item in &preview.items {
        let is_selected = selected.contains(&item.id);
        entries.push(LegacyImportLedgerEntry {
            item_id: item.id.clone(),
            group: item.group.clone(),
            source_path: item.source_path.clone(),
            source_key: item.source_key.clone(),
            target: item.target.clone(),
            selected: is_selected,
            status: if is_selected { "pending" } else { "skipped" }.to_string(),
            requires_confirmation: item.requires_confirmation,
            risk: item.risk.clone(),
        });
    }
    for excluded in &preview.excluded {
        entries.push(LegacyImportLedgerEntry {
            item_id: excluded.id.clone(),
            group: excluded.category.clone(),
            source_path: excluded.source_path.clone(),
            source_key: String::new(),
            target: "notImported".to_string(),
            selected: false,
            status: "excluded".to_string(),
            requires_confirmation: false,
            risk: excluded.category.clone(),
        });
    }
    for conflict in &preview.conflicts {
        entries.push(LegacyImportLedgerEntry {
            item_id: conflict.id.clone(),
            group: "conflict".to_string(),
            source_path: conflict.source_path.clone(),
            source_key: String::new(),
            target: "notImported".to_string(),
            selected: false,
            status: "failed".to_string(),
            requires_confirmation: false,
            risk: conflict.severity.clone(),
        });
    }
    LegacyImportLedger {
        source_root: preview.source_root.clone(),
        created_at_ms: now_ms(),
        entries,
    }
}

fn write_rollback_manifest(
    path: &Path,
    backup_path: &Path,
    current_settings_path: Option<&Path>,
) -> anyhow::Result<()> {
    let settings = current_settings_path
        .map(|path| {
            let (bytes, existed) = if path.exists() {
                (
                    std::fs::read(path).with_context(|| {
                        format!(
                            "failed to read current settings metadata {}",
                            path.to_string_lossy()
                        )
                    })?,
                    true,
                )
            } else {
                (b"{}".to_vec(), false)
            };
            crate::settings::atomic_write(backup_path, &bytes)?;
            Ok::<_, anyhow::Error>(LegacyImportSettingsSnapshot {
                path: path.to_string_lossy().to_string(),
                existed,
                sha256: sha256_hex(&bytes),
                backup_path: backup_path.to_string_lossy().to_string(),
                backup_sha256: sha256_hex(&bytes),
                captured_contents: false,
            })
        })
        .transpose()?;
    let contains_plaintext_secrets = settings
        .as_ref()
        .and_then(|snapshot| std::fs::read_to_string(&snapshot.backup_path).ok())
        .map(|contents| contains_secret_text(&contents))
        .unwrap_or(false);
    let manifest = LegacyImportRollbackManifest {
        created_at_ms: now_ms(),
        settings,
        contains_plaintext_secrets,
    };
    crate::settings::atomic_write(path, serde_json::to_string_pretty(&manifest)?.as_bytes())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn scan_setting_object(
    settings_path: &Path,
    settings: &Map<String, Value>,
    preview: &mut LegacyImportPreview,
) {
    for key in NON_SENSITIVE_SETTING_KEYS {
        if settings.contains_key(*key) {
            add_item(
                preview,
                "nonSensitiveConfig",
                settings_path,
                key,
                deck_setting_target(key),
                "convertAutomatically",
                false,
                "low",
            );
        }
    }

    if let Some(Value::Array(profiles)) = settings.get("relayProfiles") {
        for index in 0..profiles.len() {
            add_item(
                preview,
                "nonSensitiveConfig",
                settings_path,
                &format!("relayProfiles[{index}]"),
                "settings.relayProfiles",
                "convertProviderWithoutSecrets",
                false,
                "low",
            );
        }
    }

    if let Some(Value::Array(profiles)) = settings.get("aggregateRelayProfiles") {
        for index in 0..profiles.len() {
            add_item(
                preview,
                "nonSensitiveConfig",
                settings_path,
                &format!("aggregateRelayProfiles[{index}]"),
                "settings.aggregateRelayProfiles",
                "convertAggregateProviderWithoutSecrets",
                false,
                "low",
            );
        }
    }

    for key in EXTERNAL_SETTING_KEYS {
        if settings.contains_key(*key) {
            add_item(
                preview,
                "executableOrExternal",
                settings_path,
                key,
                deck_setting_target(key),
                "requiresUserConfirmation",
                true,
                "externalPath",
            );
        }
    }

    for key in CONTEXT_CONFIG_KEYS {
        if let Some(text) = settings.get(*key).and_then(Value::as_str) {
            if contains_executable_or_external_config(text) {
                add_item(
                    preview,
                    "executableOrExternal",
                    settings_path,
                    key,
                    deck_setting_target(key),
                    "requiresUserConfirmation",
                    true,
                    "canRunCommandsOrLoadExternalPackages",
                );
            } else if !text.trim().is_empty() {
                add_item(
                    preview,
                    "nonSensitiveConfig",
                    settings_path,
                    key,
                    deck_setting_target(key),
                    "convertAutomatically",
                    false,
                    "low",
                );
            }
        }
    }

    scan_secret_fields(settings_path, "", &Value::Object(settings.clone()), preview);
}

fn scan_secret_fields(
    settings_path: &Path,
    key_path: &str,
    value: &Value,
    preview: &mut LegacyImportPreview,
) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let next_path = if key_path.is_empty() {
                    key.to_string()
                } else {
                    format!("{key_path}.{key}")
                };
                if setting_key_is_secret(key) {
                    add_item(
                        preview,
                        "secret",
                        settings_path,
                        &next_path,
                        secret_target_for_key(key),
                        "requiresSecretConfirmation",
                        true,
                        "secret",
                    );
                    continue;
                }
                scan_secret_fields(settings_path, &next_path, child, preview);
            }
        }
        Value::Array(values) => {
            for (index, child) in values.iter().enumerate() {
                scan_secret_fields(
                    settings_path,
                    &format!("{key_path}[{index}]"),
                    child,
                    preview,
                );
            }
        }
        Value::String(text) => {
            if string_path_may_hold_secret(key_path) || contains_secret_text(text) {
                add_item(
                    preview,
                    "secret",
                    settings_path,
                    key_path,
                    secret_target_for_key(key_path),
                    "requiresSecretConfirmation",
                    true,
                    "secret",
                );
            }
        }
        _ => {}
    }
}

fn scan_root_entries(source_root: &Path, preview: &mut LegacyImportPreview) -> anyhow::Result<()> {
    let entries = std::fs::read_dir(source_root).with_context(|| {
        format!(
            "failed to read legacy root {}",
            source_root.to_string_lossy()
        )
    })?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.eq_ignore_ascii_case("settings.json") {
            continue;
        }
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|meta| meta.is_dir()).unwrap_or(false);
        let size_bytes = metadata
            .as_ref()
            .and_then(|meta| meta.is_file().then_some(meta.len()));

        if is_codex_native_session_source(&name) {
            add_excluded(
                preview,
                "codexNativeSession",
                &path,
                "Codex native sessions remain the source of truth and are not copied",
                size_bytes,
            );
        } else if is_default_excluded_entry(&name, is_dir) {
            add_excluded(
                preview,
                "runtimeOrCache",
                &path,
                "runtime logs, caches, locks, ports, pid files and temporary files are not imported",
                size_bytes,
            );
        } else if name.eq_ignore_ascii_case("user_scripts")
            || name.eq_ignore_ascii_case("user_scripts.json")
        {
            add_item(
                preview,
                "executableOrExternal",
                &path,
                "",
                "contextPackages.userScripts",
                "requiresUserConfirmation",
                true,
                "canExecuteUserCode",
            );
        } else {
            add_excluded(
                preview,
                "unrecognized",
                &path,
                "unrecognized legacy file is skipped until a schema adapter exists",
                if is_dir { None } else { size_bytes },
            );
        }
    }
    Ok(())
}

fn add_item(
    preview: &mut LegacyImportPreview,
    group: &str,
    source_path: &Path,
    source_key: &str,
    target: &str,
    action: &str,
    requires_confirmation: bool,
    risk: &str,
) {
    let id = format!(
        "{}-{}",
        group,
        sanitize_id(if source_key.is_empty() {
            source_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("file")
        } else {
            source_key
        })
    );
    if preview
        .items
        .iter()
        .any(|item| item.id == id && item.source_path == source_path.to_string_lossy())
    {
        return;
    }
    preview.items.push(LegacyImportItem {
        id,
        group: group.to_string(),
        source_path: source_path.to_string_lossy().to_string(),
        source_key: source_key.to_string(),
        target: target.to_string(),
        action: action.to_string(),
        requires_confirmation,
        risk: risk.to_string(),
    });
}

fn add_excluded(
    preview: &mut LegacyImportPreview,
    category: &str,
    source_path: &Path,
    reason: &str,
    size_bytes: Option<u64>,
) {
    preview.excluded.push(LegacyImportExcluded {
        id: format!(
            "{}-{}",
            category,
            sanitize_id(
                source_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("entry")
            )
        ),
        category: category.to_string(),
        source_path: source_path.to_string_lossy().to_string(),
        reason: reason.to_string(),
        size_bytes,
    });
}

fn refresh_summary(preview: &mut LegacyImportPreview) {
    preview.summary = LegacyImportSummary {
        automatic_items: preview
            .items
            .iter()
            .filter(|item| !item.requires_confirmation)
            .count(),
        confirmation_items: preview
            .items
            .iter()
            .filter(|item| item.requires_confirmation)
            .count(),
        secret_items: preview
            .items
            .iter()
            .filter(|item| item.group == "secret")
            .count(),
        executable_or_external_items: preview
            .items
            .iter()
            .filter(|item| item.group == "executableOrExternal")
            .count(),
        excluded_items: preview.excluded.len(),
        conflicts: preview.conflicts.len(),
        codex_native_session_sources: preview
            .excluded
            .iter()
            .filter(|item| item.category == "codexNativeSession")
            .count(),
    };
}

fn deck_setting_target(key: &str) -> &'static str {
    match key {
        "relayProfiles" => "settings.relayProfiles",
        "aggregateRelayProfiles" => "settings.aggregateRelayProfiles",
        "relayCommonConfigContents" => "settings.relayCommonConfigContents",
        "relayContextConfigContents" => "settings.relayContextConfigContents",
        "codexAppPath" => "settings.codexAppPath",
        "codexAppImageOverlayPath" => "settings.codexAppImageOverlayPath",
        _ => "settings",
    }
}

fn secret_target_for_key(key: &str) -> &'static str {
    if key.contains("relayProfiles") || key.contains("relayApiKey") {
        "secretStore.relayProviders"
    } else if key.contains("visionRelay") {
        "secretStore.visionRelay"
    } else if key.contains("Stepwise") || key.contains("stepwise") {
        "secretStore.stepwise"
    } else {
        "secretStore"
    }
}

fn setting_key_is_secret(key: &str) -> bool {
    let normalized = normalize_key(key);
    matches!(
        normalized.as_str(),
        "apikey"
            | "relayapikey"
            | "codexappstepwiseapikey"
            | "authcontents"
            | "authorization"
            | "bearertoken"
            | "accesstoken"
            | "refreshtoken"
            | "idtoken"
            | "tokens"
            | "secret"
            | "password"
            | "credential"
            | "credentials"
    ) || normalized.ends_with("apikey")
        || normalized.ends_with("secret")
        || normalized.ends_with("password")
        || normalized.ends_with("token")
        || normalized.ends_with("tokens")
}

fn string_path_may_hold_secret(key_path: &str) -> bool {
    key_path.ends_with("configContents") || key_path.ends_with("authContents")
}

fn contains_secret_text(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("sk-")
        || lower.contains("bearer ")
        || lower.contains("openai_api_key")
        || lower.contains("experimental_bearer_token")
        || lower.contains("access_token")
        || lower.contains("refresh_token")
        || lower.contains("id_token")
}

fn contains_executable_or_external_config(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("[mcp_servers")
        || lower.contains("[plugins")
        || lower.contains("command =")
        || lower.contains("args =")
        || lower.contains("script")
        || lower.contains("path =")
}

fn is_codex_native_session_source(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "sessions"
        || lower == "state.sqlite"
        || (lower.starts_with("state_") && lower.ends_with(".sqlite"))
        || lower == "session_index.jsonl"
}

fn is_default_excluded_entry(name: &str, is_dir: bool) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "codex-plus.log"
            | "latest-status.json"
            | "pending-provider-import.json"
            | "watcher.disabled"
            | "launcher.pid"
            | "helper.pid"
            | "helper.port"
            | "debug.port"
    ) || matches!(
        lower.as_str(),
        ".tmp" | "tmp" | "temp" | "cache" | "logs" | "backups" | "downloads" | "updates"
    ) || lower.ends_with(".log")
        || lower.ends_with(".lock")
        || lower.ends_with(".pid")
        || lower.ends_with(".port")
        || lower.ends_with(".tmp")
        || (is_dir && lower.contains("cache"))
}

fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn sanitize_id(value: &str) -> String {
    let mut output = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch.to_ascii_lowercase());
        } else if !output.ends_with('-') {
            output.push('-');
        }
    }
    let output = output.trim_matches('-').to_string();
    if output.is_empty() {
        "item".to_string()
    } else {
        output
    }
}

const NON_SENSITIVE_SETTING_KEYS: &[&str] = &[
    "providerSyncEnabled",
    "providerSyncSavedProviders",
    "providerSyncManualProviders",
    "providerSyncLastSelectedProvider",
    "relayProfilesEnabled",
    "enhancementsEnabled",
    "computerUseGuardEnabled",
    "codexAppUserScriptHotReload",
    "codexAppPluginMarketplaceUnlock",
    "codexAppPluginAutoExpand",
    "codexAppModelWhitelistUnlock",
    "codexAppSessionDelete",
    "codexAppMarkdownExport",
    "codexAppPasteFix",
    "codexAppForceChineseLocale",
    "codexAppFastStartup",
    "codexAppProjectMove",
    "codexAppThreadIdBadge",
    "codexAppConversationView",
    "codexAppThreadScrollRestore",
    "codexAppUpstreamWorktreeCreate",
    "codexAppNativeMenuPlacement",
    "codexAppNativeMenuLocalization",
    "codexAppServiceTierControls",
    "codexAppPetRealMouseLook",
    "codexAppStepwiseEnabled",
    "codexAppStepwiseDirectSend",
    "codexAppStepwiseApiKeyEnv",
    "codexAppStepwiseModel",
    "codexAppStepwiseMaxItems",
    "codexAppStepwiseMaxInputChars",
    "codexAppStepwiseMaxOutputTokens",
    "codexAppStepwiseTimeoutMs",
    "codexAppImageOverlayEnabled",
    "codexAppImageOverlayOpacity",
    "codexAppImageOverlayFitMode",
    "codexGoalsEnabled",
    "codexAppGoalResumeGuard",
    "launchMode",
    "relayBaseUrl",
    "activeRelayId",
    "activeAggregateRelayId",
    "relayTestModel",
    "visionRelay",
];

const EXTERNAL_SETTING_KEYS: &[&str] = &[
    "codexAppPath",
    "codexAppImageOverlayPath",
    "codexAppStepwiseBaseUrl",
];

const CONTEXT_CONFIG_KEYS: &[&str] = &["relayCommonConfigContents", "relayContextConfigContents"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_missing_legacy_root_is_read_only_and_empty() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("missing");

        let preview = preview_legacy_import(&missing).unwrap();

        assert!(!preview.found);
        assert_eq!(preview.items.len(), 0);
        assert_eq!(preview.excluded.len(), 0);
        assert_eq!(preview.summary.automatic_items, 0);
    }

    #[test]
    fn preview_classifies_settings_without_exposing_secret_values() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join(".codex-session-delete");
        std::fs::create_dir_all(&root).unwrap();
        let settings_path = root.join("settings.json");
        let settings = serde_json::json!({
            "enhancementsEnabled": false,
            "relayProfilesEnabled": true,
            "relayApiKey": "sk-legacy-secret",
            "codexAppStepwiseApiKey": "sk-stepwise-secret",
            "codexAppPath": "C:\\Program Files\\Codex\\Codex.exe",
            "relayCommonConfigContents": "[mcp_servers.demo]\ncommand = \"npx\"\n",
            "relayProfiles": [{
                "id": "legacy",
                "name": "Legacy",
                "apiKey": "sk-profile-secret",
                "configContents": "experimental_bearer_token = \"sk-config-secret\"",
                "authContents": "{\"OPENAI_API_KEY\":\"sk-auth-secret\"}"
            }],
            "visionRelay": {
                "enabled": true,
                "apiKey": "sk-vision-secret"
            }
        });
        std::fs::write(&settings_path, settings.to_string()).unwrap();

        let preview = preview_legacy_import(&root).unwrap();
        let text = serde_json::to_string(&preview).unwrap();

        assert!(preview.found);
        assert!(preview.schema.settings_json_found);
        assert!(preview.schema.settings_json_valid);
        assert!(preview.summary.automatic_items >= 2);
        assert!(preview.summary.confirmation_items >= 3);
        assert!(preview.summary.secret_items >= 4);
        assert!(preview.summary.executable_or_external_items >= 2);
        assert!(
            preview
                .items
                .iter()
                .any(|item| item.group == "nonSensitiveConfig")
        );
        assert!(
            preview
                .items
                .iter()
                .any(|item| item.group == "executableOrExternal")
        );
        assert!(preview.items.iter().any(|item| item.group == "secret"));
        assert!(!text.contains("sk-legacy-secret"));
        assert!(!text.contains("sk-stepwise-secret"));
        assert!(!text.contains("sk-profile-secret"));
        assert!(!text.contains("sk-config-secret"));
        assert!(!text.contains("sk-auth-secret"));
        assert!(!text.contains("sk-vision-secret"));
    }

    #[test]
    fn preview_excludes_runtime_cache_and_native_session_sources() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join(".codex-session-delete");
        std::fs::create_dir_all(root.join("cache")).unwrap();
        std::fs::create_dir_all(root.join("sessions")).unwrap();
        std::fs::write(root.join("settings.json"), "{}").unwrap();
        std::fs::write(root.join("codex-plus.log"), "secret log").unwrap();
        std::fs::write(root.join("helper.pid"), "123").unwrap();
        std::fs::write(root.join("state_5.sqlite"), "sqlite").unwrap();
        std::fs::write(root.join("session_index.jsonl"), "{}\n").unwrap();

        let preview = preview_legacy_import(&root).unwrap();

        assert_eq!(preview.summary.codex_native_session_sources, 3);
        assert!(
            preview
                .excluded
                .iter()
                .any(|item| item.category == "runtimeOrCache"
                    && item.source_path.ends_with("codex-plus.log"))
        );
        assert!(
            preview
                .excluded
                .iter()
                .any(|item| item.category == "codexNativeSession"
                    && item.source_path.ends_with("state_5.sqlite"))
        );
    }

    #[test]
    fn preview_keeps_legacy_files_unchanged() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join(".codex-session-delete");
        std::fs::create_dir_all(&root).unwrap();
        let settings_path = root.join("settings.json");
        let original = r#"{"enhancementsEnabled":true,"relayApiKey":"sk-secret"}"#;
        std::fs::write(&settings_path, original).unwrap();

        let _preview = preview_legacy_import(&root).unwrap();

        assert_eq!(std::fs::read_to_string(settings_path).unwrap(), original);
    }

    #[test]
    fn prepare_transaction_writes_preview_ledger_and_secret_free_rollback_manifest_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_root = temp.path().join(".codex-session-delete");
        let tx_root = temp.path().join("deck-state").join("tx-1");
        let current_settings = temp.path().join("deck-settings.json");
        std::fs::create_dir_all(&legacy_root).unwrap();
        std::fs::write(
            legacy_root.join("settings.json"),
            serde_json::json!({
                "enhancementsEnabled": false,
                "relayApiKey": "sk-legacy-secret",
                "codexAppPath": "C:\\Program Files\\Codex\\Codex.exe"
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(legacy_root.join("codex-plus.log"), "sk-log-secret").unwrap();
        std::fs::write(&current_settings, r#"{"relayApiKey":"sk-current-secret"}"#).unwrap();
        let preview = preview_legacy_import(&legacy_root).unwrap();
        let selected = preview
            .items
            .iter()
            .filter(|item| item.group == "nonSensitiveConfig")
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();

        let tx = prepare_legacy_import_transaction(
            &legacy_root,
            &tx_root,
            Some(&current_settings),
            &selected,
        )
        .unwrap();

        assert!(Path::new(&tx.preview_path).is_file());
        assert!(Path::new(&tx.ledger_path).is_file());
        assert!(Path::new(&tx.rollback_manifest_path).is_file());
        let backup_path = tx_root.join("rollback-settings.json");
        assert!(backup_path.is_file());
        assert!(
            tx.ledger
                .entries
                .iter()
                .any(|entry| entry.status == "pending")
        );
        assert!(
            tx.ledger
                .entries
                .iter()
                .any(|entry| entry.status == "skipped")
        );
        assert!(
            tx.ledger
                .entries
                .iter()
                .any(|entry| entry.status == "excluded")
        );
        let tx_text = [
            std::fs::read_to_string(&tx.preview_path).unwrap(),
            std::fs::read_to_string(&tx.ledger_path).unwrap(),
            std::fs::read_to_string(&tx.rollback_manifest_path).unwrap(),
        ]
        .join("\n");
        assert!(tx_text.contains("\"containsPlaintextSecrets\": true"));
        assert!(!tx_text.contains("sk-legacy-secret"));
        assert!(!tx_text.contains("sk-current-secret"));
        assert!(!tx_text.contains("sk-log-secret"));
        assert_eq!(
            std::fs::read_to_string(backup_path).unwrap(),
            r#"{"relayApiKey":"sk-current-secret"}"#
        );
    }

    #[test]
    fn prepare_transaction_refuses_to_reuse_non_empty_directory() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_root = temp.path().join(".codex-session-delete");
        let tx_root = temp.path().join("tx");
        std::fs::create_dir_all(&legacy_root).unwrap();
        std::fs::create_dir_all(&tx_root).unwrap();
        std::fs::write(legacy_root.join("settings.json"), "{}").unwrap();
        std::fs::write(tx_root.join("existing.json"), "{}").unwrap();

        let error =
            prepare_legacy_import_transaction(&legacy_root, &tx_root, None, &[]).unwrap_err();

        assert!(error.to_string().contains("not empty"));
    }

    #[test]
    fn prepare_transaction_records_preview_conflicts_as_failed_ledger_entries() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_root = temp.path().join(".codex-session-delete");
        let tx_root = temp.path().join("tx");
        std::fs::create_dir_all(&legacy_root).unwrap();
        std::fs::write(legacy_root.join("settings.json"), "[]").unwrap();

        let tx = prepare_legacy_import_transaction(&legacy_root, &tx_root, None, &[]).unwrap();

        assert!(
            tx.ledger
                .entries
                .iter()
                .any(|entry| entry.group == "conflict" && entry.status == "failed")
        );
    }

    #[test]
    fn apply_transaction_imports_only_selected_non_sensitive_settings() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_root = temp.path().join(".codex-session-delete");
        let tx_root = temp.path().join("tx");
        let deck_settings_path = temp.path().join("deck-settings.json");
        std::fs::create_dir_all(&legacy_root).unwrap();
        std::fs::write(
            legacy_root.join("settings.json"),
            serde_json::json!({
                "enhancementsEnabled": false,
                "relayProfilesEnabled": true,
                "relayApiKey": "sk-legacy-secret",
                "relayProfiles": [{
                    "id": "legacy-profile",
                    "name": "Legacy Profile",
                    "upstreamBaseUrl": "https://legacy.example/v1",
                    "apiKey": "sk-profile-secret",
                    "authContents": "{\"OPENAI_API_KEY\":\"sk-auth-secret\"}",
                    "configContents": "experimental_bearer_token = \"sk-config-secret\""
                }],
                "visionRelay": {
                    "enabled": true,
                    "model": "qwen-vl-plus",
                    "apiKey": "sk-vision-secret"
                }
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(
            &deck_settings_path,
            r#"{"customField":{"keep":true},"enhancementsEnabled":true}"#,
        )
        .unwrap();
        let preview = preview_legacy_import(&legacy_root).unwrap();
        let selected = preview
            .items
            .iter()
            .filter(|item| {
                item.group == "nonSensitiveConfig"
                    || (item.group == "secret" && item.source_key == "relayApiKey")
            })
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();
        prepare_legacy_import_transaction(
            &legacy_root,
            &tx_root,
            Some(&deck_settings_path),
            &selected,
        )
        .unwrap();
        let store = SettingsStore::new(deck_settings_path.clone());

        let result = apply_legacy_import_transaction(&tx_root, store).unwrap();

        assert!(result.imported >= 2);
        assert!(result.pending_confirmation >= 1);
        let raw = std::fs::read_to_string(deck_settings_path).unwrap();
        let value: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(value["customField"], serde_json::json!({"keep": true}));
        assert_eq!(value["enhancementsEnabled"], Value::Bool(false));
        assert!(
            value["relayProfiles"]
                .as_array()
                .unwrap()
                .iter()
                .any(|profile| profile["id"] == "legacy-profile")
        );
        assert_eq!(value["visionRelay"]["enabled"], Value::Bool(true));
        assert_eq!(value["visionRelay"]["model"], "qwen-vl-plus");
        assert!(!raw.contains("sk-legacy-secret"));
        assert!(!raw.contains("sk-profile-secret"));
        assert!(!raw.contains("sk-auth-secret"));
        assert!(!raw.contains("sk-config-secret"));
        assert!(!raw.contains("sk-vision-secret"));
        let ledger: LegacyImportLedger =
            serde_json::from_str(&std::fs::read_to_string(tx_root.join("ledger.json")).unwrap())
                .unwrap();
        assert!(ledger.entries.iter().any(|entry| entry.status == "success"));
        assert!(
            ledger
                .entries
                .iter()
                .any(|entry| entry.status == "pendingConfirmation")
        );
    }

    #[test]
    fn apply_transaction_can_be_retried_without_duplicate_provider_rows() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_root = temp.path().join(".codex-session-delete");
        let tx_root = temp.path().join("tx");
        let deck_settings_path = temp.path().join("deck-settings.json");
        std::fs::create_dir_all(&legacy_root).unwrap();
        std::fs::write(
            legacy_root.join("settings.json"),
            serde_json::json!({
                "relayProfiles": [{
                    "id": "legacy-profile",
                    "name": "Legacy Profile",
                    "upstreamBaseUrl": "https://legacy.example/v1",
                    "apiKey": "sk-profile-secret"
                }]
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(&deck_settings_path, r#"{"customField":{"keep":true}}"#).unwrap();
        let preview = preview_legacy_import(&legacy_root).unwrap();
        let selected = preview
            .items
            .iter()
            .filter(|item| item.group == "nonSensitiveConfig")
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();
        prepare_legacy_import_transaction(
            &legacy_root,
            &tx_root,
            Some(&deck_settings_path),
            &selected,
        )
        .unwrap();
        let store = SettingsStore::new(deck_settings_path.clone());

        let first = apply_legacy_import_transaction(&tx_root, store.clone()).unwrap();
        let after_first = std::fs::read_to_string(&deck_settings_path).unwrap();
        let second = apply_legacy_import_transaction(&tx_root, store).unwrap();
        let after_second = std::fs::read_to_string(&deck_settings_path).unwrap();

        assert_eq!(after_second, after_first);
        assert_eq!(second.failed, 0);
        assert_eq!(second.imported, first.imported);
        let value: Value = serde_json::from_str(&after_second).unwrap();
        let profiles = value["relayProfiles"].as_array().unwrap();
        assert_eq!(
            profiles
                .iter()
                .filter(|profile| profile["id"] == "legacy-profile")
                .count(),
            1
        );
        assert!(!after_second.contains("sk-profile-secret"));
    }

    #[test]
    fn rollback_transaction_restores_settings_snapshot_and_marks_success_entries() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_root = temp.path().join(".codex-session-delete");
        let tx_root = temp.path().join("tx");
        let deck_settings_path = temp.path().join("deck-settings.json");
        std::fs::create_dir_all(&legacy_root).unwrap();
        std::fs::write(
            legacy_root.join("settings.json"),
            serde_json::json!({
                "enhancementsEnabled": false,
                "relayProfilesEnabled": true
            })
            .to_string(),
        )
        .unwrap();
        let original_settings = r#"{"customField":{"keep":true},"enhancementsEnabled":true,"relayApiKey":"sk-current-secret"}"#;
        std::fs::write(&deck_settings_path, original_settings).unwrap();
        let preview = preview_legacy_import(&legacy_root).unwrap();
        let selected = preview
            .items
            .iter()
            .filter(|item| item.group == "nonSensitiveConfig")
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();
        prepare_legacy_import_transaction(
            &legacy_root,
            &tx_root,
            Some(&deck_settings_path),
            &selected,
        )
        .unwrap();
        let store = SettingsStore::new(deck_settings_path.clone());
        apply_legacy_import_transaction(&tx_root, store.clone()).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&std::fs::read_to_string(&deck_settings_path).unwrap())
                .unwrap()["enhancementsEnabled"],
            Value::Bool(false)
        );

        let result = rollback_legacy_import_transaction(&tx_root, store).unwrap();

        assert!(result.restored);
        assert!(result.backup_sha256_verified);
        assert!(result.entries_marked_rolled_back >= 1);
        assert_eq!(
            std::fs::read_to_string(&deck_settings_path).unwrap(),
            original_settings
        );
        let ledger: LegacyImportLedger =
            serde_json::from_str(&std::fs::read_to_string(tx_root.join("ledger.json")).unwrap())
                .unwrap();
        assert!(
            ledger
                .entries
                .iter()
                .any(|entry| entry.status == "rolledBack")
        );
        let result_text = serde_json::to_string(&result).unwrap();
        assert!(!result_text.contains("sk-current-secret"));
    }

    #[test]
    fn rollback_transaction_rejects_tampered_backup_and_preserves_current_settings() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_root = temp.path().join(".codex-session-delete");
        let tx_root = temp.path().join("tx");
        let deck_settings_path = temp.path().join("deck-settings.json");
        std::fs::create_dir_all(&legacy_root).unwrap();
        std::fs::write(
            legacy_root.join("settings.json"),
            serde_json::json!({
                "enhancementsEnabled": false,
                "relayProfilesEnabled": true
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(
            &deck_settings_path,
            r#"{"enhancementsEnabled":true,"relayApiKey":"sk-current-secret"}"#,
        )
        .unwrap();
        let preview = preview_legacy_import(&legacy_root).unwrap();
        let selected = preview
            .items
            .iter()
            .filter(|item| item.group == "nonSensitiveConfig")
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();
        prepare_legacy_import_transaction(
            &legacy_root,
            &tx_root,
            Some(&deck_settings_path),
            &selected,
        )
        .unwrap();
        let store = SettingsStore::new(deck_settings_path.clone());
        apply_legacy_import_transaction(&tx_root, store.clone()).unwrap();
        let applied_settings = std::fs::read_to_string(&deck_settings_path).unwrap();
        std::fs::write(
            tx_root.join("rollback-settings.json"),
            r#"{"tampered":true}"#,
        )
        .unwrap();

        let error = rollback_legacy_import_transaction(&tx_root, store).unwrap_err();

        assert!(error.to_string().contains("checksum mismatch"));
        assert_eq!(
            std::fs::read_to_string(&deck_settings_path).unwrap(),
            applied_settings
        );
    }
}
