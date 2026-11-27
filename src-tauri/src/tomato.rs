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
    /// Inlined JPEG/PNG data URL fetched from Fanqie CDN during search (fast path).
    pub cover_data_url: Option<String>,
    pub abstract_text: Option<String>,
    pub category: Option<String>,
    pub chapter_number: Option<String>,
    pub word_number: Option<String>,
    pub score: Option<String>,
    pub tags: Vec<String>,
    pub finished: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResponseView {
    pub items: Vec<LibrarySearchItemView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPreviewView {
    pub book_id: String,
    pub title: String,
    pub author: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub chapter_count: u64,
    pub word_count: u64,
    pub score: f64,
    pub read_count_text: String,
    pub finished: bool,
    pub first_chapter_title: String,
    pub last_chapter_title: String,
    pub cover_url: Option<String>,
    pub cover_data_url: Option<String>,
}

fn raw_string(raw: &serde_json::Value, keys: &[&str]) -> Option<String> {
    let obj = raw.as_object()?;
    for key in keys {
        if let Some(value) = obj.get(*key) {
            if let Some(text) = value.as_str().map(str::trim).filter(|v| !v.is_empty()) {
                return Some(text.to_string());
            }
            if let Some(number) = value.as_i64().or_else(|| value.as_u64().map(|v| v as i64)) {
                return Some(number.to_string());
            }
            if let Some(number) = value.as_f64() {
                return Some(format!("{number}"));
            }
        }
    }
    None
}

fn raw_tags(raw: &serde_json::Value) -> Vec<String> {
    let Some(obj) = raw.as_object() else {
        return Vec::new();
    };
    if let Some(serde_json::Value::Array(arr)) = obj.get("tags") {
        return arr
            .iter()
            .filter_map(|value| value.as_str().map(str::trim).filter(|v| !v.is_empty()))
            .map(str::to_string)
            .collect();
    }
    if let Some(category) = raw_string(raw, &["category", "complete_category"]) {
        return category
            .split(['/', ',', '、'])
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
            .collect();
    }
    Vec::new()
}

fn raw_finished(raw: &serde_json::Value) -> Option<bool> {
    let obj = raw.as_object()?;
    if let Some(status) = obj.get("creation_status").and_then(|v| v.as_str()) {
        // Fanqie: "0" finished, "1" serializing (common convention in their payloads).
        return Some(status == "0");
    }
    if let Some(status) = obj.get("tomato_book_status").and_then(|v| v.as_str()) {
        if status.contains('完') {
            return Some(true);
        }
        if status.contains('连') {
            return Some(false);
        }
    }
    None
}

fn absolute_local_url(path_or_url: &str) -> Option<String> {
    let value = path_or_url.trim();
    if value.is_empty() {
        return None;
    }
    if value.starts_with("http://") || value.starts_with("https://") {
        return Some(value.to_string());
    }
    let base = tomato_library::LOCAL_API_BASE.trim_end_matches('/');
    if value.starts_with('/') {
        Some(format!("{base}{value}"))
    } else {
        Some(format!("{base}/{value}"))
    }
}

fn bytes_to_data_url(bytes: &[u8], content_type: &str) -> String {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim();
    let mime = if mime.starts_with("image/") {
        mime
    } else {
        "image/jpeg"
    };
    format!("data:{mime};base64,{}", data_encoding_base64(bytes))
}

fn data_encoding_base64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

async fn tomato_client() -> Result<TomatoClient, String> {
    let cfg = load_cfg()?;
    TomatoClient::new(
        cfg.resolve_api_base(),
        cfg.resolve_api_password().map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

async fn cdn_cover_data_url(client: &TomatoClient, cover_url: &str) -> Option<String> {
    match client.fetch_public_image(cover_url).await {
        Ok((bytes, content_type)) if !bytes.is_empty() => Some(bytes_to_data_url(&bytes, &content_type)),
        _ => None,
    }
}

#[tauri::command]
pub async fn library_search(query: String) -> Result<LibrarySearchResponseView, String> {
    let client = tomato_client().await?;
    let search = client.search(query.trim()).await.map_err(|e| e.to_string())?;
    let mut items: Vec<LibrarySearchItemView> = search
        .items
        .into_iter()
        .map(|item| LibrarySearchItemView {
            cover_url: cover_url_from_raw(&item.raw),
            cover_data_url: None,
            abstract_text: raw_string(&item.raw, &["abstract", "book_abstract_v2", "sub_info"]),
            category: raw_string(&item.raw, &["category", "complete_category"]),
            chapter_number: raw_string(&item.raw, &["chapter_number", "serial_count"]),
            word_number: raw_string(&item.raw, &["word_number"]),
            score: raw_string(&item.raw, &["score"]),
            tags: raw_tags(&item.raw),
            finished: raw_finished(&item.raw),
            title: item.title,
            author: item.author,
            book_id: item.book_id,
        })
        .collect();

    // Parallel CDN cover fetch (~0.5–1s). Avoid Tomato `/api/preview` here — it is ~6s/book.
    let mut join_set = tokio::task::JoinSet::new();
    for (index, item) in items.iter().enumerate() {
        let Some(cover_url) = item.cover_url.clone() else {
            continue;
        };
        let client = client.clone();
        join_set.spawn(async move {
            let data_url = cdn_cover_data_url(&client, &cover_url).await;
            (index, data_url)
        });
    }
    while let Some(joined) = join_set.join_next().await {
        if let Ok((index, Some(data_url))) = joined {
            if let Some(item) = items.get_mut(index) {
                item.cover_data_url = Some(data_url);
            }
        }
    }

    Ok(LibrarySearchResponseView { items })
}

#[tauri::command]
pub async fn library_preview(book_id: String) -> Result<LibraryPreviewView, String> {
    let book_id = book_id.trim().to_string();
    if book_id.is_empty() {
        return Err("bookId 不能为空".into());
    }
    let client = tomato_client().await?;
    let preview = client.preview(&book_id).await.map_err(|e| e.to_string())?;
    let cover_data_url = if preview.cover_url.trim().is_empty() {
        None
    } else {
        match client.fetch_authenticated_bytes(&preview.cover_url).await {
            Ok((bytes, content_type)) if !bytes.is_empty() => {
                Some(bytes_to_data_url(&bytes, &content_type))
            }
            _ => None,
        }
    };
    let cover_url = absolute_local_url(&preview.cover_url);
    let _ = client.preview_cleanup(&book_id).await;
    Ok(LibraryPreviewView {
        book_id: preview.book_id,
        title: preview.book_name,
        author: preview.author,
        description: preview.description,
        category: preview.category,
        tags: preview.tags,
        chapter_count: preview.chapter_count,
        word_count: preview.word_count,
        score: preview.score,
        read_count_text: preview.read_count_text,
        finished: preview.finished,
        first_chapter_title: preview.first_chapter_title,
        last_chapter_title: preview.last_chapter_title,
        cover_url,
        cover_data_url,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCoverArgs {
    pub book_id: Option<String>,
    pub cover_url: Option<String>,
}

#[tauri::command]
pub async fn library_cover_data_url(args: LibraryCoverArgs) -> Result<Option<String>, String> {
    let client = tomato_client().await?;
    if let Some(cover_url) = args.cover_url.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        if let Some(data_url) = cdn_cover_data_url(&client, cover_url).await {
            return Ok(Some(data_url));
        }
    }
    // Slow fallback only when CDN URL is missing/blocked.
    let book_id = args.book_id.unwrap_or_default();
    let book_id = book_id.trim();
    if book_id.is_empty() {
        return Ok(None);
    }
    let preview = match client.preview(book_id).await {
        Ok(preview) => preview,
        Err(_) => return Ok(None),
    };
    let cover = preview.cover_url.trim().to_string();
    let data_url = if cover.is_empty() {
        None
    } else {
        match client.fetch_authenticated_bytes(&cover).await {
            Ok((bytes, content_type)) if !bytes.is_empty() => {
                Some(bytes_to_data_url(&bytes, &content_type))
            }
            _ => None,
        }
    };
    let _ = client.preview_cleanup(book_id).await;
    Ok(data_url)
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
