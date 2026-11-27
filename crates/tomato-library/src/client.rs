//! HTTP client for the Tomato download platform.

use anyhow::{Context, Result, anyhow, bail};
use reqwest::{
    Client,
    header::{CONTENT_TYPE, HeaderMap, HeaderValue},
};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone)]
pub struct TomatoClient {
    base: String,
    password: String,
    http: Client,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchItem {
    pub title: String,
    pub author: String,
    pub book_id: String,
    #[serde(default)]
    pub raw: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub items: Vec<SearchItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewResponse {
    pub book_id: String,
    pub book_name: String,
    #[serde(default)]
    pub original_book_name: String,
    #[serde(default)]
    pub author: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub chapter_count: u64,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub finished: bool,
    #[serde(default)]
    pub first_chapter_title: String,
    #[serde(default)]
    pub last_chapter_title: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub word_count: u64,
    #[serde(default)]
    pub category: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub score: f64,
    #[serde(default)]
    pub read_count_text: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub cover_url: String,
}

fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobCreateResponse {
    pub id: u64,
    pub book_id: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobProgress {
    #[serde(default)]
    pub chapter_total: u64,
    #[serde(default)]
    pub audiobook_generated: u64,
    #[serde(default)]
    pub audiobook_failed: u64,
    #[serde(default)]
    pub audiobook_skipped: u64,
    #[serde(default)]
    pub comment_fetch: u64,
    #[serde(default)]
    pub comment_saved: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobItem {
    pub id: u64,
    pub book_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    pub state: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub progress: Option<JobProgress>,
    #[serde(default)]
    pub book_name_options: Option<Vec<String>>,
    #[serde(default)]
    pub format_options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobsResponse {
    #[serde(default)]
    pub done_retention_ms: u64,
    pub items: Vec<JobItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryFileItem {
    pub kind: String,
    pub name: String,
    pub rel_path: String,
    #[serde(default)]
    pub ext: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryResponse {
    #[serde(default)]
    pub root: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub running: bool,
    #[serde(default)]
    pub scanned: u64,
    #[serde(default)]
    pub error: Option<String>,
    pub items: Vec<LibraryFileItem>,
}

impl TomatoClient {
    pub fn new(base: impl Into<String>, password: impl Into<String>) -> Result<Self> {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .context("Failed to build HTTP client")?;
        Ok(Self {
            base: base.into().trim_end_matches('/').to_string(),
            password: password.into(),
            http,
        })
    }

    fn auth_headers(&self) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        if !self.password.is_empty() {
            headers.insert(
                "x-tomato-password",
                HeaderValue::from_str(&self.password)
                    .context("Invalid tomato password for HTTP header")?,
            );
        }
        Ok(headers)
    }

    async fn ensure_ok(resp: reqwest::Response) -> Result<reqwest::Response> {
        let status = resp.status();
        if status.is_success() {
            return Ok(resp);
        }
        let body = resp.text().await.unwrap_or_default();
        let body = body.trim();
        if status.as_u16() == 401 {
            bail!("unauthorized: check TOMATO_API_PASSWORD / settings password");
        }
        if status.as_u16() == 429 {
            bail!("busy: another download job is already queued or running");
        }
        bail!("Tomato API {status}: {body}");
    }

    pub async fn search(&self, query: &str) -> Result<SearchResponse> {
        let url = format!("{}/api/search", self.base);
        let resp = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .query(&[("q", query)])
            .send()
            .await
            .context("search request failed")?;
        let resp = Self::ensure_ok(resp).await?;
        resp.json().await.context("Failed to parse search response")
    }

    pub async fn preview(&self, book_id: &str) -> Result<PreviewResponse> {
        let url = format!("{}/api/preview/{}", self.base, urlencoding_path(book_id));
        let resp = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .send()
            .await
            .context("preview request failed")?;
        let resp = Self::ensure_ok(resp).await?;
        resp.json()
            .await
            .context("Failed to parse preview response")
    }

    pub async fn preview_cleanup(&self, book_id: &str) -> Result<()> {
        let url = format!(
            "{}/api/preview/{}/cleanup",
            self.base,
            urlencoding_path(book_id)
        );
        let resp = self
            .http
            .post(&url)
            .headers(self.auth_headers()?)
            .send()
            .await
            .context("preview cleanup failed")?;
        let _ = Self::ensure_ok(resp).await?;
        Ok(())
    }

    pub async fn create_job(
        &self,
        book_id: &str,
        range_start: Option<u32>,
        range_end: Option<u32>,
    ) -> Result<JobCreateResponse> {
        let url = format!("{}/api/jobs", self.base);
        let mut body = json!({ "book_id": book_id });
        if let (Some(start), Some(end)) = (range_start, range_end) {
            body["range_start"] = json!(start);
            body["range_end"] = json!(end);
        }
        let mut headers = self.auth_headers()?;
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        let resp = self
            .http
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .context("create job failed")?;
        let resp = Self::ensure_ok(resp).await?;
        resp.json()
            .await
            .context("Failed to parse create-job response")
    }

    pub async fn get_job(&self, id: u64) -> Result<Option<JobItem>> {
        let url = format!("{}/api/jobs", self.base);
        let id_value = id.to_string();
        let resp = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .query(&[("id", id_value.as_str()), ("all", "true")])
            .send()
            .await
            .context("get job failed")?;
        let resp = Self::ensure_ok(resp).await?;
        let parsed: JobsResponse = resp.json().await.context("Failed to parse jobs response")?;
        Ok(parsed.items.into_iter().next())
    }

    pub async fn set_book_name(&self, id: u64, value: &str) -> Result<()> {
        self.post_job_choice(id, "book_name", value).await
    }

    pub async fn set_format(&self, id: u64, value: &str) -> Result<()> {
        self.post_job_choice(id, "format", value).await
    }

    async fn post_job_choice(&self, id: u64, kind: &str, value: &str) -> Result<()> {
        let url = format!("{}/api/jobs/{id}/{kind}", self.base);
        let mut headers = self.auth_headers()?;
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        let resp = self
            .http
            .post(&url)
            .headers(headers)
            .json(&json!({ "value": value }))
            .send()
            .await
            .with_context(|| format!("set {kind} failed"))?;
        let _ = Self::ensure_ok(resp).await?;
        Ok(())
    }

    pub async fn list_library(&self, name: &str, start: bool) -> Result<LibraryResponse> {
        let url = format!("{}/api/library", self.base);
        let resp = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .query(&[
                ("name", name),
                ("start", if start { "true" } else { "false" }),
            ])
            .send()
            .await
            .context("library list failed")?;
        let resp = Self::ensure_ok(resp).await?;
        resp.json()
            .await
            .context("Failed to parse library response")
    }

    /// Fetch a cover (or any authenticated relative/absolute URL) as raw bytes.
    pub async fn fetch_authenticated_bytes(&self, path_or_url: &str) -> Result<(Vec<u8>, String)> {
        let url = if path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
            path_or_url.to_string()
        } else if path_or_url.starts_with('/') {
            format!("{}{}", self.base, path_or_url)
        } else {
            format!("{}/{}", self.base, path_or_url.trim_start_matches('/'))
        };
        let resp = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .send()
            .await
            .context("cover request failed")?;
        let resp = Self::ensure_ok(resp).await?;
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();
        let bytes = resp.bytes().await.context("Failed to read cover body")?;
        Ok((bytes.to_vec(), content_type))
    }

    /// Fetch a Fanqie CDN cover with browser-like headers (no Tomato auth).
    /// Prefer `audio_thumb_uri` / origin JPEG URLs — HEIC thumbs are slow and hard to render.
    pub async fn fetch_public_image(&self, url: &str) -> Result<(Vec<u8>, String)> {
        let url = url.trim();
        if url.is_empty() {
            bail!("empty cover url");
        }
        let request = self
            .http
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
            )
            .header(reqwest::header::REFERER, "https://fanqienovel.com/")
            .header(
                reqwest::header::ACCEPT,
                "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
            )
            .timeout(std::time::Duration::from_secs(8));
        let resp = request.send().await.context("public cover request failed")?;
        let status = resp.status();
        if !status.is_success() {
            bail!("public cover HTTP {status}");
        }
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();
        let bytes = resp.bytes().await.context("Failed to read public cover body")?;
        if bytes.is_empty() {
            bail!("empty cover body");
        }
        // Reject HTML error pages masquerading as images.
        if content_type.contains("text/html") {
            bail!("cover url returned HTML");
        }
        Ok((bytes.to_vec(), content_type))
    }

    pub async fn download_file(&self, rel_path: &str) -> Result<(Vec<u8>, Option<String>)> {
        let encoded = encode_rel_path(rel_path);
        let url = format!("{}/download/{encoded}", self.base);
        let resp = self
            .http
            .get(&url)
            .headers(self.auth_headers()?)
            .send()
            .await
            .context("download failed")?;
        let resp = Self::ensure_ok(resp).await?;
        let filename = resp
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .and_then(parse_content_disposition_filename)
            .or_else(|| {
                std::path::Path::new(rel_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
            });
        let bytes = resp.bytes().await.context("Failed to read download body")?;
        Ok((bytes.to_vec(), filename))
    }
}

fn urlencoding_path(value: &str) -> String {
    // book_id is usually numeric; still percent-encode safely without encoding slashes.
    value
        .split('/')
        .map(|part| {
            let mut out = String::new();
            for b in part.as_bytes() {
                match *b {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                        out.push(*b as char);
                    }
                    _ => out.push_str(&format!("%{b:02X}")),
                }
            }
            out
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn encode_rel_path(rel_path: &str) -> String {
    rel_path
        .split('/')
        .map(urlencoding_path)
        .collect::<Vec<_>>()
        .join("/")
}

fn parse_content_disposition_filename(header: &str) -> Option<String> {
    if let Some(idx) = header.find("filename*=") {
        let rest = &header[idx + "filename*=".len()..];
        let token = rest.split(';').next()?.trim().trim_matches('"');
        if let Some(encoded) = token
            .strip_prefix("UTF-8''")
            .or_else(|| token.strip_prefix("utf-8''"))
        {
            return percent_decode(encoded);
        }
    }
    if let Some(idx) = header.find("filename=") {
        let rest = &header[idx + "filename=".len()..];
        let token = rest.split(';').next()?.trim();
        return Some(token.trim_matches('"').to_string());
    }
    None
}

fn percent_decode(input: &str) -> Option<String> {
    let mut out = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                i += 3;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

/// Prefer Fanqie-style cover fields from search `raw`.
/// Prefer origin JPEG (`audio_thumb_uri`) over signed HEIC thumbs.
pub fn cover_url_from_raw(raw: &serde_json::Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "audio_thumb_uri",
        "horiz_thumb_url",
        "thumb_url",
        "detail_page_thumb_url",
        "expand_thumb_url",
        "audio_thumb_url_hd",
        "cover_url",
        "cover",
        "book_cover",
        "novel_cover",
        "thumbUrl",
        "coverUrl",
    ];

    fn normalize_cover_url(url: &str) -> Option<String> {
        let url = url.trim();
        if url.is_empty() {
            return None;
        }
        // Origin byteimg paths are JPEG without extension; keep as-is.
        if url.contains("byteimg.com/origin/") {
            return Some(url.to_string());
        }
        // Prefer non-HEIC variants when the signed URL embeds `.heic`.
        if url.contains(".heic") {
            let image = url.replace(".heic", ".image");
            if image.starts_with("http") {
                return Some(image);
            }
        }
        Some(url.to_string())
    }

    fn from_object(obj: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
        // Two-pass: first non-HEIC-ish keys, then anything else.
        for key in KEYS {
            if let Some(url) = obj.get(*key).and_then(|v| v.as_str()) {
                let lower = url.to_ascii_lowercase();
                if lower.contains(".heic") {
                    continue;
                }
                if let Some(normalized) = normalize_cover_url(url) {
                    return Some(normalized);
                }
            }
        }
        for key in KEYS {
            if let Some(url) = obj.get(*key).and_then(|v| v.as_str()) {
                if let Some(normalized) = normalize_cover_url(url) {
                    return Some(normalized);
                }
            }
        }
        None
    }

    match raw {
        serde_json::Value::Object(obj) => {
            if let Some(url) = from_object(obj) {
                return Some(url);
            }
            // Nested shapes: book_data[0], data, book
            for nest in ["book_data", "data", "book"] {
                match obj.get(nest) {
                    Some(serde_json::Value::Array(arr)) => {
                        for item in arr {
                            if let Some(url) = cover_url_from_raw(item) {
                                return Some(url);
                            }
                        }
                    }
                    Some(inner) => {
                        if let Some(url) = cover_url_from_raw(inner) {
                            return Some(url);
                        }
                    }
                    None => {}
                }
            }
            None
        }
        serde_json::Value::Array(arr) => arr.iter().find_map(cover_url_from_raw),
        _ => None,
    }
}

pub fn pick_preferred_format(options: &[String]) -> Option<String> {
    options
        .iter()
        .find(|v| v.eq_ignore_ascii_case("epub"))
        .cloned()
        .or_else(|| options.first().cloned())
}

pub fn job_failed_message(job: &JobItem) -> String {
    job.message
        .clone()
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| format!("job {} {}", job.id, job.state))
}

pub fn unexpected_missing_job(id: u64) -> anyhow::Error {
    anyhow!("job {id} not found")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::cover_url_from_raw;

    #[test]
    fn extracts_thumb_url_from_raw() {
        let raw = json!({
            "book_id": "123",
            "thumb_url": "https://cdn.example/cover.jpg"
        });
        assert_eq!(
            cover_url_from_raw(&raw).as_deref(),
            Some("https://cdn.example/cover.jpg")
        );
    }

    #[test]
    fn extracts_nested_book_data_thumb() {
        let raw = json!({
            "book_data": [{
                "thumb_url": "https://cdn.example/nested.jpg",
                "book_name": "三体"
            }]
        });
        assert_eq!(
            cover_url_from_raw(&raw).as_deref(),
            Some("https://cdn.example/nested.jpg")
        );
    }
}
