/**
 * @description 聚合供应商轮转选择器，负责按失败、对话、请求和权重策略选择已有中转配置。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-05-27 00:00
 */
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::settings::{
    AggregateRelayProfile, AggregateRelayStrategy, BackendSettings, RelayProfile,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectionError {
    NoActiveAggregate,
    EmptyAggregateMembers {
        aggregate_id: String,
    },
    UnknownMemberRelay {
        aggregate_id: String,
        relay_id: String,
    },
    InvalidMemberRelay {
        aggregate_id: String,
        relay_id: String,
    },
    NoCompatibleModel {
        aggregate_id: String,
        model: String,
    },
}

impl std::fmt::Display for SelectionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SelectionError::NoActiveAggregate => write!(formatter, "未找到当前聚合供应商"),
            SelectionError::EmptyAggregateMembers { aggregate_id } => {
                write!(formatter, "聚合供应商「{aggregate_id}」没有成员")
            }
            SelectionError::UnknownMemberRelay {
                aggregate_id,
                relay_id,
            } => write!(
                formatter,
                "聚合供应商「{aggregate_id}」引用了不存在的供应商「{relay_id}」"
            ),
            SelectionError::InvalidMemberRelay {
                aggregate_id,
                relay_id,
            } => write!(
                formatter,
                "聚合供应商「{aggregate_id}」成员「{relay_id}」缺少 API Base URL 或 Key"
            ),
            SelectionError::NoCompatibleModel {
                aggregate_id,
                model,
            } => write!(
                formatter,
                "供应商池「{aggregate_id}」没有支持模型「{model}」的成员"
            ),
        }
    }
}

impl std::error::Error for SelectionError {}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RotationContext {
    pub conversation_id: Option<String>,
    pub model: Option<String>,
}

impl RotationContext {
    pub fn for_conversation(conversation_id: impl Into<String>) -> Self {
        Self {
            conversation_id: Some(conversation_id.into()),
            model: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RotationEvent {
    Success,
    Failure,
}

#[derive(Debug, Clone)]
pub struct RelayRotationSelector {
    aggregate: AggregateRelayProfile,
    failover_index: usize,
    request_index: usize,
    weighted_index: usize,
    conversation_assignments: HashMap<String, String>,
    cooldowns: HashMap<String, Instant>,
    last_selected_id: Option<String>,
}

static GLOBAL_SELECTOR: OnceLock<Mutex<Option<RelayRotationSelector>>> = OnceLock::new();

impl RelayRotationSelector {
    pub fn from_settings(settings: &BackendSettings) -> Result<Self, SelectionError> {
        let aggregate = active_aggregate(settings)?.clone();
        validate_aggregate_members(settings, &aggregate)?;
        Ok(Self {
            aggregate,
            failover_index: 0,
            request_index: 0,
            weighted_index: 0,
            conversation_assignments: HashMap::new(),
            cooldowns: HashMap::new(),
            last_selected_id: None,
        })
    }

    pub fn select(
        &mut self,
        settings: &BackendSettings,
        context: RotationContext,
    ) -> Result<RelayProfile, SelectionError> {
        validate_aggregate_members(settings, &self.aggregate)?;
        let candidates = self.candidate_ids(settings, context.model.as_deref())?;
        let relay_id = match self.aggregate.strategy {
            AggregateRelayStrategy::Failover => (0..self.aggregate.members.len())
                .map(|offset| {
                    &self.aggregate.members
                        [(self.failover_index + offset) % self.aggregate.members.len()]
                    .relay_id
                })
                .find(|relay_id| candidates.contains(*relay_id))
                .cloned()
                .unwrap_or_else(|| candidates[0].clone()),
            AggregateRelayStrategy::ConversationRoundRobin => {
                self.select_for_conversation(context.conversation_id, &candidates)
            }
            AggregateRelayStrategy::RequestRoundRobin => self.select_next_request(&candidates),
            AggregateRelayStrategy::WeightedRoundRobin => self.select_next_weighted(&candidates),
        };
        self.last_selected_id = Some(relay_id.clone());
        relay_profile_by_id(settings, &relay_id).ok_or_else(|| SelectionError::UnknownMemberRelay {
            aggregate_id: self.aggregate.id.clone(),
            relay_id,
        })
    }

    pub fn peek(&self, settings: &BackendSettings) -> Result<RelayProfile, SelectionError> {
        validate_aggregate_members(settings, &self.aggregate)?;
        let relay_id = match self.aggregate.strategy {
            AggregateRelayStrategy::Failover => self.member_id_at(self.failover_index),
            AggregateRelayStrategy::ConversationRoundRobin
            | AggregateRelayStrategy::RequestRoundRobin => self.member_id_at(self.request_index),
            AggregateRelayStrategy::WeightedRoundRobin => {
                let candidates = self
                    .aggregate
                    .members
                    .iter()
                    .map(|member| member.relay_id.clone())
                    .collect::<Vec<_>>();
                let schedule = self.weighted_schedule(&candidates);
                schedule[self.weighted_index % schedule.len()].clone()
            }
        };
        relay_profile_by_id(settings, &relay_id).ok_or_else(|| SelectionError::UnknownMemberRelay {
            aggregate_id: self.aggregate.id.clone(),
            relay_id,
        })
    }

    pub fn record_event(&mut self, event: RotationEvent) {
        self.record_result(None, None, event);
    }

    pub fn record_result(
        &mut self,
        relay_id: Option<&str>,
        conversation_id: Option<&str>,
        event: RotationEvent,
    ) {
        let relay_id = relay_id
            .map(str::to_string)
            .or_else(|| self.last_selected_id.clone());
        let Some(relay_id) = relay_id else {
            return;
        };
        match event {
            RotationEvent::Success => {
                self.cooldowns.remove(&relay_id);
                if self.aggregate.strategy == AggregateRelayStrategy::ConversationRoundRobin {
                    if let Some(conversation_id) = conversation_id {
                        self.conversation_assignments
                            .insert(conversation_id.to_string(), relay_id);
                    }
                }
            }
            RotationEvent::Failure => {
                self.cooldowns
                    .insert(relay_id.clone(), Instant::now() + Duration::from_secs(30));
                self.conversation_assignments
                    .retain(|_, assigned| assigned != &relay_id);
                if self.aggregate.strategy == AggregateRelayStrategy::Failover
                    && !self.aggregate.members.is_empty()
                {
                    self.failover_index = self
                        .aggregate
                        .members
                        .iter()
                        .position(|member| member.relay_id == relay_id)
                        .map(|index| (index + 1) % self.aggregate.members.len())
                        .unwrap_or_else(|| {
                            (self.failover_index + 1) % self.aggregate.members.len()
                        });
                }
            }
        }
    }

    fn select_for_conversation(
        &mut self,
        conversation_id: Option<String>,
        candidates: &[String],
    ) -> String {
        let Some(conversation_id) = conversation_id else {
            return self.select_next_request(candidates);
        };
        if let Some(relay_id) = self
            .conversation_assignments
            .get(&conversation_id)
            .filter(|relay_id| candidates.contains(relay_id))
        {
            return relay_id.clone();
        }

        let relay_id = self.select_next_request(candidates);
        self.conversation_assignments
            .insert(conversation_id, relay_id.clone());
        relay_id
    }

    fn select_next_request(&mut self, candidates: &[String]) -> String {
        let relay_id = candidates[self.request_index % candidates.len()].clone();
        self.request_index = (self.request_index + 1) % candidates.len();
        relay_id
    }

    fn select_next_weighted(&mut self, candidates: &[String]) -> String {
        let schedule = self.weighted_schedule(candidates);
        let relay_id = schedule[self.weighted_index % schedule.len()].clone();
        self.weighted_index = (self.weighted_index + 1) % schedule.len();
        relay_id
    }

    fn weighted_schedule(&self, candidates: &[String]) -> Vec<String> {
        self.aggregate
            .members
            .iter()
            .filter(|member| candidates.contains(&member.relay_id))
            .flat_map(|member| {
                std::iter::repeat_n(member.relay_id.clone(), member.weight.max(1) as usize)
            })
            .collect()
    }

    fn candidate_ids(
        &mut self,
        settings: &BackendSettings,
        model: Option<&str>,
    ) -> Result<Vec<String>, SelectionError> {
        let compatible = self
            .aggregate
            .members
            .iter()
            .filter(|member| {
                relay_profile_by_id(settings, &member.relay_id)
                    .is_some_and(|profile| profile_supports_model(&profile, model))
            })
            .map(|member| member.relay_id.clone())
            .collect::<Vec<_>>();
        if compatible.is_empty() {
            return Err(SelectionError::NoCompatibleModel {
                aggregate_id: self.aggregate.id.clone(),
                model: model.unwrap_or("未指定").to_string(),
            });
        }
        let now = Instant::now();
        self.cooldowns.retain(|_, until| *until > now);
        let healthy = compatible
            .iter()
            .filter(|relay_id| !self.cooldowns.contains_key(*relay_id))
            .cloned()
            .collect::<Vec<_>>();
        Ok(if healthy.is_empty() {
            compatible
        } else {
            healthy
        })
    }

    fn member_id_at(&self, index: usize) -> String {
        self.aggregate.members[index % self.aggregate.members.len()]
            .relay_id
            .clone()
    }
}

pub fn select_relay_for_request(
    settings: &BackendSettings,
    context: RotationContext,
) -> Result<RelayProfile, SelectionError> {
    let Some(active_aggregate) = settings.active_aggregate_relay_profile() else {
        clear_global_selector();
        return Ok(settings.active_relay_profile());
    };

    let lock = GLOBAL_SELECTOR.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let needs_new_selector = guard
        .as_ref()
        .map(|selector| selector.aggregate != active_aggregate)
        .unwrap_or(true);
    if needs_new_selector {
        *guard = Some(RelayRotationSelector::from_settings(settings)?);
    }
    guard
        .as_mut()
        .expect("selector initialized")
        .select(settings, context)
}

pub fn select_relay_for_probe(settings: &BackendSettings) -> Result<RelayProfile, SelectionError> {
    let Some(active_aggregate) = settings.active_aggregate_relay_profile() else {
        clear_global_selector();
        return Ok(settings.active_relay_profile());
    };

    let lock = GLOBAL_SELECTOR.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let needs_new_selector = guard
        .as_ref()
        .map(|selector| selector.aggregate != active_aggregate)
        .unwrap_or(true);
    if needs_new_selector {
        *guard = Some(RelayRotationSelector::from_settings(settings)?);
    }
    guard.as_ref().expect("selector initialized").peek(settings)
}

pub fn fallback_relays_after(
    settings: &BackendSettings,
    relay_id: &str,
) -> Result<Vec<RelayProfile>, SelectionError> {
    fallback_relays_after_for_context(settings, relay_id, &RotationContext::default())
}

pub fn fallback_relays_after_for_context(
    settings: &BackendSettings,
    relay_id: &str,
    context: &RotationContext,
) -> Result<Vec<RelayProfile>, SelectionError> {
    let Some(active_aggregate) = settings.active_aggregate_relay_profile() else {
        return Ok(Vec::new());
    };
    validate_aggregate_members(settings, &active_aggregate)?;
    let start_index = active_aggregate
        .members
        .iter()
        .position(|member| member.relay_id == relay_id)
        .map(|index| index + 1)
        .unwrap_or(0);
    (0..active_aggregate.members.len().saturating_sub(1))
        .map(|offset| {
            let index = (start_index + offset) % active_aggregate.members.len();
            &active_aggregate.members[index]
        })
        .filter(|member| {
            relay_profile_by_id(settings, &member.relay_id)
                .is_some_and(|profile| profile_supports_model(&profile, context.model.as_deref()))
        })
        .map(|member| {
            relay_profile_by_id(settings, &member.relay_id).ok_or_else(|| {
                SelectionError::UnknownMemberRelay {
                    aggregate_id: active_aggregate.id.clone(),
                    relay_id: member.relay_id.clone(),
                }
            })
        })
        .collect()
}

pub fn record_relay_request_event(settings: &BackendSettings, event: RotationEvent) {
    record_relay_request_result(settings, None, &RotationContext::default(), event);
}

pub fn record_relay_request_result(
    settings: &BackendSettings,
    relay_id: Option<&str>,
    context: &RotationContext,
    event: RotationEvent,
) {
    if settings.active_aggregate_relay_profile().is_none() {
        clear_global_selector();
        return;
    }
    let lock = GLOBAL_SELECTOR.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(selector) = guard.as_mut() {
        selector.record_result(relay_id, context.conversation_id.as_deref(), event);
    }
}

pub fn record_relay_request_failure(settings: &BackendSettings) {
    record_relay_request_event(settings, RotationEvent::Failure);
}

fn active_aggregate(settings: &BackendSettings) -> Result<&AggregateRelayProfile, SelectionError> {
    let active_id = settings
        .active_aggregate_relay_profile()
        .map(|aggregate| aggregate.id)
        .ok_or(SelectionError::NoActiveAggregate)?;

    settings
        .aggregate_relay_profiles
        .iter()
        .find(|aggregate| aggregate.id == active_id)
        .ok_or(SelectionError::NoActiveAggregate)
}

fn validate_aggregate_members(
    settings: &BackendSettings,
    aggregate: &AggregateRelayProfile,
) -> Result<(), SelectionError> {
    if aggregate.members.is_empty() {
        return Err(SelectionError::EmptyAggregateMembers {
            aggregate_id: aggregate.id.clone(),
        });
    }

    let relay_by_id = settings
        .relay_profiles
        .iter()
        .map(|profile| (profile.id.as_str(), profile))
        .collect::<HashMap<_, _>>();
    for member in &aggregate.members {
        let Some(relay) = relay_by_id.get(member.relay_id.as_str()) else {
            return Err(SelectionError::UnknownMemberRelay {
                aggregate_id: aggregate.id.clone(),
                relay_id: member.relay_id.clone(),
            });
        };
        let oauth_ready = crate::codex_oauth::is_oauth_profile(relay);
        if (!oauth_ready && relay.base_url.trim().is_empty())
            || (!oauth_ready
                && crate::relay_config::relay_profile_api_key(relay)
                    .trim()
                    .is_empty())
        {
            return Err(SelectionError::InvalidMemberRelay {
                aggregate_id: aggregate.id.clone(),
                relay_id: member.relay_id.clone(),
            });
        }
    }
    Ok(())
}

fn profile_supports_model(profile: &RelayProfile, model: Option<&str>) -> bool {
    let Some(model) = model.map(str::trim).filter(|model| !model.is_empty()) else {
        return true;
    };
    let configured = profile
        .model_list
        .split(['\r', '\n', ','])
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(|candidate| crate::model_suffix::parse_model_suffix(candidate).0)
        .collect::<Vec<_>>();
    configured.is_empty()
        || configured
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(model))
}

fn clear_global_selector() {
    let lock = GLOBAL_SELECTOR.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = None;
}

fn relay_profile_by_id(settings: &BackendSettings, relay_id: &str) -> Option<RelayProfile> {
    settings
        .relay_profiles
        .iter()
        .find(|profile| profile.id == relay_id)
        .cloned()
}
