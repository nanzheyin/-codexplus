fn main() {
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=SOURCE_VERSION");
    println!("cargo:rerun-if-changed=../../../.git/HEAD");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!(
        "cargo:rustc-env=CODEX_PLUS_BUILD_SHA={}",
        build_commit_sha()
    );

    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("windows-app-manifest.xml"));
    let attrs = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attrs).expect("failed to run Tauri build script");
}

fn build_commit_sha() -> String {
    let from_env = std::env::var("GITHUB_SHA")
        .ok()
        .or_else(|| std::env::var("SOURCE_VERSION").ok());
    let raw = from_env.or_else(|| {
        std::process::Command::new("git")
            .args(["rev-parse", "--short=12", "HEAD"])
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
    });
    let sha = raw.unwrap_or_else(|| "unknown".to_string());
    let trimmed = sha.trim();
    if trimmed == "unknown" {
        return trimmed.to_string();
    }
    trimmed.chars().take(12).collect()
}
