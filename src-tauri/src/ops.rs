use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsRunRequest {
    pub request: Value,
    /// Absolute path to a temp request JSON file. Preferred over embedding large payloads.
    pub request_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpsProgressPayload {
    pub job_id: String,
    pub event: Value,
}

pub struct OpsState {
    pub active: Mutex<Option<u32>>,
}

impl Default for OpsState {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}

fn env_ops_runner_dir() -> Option<PathBuf> {
    let path = std::env::var_os("OPS_RUNNER_DIR")?;
    let candidate = PathBuf::from(path);
    if candidate.join("cli.ts").exists() {
        return Some(candidate);
    }
    None
}

fn sibling_ops_runner_dir() -> Option<PathBuf> {
    // App repo: …/Minimalist-Canvas/src-tauri → sibling …/minimalist-canvas-ops-runner
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let desktop = manifest_dir.join("..").join("..");
    for name in [
        "minimalist-canvas-ops-runner",
        "Minimalist-Canvas-Ops",
        "ops-runner",
    ] {
        let candidate = desktop.join(name);
        if candidate.join("cli.ts").exists() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_ops_runner(_app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = env_ops_runner_dir() {
        return Ok(dir);
    }
    if let Some(dir) = sibling_ops_runner_dir() {
        return Ok(dir);
    }
    Err(
        "Ops runner not found. Clone/keep `minimalist-canvas-ops-runner` as a Desktop sibling of Minimalist-Canvas, or set OPS_RUNNER_DIR."
            .into(),
    )
}

fn resolve_bun() -> PathBuf {
    if let Ok(path) = std::env::var("BUN_PATH") {
        let p = PathBuf::from(path);
        if p.exists() {
            return p;
        }
    }
    for candidate in [
        "/opt/homebrew/bin/bun",
        "/usr/local/bin/bun",
        "bun",
    ] {
        let p = PathBuf::from(candidate);
        if candidate == "bun" || p.exists() {
            return p;
        }
    }
    PathBuf::from("bun")
}

fn write_request_file(path: &Path, request: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(serde_json::to_string(request).map_err(|e| e.to_string())?.as_bytes())
        .map_err(|e| e.to_string())
}

fn kill_pid(pid: u32) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).status();
        std::thread::sleep(std::time::Duration::from_millis(250));
        let _ = Command::new("kill").args(["-KILL", &pid.to_string()]).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}

#[tauri::command]
pub fn ops_runner_available(app: AppHandle) -> Result<bool, String> {
    Ok(resolve_ops_runner(&app).is_ok())
}

#[tauri::command]
pub fn ops_cancel(state: State<'_, OpsState>) -> Result<bool, String> {
    let pid = {
        let mut active = state.active.lock().map_err(|_| "lock poisoned".to_string())?;
        active.take()
    };
    if let Some(pid) = pid {
        if pid > 0 {
            kill_pid(pid);
            return Ok(true);
        }
    }
    Ok(false)
}

/// Async so the UI thread stays responsive while Playwright runs.
#[tauri::command]
pub async fn ops_run(
    app: AppHandle,
    state: State<'_, OpsState>,
    job_id: String,
    payload: OpsRunRequest,
) -> Result<Value, String> {
    {
        let mut active = state.active.lock().map_err(|_| "lock poisoned".to_string())?;
        if active.is_some() {
            return Err("Another ops job is already running".into());
        }
        *active = Some(0);
    }

    let app_clone = app.clone();
    let job_clone = job_id.clone();
    let payload_clone = OpsRunRequest {
        request: payload.request.clone(),
        request_path: payload.request_path.clone(),
    };

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_ops_blocking(app_clone, job_clone, payload_clone)
    })
    .await
    .map_err(|e| format!("ops worker panicked: {e}"))?;

    // Clear active unless cancel already cleared it mid-flight.
    if let Ok(mut active) = state.active.lock() {
        *active = None;
    }

    result
}

fn run_ops_blocking(
    app: AppHandle,
    job_id: String,
    payload: OpsRunRequest,
) -> Result<Value, String> {
    let runner_dir = resolve_ops_runner(&app)?;
    let cli = runner_dir.join("cli.ts");
    if !cli.exists() {
        return Err(format!("Missing {}", cli.display()));
    }

    let request_path = if let Some(path) = payload.request_path.clone() {
        let p = PathBuf::from(&path);
        if !p.exists() {
            write_request_file(&p, &payload.request)?;
        }
        p
    } else {
        let tmp = std::env::temp_dir().join(format!("mc-ops-{job_id}.json"));
        write_request_file(&tmp, &payload.request)?;
        tmp
    };

    let bun = resolve_bun();
    let arg = format!("@{}", request_path.display());

    let mut child: Child = Command::new(&bun)
        .arg("run")
        .arg(&cli)
        .arg(&arg)
        .current_dir(&runner_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "BUN_NOT_FOUND: install Bun (https://bun.sh) to run ops-runner".to_string()
            } else {
                error.to_string()
            }
        })?;

    let child_pid = child.id();
    if let Some(state) = app.try_state::<OpsState>() {
        if let Ok(mut active) = state.active.lock() {
            *active = Some(child_pid);
        }
    }

    let _ = app.emit(
        "ops-progress",
        OpsProgressPayload {
            job_id: job_id.clone(),
            event: serde_json::json!({
                "type": "progress",
                "message": format!("Runner started (pid {child_pid})")
            }),
        },
    );

    let stdout = child.stdout.take().ok_or_else(|| "missing stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "missing stderr".to_string())?;

    let app_for_stdout = app.clone();
    let job_for_stdout = job_id.clone();
    let stdout_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut last_done: Option<Value> = None;
        let mut last_error: Option<String> = None;
        for line in reader.lines().flatten() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let event: Value = match serde_json::from_str(trimmed) {
                Ok(value) => value,
                Err(_) => serde_json::json!({ "type": "progress", "message": trimmed }),
            };
            if event.get("type").and_then(|v| v.as_str()) == Some("done") {
                last_done = event.get("result").cloned();
            }
            if event.get("type").and_then(|v| v.as_str()) == Some("error") {
                last_error = event
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            let _ = app_for_stdout.emit(
                "ops-progress",
                OpsProgressPayload {
                    job_id: job_for_stdout.clone(),
                    event,
                },
            );
        }
        (last_done, last_error)
    });

    let stderr_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let mut lines = Vec::new();
        for line in reader.lines().flatten() {
            lines.push(line);
        }
        lines.join("\n")
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let (last_done, last_error) = stdout_thread.join().unwrap_or((None, None));
    let stderr_text = stderr_thread.join().unwrap_or_default();

    if !status.success() {
        let message = last_error
            .filter(|s| !s.is_empty())
            .or_else(|| {
                let trimmed = stderr_text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
            .unwrap_or_else(|| format!("ops-runner exited with status {status}"));
        // Cancelled processes often look like SIGTERM / exit 143 / 9.
        if message.contains("SIGTERM")
            || message.contains("signal: 15")
            || status.code() == Some(143)
            || status.code() == Some(9)
        {
            return Err("OPS_CANCELLED".into());
        }
        return Err(message);
    }

    Ok(last_done.unwrap_or_else(|| serde_json::json!({ "ok": true })))
}
