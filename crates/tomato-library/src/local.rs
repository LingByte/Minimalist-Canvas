//! Scan locally downloaded books + companion covers.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::{
    book_dir::{BOOK_MANIFEST, cover_in_book_dir, is_book_dir},
    epub::extract_epub_cover,
};

const ALLOWED_EXTS: &[&str] = &["epub", "txt", "mp3", "wav"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalBook {
    pub name: String,
    pub path: String,
    pub ext: String,
    pub size: u64,
    pub modified_ms: u64,
    /// Companion cover path next to the book, when available.
    pub cover_path: Option<String>,
    /// Cover encoded for the webview list (`data:image/...;base64,...`).
    pub cover_data_url: Option<String>,
}

pub fn list_local_books(library_root: &Path) -> Result<Vec<LocalBook>> {
    if !library_root.exists() {
        return Ok(Vec::new());
    }
    let mut books = Vec::new();
    let entries = std::fs::read_dir(library_root)
        .with_context(|| format!("Failed to read {}", library_root.display()))?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if is_book_dir(&path) {
            books.push(book_dir_entry(&path)?);
            continue;
        }
        if path.is_dir() {
            // Nested non-book directories are ignored at the library root.
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !ALLOWED_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string());
        if name.to_ascii_lowercase().contains(".cover.") {
            continue;
        }
        let meta = entry.metadata()?;
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let cover_path = ensure_cover_for_book(&path, &ext).ok().flatten();
        let cover_data_url = cover_path.as_ref().and_then(|p| encode_cover_data_url(p));
        books.push(LocalBook {
            name,
            path: path.to_string_lossy().into_owned(),
            ext,
            size: meta.len(),
            modified_ms,
            cover_path: cover_path.map(|p| p.to_string_lossy().into_owned()),
            cover_data_url,
        });
    }
    books.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then(a.name.cmp(&b.name)));
    Ok(books)
}

fn book_dir_entry(path: &Path) -> Result<LocalBook> {
    let meta = std::fs::metadata(path)?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());
    let size = dir_size(path).unwrap_or(0);
    let cover_path = cover_in_book_dir(path);
    let cover_data_url = cover_path.as_ref().and_then(|p| encode_cover_data_url(p));
    let _ = BOOK_MANIFEST;
    Ok(LocalBook {
        name,
        path: path.to_string_lossy().into_owned(),
        ext: "book".into(),
        size,
        modified_ms,
        cover_path: cover_path.map(|p| p.to_string_lossy().into_owned()),
        cover_data_url,
    })
}

fn encode_cover_data_url(path: &Path) -> Option<String> {
    use base64::Engine as _;
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

fn dir_size(path: &Path) -> Result<u64> {
    let mut total = 0u64;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_file() {
            total = total.saturating_add(meta.len());
        } else if meta.is_dir() {
            total = total.saturating_add(dir_size(&entry.path())?);
        }
    }
    Ok(total)
}

pub fn read_local_text(path: &Path, max_chars: usize) -> Result<String> {
    let data = std::fs::read(path).with_context(|| format!("Failed to read {}", path.display()))?;
    let text = String::from_utf8_lossy(&data).into_owned();
    if max_chars == 0 || text.chars().count() <= max_chars {
        return Ok(text);
    }
    Ok(text.chars().take(max_chars).collect())
}

pub fn companion_cover_path(book_path: &Path, image_ext: &str) -> PathBuf {
    let stem = book_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "book".into());
    let parent = book_path.parent().unwrap_or_else(|| Path::new("."));
    parent.join(format!("{stem}.cover.{image_ext}"))
}

pub fn find_existing_cover(book_path: &Path) -> Option<PathBuf> {
    let stem = book_path.file_stem()?.to_string_lossy();
    let parent = book_path.parent()?;
    for ext in ["jpg", "jpeg", "png", "webp", "gif"] {
        let candidate = parent.join(format!("{stem}.cover.{ext}"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn write_cover_bytes(book_path: &Path, bytes: &[u8], content_type: &str) -> Result<PathBuf> {
    let ext = mime_to_ext(content_type);
    let path = companion_cover_path(book_path, ext);
    std::fs::write(&path, bytes)
        .with_context(|| format!("Failed to write cover {}", path.display()))?;
    Ok(path)
}

fn ensure_cover_for_book(book_path: &Path, ext: &str) -> Result<Option<PathBuf>> {
    if let Some(existing) = find_existing_cover(book_path) {
        return Ok(Some(existing));
    }
    if ext != "epub" {
        return Ok(None);
    }
    match extract_epub_cover(book_path) {
        Ok((bytes, mime)) => Ok(Some(write_cover_bytes(book_path, &bytes, &mime)?)),
        Err(_) => Ok(None),
    }
}

fn mime_to_ext(content_type: &str) -> &'static str {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim()
        .to_ascii_lowercase();
    match mime.as_str() {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "jpg",
    }
}

pub fn sanitize_filename(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => out.push('_'),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    let trimmed = out.trim().trim_matches('.');
    if trimmed.is_empty() {
        "book".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn unique_target_path(dir: &Path, filename: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(filename)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "book".to_string());
    let ext = Path::new(filename)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for i in 2..10_000 {
        let next = dir.join(format!("{stem}-{i}{ext}"));
        if !next.exists() {
            return next;
        }
    }
    dir.join(format!("{stem}-dup{ext}"))
}

pub fn unique_dir_path(dir: &Path, folder_name: &str) -> PathBuf {
    let candidate = dir.join(folder_name);
    if !candidate.exists() {
        return candidate;
    }
    for i in 2..10_000 {
        let next = dir.join(format!("{folder_name}-{i}"));
        if !next.exists() {
            return next;
        }
    }
    dir.join(format!("{folder_name}-dup"))
}
