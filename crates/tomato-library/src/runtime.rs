//! Manage the local Tomato-Novel-Downloader binary and its `--server` process.
//!
//! Release assets follow installer.sh naming:
//! `TomatoNovelDownloader-{platform}-{arch}-v{version}[.exe]`

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};
use tokio::time::sleep;
use tracing::{info, warn};

use crate::config::LOCAL_API_BASE;

const GITHUB_REPO: &str = "zhongbai2333/Tomato-Novel-Downloader";
const MIRROR_BASE: &str = "https://dl.zhongbai233.com/release";
const LOCAL_WEB_ADDR: &str = "127.0.0.1:18423";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DownloaderPhase {
    Missing,
    Installing,
    Ready,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloaderStatus {
    pub phase: DownloaderPhase,
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub api_base: String,
    pub message: Option<String>,
    /// 0.0..=1.0 while installing; null otherwise.
    pub install_progress: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstallManifest {
    version: String,
    tag: String,
    binary_name: String,
    installed_at: String,
}

struct RuntimeInner {
    child: Option<Child>,
    phase: DownloaderPhase,
    message: Option<String>,
    install_progress: Option<f64>,
    installing: bool,
}

pub struct TomatoDownloaderRuntime {
    inner: Mutex<RuntimeInner>,
}

impl Default for TomatoDownloaderRuntime {
    fn default() -> Self {
        Self {
            inner: Mutex::new(RuntimeInner {
                child: None,
                phase: DownloaderPhase::Missing,
                message: None,
                install_progress: None,
                installing: false,
            }),
        }
    }
}

static RUNTIME: OnceLock<Arc<TomatoDownloaderRuntime>> = OnceLock::new();

pub fn runtime() -> Arc<TomatoDownloaderRuntime> {
    RUNTIME
        .get_or_init(|| Arc::new(TomatoDownloaderRuntime::default()))
        .clone()
}

impl TomatoDownloaderRuntime {
    pub fn status(&self) -> DownloaderStatus {
        let installed = resolve_binary_path().ok().filter(|path| path.is_file());
        let version = read_manifest()
            .ok()
            .map(|manifest| manifest.version);
        let mut guard = self.inner.lock().expect("tomato runtime lock");
        refresh_child_locked(&mut guard);

        // App restarts drop the Child handle; still treat a live local server as running.
        let server_up = probe_local_server_blocking();

        if server_up {
            guard.phase = DownloaderPhase::Running;
            if guard.message.is_none()
                || guard
                    .message
                    .as_deref()
                    .is_some_and(|msg| msg.contains("已退出") || msg.contains("正在启动"))
            {
                guard.message = Some(format!("本机服务已在运行（{LOCAL_API_BASE}）"));
            }
        } else if matches!(guard.phase, DownloaderPhase::Running) && guard.child.is_none() {
            guard.phase = if installed.is_some() {
                DownloaderPhase::Ready
            } else {
                DownloaderPhase::Missing
            };
            guard.message = Some("本机服务已退出".to_string());
        } else if guard.installing {
            guard.phase = DownloaderPhase::Installing;
        } else if installed.is_some()
            && !matches!(
                guard.phase,
                DownloaderPhase::Starting
                    | DownloaderPhase::Stopping
                    | DownloaderPhase::Error
                    | DownloaderPhase::Installing
            )
        {
            guard.phase = DownloaderPhase::Ready;
        } else if installed.is_none()
            && !matches!(
                guard.phase,
                DownloaderPhase::Installing | DownloaderPhase::Error
            )
        {
            guard.phase = DownloaderPhase::Missing;
        }

        DownloaderStatus {
            phase: guard.phase,
            installed: installed.is_some(),
            running: matches!(guard.phase, DownloaderPhase::Running) || server_up,
            version,
            binary_path: installed.map(|path| path.to_string_lossy().into_owned()),
            api_base: LOCAL_API_BASE.to_string(),
            message: guard.message.clone(),
            install_progress: guard.install_progress,
        }
    }

    pub async fn install_latest(&self) -> Result<DownloaderStatus> {
        info!(target: "tomato_downloader", "install requested");
        {
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            if guard.installing {
                warn!(target: "tomato_downloader", "install rejected: already installing");
                bail!("番茄下载器正在安装中");
            }
            if guard.child.is_some() || probe_local_server_blocking() {
                warn!(
                    target: "tomato_downloader",
                    child_tracked = guard.child.is_some(),
                    port_busy = probe_local_server_blocking(),
                    "install rejected: downloader still running"
                );
                bail!("请先停止正在运行的番茄下载器，再安装或更新");
            }
            guard.installing = true;
            guard.phase = DownloaderPhase::Installing;
            guard.message = Some("正在获取最新版本…".to_string());
            guard.install_progress = Some(0.05);
        }

        let result = self.install_latest_inner().await;

        let mut guard = self.inner.lock().expect("tomato runtime lock");
        guard.installing = false;
        guard.install_progress = None;
        match &result {
            Ok(()) => {
                guard.phase = DownloaderPhase::Ready;
                guard.message = Some("安装完成".to_string());
                info!(target: "tomato_downloader", "install completed");
            }
            Err(error) => {
                guard.phase = DownloaderPhase::Error;
                guard.message = Some(error.to_string());
                warn!(target: "tomato_downloader", error = %error, "install failed");
            }
        }
        drop(guard);
        result?;
        Ok(self.status())
    }

    async fn install_latest_inner(&self) -> Result<()> {
        let tag = fetch_latest_tag().await?;
        let version = tag.trim_start_matches('v').to_string();
        self.set_progress(0.15, format!("最新版本 {tag}，准备下载…"));

        let asset = platform_asset_name(&version)?;
        let install_dir = install_dir()?;
        fs::create_dir_all(&install_dir)
            .with_context(|| format!("创建安装目录失败: {}", install_dir.display()))?;

        let staged = install_dir.join(format!("{asset}.partial"));
        let final_path = install_dir.join(canonical_binary_name(&asset));

        let urls = [
            format!("{MIRROR_BASE}/{tag}/{asset}"),
            format!("https://github.com/{GITHUB_REPO}/releases/download/{tag}/{asset}"),
        ];

        let mut last_error = None;
        let mut downloaded = false;
        for (index, url) in urls.iter().enumerate() {
            self.set_progress(
                0.2 + index as f64 * 0.05,
                format!("正在下载 {asset}…"),
            );
            match download_file(url, &staged).await {
                Ok(()) => {
                    downloaded = true;
                    break;
                }
                Err(error) => {
                    last_error = Some(error);
                }
            }
        }
        if !downloaded {
            return Err(last_error.unwrap_or_else(|| anyhow!("下载失败")));
        }

        self.set_progress(0.85, "正在安装…");
        if final_path.exists() {
            fs::remove_file(&final_path).ok();
        }
        fs::rename(&staged, &final_path)
            .with_context(|| format!("写入二进制失败: {}", final_path.display()))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&final_path)?.permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&final_path, permissions)?;
            let _ = Command::new("xattr")
                .args(["-d", "com.apple.quarantine"])
                .arg(&final_path)
                .status();
        }

        let manifest = InstallManifest {
            version: version.clone(),
            tag: tag.clone(),
            binary_name: canonical_binary_name(&asset),
            installed_at: chrono_like_now(),
        };
        fs::write(
            manifest_path()?,
            serde_json::to_string_pretty(&manifest)?,
        )?;

        self.set_progress(1.0, "安装完成");
        Ok(())
    }

    pub async fn start_server(&self) -> Result<DownloaderStatus> {
        let binary = resolve_binary_path().context("尚未安装番茄下载器")?;
        info!(
            target: "tomato_downloader",
            binary = %binary.display(),
            api_base = LOCAL_API_BASE,
            "start requested"
        );
        {
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            refresh_child_locked(&mut guard);
            info!(
                target: "tomato_downloader",
                phase = ?guard.phase,
                child_tracked = guard.child.is_some(),
                "start: refreshed tracked child"
            );
        }

        // Reattach if a previous app session (or manual launch) already owns the port.
        if probe_local_server().await {
            info!(
                target: "tomato_downloader",
                api_base = LOCAL_API_BASE,
                "start: port already ready, adopting existing server"
            );
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            guard.phase = DownloaderPhase::Running;
            guard.message = Some(format!("本机服务已在运行（{LOCAL_API_BASE}）"));
            persist_local_api_base();
            return Ok(self.status_unlocked(&guard));
        }

        {
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            guard.phase = DownloaderPhase::Starting;
            guard.message = Some("正在启动本机番茄下载服务…".to_string());
        }

        let log_dir = install_dir()?.join("logs");
        fs::create_dir_all(&log_dir).ok();
        let stderr_path = log_dir.join("server.stderr.log");
        let stderr_file = fs::File::create(&stderr_path).ok();

        let data_dir = install_dir()?;
        info!(
            target: "tomato_downloader",
            data_dir = %data_dir.display(),
            stderr_log = %stderr_path.display(),
            "start: spawning --server process"
        );
        let mut command = Command::new(&binary);
        command
            .arg("--server")
            .arg("--data-dir")
            .arg(&data_dir)
            .env("TOMATO_WEB_ADDR", LOCAL_WEB_ADDR)
            .current_dir(&data_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null());
        if let Some(file) = stderr_file {
            command.stderr(Stdio::from(file));
        } else {
            command.stderr(Stdio::null());
        }

        // Stay out of the app / script process group so unrelated SIGINT cleanup
        // (utils::process::kill_process_group) cannot take this server down.
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                command.pre_exec(|| {
                    if libc::setsid() == -1 {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
            command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
        }

        let child = command
            .spawn()
            .with_context(|| format!("启动失败: {}", binary.display()))?;
        let child_pid = child.id();
        info!(
            target: "tomato_downloader",
            pid = child_pid,
            "start: process spawned, waiting for port readiness"
        );

        {
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            guard.child = Some(child);
        }

        // Cold start often spends several seconds on Tomato's network "IID 预热"
        // before binding 18423. Wait long enough, and never kill a still-live child
        // just because the first window expired — that was aborting healthy starts.
        const READY_ATTEMPTS: u32 = 120; // ~60s at 500ms
        for attempt in 0..READY_ATTEMPTS {
            if probe_local_server().await {
                let waited_ms = (attempt + 1) * 500;
                info!(
                    target: "tomato_downloader",
                    pid = child_pid,
                    waited_ms,
                    api_base = LOCAL_API_BASE,
                    "start: port ready"
                );
                let mut guard = self.inner.lock().expect("tomato runtime lock");
                guard.phase = DownloaderPhase::Running;
                guard.message = Some(format!("本机服务已启动（{LOCAL_API_BASE}）"));
                persist_local_api_base();
                // Must use status_unlocked: Mutex is not reentrant.
                return Ok(self.status_unlocked(&guard));
            }
            {
                let mut guard = self.inner.lock().expect("tomato runtime lock");
                refresh_child_locked(&mut guard);
                if guard.child.is_none() {
                    // Port may already be owned by an orphan from a prior session.
                    if probe_local_server_blocking() {
                        info!(
                            target: "tomato_downloader",
                            "start: tracked child exited but port is live; adopting"
                        );
                        guard.phase = DownloaderPhase::Running;
                        guard.message =
                            Some(format!("本机服务已在运行（{LOCAL_API_BASE}）"));
                        persist_local_api_base();
                        return Ok(self.status_unlocked(&guard));
                    }
                    let detail = fs::read_to_string(&stderr_path).unwrap_or_default();
                    let detail = detail.trim();
                    warn!(
                        target: "tomato_downloader",
                        pid = child_pid,
                        stderr = %detail,
                        "start: process exited before port was ready"
                    );
                    bail!(
                        "番茄下载器进程已退出，服务未就绪{}",
                        if detail.is_empty() {
                            String::new()
                        } else {
                            format!("：{detail}")
                        }
                    );
                }
                if attempt == 20 || attempt == 60 {
                    let waited_s = (attempt + 1) / 2;
                    info!(
                        target: "tomato_downloader",
                        pid = child_pid,
                        waited_s,
                        "start: still waiting (network prewarm)"
                    );
                    guard.message = Some(format!(
                        "正在启动（网络预热中，已等待 ~{waited_s}s）…"
                    ));
                }
            }
            sleep(Duration::from_millis(500)).await;
        }

        // Last chance: process may have bound between probes.
        if probe_local_server().await {
            info!(
                target: "tomato_downloader",
                pid = child_pid,
                "start: port ready on final probe"
            );
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            guard.phase = DownloaderPhase::Running;
            guard.message = Some(format!("本机服务已启动（{LOCAL_API_BASE}）"));
            persist_local_api_base();
            return Ok(self.status_unlocked(&guard));
        }

        // Leave a live child alone — killing it on timeout caused repeated failures.
        {
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            refresh_child_locked(&mut guard);
            if guard.child.is_some() || probe_local_server_blocking() {
                warn!(
                    target: "tomato_downloader",
                    pid = child_pid,
                    child_tracked = guard.child.is_some(),
                    port_busy = probe_local_server_blocking(),
                    "start: timed out waiting for port; leaving process running"
                );
                guard.phase = DownloaderPhase::Starting;
                guard.message = Some(
                    "启动较慢（网络预热）。进程仍在运行，请稍后点刷新。"
                        .to_string(),
                );
                return Ok(self.status_unlocked(&guard));
            }
        }

        let detail = fs::read_to_string(&stderr_path).unwrap_or_default();
        let detail = detail.trim();
        warn!(
            target: "tomato_downloader",
            pid = child_pid,
            stderr = %detail,
            "start failed: process gone and port not ready"
        );
        bail!(
            "启动失败：本机服务未在 {LOCAL_API_BASE} 就绪{}",
            if detail.is_empty() {
                String::new()
            } else {
                format!("：{detail}")
            }
        );
    }

    pub async fn stop_server(&self) -> Result<DownloaderStatus> {
        info!(target: "tomato_downloader", "stop requested");
        let tracked_pid = {
            let mut guard = self.inner.lock().expect("tomato runtime lock");
            guard.phase = DownloaderPhase::Stopping;
            guard.message = Some("正在停止本机服务…".to_string());
            if let Some(mut child) = guard.child.take() {
                let pid = child.id();
                info!(target: "tomato_downloader", pid, "stop: killing tracked child");
                let kill_result = child.kill();
                let wait_result = child.wait();
                info!(
                    target: "tomato_downloader",
                    pid,
                    kill_ok = kill_result.is_ok(),
                    wait = ?wait_result.as_ref().ok().map(|status| status.to_string()),
                    "stop: tracked child finished"
                );
                Some(pid)
            } else {
                info!(target: "tomato_downloader", "stop: no tracked child handle");
                None
            }
        };

        // Also stop an orphaned listener left from a previous app session.
        let port_busy_before = probe_local_server_blocking();
        if port_busy_before {
            info!(
                target: "tomato_downloader",
                tracked_pid,
                "stop: port still busy, killing listeners on 18423"
            );
            match kill_local_server_listeners() {
                Ok(()) => info!(target: "tomato_downloader", "stop: listener cleanup issued"),
                Err(error) => warn!(
                    target: "tomato_downloader",
                    error = %error,
                    "stop: listener cleanup failed"
                ),
            }
        } else {
            info!(target: "tomato_downloader", "stop: port already free");
        }

        sleep(Duration::from_millis(300)).await;
        let mut guard = self.inner.lock().expect("tomato runtime lock");
        let port_busy_after = probe_local_server_blocking();
        if port_busy_after {
            warn!(target: "tomato_downloader", "stop: port 18423 still occupied");
            guard.phase = DownloaderPhase::Error;
            guard.message = Some(
                "未能释放 18423 端口。请手动结束 TomatoNovelDownloader 进程后重试。"
                    .to_string(),
            );
        } else if resolve_binary_path().ok().is_some_and(|path| path.is_file()) {
            info!(target: "tomato_downloader", "stop completed; service ready to start again");
            guard.phase = DownloaderPhase::Ready;
            guard.message = Some("本机服务已停止".to_string());
        } else {
            info!(target: "tomato_downloader", "stop completed; binary missing");
            guard.phase = DownloaderPhase::Missing;
            guard.message = None;
        }
        Ok(self.status_unlocked(&guard))
    }

    fn set_progress(&self, progress: f64, message: impl Into<String>) {
        let mut guard = self.inner.lock().expect("tomato runtime lock");
        guard.install_progress = Some(progress.clamp(0.0, 1.0));
        guard.message = Some(message.into());
        guard.phase = DownloaderPhase::Installing;
    }

    fn status_unlocked(&self, guard: &RuntimeInner) -> DownloaderStatus {
        let installed = resolve_binary_path().ok().filter(|path| path.is_file());
        let version = read_manifest().ok().map(|manifest| manifest.version);
        DownloaderStatus {
            phase: guard.phase,
            installed: installed.is_some(),
            running: matches!(guard.phase, DownloaderPhase::Running),
            version,
            binary_path: installed.map(|path| path.to_string_lossy().into_owned()),
            api_base: LOCAL_API_BASE.to_string(),
            message: guard.message.clone(),
            install_progress: guard.install_progress,
        }
    }
}

fn refresh_child_locked(guard: &mut RuntimeInner) {
    if let Some(child) = guard.child.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                guard.child = None;
                // Do not demote to Ready here if an orphaned server still answers —
                // status()/start_server() will reattach via probe.
                if matches!(guard.phase, DownloaderPhase::Starting) {
                    guard.message = Some("番茄下载器进程已退出".to_string());
                }
            }
            Ok(None) => {}
            Err(_) => {
                guard.child = None;
            }
        }
    }
}

fn persist_local_api_base() {
    if let Ok(mut cfg) = crate::TomatoLibraryConfigManager::load() {
        cfg.api_base = LOCAL_API_BASE.to_string();
        cfg.api_password.clear();
        let _ = crate::TomatoLibraryConfigManager::save(&cfg);
    }
}

fn kill_local_server_listeners() -> Result<()> {
    #[cfg(unix)]
    {
        let output = Command::new("lsof")
            .args(["-nP", "-tiTCP:18423", "-sTCP:LISTEN"])
            .output()
            .context("lsof 查找 18423 占用进程失败")?;
        if !output.status.success() && output.stdout.is_empty() {
            return Ok(());
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        for pid in stdout.split_whitespace() {
            let Ok(pid) = pid.parse::<i32>() else {
                continue;
            };
            let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).status();
        }
        return Ok(());
    }
    #[cfg(windows)]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-NetTCPConnection -LocalPort 18423 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }",
            ])
            .output()
            .context("查找 18423 占用进程失败")?;
        let _ = output;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

fn install_dir() -> Result<PathBuf> {
    let base = dirs::data_local_dir().context("无法确定本机数据目录")?;
    Ok(base.join("minimalist-canvas").join("tomato-novel-downloader"))
}

fn manifest_path() -> Result<PathBuf> {
    Ok(install_dir()?.join("manifest.json"))
}

fn read_manifest() -> Result<InstallManifest> {
    let data = fs::read_to_string(manifest_path()?)?;
    Ok(serde_json::from_str(&data)?)
}

fn resolve_binary_path() -> Result<PathBuf> {
    let dir = install_dir()?;
    if let Ok(manifest) = read_manifest() {
        let path = dir.join(&manifest.binary_name);
        if path.is_file() {
            return Ok(path);
        }
    }

    // Fall back to any known platform binary sitting in the install dir.
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
            if name.starts_with("TomatoNovelDownloader-") && path.is_file() {
                return Ok(path);
            }
        }
    }
    bail!("binary missing");
}

fn canonical_binary_name(asset: &str) -> String {
    // TomatoNovelDownloader-macOS_arm64-v2.4.18 -> TomatoNovelDownloader-macOS_arm64
    // TomatoNovelDownloader-Win64-v2.4.18.exe -> TomatoNovelDownloader-Win64.exe
    if let Some((stem, _)) = asset.rsplit_once("-v") {
        if asset.ends_with(".exe") {
            return format!("{stem}.exe");
        }
        return stem.to_string();
    }
    asset.to_string()
}

fn platform_asset_name(version: &str) -> Result<String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let name = match (os, arch) {
        ("macos", "aarch64") => format!("TomatoNovelDownloader-macOS_arm64-v{version}"),
        ("macos", "x86_64") => format!("TomatoNovelDownloader-macOS_amd64-v{version}"),
        ("linux", "x86_64") => format!("TomatoNovelDownloader-Linux_amd64-v{version}"),
        ("linux", "aarch64") => format!("TomatoNovelDownloader-Linux_arm64-v{version}"),
        ("windows", "x86_64") => format!("TomatoNovelDownloader-Win64-v{version}.exe"),
        ("windows", "aarch64") => format!("TomatoNovelDownloader-WinArm64-v{version}.exe"),
        _ => bail!("当前系统暂不支持自动安装番茄下载器（{os}/{arch}）"),
    };
    Ok(name)
}

async fn fetch_latest_tag() -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Minimalist-Canvas")
        .build()?;

    // Prefer GitHub API; fall back to releases/latest redirect.
    let api = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    if let Ok(response) = client.get(&api).send().await {
        if response.status().is_success() {
            let body: serde_json::Value = response.json().await?;
            if let Some(tag) = body.get("tag_name").and_then(|value| value.as_str()) {
                return Ok(tag.to_string());
            }
        }
    }

    let latest = format!("https://github.com/{GITHUB_REPO}/releases/latest");
    let response = client
        .get(latest)
        .send()
        .await
        .context("无法访问 GitHub Releases")?;
    let final_url = response.url().clone();
    if let Some(tag) = final_url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|segment| segment.starts_with('v'))
    {
        return Ok(tag.to_string());
    }
    bail!("无法解析番茄下载器最新版本号");
}

async fn download_file(url: &str, destination: &Path) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .user_agent("Minimalist-Canvas")
        .build()?;
    let response = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("请求失败: {url}"))?;
    if !response.status().is_success() {
        bail!("下载失败 HTTP {}: {url}", response.status());
    }
    let bytes = response.bytes().await.context("读取下载内容失败")?;
    if bytes.len() < 1_000_000 {
        bail!("下载内容过小，可能不是有效二进制（{} bytes）", bytes.len());
    }
    let mut file = fs::File::create(destination)
        .with_context(|| format!("无法写入 {}", destination.display()))?;
    file.write_all(&bytes)?;
    Ok(())
}

async fn probe_local_server() -> bool {
    // TCP bind is the readiness signal; avoid HTTP client timeouts on every miss.
    tokio::task::spawn_blocking(probe_local_server_blocking)
        .await
        .unwrap_or(false)
}

fn probe_local_server_blocking() -> bool {
    use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
    let Ok(mut addrs) = "127.0.0.1:18423".to_socket_addrs() else {
        return false;
    };
    let Some(addr) = addrs.next() else {
        return false;
    };
    TcpStream::connect_timeout(&SocketAddr::from(addr), Duration::from_millis(200)).is_ok()
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

#[cfg(test)]
mod tests {
    use super::{canonical_binary_name, platform_asset_name};

    #[test]
    fn canonical_binary_name_strips_version_suffix() {
        assert_eq!(
            canonical_binary_name("TomatoNovelDownloader-macOS_arm64-v2.4.18"),
            "TomatoNovelDownloader-macOS_arm64"
        );
        assert_eq!(
            canonical_binary_name("TomatoNovelDownloader-Win64-v2.4.18.exe"),
            "TomatoNovelDownloader-Win64.exe"
        );
    }

    #[test]
    fn platform_asset_name_covers_common_targets() {
        // Smoke: function returns for host; exact string covered in installer.sh docs.
        let version = "2.4.18";
        let name = platform_asset_name(version).expect("host platform supported");
        assert!(name.contains(version));
        assert!(name.starts_with("TomatoNovelDownloader-"));
    }
}
