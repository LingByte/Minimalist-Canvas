//! Tauri commands for Tomato (番茄) novel downloader + local library.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tomato_library::{
    DownloadProgressEvent, DownloadRequest, DownloadResult, DownloaderStatus, LocalBook,
    TomatoClient, TomatoLibraryConfig, TomatoLibraryConfigManager, cover_url_from_raw,
    default_library_path, delete_book, download_book_to_library_with_progress, list_local_books,
    runtime,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettingsView {
    pub api_base: String,
    pub library_path: String,
    pub default_library_path: String,
}

fn load_cfg() -> Result<TomatoLibraryConfig, String> {
    TomatoLibraryConfigManager::load().map_err(|e| e.to_string())
}

fn to_settings_view(cfg: TomatoLibraryConfig) -> Result<LibrarySettingsView, String> {
    let default_path = default_library_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let library_path = cfg
        .resolve_library_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| default_path.clone());
    Ok(LibrarySettingsView {
        api_base: cfg.resolve_api_base(),
        library_path,
        default_library_path: default_path,
    })
}

#[tauri::command]
pub async fn library_get_settings() -> Result<LibrarySettingsView, String> {
    to_settings_view(load_cfg()?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettingsInput {
    pub library_path: String,
}

#[tauri::command]
pub async fn library_set_settings(settings: LibrarySettingsInput) -> Result<LibrarySettingsView, String> {
    let mut cfg = load_cfg().unwrap_or_default();
    cfg.api_base = tomato_library::LOCAL_API_BASE.to_string();
    cfg.api_password = String::new();
    cfg.library_path = settings.library_path.trim().to_string();
    cfg.ensure_library_dir().map_err(|e| e.to_string())?;
    TomatoLibraryConfigManager::save(&cfg).map_err(|e| e.to_string())?;
    to_settings_view(cfg)
}

#[tauri::command]
pub async fn library_list_local() -> Result<Vec<LocalBook>, String> {
    let cfg = load_cfg()?;
    let path = cfg.ensure_library_dir().map_err(|e| e.to_string())?;
    list_local_books(&path).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchItemView {
    pub title: String,
    pub author: String,
    pub book_id: String,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResponseView {
    pub items: Vec<LibrarySearchItemView>,
}

#[tauri::command]
pub async fn library_search(query: String) -> Result<LibrarySearchResponseView, String> {
    let cfg = load_cfg()?;
    let client = TomatoClient::new(
        cfg.resolve_api_base(),
        cfg.resolve_api_password().map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let search = client.search(query.trim()).await.map_err(|e| e.to_string())?;
    let items = search
        .items
        .into_iter()
        .map(|item| LibrarySearchItemView {
            cover_url: cover_url_from_raw(&item.raw),
            title: item.title,
            author: item.author,
            book_id: item.book_id,
        })
        .collect();
    Ok(LibrarySearchResponseView { items })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDownloadArgs {
    pub book_id: String,
    pub preferred_name: Option<String>,
    pub range_start: Option<u32>,
    pub range_end: Option<u32>,
}

#[tauri::command]
pub async fn library_download(app: AppHandle, args: LibraryDownloadArgs) -> Result<DownloadResult, String> {
    let cfg = load_cfg()?;
    let book_id = args.book_id.trim().to_string();
    let result = download_book_to_library_with_progress(
        &cfg,
        DownloadRequest {
            book_id: book_id.clone(),
            preferred_name: args.preferred_name,
            range_start: args.range_start,
            range_end: args.range_end,
        },
        |progress: DownloadProgressEvent| {
            let _ = app.emit("library-download-progress", &progress);
        },
    )
    .await
    .map_err(|e| e.to_string());

    if let Err(error) = &result {
        let _ = app.emit(
            "library-download-progress",
            &DownloadProgressEvent {
                book_id: book_id.clone(),
                title: book_id.clone(),
                phase: "failed".to_string(),
                message: Some(error.clone()),
                job_id: None,
                percent: None,
            },
        );
    }
    result
}

fn ensure_path_in_library(path: &PathBuf) -> Result<PathBuf, String> {
    let cfg = load_cfg()?;
    let library_root = cfg
        .ensure_library_dir()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let candidate = PathBuf::from(path);
    let canonical = candidate.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&library_root) {
        return Err("路径不在书库目录内".into());
    }
    Ok(canonical)
}

#[tauri::command]
pub async fn library_delete_local(path: String) -> Result<(), String> {
    let path = ensure_path_in_library(&PathBuf::from(path))?;
    delete_book(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_reveal_local(path: String) -> Result<(), String> {
    let path = ensure_path_in_library(&PathBuf::from(path))?;
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(parent) = path.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn library_open_local(path: String) -> Result<(), String> {
    let path = ensure_path_in_library(&PathBuf::from(path))?;
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub async fn library_downloader_status() -> Result<DownloaderStatus, String> {
    Ok(runtime().status())
}

#[tauri::command]
pub async fn library_install_downloader() -> Result<DownloaderStatus, String> {
    runtime().install_latest().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_start_downloader() -> Result<DownloaderStatus, String> {
    runtime().start_server().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_stop_downloader() -> Result<DownloaderStatus, String> {
    runtime().stop_server().await.map_err(|e| e.to_string())
}
