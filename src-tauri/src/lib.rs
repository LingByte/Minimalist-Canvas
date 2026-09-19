mod mcp;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let bridge = mcp::spawn_mcp_server(app.handle());
            app.manage(bridge);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mcp::mcp_endpoint,
            mcp::mcp_tool_result,
            mcp::mcp_registered,
            mcp::register_codex_mcp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
