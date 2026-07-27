fn main() {
    #[cfg(windows)]
    {
        println!("cargo:rerun-if-changed=../codex-plus-manager/src-tauri/icons/icon.ico");
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon("../codex-plus-manager/src-tauri/icons/icon.ico");
        resource.set_manifest(include_str!(
            "../codex-plus-manager/src-tauri/windows-app-manifest.xml"
        ));
        resource.compile().expect("compile launcher icon resource");
    }
}
