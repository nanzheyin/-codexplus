fn client_builder(user_agent: &str) -> reqwest::ClientBuilder {
    let ua = if user_agent.trim().is_empty() {
        format!("CodexPlusPlus/{}", env!("CARGO_PKG_VERSION"))
    } else {
        user_agent.trim().to_string()
    };
    reqwest::Client::builder().user_agent(ua)
}

pub fn proxied_client(user_agent: &str) -> anyhow::Result<reqwest::Client> {
    Ok(client_builder(user_agent).build()?)
}

pub fn direct_client(user_agent: &str) -> anyhow::Result<reqwest::Client> {
    Ok(client_builder(user_agent).no_proxy().build()?)
}

pub fn client_for_url(user_agent: &str, url: &str) -> anyhow::Result<reqwest::Client> {
    if is_local_url(url) {
        direct_client(user_agent)
    } else {
        proxied_client(user_agent)
    }
}

pub(crate) fn is_local_url(url: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(url) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") || host.to_ascii_lowercase().ends_with(".localhost") {
        return true;
    }
    host.trim_matches(['[', ']'])
        .parse::<std::net::IpAddr>()
        .is_ok_and(|address| address.is_loopback())
}

#[cfg(test)]
mod tests {
    use super::is_local_url;

    #[test]
    fn local_urls_bypass_system_proxy() {
        assert!(is_local_url("http://127.0.0.1:57321/v1"));
        assert!(is_local_url("http://[::1]:9222/json"));
        assert!(is_local_url("http://localhost:8080"));
        assert!(is_local_url("http://service.localhost:8080"));
    }

    #[test]
    fn public_and_private_network_urls_keep_proxy_support() {
        assert!(!is_local_url("https://github.com/example/project"));
        assert!(!is_local_url("http://192.168.1.10:8080/v1"));
        assert!(!is_local_url("not a url"));
    }
}
