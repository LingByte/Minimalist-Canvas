mod mcp;
mod media_api;
mod tomato;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let bridge = mcp::spawn_mcp_server(app.handle());
            app.manage(bridge);
            let media = media_api::spawn_media_api(app.handle());
            app.manage(media);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mcp::mcp_endpoint,
            mcp::mcp_tool_result,
            mcp::mcp_registered,
            mcp::register_codex_mcp,
            mcp::open_codex_terminal,
            media_api::media_api_endpoint,
            media_api::media_api_result,
            tomato::library_get_settings,
            tomato::library_set_settings,
            tomato::library_list_local,
            tomato::library_search,
            tomato::library_preview,
            tomato::library_cover_data_url,
            tomato::library_download,
            tomato::library_delete_local,
            tomato::library_reveal_local,
            tomato::library_open_local,
            tomato::library_open_book,
            tomato::library_read_chapter,
            tomato::library_downloader_status,
            tomato::library_install_downloader,
            tomato::library_start_downloader,
            tomato::library_stop_downloader,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
