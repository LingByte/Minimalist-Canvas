//! Tomato library settings: local Tomato `--server` + storage path.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

pub const LOCAL_API_BASE: &str = "http://127.0.0.1:18423";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TomatoLibraryConfig {
    /// Kept for config-file compatibility; always resolved to the local server.
    #[serde(default = "default_api_base")]
    pub api_base: String,
    /// Kept for config-file compatibility; local server needs no password.
    #[serde(default)]
    pub api_password: String,
    /// Absolute path where downloaded books are stored.
    #[serde(default)]
    pub library_path: String,
}

fn default_api_base() -> String {
    LOCAL_API_BASE.to_string()
}

pub fn local_api_base() -> &'static str {
    LOCAL_API_BASE
}

impl Default for TomatoLibraryConfig {
    fn default() -> Self {
        Self {
            api_base: default_api_base(),
            api_password: String::new(),
            library_path: String::new(),
        }
    }
}

impl TomatoLibraryConfig {
    pub fn resolve_api_base(&self) -> String {
        // Product path is always the locally managed Tomato `--server`.
        LOCAL_API_BASE.trim_end_matches('/').to_string()
    }

    pub fn resolve_api_password(&self) -> Result<String> {
        Ok(String::new())
    }

    pub fn resolve_library_path(&self) -> Result<PathBuf> {
        if !self.library_path.trim().is_empty() {
            return Ok(PathBuf::from(self.library_path.trim()));
        }
        Ok(default_library_path()?)
    }

    pub fn ensure_library_dir(&self) -> Result<PathBuf> {
        let path = self.resolve_library_path()?;
        std::fs::create_dir_all(&path)
            .with_context(|| format!("Failed to create library directory {}", path.display()))?;
        Ok(path)
    }
}

/// Default novel library folder (downloaded books).
///
/// - macOS: `~/Documents/Minimalist-Canvas/Library`
/// - Windows: `%USERPROFILE%\Documents\Minimalist-Canvas\Library`
///   (falls back to `%LOCALAPPDATA%\Minimalist-Canvas\Library`)
/// - Linux: `~/Documents/Minimalist-Canvas/Library`
pub fn default_library_path() -> Result<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Some(docs) = dirs::document_dir() {
            return Ok(docs.join("Minimalist-Canvas").join("Library"));
        }
        let local = dirs::data_local_dir().context("无法确定 LOCALAPPDATA")?;
        return Ok(local.join("Minimalist-Canvas").join("Library"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let docs = dirs::document_dir().context("无法确定 Documents 目录")?;
        Ok(docs.join("Minimalist-Canvas").join("Library"))
    }
}

pub struct TomatoLibraryConfigManager;

impl TomatoLibraryConfigManager {
    fn config_path() -> Result<PathBuf> {
        // Prefer the Tauri app data root; keep reading the legacy path if present.
        let preferred = {
            let base = dirs::data_local_dir().context("无法确定本机数据目录")?;
            base.join("com.lingbyte.minimalist-canvas")
                .join("tomato-library.json")
        };
        if preferred.exists() {
            return Ok(preferred);
        }
        let legacy = {
            let base = dirs::config_dir().context("无法确定配置目录")?;
            base.join("minimalist-canvas").join("tomato-library.json")
        };
        if legacy.exists() {
            return Ok(legacy);
        }
        Ok(preferred)
    }

    pub fn load() -> Result<TomatoLibraryConfig> {
        let path = Self::config_path()?;
        if !path.exists() {
            return Ok(TomatoLibraryConfig::default());
        }
        let data = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read {}", path.display()))?;
        let cfg: TomatoLibraryConfig = serde_json::from_str(&data)
            .with_context(|| format!("Failed to parse {}", path.display()))?;
        Ok(cfg)
    }

    pub fn save(cfg: &TomatoLibraryConfig) -> Result<()> {
        let path = Self::config_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create {}", parent.display()))?;
        }
        let data = serde_json::to_string_pretty(cfg)?;
        std::fs::write(&path, data)
            .with_context(|| format!("Failed to write {}", path.display()))?;
        Ok(())
    }
}
