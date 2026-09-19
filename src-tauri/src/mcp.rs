use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

const DEFAULT_PORT: u16 = 17371;
const TOOL_CALL_TIMEOUT: Duration = Duration::from_secs(120);

type PendingMap = HashMap<u64, oneshot::Sender<Result<Value, String>>>;

pub struct McpBridge {
    app: AppHandle,
    endpoint: Mutex<String>,
    pending: Mutex<PendingMap>,
    next_request_id: AtomicU64,
}

impl McpBridge {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            endpoint: Mutex::new(String::new()),
            pending: Mutex::new(HashMap::new()),
            next_request_id: AtomicU64::new(1),
        }
    }
}

#[tauri::command]
pub fn mcp_endpoint(state: tauri::State<'_, Arc<McpBridge>>) -> String {
    state.endpoint.lock().map(|v| v.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn mcp_tool_result(
    state: tauri::State<'_, Arc<McpBridge>>,
    request_id: u64,
    ok: bool,
    payload: Value,
) -> Result<(), String> {
    let sender = state
        .pending
        .lock()
        .map_err(|_| "lock poisoned".to_string())?
        .remove(&request_id);
    match sender {
        Some(tx) => {
            let value = if ok { Ok(payload) } else { Err(payload.as_str().map(str::to_string).unwrap_or_else(|| payload.to_string())) };
            let _ = tx.send(value);
            Ok(())
        }
        None => Err("unknown request id".to_string()),
    }
}

fn codex_candidates() -> Vec<(String, Vec<String>)> {
    let mut candidates: Vec<(String, Vec<String>)> = Vec::new();
    // Installed binary: %LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe — works even
    // when the app's PATH predates the user's PATH changes.
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let bin = std::path::Path::new(&local).join("OpenAI").join("Codex").join("bin");
        if let Ok(entries) = std::fs::read_dir(&bin) {
            let mut exes: Vec<std::path::PathBuf> = entries
                .flatten()
                .map(|entry| entry.path().join("codex.exe"))
                .filter(|path| path.exists())
                .collect();
            exes.sort();
            for exe in exes.into_iter().rev() {
                candidates.push((exe.to_string_lossy().into_owned(), Vec::new()));
            }
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        let wrapper = std::path::Path::new(&home).join("bin").join("codex.cmd");
        if wrapper.exists() {
            candidates.push(("cmd".to_string(), vec!["/c".to_string(), wrapper.to_string_lossy().into_owned()]));
        }
    }
    candidates.push(("codex".to_string(), Vec::new()));
    candidates.push(("cmd".to_string(), vec!["/c".to_string(), "codex".to_string()]));
    candidates
}

fn run_codex(args: &[&str]) -> Result<String, String> {
    let mut last_error = "codex not found".to_string();
    for (program, prefix) in codex_candidates() {
        let argv: Vec<String> = prefix.iter().cloned().chain(args.iter().map(|s| s.to_string())).collect();
        match std::process::Command::new(&program).args(&argv).output() {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return Ok(if stdout.is_empty() { "ok".to_string() } else { stdout });
            }
            Ok(output) => last_error = String::from_utf8_lossy(&output.stderr).trim().to_string(),
            Err(error) => last_error = error.to_string(),
        }
    }
    Err(last_error)
}

#[tauri::command]
pub fn mcp_registered(state: tauri::State<'_, Arc<McpBridge>>) -> bool {
    let endpoint = state.endpoint.lock().map(|v| v.clone()).unwrap_or_default();
    if endpoint.is_empty() {
        return false;
    }
    let config_path = std::env::var("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|_| std::env::var("USERPROFILE").map(|home| std::path::Path::new(&home).join(".codex")))
        .map(|dir| dir.join("config.toml"));
    let Ok(config_path) = config_path else { return false };
    let Ok(config) = std::fs::read_to_string(config_path) else { return false };
    config.contains("infinite-canvas") && config.contains(&endpoint)
}

#[tauri::command]
pub fn register_codex_mcp(state: tauri::State<'_, Arc<McpBridge>>) -> Result<String, String> {
    let endpoint = state.endpoint.lock().map_err(|_| "lock poisoned".to_string())?.clone();
    if endpoint.is_empty() {
        return Err("MCP server not started".to_string());
    }
    let _ = run_codex(&["mcp", "remove", "infinite-canvas"]);
    run_codex(&["mcp", "add", "infinite-canvas", "--url", &endpoint])
}

pub fn spawn_mcp_server(app: &AppHandle) -> Arc<McpBridge> {
    let bridge = Arc::new(McpBridge::new(app.clone()));
    let state = bridge.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(("127.0.0.1", DEFAULT_PORT)).await {
            Ok(listener) => listener,
            Err(_) => match tokio::net::TcpListener::bind(("127.0.0.1", 0)).await {
                Ok(listener) => listener,
                Err(_) => return,
            },
        };
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
        if let Ok(mut endpoint) = state.endpoint.lock() {
            *endpoint = format!("http://127.0.0.1:{port}/mcp");
        }
        let router = Router::new().route("/mcp", post(mcp_post)).with_state(state);
        let _ = axum::serve(listener, router).await;
    });
    bridge
}

async fn mcp_post(State(bridge): State<Arc<McpBridge>>, Json(body): Json<Value>) -> impl IntoResponse {
    let is_batch = matches!(body, Value::Array(_));
    let messages = match body {
        Value::Array(items) => items,
        single => vec![single],
    };
    // Notifications carry no id and expect no response body.
    let is_notification_only = messages.iter().all(|m| m.get("id").is_none() || m.get("method").and_then(Value::as_str).map(|s| s.starts_with("notifications/")).unwrap_or(false));
    if is_notification_only {
        return (StatusCode::ACCEPTED, Json(Value::Null)).into_response();
    }
    let mut responses = Vec::new();
    for message in &messages {
        if let Some(response) = handle_message(&bridge, message).await {
            responses.push(response);
        }
    }
    let result = if is_batch { Value::Array(responses) } else { responses.into_iter().next().unwrap_or(Value::Null) };
    (StatusCode::OK, Json(result)).into_response()
}

async fn handle_message(bridge: &Arc<McpBridge>, message: &Value) -> Option<Value> {
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": message.pointer("/params/protocolVersion").and_then(Value::as_str).unwrap_or("2025-06-18"),
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "infinite-canvas", "version": env!("CARGO_PKG_VERSION") },
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_list() })),
        "tools/call" => handle_tool_call(bridge, message).await,
        _ if method.starts_with("notifications/") => return None,
        _ if method.is_empty() => Err(json!({ "code": -32600, "message": "invalid request" })),
        _ => Err(json!({ "code": -32601, "message": format!("method not found: {method}") })),
    };
    Some(match result {
        Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": value }),
        Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error }),
    })
}

async fn handle_tool_call(bridge: &Arc<McpBridge>, message: &Value) -> Result<Value, Value> {
    let name = message.pointer("/params/name").and_then(Value::as_str).unwrap_or("").to_string();
    let arguments = message.pointer("/params/arguments").cloned().unwrap_or_else(|| json!({}));
    if name.is_empty() {
        return Err(json!({ "code": -32602, "message": "missing tool name" }));
    }
    let request_id = bridge.next_request_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    bridge.pending.lock().map_err(|_| internal_error())?.insert(request_id, tx);
    let emitted = bridge.app.emit("mcp:tool-call", json!({ "requestId": request_id, "name": name, "arguments": arguments }));
    if emitted.is_err() {
        bridge.pending.lock().ok().map(|mut map| map.remove(&request_id));
        return Err(internal_error());
    }
    match tokio::time::timeout(TOOL_CALL_TIMEOUT, rx).await {
        Ok(Ok(Ok(result))) => Ok(json!({ "content": [{ "type": "text", "text": result.to_string() }] })),
        Ok(Ok(Err(message))) => Ok(json!({ "isError": true, "content": [{ "type": "text", "text": message }] })),
        Ok(Err(_)) => Err(internal_error()),
        Err(_) => {
            bridge.pending.lock().ok().map(|mut map| map.remove(&request_id));
            Err(json!({ "code": -32603, "message": "tool call timed out" }))
        }
    }
}

fn internal_error() -> Value {
    json!({ "code": -32603, "message": "internal error" })
}

fn obj(props: &[(&str, &str)]) -> Value {
    let properties = props.iter().map(|(k, v)| (k.to_string(), json!({ "type": v }))).collect::<serde_json::Map<_, _>>();
    json!({ "type": "object", "properties": Value::Object(properties) })
}

fn tool_list() -> Value {
    json!([
        {
            "name": "canvas_get_state",
            "description": "Get the current canvas snapshot: nodes (id/type/title/position/metadata), connections, selection, and viewport.",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "canvas_apply_ops",
            "description": "Apply operations to the open canvas. Each op in ops[] is one of: {type:'add_node',nodeType?,title?,x?,y?,width?,height?,metadata?} | {type:'update_node',id,metadata?|patch?} | {type:'delete_node',id?|ids?|nodeType?} | {type:'connect_nodes',fromNodeId,toNodeId} | {type:'delete_connections',id?|ids?|all?} | {type:'set_viewport',viewport:{x,y,zoom}} | {type:'select_nodes',ids[]} | {type:'run_generation',nodeId,mode?('text'|'image'|'video'|'audio'),prompt?}. nodeType values come from the canvas node registry (e.g. 'text','image','video','audio'). Returns the updated snapshot.",
            "inputSchema": { "type": "object", "properties": { "ops": { "type": "array", "items": { "type": "object" } } }, "required": ["ops"] },
        },
        {
            "name": "canvas_undo_ops",
            "description": "Undo the most recently applied canvas ops batch.",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "canvas_list_projects",
            "description": "List saved canvas projects.",
            "inputSchema": obj(&[("keyword", "string"), ("page", "number"), ("pageSize", "number")]),
        },
        {
            "name": "generation_get_status",
            "description": "Get generation task status across canvas/workbench. scope: 'all'|'canvas'|'image'|'video'.",
            "inputSchema": obj(&[("scope", "string"), ("taskId", "string"), ("limit", "number")]),
        },
        {
            "name": "prompts_search",
            "description": "Search the prompt library.",
            "inputSchema": obj(&[("keyword", "string"), ("category", "string"), ("page", "number"), ("pageSize", "number")]),
        },
        {
            "name": "assets_list",
            "description": "List saved assets. kind: 'all'|'text'|'image'|'video'.",
            "inputSchema": obj(&[("kind", "string"), ("keyword", "string"), ("page", "number"), ("pageSize", "number")]),
        },
        {
            "name": "assets_add",
            "description": "Add an asset. kind 'text' requires title+content; kind 'image' requires title+imageUrl.",
            "inputSchema": obj(&[("kind", "string"), ("title", "string"), ("content", "string"), ("imageUrl", "string"), ("note", "string")]),
        },
        {
            "name": "workbench_image_get_config",
            "description": "Get current image-workbench config and selectable models/options.",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "workbench_image_generate",
            "description": "Configure and optionally start image generation in the workbench.",
            "inputSchema": obj(&[("prompt", "string"), ("model", "string"), ("quality", "string"), ("size", "string"), ("count", "number"), ("run", "boolean")]),
        },
        {
            "name": "workbench_video_get_config",
            "description": "Get current video-workbench config and selectable models/options.",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "workbench_video_generate",
            "description": "Configure and optionally start video generation in the workbench.",
            "inputSchema": obj(&[("prompt", "string"), ("model", "string"), ("seconds", "string"), ("size", "string"), ("resolution", "string"), ("generateAudio", "boolean"), ("watermark", "boolean"), ("run", "boolean")]),
        },
    ])
}
