//! End-to-end download: create job → poll → save into the local library.

use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::{
    client::{TomatoClient, job_failed_message, pick_preferred_format, unexpected_missing_job},
    config::TomatoLibraryConfig,
    local::{sanitize_filename, unique_target_path},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub book_id: String,
    pub range_start: Option<u32>,
    pub range_end: Option<u32>,
    /// Preferred book title used when locating the remote library file.
    pub preferred_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub job_id: u64,
    pub title: String,
    pub author: String,
    pub local_path: String,
    pub format: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub book_id: String,
    pub title: String,
    pub phase: String,
    pub message: Option<String>,
    pub job_id: Option<u64>,
    /// Coarse 0..=100 progress for UI; null when unknown.
    pub percent: Option<u8>,
}

pub async fn download_book_to_library(
    cfg: &TomatoLibraryConfig,
    request: DownloadRequest,
) -> Result<DownloadResult> {
    download_book_to_library_with_progress(cfg, request, |_| {}).await
}

pub async fn download_book_to_library_with_progress(
    cfg: &TomatoLibraryConfig,
    request: DownloadRequest,
    mut on_progress: impl FnMut(DownloadProgressEvent),
) -> Result<DownloadResult> {
    let client = TomatoClient::new(cfg.resolve_api_base(), cfg.resolve_api_password()?)?;
    let library_dir = cfg.ensure_library_dir()?;
    let book_id = request.book_id.clone();
    let mut title = request
        .preferred_name
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| book_id.clone());

    let emit = |on_progress: &mut dyn FnMut(DownloadProgressEvent),
                title: &str,
                phase: &str,
                message: Option<String>,
                job_id: Option<u64>,
                percent: Option<u8>| {
        on_progress(DownloadProgressEvent {
            book_id: book_id.clone(),
            title: title.to_string(),
            phase: phase.to_string(),
            message,
            job_id,
            percent,
        });
    };

    emit(
        &mut on_progress,
        &title,
        "waiting_slot",
        Some("等待下载槽…".into()),
        None,
        Some(5),
    );

    let preview = client.preview(&request.book_id).await.ok();
    let mut cover_bytes: Option<(Vec<u8>, String)> = None;
    if let Some(ref preview) = preview {
        if !preview.book_name.trim().is_empty() {
            title = preview.book_name.clone();
        }
        if !preview.cover_url.trim().is_empty() {
            match client.fetch_authenticated_bytes(&preview.cover_url).await {
                Ok(data) => cover_bytes = Some(data),
                Err(err) => warn!("cover fetch failed: {err}"),
            }
        }
        if let Err(err) = client.preview_cleanup(&request.book_id).await {
            warn!("preview cleanup failed: {err}");
        }
    }

    let mut created = None;
    for attempt in 0..30 {
        match client
            .create_job(&request.book_id, request.range_start, request.range_end)
            .await
        {
            Ok(job) => {
                created = Some(job);
                break;
            }
            Err(err) => {
                let msg = err.to_string();
                if msg.contains("busy") || msg.contains("429") {
                    info!("download slot busy, retry {attempt}");
                    emit(
                        &mut on_progress,
                        &title,
                        "waiting_slot",
                        Some(format!("下载槽占用中，排队重试（{attempt}）…")),
                        None,
                        Some(8),
                    );
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
                return Err(err);
            }
        }
    }
    let created = created.context("Timed out waiting for a free download slot")?;
    let job_id = created.id;
    emit(
        &mut on_progress,
        &title,
        "queued",
        Some("已创建下载任务".into()),
        Some(job_id),
        Some(15),
    );

    let mut author = preview
        .as_ref()
        .map(|p| p.author.clone())
        .unwrap_or_default();
    let mut chosen_format = "epub".to_string();

    loop {
        let job = client
            .get_job(job_id)
            .await?
            .ok_or_else(|| unexpected_missing_job(job_id))?;

        if let Some(name) = job.title.clone().filter(|s| !s.trim().is_empty()) {
            title = name;
        }
        if let Some(a) = job.author.clone().filter(|s| !s.trim().is_empty()) {
            author = a;
        }

        match job.state.as_str() {
            "queued" | "running" => {
                let phase = if job.state == "queued" {
                    "queued"
                } else {
                    "running"
                };
                let percent = if job.state == "queued" { 20 } else { 55 };
                emit(
                    &mut on_progress,
                    &title,
                    phase,
                    job.message
                        .clone()
                        .or_else(|| Some(if job.state == "queued" {
                            "排队中…".into()
                        } else {
                            "下载中…".into()
                        })),
                    Some(job_id),
                    Some(percent),
                );
                if let Some(options) = job.book_name_options.as_ref().filter(|o| !o.is_empty()) {
                    let value = options[0].clone();
                    client.set_book_name(job_id, &value).await?;
                    title = value;
                } else if let Some(options) = job.format_options.as_ref().filter(|o| !o.is_empty())
                {
                    let value = pick_preferred_format(options).unwrap_or_else(|| "epub".into());
                    client.set_format(job_id, &value).await?;
                    chosen_format = value;
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            "done" => break,
            "failed" => bail!("{}", job_failed_message(&job)),
            "canceled" => bail!("download canceled"),
            other => bail!("unexpected job state: {other}"),
        }
    }

    emit(
        &mut on_progress,
        &title,
        "saving",
        Some("正在保存到本地书库…".into()),
        Some(job_id),
        Some(80),
    );

    let file_item = wait_for_remote_file(&client, &title).await?;
    if !file_item.ext.is_empty() {
        chosen_format = file_item.ext.clone();
    }

    let (bytes, remote_filename) = client.download_file(&file_item.rel_path).await?;
    let filename = remote_filename.unwrap_or_else(|| {
        let base = sanitize_filename(&title);
        format!("{base}.{}", chosen_format.trim_start_matches('.'))
    });
    let filename = sanitize_filename(&filename);
    let target = unique_target_path(&library_dir, &filename);
    std::fs::write(&target, &bytes)
        .with_context(|| format!("Failed to write {}", target.display()))?;

    if let Some((cover_data, content_type)) = cover_bytes {
        if let Err(err) = crate::local::write_cover_bytes(&target, &cover_data, &content_type) {
            warn!("failed to save local cover: {err}");
        }
    }

    // Prefer a folder book (parsed chapters) over keeping the raw EPUB around.
    let (final_path, final_format, final_size) = if chosen_format.eq_ignore_ascii_case("epub") {
        emit(
            &mut on_progress,
            &title,
            "converting",
            Some("正在转换为书库格式…".into()),
            Some(job_id),
            Some(92),
        );
        match crate::book_dir::import_epub_as_book_dir(&target, &library_dir) {
            Ok(book_dir) => {
                let size = std::fs::metadata(&book_dir)
                    .map(|m| m.len())
                    .unwrap_or(bytes.len() as u64);
                (book_dir, "book".to_string(), size)
            }
            Err(err) => {
                warn!("epub→folder conversion failed, keeping epub: {err}");
                (target, chosen_format, bytes.len() as u64)
            }
        }
    } else {
        (target, chosen_format, bytes.len() as u64)
    };

    emit(
        &mut on_progress,
        &title,
        "done",
        Some("下载完成".into()),
        Some(job_id),
        Some(100),
    );

    Ok(DownloadResult {
        job_id,
        title,
        author,
        local_path: final_path.to_string_lossy().into_owned(),
        format: final_format,
        size: final_size,
    })
}

async fn wait_for_remote_file(
    client: &TomatoClient,
    title: &str,
) -> Result<crate::client::LibraryFileItem> {
    for attempt in 0..60 {
        let listing = client.list_library(title, attempt == 0).await?;
        if listing.running {
            tokio::time::sleep(Duration::from_secs(1)).await;
            continue;
        }
        let mut files: Vec<_> = listing
            .items
            .into_iter()
            .filter(|item| item.kind == "file")
            .filter(|item| {
                let ext = item.ext.to_ascii_lowercase();
                matches!(ext.as_str(), "epub" | "txt" | "mp3" | "wav")
            })
            .collect();
        if files.is_empty() {
            tokio::time::sleep(Duration::from_secs(1)).await;
            continue;
        }
        files.sort_by(|a, b| {
            let rank = |ext: &str| match ext.to_ascii_lowercase().as_str() {
                "epub" => 0,
                "txt" => 1,
                _ => 2,
            };
            rank(&a.ext).cmp(&rank(&b.ext)).then(a.name.cmp(&b.name))
        });
        return Ok(files.remove(0));
    }
    bail!("Download finished but no file appeared in remote library")
}
