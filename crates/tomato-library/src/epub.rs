//! Structured EPUB open / chapter read for the in-app library reader.

use std::{collections::HashMap, io::Read, path::Path};

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubChapterMeta {
    pub index: u32,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubBook {
    pub title: String,
    pub author: String,
    pub chapters: Vec<EpubChapterMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubChapter {
    pub index: u32,
    pub title: String,
    pub text: String,
}

struct EpubInner {
    archive: zip::ZipArchive<std::fs::File>,
    title: String,
    author: String,
    /// Spine order: (title, zip path)
    chapters: Vec<(String, String)>,
}

/// Open EPUB once and return metadata + every chapter's plain text (for folder import).
pub fn open_epub_with_texts(path: &Path) -> Result<(EpubBook, Vec<(String, String)>)> {
    let mut inner = EpubInner::open(path)?;
    let book = EpubBook {
        title: inner.title.clone(),
        author: inner.author.clone(),
        chapters: inner
            .chapters
            .iter()
            .enumerate()
            .map(|(i, (title, _))| EpubChapterMeta {
                index: i as u32,
                title: title.clone(),
            })
            .collect(),
    };
    let mut texts = Vec::with_capacity(inner.chapters.len());
    for (title, href) in inner.chapters.clone() {
        let html = read_zip_entry(&mut inner.archive, &href).unwrap_or_default();
        let text = html_to_readable_text(&html);
        texts.push((title, text));
    }
    Ok((book, texts))
}

/// Extract cover image bytes from an EPUB when present.
pub fn extract_epub_cover(path: &Path) -> Result<(Vec<u8>, String)> {
    let file =
        std::fs::File::open(path).with_context(|| format!("Failed to open {}", path.display()))?;
    let mut archive = zip::ZipArchive::new(file)
        .with_context(|| format!("Invalid EPUB zip: {}", path.display()))?;
    let container = read_zip_entry(&mut archive, "META-INF/container.xml")?;
    let opf_path = extract_attr(&container, "rootfile", "full-path")
        .ok_or_else(|| anyhow!("EPUB missing rootfile"))?;
    let opf = read_zip_entry(&mut archive, &opf_path)?;
    let opf_dir = Path::new(&opf_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();

    let cover_href = find_cover_href(&opf).ok_or_else(|| anyhow!("EPUB has no cover"))?;
    let cover_path = join_epub_path(&opf_dir, &cover_href);
    let bytes = read_zip_bytes(&mut archive, &cover_path)?;
    let mime = guess_image_mime(&cover_path);
    Ok((bytes, mime))
}

impl EpubInner {
    fn open(path: &Path) -> Result<Self> {
        let file = std::fs::File::open(path)
            .with_context(|| format!("Failed to open {}", path.display()))?;
        let mut archive = zip::ZipArchive::new(file)
            .with_context(|| format!("Invalid EPUB zip: {}", path.display()))?;

        let container = read_zip_entry(&mut archive, "META-INF/container.xml")?;
        let opf_path = extract_attr(&container, "rootfile", "full-path")
            .ok_or_else(|| anyhow!("EPUB missing rootfile in container.xml"))?;
        let opf = read_zip_entry(&mut archive, &opf_path)?;
        let opf_dir = Path::new(&opf_path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_default();

        let title = meta_content(&opf, "dc:title")
            .or_else(|| meta_content(&opf, "title"))
            .unwrap_or_else(|| {
                path.file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "未命名".into())
            });
        let author = meta_content(&opf, "dc:creator")
            .or_else(|| meta_content(&opf, "creator"))
            .unwrap_or_default();

        let manifest = parse_manifest(&opf);
        let spine_ids = parse_spine_idrefs(&opf);
        if spine_ids.is_empty() {
            bail!("EPUB spine is empty");
        }

        let toc_titles = load_toc_titles(&mut archive, &opf_dir, &manifest, &opf);

        let mut chapters = Vec::new();
        for id in spine_ids {
            let Some(item) = manifest.get(&id) else {
                continue;
            };
            if item.is_nav || item.media_type.contains("ncx") {
                continue;
            }
            if !(item.media_type.contains("html")
                || item.media_type.contains("xml")
                || item.href.ends_with(".xhtml")
                || item.href.ends_with(".html")
                || item.href.ends_with(".htm"))
            {
                continue;
            }
            let chapter_path = join_epub_path(&opf_dir, &item.href);
            let html = match read_zip_entry(&mut archive, &chapter_path) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let heading = first_heading(&html);
            let from_toc = toc_titles
                .get(&normalize_href_key(&item.href))
                .cloned()
                .or_else(|| toc_titles.get(&normalize_href_key(&chapter_path)).cloned());
            let mut title = from_toc
                .or(heading)
                .unwrap_or_else(|| format!("第{}章", chapters.len() + 1));

            // Skip pure cover / TOC / copyright pages that aren't real chapters.
            let preview = html_to_readable_text(&html);
            let preview_trim = preview.trim();
            if is_non_content_chapter(&title, preview_trim) {
                continue;
            }
            // Prefer a cleaner title if the page is a short nav dump.
            if title.contains("目录") && preview_trim.chars().count() > 200 {
                // Keep as chapter if it also has substantial body beyond the TOC label.
            }
            if title.chars().count() > 80 {
                title = title.chars().take(80).collect();
            }
            chapters.push((title, chapter_path));
        }

        if chapters.is_empty() {
            bail!("EPUB 未解析到可读章节");
        }

        let _ = opf_dir;
        Ok(Self {
            archive,
            title,
            author,
            chapters,
        })
    }
}

#[derive(Clone)]
struct ManifestItem {
    href: String,
    media_type: String,
    is_nav: bool,
    properties: String,
}

fn parse_manifest(opf: &str) -> HashMap<String, ManifestItem> {
    let mut map = HashMap::new();
    let lower = opf.to_ascii_lowercase();
    let mut search_from = 0;
    while let Some(rel) = lower[search_from..].find("<item") {
        let start = search_from + rel;
        let rest = &opf[start..];
        let end = rest.find('>').unwrap_or(rest.len());
        let open = &rest[..end];
        if let (Some(id), Some(href)) = (attr_value(open, "id"), attr_value(open, "href")) {
            let media_type = attr_value(open, "media-type").unwrap_or_default();
            let properties = attr_value(open, "properties").unwrap_or_default();
            let is_nav = properties
                .split_whitespace()
                .any(|p| p.eq_ignore_ascii_case("nav"));
            map.insert(
                id,
                ManifestItem {
                    href,
                    media_type,
                    is_nav,
                    properties,
                },
            );
        }
        search_from = start + 5;
    }
    map
}

fn parse_spine_idrefs(opf: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let lower = opf.to_ascii_lowercase();
    let mut search_from = 0;
    while let Some(rel) = lower[search_from..].find("<itemref") {
        let start = search_from + rel;
        let rest = &opf[start..];
        let end = rest.find('>').unwrap_or(rest.len());
        let open = &rest[..end];
        if let Some(idref) = attr_value(open, "idref") {
            ids.push(idref);
        }
        search_from = start + 8;
    }
    ids
}

fn find_cover_href(opf: &str) -> Option<String> {
    let manifest = parse_manifest(opf);
    for item in manifest.values() {
        if item
            .properties
            .split_whitespace()
            .any(|p| p.eq_ignore_ascii_case("cover-image"))
        {
            return Some(item.href.clone());
        }
    }
    // <meta name="cover" content="id"/>
    let lower = opf.to_ascii_lowercase();
    let mut search_from = 0;
    while let Some(rel) = lower[search_from..].find("<meta") {
        let start = search_from + rel;
        let rest = &opf[start..];
        let end = rest.find('>').unwrap_or(rest.len());
        let open = &rest[..end];
        let name = attr_value(open, "name").unwrap_or_default();
        if name.eq_ignore_ascii_case("cover") {
            if let Some(id) = attr_value(open, "content") {
                if let Some(item) = manifest.get(&id) {
                    return Some(item.href.clone());
                }
            }
        }
        search_from = start + 5;
    }
    None
}

fn load_toc_titles(
    archive: &mut zip::ZipArchive<std::fs::File>,
    opf_dir: &Path,
    manifest: &HashMap<String, ManifestItem>,
    opf: &str,
) -> HashMap<String, String> {
    let mut titles = HashMap::new();

    // EPUB3 nav document
    for item in manifest.values() {
        if item.is_nav {
            let path = join_epub_path(opf_dir, &item.href);
            if let Ok(nav) = read_zip_entry(archive, &path) {
                parse_nav_links(&nav, &mut titles);
            }
        }
    }

    // EPUB2 NCX
    if titles.is_empty() {
        for item in manifest.values() {
            if item.media_type.contains("ncx") || item.href.ends_with(".ncx") {
                let path = join_epub_path(opf_dir, &item.href);
                if let Ok(ncx) = read_zip_entry(archive, &path) {
                    parse_ncx_titles(&ncx, &mut titles);
                }
            }
        }
    }

    // Some OPF embed guide references — ignore for titles.
    let _ = opf;
    titles
}

fn parse_nav_links(nav: &str, out: &mut HashMap<String, String>) {
    let lower = nav.to_ascii_lowercase();
    let mut search_from = 0;
    while let Some(rel) = lower[search_from..].find("<a") {
        let start = search_from + rel;
        let rest = &nav[start..];
        let tag_end = rest.find('>').unwrap_or(rest.len());
        let open = &rest[..tag_end];
        let Some(href) = attr_value(open, "href") else {
            search_from = start + 2;
            continue;
        };
        let after = &rest[tag_end + 1..];
        let Some(close_rel) = after.to_ascii_lowercase().find("</a>") else {
            search_from = start + 2;
            continue;
        };
        let label = strip_html_inline(&after[..close_rel]).trim().to_string();
        if !label.is_empty() {
            out.insert(normalize_href_key(&href), label);
        }
        search_from = start + 2;
    }
}

fn parse_ncx_titles(ncx: &str, out: &mut HashMap<String, String>) {
    let lower = ncx.to_ascii_lowercase();
    let mut search_from = 0;
    while let Some(rel) = lower[search_from..].find("<navpoint") {
        let start = search_from + rel;
        let rest = &ncx[start..];
        let Some(end_rel) = rest.to_ascii_lowercase().find("</navpoint>") else {
            break;
        };
        let block = &rest[..end_rel];
        let label = extract_tag_text(block, "text").unwrap_or_default();
        let href = extract_attr(block, "content", "src").unwrap_or_default();
        if !label.trim().is_empty() && !href.is_empty() {
            out.insert(normalize_href_key(&href), label.trim().to_string());
        }
        search_from = start + end_rel + 11;
    }
}

fn is_non_content_chapter(title: &str, body: &str) -> bool {
    let t = title.trim().to_ascii_lowercase();
    let short = body.chars().count() < 80;
    let toc_like = t.contains("目录")
        || t.contains("contents")
        || t.contains("toc")
        || t == "cover"
        || t.contains("封面")
        || t.contains("版权")
        || t.contains("copyright");
    if toc_like && (short || body.matches('第').count() > 8) {
        // Pure TOC pages: many "第N章" links and little prose.
        return true;
    }
    if short
        && (t.contains("cover")
            || t.contains("封面")
            || body.trim().is_empty()
            || body.trim() == title.trim())
    {
        return true;
    }
    false
}

fn first_heading(html: &str) -> Option<String> {
    for tag in ["h1", "h2", "h3", "title"] {
        if let Some(text) = extract_tag_text(html, tag) {
            let cleaned = strip_html_inline(&text).trim().to_string();
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
    }
    None
}

fn extract_tag_text(xml: &str, tag: &str) -> Option<String> {
    let lower = xml.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let start = lower.find(&open)?;
    let after_lt = &xml[start..];
    let gt = after_lt.find('>')?;
    let inner = &after_lt[gt + 1..];
    let end = inner.to_ascii_lowercase().find(&close)?;
    Some(inner[..end].to_string())
}

fn meta_content(opf: &str, tag: &str) -> Option<String> {
    extract_tag_text(opf, tag)
        .map(|s| strip_html_inline(&s).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn html_to_readable_text(html: &str) -> String {
    let mut without_blocks = html.to_string();
    for tag in ["script", "style", "nav"] {
        loop {
            let lower = without_blocks.to_ascii_lowercase();
            let open = format!("<{tag}");
            let close = format!("</{tag}>");
            let Some(start) = lower.find(&open) else {
                break;
            };
            let Some(rel_end) = lower[start..].find(&close) else {
                break;
            };
            let end = start + rel_end + close.len();
            without_blocks.replace_range(start..end, "\n");
        }
    }

    // Turn block tags into paragraph breaks.
    let mut text = String::with_capacity(without_blocks.len());
    let mut in_tag = false;
    let mut tag_buf = String::new();
    for ch in without_blocks.chars() {
        match ch {
            '<' => {
                in_tag = true;
                tag_buf.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let tag_name = tag_buf
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .trim_start_matches('/')
                    .to_ascii_lowercase();
                if matches!(
                    tag_name.as_str(),
                    "p" | "div" | "br" | "li" | "h1" | "h2" | "h3" | "h4" | "tr" | "section"
                ) {
                    text.push('\n');
                } else {
                    text.push(' ');
                }
            }
            _ if in_tag => tag_buf.push(ch),
            _ => text.push(ch),
        }
    }

    text = decode_entities(&text);
    let mut paragraphs = Vec::new();
    for para in text.split('\n') {
        let line = para.split_whitespace().collect::<Vec<_>>().join(" ");
        if !line.is_empty() {
            paragraphs.push(line);
        }
    }
    paragraphs.join("\n\n")
}

fn strip_html_inline(input: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    decode_entities(&out)
}

fn decode_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

fn normalize_href_key(href: &str) -> String {
    let base = href.split(['#', '?']).next().unwrap_or(href);
    base.replace('\\', "/")
        .trim_start_matches("./")
        .to_ascii_lowercase()
}

fn join_epub_path(base: &Path, href: &str) -> String {
    let href = href.split(['#', '?']).next().unwrap_or(href);
    if href.starts_with('/') {
        return href.trim_start_matches('/').replace('\\', "/");
    }
    let joined = base.join(href);
    let mut parts = Vec::new();
    for component in joined.components() {
        match component {
            std::path::Component::ParentDir => {
                parts.pop();
            }
            std::path::Component::Normal(s) => parts.push(s.to_string_lossy().into_owned()),
            std::path::Component::CurDir => {}
            _ => {}
        }
    }
    parts.join("/")
}

fn extract_attr(xml: &str, tag: &str, attr: &str) -> Option<String> {
    let lower = xml.to_ascii_lowercase();
    let tag_needle = format!("<{tag}");
    let mut search_from = 0;
    while let Some(rel) = lower[search_from..].find(&tag_needle) {
        let start = search_from + rel;
        let rest = &xml[start..];
        let end = rest.find('>').unwrap_or(rest.len());
        let open = &rest[..end];
        if let Some(value) = attr_value(open, attr) {
            return Some(value);
        }
        search_from = start + tag_needle.len();
    }
    None
}

fn attr_value(open_tag: &str, attr: &str) -> Option<String> {
    let lower = open_tag.to_ascii_lowercase();
    let needle = format!("{attr}=");
    let idx = lower.find(&needle)?;
    let after = &open_tag[idx + needle.len()..];
    let quote = after.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let body = &after[1..];
    let close = body.find(quote)?;
    Some(body[..close].trim().to_string())
}

fn read_zip_entry(archive: &mut zip::ZipArchive<std::fs::File>, path: &str) -> Result<String> {
    let bytes = read_zip_bytes(archive, path)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn read_zip_bytes(archive: &mut zip::ZipArchive<std::fs::File>, path: &str) -> Result<Vec<u8>> {
    let normalized = path.replace('\\', "/");
    let mut file = archive
        .by_name(&normalized)
        .with_context(|| format!("EPUB missing entry: {normalized}"))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .with_context(|| format!("Failed to read EPUB entry: {normalized}"))?;
    Ok(buf)
}

fn guess_image_mime(path: &str) -> String {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png".into()
    } else if lower.ends_with(".webp") {
        "image/webp".into()
    } else if lower.ends_with(".gif") {
        "image/gif".into()
    } else {
        "image/jpeg".into()
    }
}
