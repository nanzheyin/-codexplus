use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use base64::{Engine, engine::general_purpose::URL_SAFE, engine::general_purpose::URL_SAFE_NO_PAD};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::settings::{RelayMode, RelayProfile, RelayProtocol, SettingsStore};

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_ENDPOINT: &str = "https://auth.openai.com/oauth/authorize";
const TOKEN_ENDPOINT: &str = "https://auth.openai.com/oauth/token";
const SCOPES: &str = "openid profile email offline_access";
const ORIGINATOR: &str = "codex_vscode";
const CALLBACK_PORT: u16 = 1455;
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
const TOKEN_REFRESH_SKEW_SECONDS: u64 = 300;
pub const CODEX_OAUTH_BASE_URL: &str = "https://chatgpt.com/backend-api/codex";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexOAuthTokens {
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthLoginStart {
    pub login_id: String,
    pub auth_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OAuthLoginPoll {
    Pending,
    Completed(CodexOAuthTokens),
    Failed(String),
}

#[derive(Debug, Clone)]
enum LoginState {
    Pending,
    Completed(CodexOAuthTokens),
    Failed(String),
}

#[derive(Debug, Clone)]
struct OAuthSession {
    login_id: String,
    auth_url: String,
    expires_at: u64,
    status: LoginState,
}

fn oauth_session() -> &'static Mutex<Option<OAuthSession>> {
    static SESSION: OnceLock<Mutex<Option<OAuthSession>>> = OnceLock::new();
    SESSION.get_or_init(|| Mutex::new(None))
}

pub async fn start_oauth_login() -> anyhow::Result<OAuthLoginStart> {
    if let Some(existing) = current_pending_login() {
        return Ok(existing);
    }

    let listener = TcpListener::bind(("127.0.0.1", CALLBACK_PORT))
        .await
        .with_context(|| format!("OAuth 回调端口 {CALLBACK_PORT} 已被占用"))?;
    let login_id = random_token();
    let state = random_token();
    let code_verifier = format!("{}{}", random_token(), random_token());
    let code_challenge = pkce_challenge(&code_verifier);
    let redirect_uri = format!("http://localhost:{CALLBACK_PORT}/auth/callback");
    let auth_url = build_authorization_url(&redirect_uri, &code_challenge, &state)?;
    let expires_at = unix_timestamp().saturating_add(LOGIN_TIMEOUT.as_secs());
    let session = OAuthSession {
        login_id: login_id.clone(),
        auth_url: auth_url.clone(),
        expires_at,
        status: LoginState::Pending,
    };
    *oauth_session()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(session);

    tokio::spawn(run_callback_listener(
        listener,
        login_id.clone(),
        state,
        code_verifier,
    ));

    Ok(OAuthLoginStart { login_id, auth_url })
}

pub fn poll_oauth_login(login_id: &str) -> OAuthLoginPoll {
    let guard = oauth_session()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(session) = guard
        .as_ref()
        .filter(|session| session.login_id == login_id)
    else {
        return OAuthLoginPoll::Failed("OAuth 登录会话不存在或已经结束".to_string());
    };
    if session.expires_at <= unix_timestamp() && matches!(session.status, LoginState::Pending) {
        return OAuthLoginPoll::Failed("OAuth 登录已超时，请重新发起".to_string());
    }
    match &session.status {
        LoginState::Pending => OAuthLoginPoll::Pending,
        LoginState::Completed(tokens) => OAuthLoginPoll::Completed(tokens.clone()),
        LoginState::Failed(error) => OAuthLoginPoll::Failed(error.clone()),
    }
}

pub fn clear_oauth_login(login_id: &str) {
    let mut guard = oauth_session()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard
        .as_ref()
        .is_some_and(|session| session.login_id == login_id)
    {
        *guard = None;
    }
}

pub fn is_oauth_profile(profile: &RelayProfile) -> bool {
    profile.relay_mode == RelayMode::Official
        && !profile.official_mix_api_key
        && tokens_from_auth_contents(&profile.auth_contents).is_some()
}

pub fn tokens_from_auth_contents(contents: &str) -> Option<CodexOAuthTokens> {
    let value: Value = serde_json::from_str(contents).ok()?;
    let tokens = value.get("tokens").unwrap_or(&value);
    let access_token = json_string(tokens, &["access_token", "accessToken"])?;
    let id_token = json_string(tokens, &["id_token", "idToken"]).unwrap_or_default();
    let refresh_token = json_string(tokens, &["refresh_token", "refreshToken"]);
    let account_id = json_string(tokens, &["account_id", "accountId"])
        .or_else(|| chatgpt_account_id_from_access_token(&access_token));
    Some(CodexOAuthTokens {
        id_token,
        access_token,
        refresh_token,
        account_id,
    })
}

pub fn auth_contents_with_tokens(
    existing: &str,
    tokens: &CodexOAuthTokens,
) -> anyhow::Result<String> {
    let mut root = serde_json::from_str::<Value>(existing)
        .ok()
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    let object = root.as_object_mut().context("auth.json 必须是 JSON 对象")?;
    object.insert(
        "auth_mode".to_string(),
        Value::String("chatgpt".to_string()),
    );
    object.insert("OPENAI_API_KEY".to_string(), Value::Null);
    object.insert(
        "tokens".to_string(),
        json!({
            "id_token": tokens.id_token,
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "account_id": tokens.account_id,
        }),
    );
    Ok(format!("{}\n", serde_json::to_string_pretty(&root)?))
}

pub async fn prepare_oauth_profile(
    mut profile: RelayProfile,
    force_refresh: bool,
) -> anyhow::Result<(RelayProfile, bool)> {
    let mut tokens = tokens_from_auth_contents(&profile.auth_contents)
        .context("OAuth 供应商缺少 access_token")?;
    let should_refresh = force_refresh || token_needs_refresh(&tokens.access_token);
    let mut refreshed = false;
    if should_refresh {
        let refresh_token = tokens
            .refresh_token
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .context("OAuth access_token 已过期且缺少 refresh_token")?;
        tokens = refresh_access_token(refresh_token, Some(tokens.id_token.as_str())).await?;
        profile.auth_contents = auth_contents_with_tokens(&profile.auth_contents, &tokens)?;
        refreshed = true;
    }
    profile.base_url = CODEX_OAUTH_BASE_URL.to_string();
    profile.upstream_base_url = CODEX_OAUTH_BASE_URL.to_string();
    profile.protocol = RelayProtocol::Responses;
    profile.api_key = tokens.access_token;
    Ok((profile, refreshed))
}

pub fn persist_refreshed_profile(profile: &RelayProfile) -> anyhow::Result<()> {
    let store = SettingsStore::default();
    let mut settings = store.load()?;
    let stored = settings
        .relay_profiles
        .iter_mut()
        .find(|stored| stored.id == profile.id)
        .with_context(|| format!("OAuth 供应商「{}」已不存在", profile.id))?;
    stored.auth_contents = profile.auth_contents.clone();
    store.update(json!({ "relayProfiles": settings.relay_profiles }))?;
    Ok(())
}

pub fn oauth_profile_from_auth(
    config_contents: String,
    auth_contents: String,
    existing_ids: &[String],
) -> anyhow::Result<RelayProfile> {
    let tokens = tokens_from_auth_contents(&auth_contents)
        .context("auth.json 中未找到可导入的 Codex OAuth Token")?;
    let identity = tokens
        .account_id
        .clone()
        .or_else(|| account_label_from_tokens(&tokens))
        .unwrap_or_else(|| tokens.access_token.clone());
    let mut hasher = Sha256::new();
    hasher.update(identity.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    let base_id = format!("oauth-{}", &digest[..12]);
    let id = unique_profile_id(&base_id, existing_ids);
    let name = account_label_from_tokens(&tokens).unwrap_or_else(|| "Codex OAuth".to_string());
    let mut profile = RelayProfile {
        id,
        name,
        relay_mode: RelayMode::Official,
        protocol: RelayProtocol::Responses,
        config_contents,
        auth_contents,
        ..RelayProfile::default()
    };
    crate::relay_config::normalize_relay_profile_for_storage(&mut profile)?;
    Ok(profile)
}

pub fn oauth_profile_identity(profile: &RelayProfile) -> Option<String> {
    let tokens = tokens_from_auth_contents(&profile.auth_contents)?;
    tokens
        .account_id
        .clone()
        .or_else(|| account_label_from_tokens(&tokens))
}

pub fn chatgpt_account_id_from_access_token(access_token: &str) -> Option<String> {
    let payload = jwt_payload(access_token)?;
    let auth = payload.get("https://api.openai.com/auth")?;
    json_string(auth, &["chatgpt_account_id", "account_id"])
}

fn current_pending_login() -> Option<OAuthLoginStart> {
    let guard = oauth_session()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let session = guard.as_ref()?;
    (matches!(session.status, LoginState::Pending) && session.expires_at > unix_timestamp()).then(
        || OAuthLoginStart {
            login_id: session.login_id.clone(),
            auth_url: session.auth_url.clone(),
        },
    )
}

async fn run_callback_listener(
    listener: TcpListener,
    login_id: String,
    expected_state: String,
    code_verifier: String,
) {
    let result = tokio::time::timeout(LOGIN_TIMEOUT, async {
        loop {
            let (mut stream, _) = listener.accept().await?;
            let mut buffer = vec![0_u8; 16 * 1024];
            let read = stream.read(&mut buffer).await?;
            let request = String::from_utf8_lossy(&buffer[..read]);
            let target = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("/");
            let callback = Url::parse(&format!("http://localhost:{CALLBACK_PORT}{target}"));
            let Ok(callback) = callback else {
                write_callback_response(&mut stream, 400, "授权回调地址无效").await;
                continue;
            };
            if callback.path() != "/auth/callback" {
                write_callback_response(&mut stream, 404, "等待 Codex OAuth 授权").await;
                continue;
            }
            let params = callback
                .query_pairs()
                .collect::<std::collections::HashMap<_, _>>();
            if let Some(error) = params.get("error") {
                write_callback_response(&mut stream, 400, "Codex OAuth 授权未完成").await;
                anyhow::bail!("OAuth 授权失败：{}", error);
            }
            if params.get("state").map(|value| value.as_ref()) != Some(expected_state.as_str()) {
                write_callback_response(&mut stream, 400, "OAuth state 校验失败").await;
                anyhow::bail!("OAuth state 校验失败");
            }
            let code = params
                .get("code")
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .context("OAuth 回调缺少 code")?;
            let tokens = exchange_authorization_code(&code, &code_verifier).await?;
            write_callback_response(&mut stream, 200, "Codex OAuth 授权完成，可以关闭此页面").await;
            return Ok::<_, anyhow::Error>(tokens);
        }
    })
    .await;

    let status = match result {
        Ok(Ok(tokens)) => LoginState::Completed(tokens),
        Ok(Err(error)) => LoginState::Failed(error.to_string()),
        Err(_) => LoginState::Failed("OAuth 登录已超时，请重新发起".to_string()),
    };
    let mut guard = oauth_session()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(session) = guard
        .as_mut()
        .filter(|session| session.login_id == login_id)
    {
        session.status = status;
    }
}

async fn write_callback_response(stream: &mut tokio::net::TcpStream, status: u16, message: &str) {
    let reason = if status == 200 { "OK" } else { "Error" };
    let body = format!(
        "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>Codex Deck</title><body><h1>{message}</h1></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

async fn exchange_authorization_code(
    code: &str,
    code_verifier: &str,
) -> anyhow::Result<CodexOAuthTokens> {
    let redirect_uri = format!("http://localhost:{CALLBACK_PORT}/auth/callback");
    let response = reqwest::Client::new()
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri.as_str()),
            ("client_id", CLIENT_ID),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await
        .context("OAuth Token 请求失败")?;
    parse_token_response(response, None).await
}

async fn refresh_access_token(
    refresh_token: &str,
    current_id_token: Option<&str>,
) -> anyhow::Result<CodexOAuthTokens> {
    let response = reqwest::Client::new()
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
        ])
        .send()
        .await
        .context("OAuth Token 刷新请求失败")?;
    let mut tokens = parse_token_response(response, current_id_token).await?;
    if tokens.refresh_token.is_none() {
        tokens.refresh_token = Some(refresh_token.to_string());
    }
    Ok(tokens)
}

async fn parse_token_response(
    response: reqwest::Response,
    current_id_token: Option<&str>,
) -> anyhow::Result<CodexOAuthTokens> {
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .context("读取 OAuth Token 响应失败")?;
    if !status.is_success() {
        anyhow::bail!(
            "OAuth Token 请求失败：HTTP {status}，响应长度 {}",
            bytes.len()
        );
    }
    let value: Value = serde_json::from_slice(&bytes).context("解析 OAuth Token 响应失败")?;
    let access_token =
        json_string(&value, &["access_token"]).context("OAuth 响应缺少 access_token")?;
    let id_token = json_string(&value, &["id_token"])
        .or_else(|| current_id_token.map(ToString::to_string))
        .unwrap_or_default();
    let refresh_token = json_string(&value, &["refresh_token"]);
    let account_id = chatgpt_account_id_from_access_token(&access_token);
    Ok(CodexOAuthTokens {
        id_token,
        access_token,
        refresh_token,
        account_id,
    })
}

fn build_authorization_url(
    redirect_uri: &str,
    code_challenge: &str,
    state: &str,
) -> anyhow::Result<String> {
    let mut url = Url::parse(AUTH_ENDPOINT)?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", SCOPES)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("id_token_add_organizations", "true")
        .append_pair("codex_cli_simplified_flow", "true")
        .append_pair("state", state)
        .append_pair("originator", ORIGINATOR);
    Ok(url.to_string())
}

fn random_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn pkce_challenge(code_verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()))
}

fn token_needs_refresh(access_token: &str) -> bool {
    let Some(exp) =
        jwt_payload(access_token).and_then(|payload| payload.get("exp").and_then(Value::as_u64))
    else {
        return false;
    };
    exp <= unix_timestamp().saturating_add(TOKEN_REFRESH_SKEW_SECONDS)
}

fn jwt_payload(token: &str) -> Option<Value> {
    let encoded = token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD
        .decode(encoded.as_bytes())
        .ok()
        .or_else(|| URL_SAFE.decode(encoded.as_bytes()).ok())?;
    serde_json::from_slice(&decoded).ok()
}

fn account_label_from_tokens(tokens: &CodexOAuthTokens) -> Option<String> {
    [&tokens.id_token, &tokens.access_token]
        .into_iter()
        .filter(|token| !token.trim().is_empty())
        .find_map(|token| {
            let payload = jwt_payload(token)?;
            json_string(&payload, &["email", "preferred_username", "name"])
        })
}

fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    })
}

fn unique_profile_id(base_id: &str, existing_ids: &[String]) -> String {
    if !existing_ids.iter().any(|id| id == base_id) {
        return base_id.to_string();
    }
    (2..)
        .map(|suffix| format!("{base_id}-{suffix}"))
        .find(|candidate| !existing_ids.iter().any(|id| id == candidate))
        .unwrap_or_else(|| format!("{base_id}-{}", random_token()))
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jwt(value: Value) -> String {
        format!(
            "header.{}.signature",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&value).unwrap())
        )
    }

    #[test]
    fn parses_codex_auth_and_account_identity() {
        let access = jwt(json!({
            "https://api.openai.com/auth": { "chatgpt_account_id": "acct-1" }
        }));
        let id = jwt(json!({ "email": "user@example.com" }));
        let auth = json!({
            "auth_mode": "chatgpt",
            "tokens": {
                "access_token": access,
                "id_token": id,
                "refresh_token": "refresh-1"
            }
        })
        .to_string();

        let tokens = tokens_from_auth_contents(&auth).unwrap();

        assert_eq!(tokens.account_id.as_deref(), Some("acct-1"));
        assert_eq!(
            account_label_from_tokens(&tokens).as_deref(),
            Some("user@example.com")
        );
    }

    #[test]
    fn auth_update_preserves_unrelated_fields() {
        let tokens = CodexOAuthTokens {
            id_token: "id-new".to_string(),
            access_token: "access-new".to_string(),
            refresh_token: Some("refresh-new".to_string()),
            account_id: Some("acct-new".to_string()),
        };

        let updated = auth_contents_with_tokens(r#"{"custom":true}"#, &tokens).unwrap();
        let value: Value = serde_json::from_str(&updated).unwrap();

        assert_eq!(value["custom"], true);
        assert_eq!(value["auth_mode"], "chatgpt");
        assert_eq!(value["tokens"]["access_token"], "access-new");
    }

    #[test]
    fn oauth_profile_uses_stable_non_secret_identity() {
        let access = jwt(json!({
            "https://api.openai.com/auth": { "chatgpt_account_id": "acct-stable" }
        }));
        let id = jwt(json!({ "email": "stable@example.com" }));
        let auth = json!({
            "auth_mode": "chatgpt",
            "tokens": { "access_token": access, "id_token": id, "refresh_token": "refresh" }
        })
        .to_string();

        let profile = oauth_profile_from_auth(String::new(), auth, &[]).unwrap();

        assert!(profile.id.starts_with("oauth-"));
        assert_eq!(profile.name, "stable@example.com");
        assert_eq!(profile.relay_mode, RelayMode::Official);
        assert!(is_oauth_profile(&profile));
    }
}
