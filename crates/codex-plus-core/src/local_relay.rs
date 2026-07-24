use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};

pub const DEFAULT_LOCAL_RELAY_PORT: u16 = crate::protocol_proxy::DEFAULT_PROTOCOL_PROXY_PORT;
pub const LOCAL_RELAY_POOL_ID: &str = "__codex_deck_local_pool__";
const STATE_FILE: &str = "local-relay.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRelaySettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "generate_api_key")]
    pub api_key: String,
    #[serde(default = "default_routing_strategy")]
    pub routing_strategy: String,
    #[serde(default)]
    pub provider_ids: Vec<String>,
    #[serde(default)]
    pub disabled_provider_ids: Vec<String>,
    #[serde(default)]
    pub hourly_quota: Option<u64>,
    #[serde(default)]
    pub weekly_quota: Option<u64>,
}

impl Default for LocalRelaySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            port: DEFAULT_LOCAL_RELAY_PORT,
            api_key: generate_api_key(),
            routing_strategy: default_routing_strategy(),
            provider_ids: Vec::new(),
            disabled_provider_ids: Vec::new(),
            hourly_quota: None,
            weekly_quota: None,
        }
    }
}

impl LocalRelaySettings {
    pub fn load() -> anyhow::Result<Self> {
        Self::load_from(&state_path())
    }

    pub fn load_or_create() -> anyhow::Result<Self> {
        let path = state_path();
        match Self::load_from(&path) {
            Ok(settings) => Ok(settings.ensure_valid()),
            Err(error)
                if error
                    .downcast_ref::<std::io::Error>()
                    .is_some_and(|e| e.kind() == std::io::ErrorKind::NotFound) =>
            {
                let settings = Self::default();
                settings.save_to(&path)?;
                Ok(settings)
            }
            Err(error) => Err(error),
        }
    }

    pub fn save(&self) -> anyhow::Result<()> {
        self.save_to(&state_path())
    }

    pub fn load_from(path: &Path) -> anyhow::Result<Self> {
        let bytes =
            fs::read(path).with_context(|| format!("读取本地中转配置失败：{}", path.display()))?;
        let settings = serde_json::from_slice::<Self>(&bytes)
            .with_context(|| format!("解析本地中转配置失败：{}", path.display()))?;
        Ok(settings.ensure_valid())
    }

    pub fn save_to(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let payload = serde_json::to_vec_pretty(&self.clone().ensure_valid())?;
        fs::write(path, payload)
            .with_context(|| format!("保存本地中转配置失败：{}", path.display()))
    }

    pub fn masked_api_key(&self) -> String {
        let key = self.api_key.trim();
        if key.len() <= 8 {
            return "********".to_string();
        }
        format!("{}...{}", &key[..4], &key[key.len() - 4..])
    }

    pub fn regenerate_api_key(&mut self) {
        self.api_key = generate_api_key();
    }

    pub fn is_provider_enabled(&self, provider_id: &str) -> bool {
        self.provider_ids.iter().any(|id| id == provider_id)
            && !self
                .disabled_provider_ids
                .iter()
                .any(|id| id == provider_id)
    }

    pub fn enabled_provider_ids(&self) -> impl Iterator<Item = &str> {
        self.provider_ids
            .iter()
            .map(String::as_str)
            .filter(|provider_id| self.is_provider_enabled(provider_id))
    }

    fn ensure_valid(mut self) -> Self {
        if self.port == 0 {
            self.port = DEFAULT_LOCAL_RELAY_PORT;
        }
        if self.api_key.trim().is_empty() {
            self.api_key = generate_api_key();
        }
        if self.routing_strategy.trim().is_empty() {
            self.routing_strategy = default_routing_strategy();
        }
        self.routing_strategy = "conversation-sticky".to_string();
        normalize_provider_ids(&mut self.provider_ids);
        normalize_provider_ids(&mut self.disabled_provider_ids);
        let provider_ids = self
            .provider_ids
            .iter()
            .map(String::as_str)
            .collect::<std::collections::HashSet<_>>();
        self.disabled_provider_ids
            .retain(|provider_id| provider_ids.contains(provider_id.as_str()));
        self
    }
}

fn normalize_provider_ids(provider_ids: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    *provider_ids = std::mem::take(provider_ids)
        .into_iter()
        .filter_map(|provider_id| {
            let provider_id = provider_id.trim().to_string();
            (!provider_id.is_empty() && seen.insert(provider_id.clone())).then_some(provider_id)
        })
        .collect();
}

pub fn state_path() -> PathBuf {
    crate::paths::default_app_state_dir().join(STATE_FILE)
}

pub fn settings_with_local_pool(
    mut settings: crate::settings::BackendSettings,
    local: &LocalRelaySettings,
) -> crate::settings::BackendSettings {
    if !local.enabled {
        return settings;
    }
    let available = settings
        .relay_profiles
        .iter()
        .filter(|profile| profile.relay_mode != crate::settings::RelayMode::Aggregate)
        .map(|profile| profile.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    let members = local
        .enabled_provider_ids()
        .filter(|provider_id| available.contains(provider_id))
        .map(|provider_id| crate::settings::AggregateRelayMember {
            relay_id: provider_id.to_string(),
            weight: 1,
        })
        .collect::<Vec<_>>();
    if members.is_empty() {
        return settings;
    }
    settings
        .relay_profiles
        .retain(|profile| profile.id != LOCAL_RELAY_POOL_ID);
    settings.relay_profiles.push(crate::settings::RelayProfile {
        id: LOCAL_RELAY_POOL_ID.to_string(),
        name: "本地中转供应商池".to_string(),
        relay_mode: crate::settings::RelayMode::Aggregate,
        ..crate::settings::RelayProfile::default()
    });
    settings
        .aggregate_relay_profiles
        .retain(|profile| profile.id != LOCAL_RELAY_POOL_ID);
    settings
        .aggregate_relay_profiles
        .push(crate::settings::AggregateRelayProfile {
            id: LOCAL_RELAY_POOL_ID.to_string(),
            name: "本地中转供应商池".to_string(),
            strategy: crate::settings::AggregateRelayStrategy::ConversationRoundRobin,
            members,
        });
    settings.active_relay_id = LOCAL_RELAY_POOL_ID.to_string();
    settings.active_aggregate_relay_id = LOCAL_RELAY_POOL_ID.to_string();
    settings
}

fn default_port() -> u16 {
    DEFAULT_LOCAL_RELAY_PORT
}

fn default_routing_strategy() -> String {
    "conversation-sticky".to_string()
}

fn generate_api_key() -> String {
    format!("cdx_{}", uuid::Uuid::new_v4().simple())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_generate_local_key_without_exposing_it_in_mask() {
        let settings = LocalRelaySettings::default();
        assert!(settings.api_key.starts_with("cdx_"));
        assert_ne!(settings.api_key, settings.masked_api_key());
        assert_eq!(settings.port, DEFAULT_LOCAL_RELAY_PORT);
        assert_eq!(settings.routing_strategy, "conversation-sticky");
    }

    #[test]
    fn invalid_values_are_repaired_on_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("local-relay.json");
        fs::write(
            &path,
            r#"{"enabled":true,"port":0,"apiKey":"","routingStrategy":""}"#,
        )
        .unwrap();
        let settings = LocalRelaySettings::load_from(&path).unwrap();
        assert_eq!(settings.port, DEFAULT_LOCAL_RELAY_PORT);
        assert!(settings.api_key.starts_with("cdx_"));
        assert_eq!(settings.routing_strategy, "conversation-sticky");
    }

    #[test]
    fn provider_ids_are_trimmed_and_deduplicated() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("local-relay.json");
        fs::write(
            &path,
            r#"{"providerIds":[" provider-a ","provider-a","","provider-b"]}"#,
        )
        .unwrap();

        let settings = LocalRelaySettings::load_from(&path).unwrap();

        assert_eq!(settings.provider_ids, ["provider-a", "provider-b"]);
    }

    #[test]
    fn disabled_provider_ids_are_normalized_and_limited_to_pool_members() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("local-relay.json");
        fs::write(
            &path,
            r#"{"providerIds":["provider-a","provider-b"],"disabledProviderIds":[" provider-b ","provider-b","missing",""]}"#,
        )
        .unwrap();

        let settings = LocalRelaySettings::load_from(&path).unwrap();

        assert_eq!(settings.disabled_provider_ids, ["provider-b"]);
        assert!(settings.is_provider_enabled("provider-a"));
        assert!(!settings.is_provider_enabled("provider-b"));
        assert_eq!(
            settings.enabled_provider_ids().collect::<Vec<_>>(),
            ["provider-a"]
        );
    }

    #[test]
    fn local_pool_reuses_existing_providers_without_copying_credentials() {
        let settings = crate::settings::BackendSettings {
            relay_profiles: vec![crate::settings::RelayProfile {
                id: "provider-a".to_string(),
                name: "A".to_string(),
                api_key: "secret".to_string(),
                ..crate::settings::RelayProfile::default()
            }],
            active_relay_id: "provider-a".to_string(),
            ..crate::settings::BackendSettings::default()
        };
        let local = LocalRelaySettings {
            enabled: true,
            provider_ids: vec!["provider-a".to_string()],
            ..LocalRelaySettings::default()
        };

        let routed = settings_with_local_pool(settings, &local);

        assert_eq!(routed.active_relay_id, LOCAL_RELAY_POOL_ID);
        assert_eq!(
            routed.aggregate_relay_profiles[0].members[0].relay_id,
            "provider-a"
        );
        assert_eq!(routed.relay_profiles[0].api_key, "secret");
        assert!(routed.relay_profiles.last().unwrap().api_key.is_empty());
    }

    #[test]
    fn local_pool_excludes_disabled_providers() {
        let settings = crate::settings::BackendSettings {
            relay_profiles: vec![
                crate::settings::RelayProfile {
                    id: "provider-a".to_string(),
                    name: "A".to_string(),
                    ..crate::settings::RelayProfile::default()
                },
                crate::settings::RelayProfile {
                    id: "provider-b".to_string(),
                    name: "B".to_string(),
                    ..crate::settings::RelayProfile::default()
                },
            ],
            active_relay_id: "provider-a".to_string(),
            ..crate::settings::BackendSettings::default()
        };
        let local = LocalRelaySettings {
            enabled: true,
            provider_ids: vec!["provider-a".to_string(), "provider-b".to_string()],
            disabled_provider_ids: vec!["provider-b".to_string()],
            ..LocalRelaySettings::default()
        };

        let routed = settings_with_local_pool(settings, &local);
        let members = &routed.aggregate_relay_profiles[0].members;

        assert_eq!(members.len(), 1);
        assert_eq!(members[0].relay_id, "provider-a");
    }
}
