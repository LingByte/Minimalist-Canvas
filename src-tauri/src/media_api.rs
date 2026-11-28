//! Local REST bridge for external Agent Skills / CLI.
//! Binds `127.0.0.1:17373` (ephemeral fallback) and forwards work to the UI via events,
//! so generation uses the live in-app channel config — not a hardcoded data dir.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

const DEFAULT_PORT: u16 = 17373;
const MEDIA_CALL_TIMEOUT: Duration = Duration::from_secs(600);

type PendingMap = HashMap<u64, oneshot::Sender<Result<Value, String>>>;

pub struct MediaApiBridge {
    app: AppHandle,
    endpoint: Mutex<String>,
    pending: Mutex<PendingMap>,
    next_request_id: AtomicU64,
}

impl MediaApiBridge {
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
pub fn media_api_endpoint(state: tauri::State<'_, Arc<MediaApiBridge>>) -> String {
    state.endpoint.lock().map(|v| v.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn media_api_result(
    state: tauri::State<'_, Arc<MediaApiBridge>>,
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
            let value = if ok {
                Ok(payload)
            } else {
                Err(payload
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| payload.to_string()))
            };
            let _ = tx.send(value);
            Ok(())
        }
        None => Err("unknown request id".to_string()),
    }
}

pub fn spawn_media_api(app: &AppHandle) -> Arc<MediaApiBridge> {
    let bridge = Arc::new(MediaApiBridge::new(app.clone()));
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
        let base = format!("http://127.0.0.1:{port}");
        if let Ok(mut endpoint) = state.endpoint.lock() {
            *endpoint = base.clone();
        }
        write_discovery(&base, port);

        let router = Router::new()
            .route("/health", get(health))
            .route("/v1/config", get(config_get))
            .route("/v1/models", get(models_get))
            .route("/v1/images/generations", post(images_generations))
            .route("/v1/images/edits", post(images_edits))
            .route("/v1/videos", post(videos_create))
            .with_state(state);

        let _ = axum::serve(listener, router).await;
    });
    bridge
}

fn write_discovery(base: &str, port: u16) {
    let path = std::env::temp_dir().join("minimalist-canvas-media-api.json");
    let body = json!({
        "ok": true,
        "endpoint": base,
        "port": port,
        "pid": std::process::id(),
    });
    let _ = std::fs::write(path, body.to_string());
}

async fn health(State(bridge): State<Arc<MediaApiBridge>>) -> impl IntoResponse {
    let endpoint = bridge.endpoint.lock().map(|v| v.clone()).unwrap_or_default();
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "service": "minimalist-canvas-media",
            "version": env!("CARGO_PKG_VERSION"),
            "endpoint": endpoint,
        })),
    )
}

async fn config_get(State(bridge): State<Arc<MediaApiBridge>>) -> impl IntoResponse {
    bridge_json(&bridge, "config", json!({})).await
}

#[derive(serde::Deserialize)]
struct ModelsQuery {
    capability: Option<String>,
}

async fn models_get(
    State(bridge): State<Arc<MediaApiBridge>>,
    Query(query): Query<ModelsQuery>,
) -> impl IntoResponse {
    bridge_json(
        &bridge,
        "models",
        json!({ "capability": query.capability.unwrap_or_default() }),
    )
    .await
}

async fn images_generations(
    State(bridge): State<Arc<MediaApiBridge>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    bridge_json(&bridge, "images.generations", body).await
}

async fn images_edits(
    State(bridge): State<Arc<MediaApiBridge>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    bridge_json(&bridge, "images.edits", body).await
}

async fn videos_create(
    State(bridge): State<Arc<MediaApiBridge>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    bridge_json(&bridge, "videos.create", body).await
}

async fn bridge_json(bridge: &Arc<MediaApiBridge>, action: &str, arguments: Value) -> axum::response::Response {
    let request_id = bridge.next_request_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    if bridge.pending.lock().map(|mut map| map.insert(request_id, tx)).is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": { "message": "lock poisoned" } })),
        )
            .into_response();
    }
    let emitted = bridge.app.emit(
        "media-api:request",
        json!({
            "requestId": request_id,
            "action": action,
            "arguments": arguments,
        }),
    );
    if emitted.is_err() {
        bridge.pending.lock().ok().map(|mut map| map.remove(&request_id));
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": { "message": "UI bridge unavailable — open Minimalist Canvas" } })),
        )
            .into_response();
    }
    match tokio::time::timeout(MEDIA_CALL_TIMEOUT, rx).await {
        Ok(Ok(Ok(result))) => (StatusCode::OK, Json(result)).into_response(),
        Ok(Ok(Err(message))) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": { "message": message } })),
        )
            .into_response(),
        Ok(Err(_)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": { "message": "internal error" } })),
        )
            .into_response(),
        Err(_) => {
            bridge.pending.lock().ok().map(|mut map| map.remove(&request_id));
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(json!({ "error": { "message": "media request timed out" } })),
            )
                .into_response()
        }
    }
}
