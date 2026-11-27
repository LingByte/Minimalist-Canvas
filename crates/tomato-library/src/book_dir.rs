//! On-disk book folder format (replaces keeping raw EPUB for reading).
//!
//! Layout:
//!   <library>/<title>/
//!     book.json
//!     cover.jpg            (optional)
//!     chapters/0000.txt
//!     chapters/0001.txt
//!     ...

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};

use crate::{
    epub::{EpubBook, EpubChapter, EpubChapterMeta, extract_epub_cover, open_epub_with_texts},
    local::{sanitize_filename, unique_dir_path},
};

pub const BOOK_MANIFEST: &str = "book.json";
pub const CHAPTERS_DIR: &str = "chapters";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookManifestChapter {
    pub index: u32,
    pub title: String,
    pub file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookManifest {
    pub title: String,
    pub author: String,
    pub chapters: Vec<BookManifestChapter>,
}

pub fn is_book_dir(path: &Path) -> bool {
    path.is_dir() && path.join(BOOK_MANIFEST).is_file()
}

pub fn load_manifest(book_dir: &Path) -> Result<BookManifest> {
    let raw = fs::read_to_string(book_dir.join(BOOK_MANIFEST))
        .with_context(|| format!("Failed to read {}", book_dir.join(BOOK_MANIFEST).display()))?;
    serde_json::from_str(&raw).context("Invalid book.json")
}

pub fn open_book(path: &Path) -> Result<EpubBook> {
    let book_dir = resolve_book_dir(path)?;
    let manifest = load_manifest(&book_dir)?;
    Ok(EpubBook {
        title: manifest.title,
        author: manifest.author,
        chapters: manifest
            .chapters
            .into_iter()
            .map(|c| EpubChapterMeta {
                index: c.index,
                title: c.title,
            })
            .collect(),
    })
}

pub fn read_chapter(path: &Path, index: u32) -> Result<EpubChapter> {
    let book_dir = resolve_book_dir(path)?;
    let manifest = load_manifest(&book_dir)?;
    let chapter = manifest
        .chapters
        .iter()
        .find(|c| c.index == index)
        .ok_or_else(|| anyhow!("chapter index out of range: {index}"))?;
    let file_path = book_dir.join(&chapter.file);
    let text = fs::read_to_string(&file_path)
        .with_context(|| format!("Failed to read {}", file_path.display()))?;
    Ok(EpubChapter {
        index: chapter.index,
        title: chapter.title.clone(),
        text,
    })
}

/// Convert an EPUB into a book folder under `library_root`, then remove the EPUB
/// (and any sibling `*.cover.*` companions).
pub fn import_epub_as_book_dir(epub_path: &Path, library_root: &Path) -> Result<PathBuf> {
    if !epub_path.is_file() {
        bail!("EPUB not found: {}", epub_path.display());
    }
    let (book, texts) = open_epub_with_texts(epub_path)?;
    let folder_name = sanitize_filename(&book.title);
    let book_dir = unique_dir_path(library_root, &folder_name);
    fs::create_dir_all(book_dir.join(CHAPTERS_DIR))
        .with_context(|| format!("Failed to create {}", book_dir.display()))?;

    let mut chapters = Vec::with_capacity(texts.len());
    for (i, (title, raw_text)) in texts.into_iter().enumerate() {
        let index = i as u32;
        let file = format!("{CHAPTERS_DIR}/{index:04}.txt");
        let text = strip_repeated_title(&title, &raw_text);
        fs::write(book_dir.join(&file), text)
            .with_context(|| format!("Failed to write chapter {file}"))?;
        chapters.push(BookManifestChapter { index, title, file });
    }

    let _ = write_cover_into_book_dir(epub_path, &book_dir)?;

    let manifest = BookManifest {
        title: book.title,
        author: book.author,
        chapters,
    };
    let manifest_json = serde_json::to_string_pretty(&manifest)?;
    fs::write(book_dir.join(BOOK_MANIFEST), manifest_json)
        .with_context(|| format!("Failed to write {}", book_dir.join(BOOK_MANIFEST).display()))?;

    remove_epub_and_companions(epub_path)?;
    Ok(book_dir)
}

/// If `path` is a loose EPUB, convert it under the library root; book dirs pass through.
pub fn ensure_book_dir(path: &Path, library_root: &Path) -> Result<PathBuf> {
    if is_book_dir(path) {
        return Ok(path.to_path_buf());
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext == "epub" {
        return import_epub_as_book_dir(path, library_root);
    }
    bail!("不是可打开的书库目录或 EPUB: {}", path.display())
}

pub fn delete_book(path: &Path) -> Result<()> {
    if is_book_dir(path) {
        fs::remove_dir_all(path).with_context(|| format!("Failed to delete {}", path.display()))?;
        return Ok(());
    }
    if path.is_file() {
        remove_epub_and_companions(path)?;
        return Ok(());
    }
    bail!("路径不存在: {}", path.display())
}

pub fn cover_in_book_dir(book_dir: &Path) -> Option<PathBuf> {
    for ext in ["jpg", "jpeg", "png", "webp", "gif"] {
        let candidate = book_dir.join(format!("cover.{ext}"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_book_dir(path: &Path) -> Result<PathBuf> {
    if is_book_dir(path) {
        return Ok(path.to_path_buf());
    }
    bail!("不是书库目录（缺少 book.json）: {}", path.display())
}

fn write_cover_into_book_dir(epub_path: &Path, book_dir: &Path) -> Result<Option<PathBuf>> {
    if let Some(parent) = epub_path.parent() {
        if let Some(stem) = epub_path.file_stem() {
            for ext in ["jpg", "jpeg", "png", "webp", "gif"] {
                let sibling = parent.join(format!("{}.cover.{ext}", stem.to_string_lossy()));
                if sibling.is_file() {
                    let dest = book_dir.join(format!("cover.{ext}"));
                    fs::copy(&sibling, &dest)?;
                    return Ok(Some(dest));
                }
            }
        }
    }
    match extract_epub_cover(epub_path) {
        Ok((bytes, mime)) => {
            let ext = match mime.as_str() {
                "image/png" => "png",
                "image/webp" => "webp",
                "image/gif" => "gif",
                _ => "jpg",
            };
            let dest = book_dir.join(format!("cover.{ext}"));
            fs::write(&dest, bytes)?;
            Ok(Some(dest))
        }
        Err(_) => Ok(None),
    }
}

fn remove_epub_and_companions(epub_path: &Path) -> Result<()> {
    if let Some(parent) = epub_path.parent() {
        if let Some(stem) = epub_path.file_stem() {
            for ext in ["jpg", "jpeg", "png", "webp", "gif"] {
                let sibling = parent.join(format!("{}.cover.{ext}", stem.to_string_lossy()));
                let _ = fs::remove_file(sibling);
            }
        }
    }
    if epub_path.exists() {
        fs::remove_file(epub_path)
            .with_context(|| format!("Failed to remove {}", epub_path.display()))?;
    }
    Ok(())
}

/// Drop leading paragraphs that only repeat the chapter title.
pub fn strip_repeated_title(title: &str, text: &str) -> String {
    let title_norm = normalize_for_compare(title);
    if title_norm.is_empty() {
        return text.trim().to_string();
    }

    let mut out_paras = Vec::new();
    let mut skipping = true;
    for para in text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
        if skipping {
            let first_norm = normalize_for_compare(para);
            if first_norm == title_norm
                || (title_norm.starts_with(&first_norm) && first_norm.chars().count() >= 4)
                || (first_norm.starts_with(&title_norm)
                    && first_norm.chars().count() <= title_norm.chars().count() + 4)
            {
                continue;
            }
            if let Some(rest) = para
                .strip_prefix(title)
                .map(|r| r.trim_start_matches(['\n', '\r', ' ', '　', ':', '：']))
            {
                skipping = false;
                if !rest.is_empty() {
                    out_paras.push(rest.to_string());
                }
                continue;
            }
            skipping = false;
            out_paras.push(para.to_string());
        } else {
            out_paras.push(para.to_string());
        }
    }
    out_paras.join("\n\n")
}

fn normalize_for_compare(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '　')
        .collect::<String>()
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::strip_repeated_title;

    #[test]
    fn strips_duplicate_chapter_titles() {
        let title = "第8章 祂的眼";
        let text = "第8章 祂的眼\n\n第8章 祂的眼\n\n正文第一段。\n\n正文第二段。";
        let cleaned = strip_repeated_title(title, text);
        assert_eq!(cleaned, "正文第一段。\n\n正文第二段。");
    }
}
