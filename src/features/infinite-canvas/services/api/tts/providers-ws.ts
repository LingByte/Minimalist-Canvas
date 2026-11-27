import { audioBlob, pcmToWavBlob } from "./http";
import type { TtsSynthesizer } from "./types";

export const synthesizeAliyun: TtsSynthesizer = async (engine, input) => {
    if (!engine.apiKey.trim()) throw new Error("Aliyun DashScope API key is required");
    const endpoint = (engine.baseUrl || "wss://dashscope.aliyuncs.com/api-ws/v1/realtime").trim();
    if (!endpoint.startsWith("ws://") && !endpoint.startsWith("wss://")) {
        throw new Error("Aliyun TTS endpoint must be a ws/wss URL");
    }
    const url = new URL(endpoint);
    url.searchParams.set("api-key", engine.apiKey);
    const voice = input.voice || engine.voice || "Cherry";
    const model = engine.model || "qwen3-tts-flash-realtime";
    const language = engine.options.languageType || "Auto";

    const chunks: Uint8Array[] = [];
    await withWebSocket(url.toString(), input.signal, async (ws) => {
        const send = (payload: Record<string, unknown>) => ws.send(JSON.stringify(payload));
        send({
            event_id: `evt_session_${Date.now()}`,
            type: "session.update",
            session: {
                model,
                voice,
                language,
                modalities: ["text", "audio"],
                output_format: "pcm",
                sample_rate: 24000,
                channels: 1,
                bit_depth: 16,
                mode: "server_commit",
                input_modalities: ["text"],
            },
        });
        send({ event_id: `evt_append_${Date.now()}`, type: "input_text_buffer.append", text: input.text });
        send({ event_id: `evt_finish_${Date.now()}`, type: "session.finish" });

        await readUntil(ws, input.signal, (raw) => {
            let event: Record<string, unknown>;
            try {
                event = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                return "continue";
            }
            const type = typeof event.type === "string" ? event.type : "";
            if (type === "response.audio.delta" && typeof event.delta === "string" && event.delta) {
                chunks.push(base64ToBytes(event.delta));
                return "continue";
            }
            if (type === "session.finished" || type === "response.done") return "done";
            if (type === "error") {
                const err = event.error && typeof event.error === "object" ? (event.error as { message?: string }) : undefined;
                throw new Error(err?.message || "Aliyun TTS error");
            }
            return "continue";
        });
    });

    if (!chunks.length) throw new Error("Aliyun TTS returned no audio");
    const pcm = concatBytes(chunks);
    return { blob: pcmToWavBlob(pcm, 24000), mimeType: "audio/wav" };
};

export const synthesizeXunfei: TtsSynthesizer = async (engine, input) => {
    const appId = engine.options.appId?.trim();
    const apiSecret = engine.options.apiSecret?.trim();
    if (!appId || !engine.apiKey.trim() || !apiSecret) throw new Error("Xunfei appId / apiKey / apiSecret are required");
    const host = "cn-huabei-1.xf-yun.com";
    const path = "/v1/private/voice_clone";
    const wsUrl = await buildXunfeiAuthUrl(host, path, engine.apiKey, apiSecret);
    const resId = engine.options.resId?.trim() || "xunfei_default";
    const vcn = engine.options.vcn?.trim() || input.voice || engine.voice || "x5_clone";
    const chunks: Uint8Array[] = [];

    await withWebSocket(wsUrl, input.signal, async (ws) => {
        const request = {
            header: { app_id: appId, status: 2, res_id: resId },
            parameter: {
                tts: {
                    vcn,
                    volume: 8,
                    rhy: 1,
                    pybuffer: 1,
                    speed: 50,
                    pitch: 50,
                    bgs: 0,
                    reg: 2,
                    rdn: 2,
                    audio: { encoding: "raw", sample_rate: 24000 },
                },
            },
            payload: {
                text: {
                    encoding: "utf8",
                    compress: "raw",
                    format: "plain",
                    status: 2,
                    seq: 1,
                    text: btoa(unescape(encodeURIComponent(input.text))),
                },
            },
        };
        ws.send(JSON.stringify(request));
        await readUntil(ws, input.signal, (raw) => {
            let response: Record<string, unknown>;
            try {
                response = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                return "continue";
            }
            const payload = response.payload && typeof response.payload === "object" ? (response.payload as Record<string, unknown>) : undefined;
            const audio = payload?.audio && typeof payload.audio === "object" ? (payload.audio as Record<string, unknown>) : undefined;
            if (typeof audio?.audio === "string" && audio.audio) chunks.push(base64ToBytes(audio.audio));
            if (typeof audio?.status === "number" && audio.status === 2) return "done";
            return "continue";
        });
    });

    if (!chunks.length) throw new Error("Xunfei TTS returned no audio");
    return { blob: pcmToWavBlob(concatBytes(chunks), 24000), mimeType: "audio/wav" };
};

export const synthesizeMinimax: TtsSynthesizer = async (engine, input) => {
    if (!engine.apiKey.trim()) throw new Error("MiniMax API key is required");
    const voiceId = engine.options.voiceId || input.voice || engine.voice;
    if (!voiceId) throw new Error("MiniMax voiceId is required");
    const endpoint = engine.baseUrl.trim() || "wss://api.minimaxi.com/ws/v1/t2a_v2";
    const chunks: Uint8Array[] = [];

    await withWebSocket(endpoint, input.signal, async (ws) => {
        // MiniMax expects auth via first message / query — use task start protocol from ling-base.
        ws.send(
            JSON.stringify({
                event: "task_start",
                model: engine.model || "speech-02-hd",
                voice_setting: { voice_id: voiceId, speed: input.speed || 1 },
                audio_setting: { format: "mp3", sample_rate: 32000 },
            }),
        );
        await readUntil(ws, input.signal, (raw) => {
            let event: Record<string, unknown>;
            try {
                event = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                return "continue";
            }
            if (event.is_logged === false || event.base_resp) {
                // connected / started
            }
            const status = typeof event.status === "string" ? event.status : "";
            if (status === "ready" || event.event === "connected_success" || event.event === "task_started") {
                ws.send(JSON.stringify({ event: "task_continue", text: input.text }));
                return "continue";
            }
            const data = typeof event.data === "string" ? event.data : typeof event.audio === "string" ? event.audio : "";
            if (data) chunks.push(base64ToBytes(data));
            if (event.event === "task_finished" || event.is_final === true || status === "success") {
                ws.send(JSON.stringify({ event: "task_finish" }));
                return "done";
            }
            if (event.event === "task_failed" || (event.base_resp && typeof event.base_resp === "object" && (event.base_resp as { status_code?: number }).status_code)) {
                const msg =
                    (event.base_resp && typeof event.base_resp === "object" && typeof (event.base_resp as { status_msg?: string }).status_msg === "string"
                        ? (event.base_resp as { status_msg: string }).status_msg
                        : "") || "MiniMax TTS failed";
                if ((event.base_resp as { status_code?: number })?.status_code && (event.base_resp as { status_code?: number }).status_code !== 0) {
                    throw new Error(msg);
                }
            }
            return "continue";
        });
    }, { headers: { Authorization: `Bearer ${engine.apiKey}` } });

    if (!chunks.length) throw new Error("MiniMax TTS returned no audio");
    return { blob: audioBlob(concatBytes(chunks), "audio/mpeg"), mimeType: "audio/mpeg" };
};

type WsExtra = { headers?: Record<string, string> };

async function withWebSocket(url: string, signal: AbortSignal | undefined, run: (ws: WebSocket) => Promise<void>, extra?: WsExtra) {
    // Browser/Tauri webview WebSocket cannot set custom headers; MiniMax auth falls back to query if needed.
    const finalUrl =
        extra?.headers?.Authorization && !url.includes("Authorization")
            ? appendQuery(url, "authorization", extra.headers.Authorization.replace(/^Bearer\s+/i, ""))
            : url;
    const ws = new WebSocket(finalUrl);
    ws.binaryType = "arraybuffer";
    const abort = () => {
        try {
            ws.close();
        } catch {
            // ignore
        }
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
        await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = () => reject(new Error("WebSocket connection failed"));
            if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
        });
        await run(ws);
    } finally {
        signal?.removeEventListener("abort", abort);
        abort();
    }
}

async function readUntil(ws: WebSocket, signal: AbortSignal | undefined, onMessage: (raw: string) => "continue" | "done") {
    await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("TTS WebSocket timed out")), 60_000);
        const cleanup = () => window.clearTimeout(timer);
        ws.onmessage = (event) => {
            try {
                const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
                const result = onMessage(raw);
                if (result === "done") {
                    cleanup();
                    resolve();
                }
            } catch (error) {
                cleanup();
                reject(error);
            }
        };
        ws.onerror = () => {
            cleanup();
            reject(new Error("WebSocket error"));
        };
        ws.onclose = () => {
            cleanup();
            resolve();
        };
        if (signal?.aborted) {
            cleanup();
            reject(new DOMException("Aborted", "AbortError"));
        }
    });
}

async function buildXunfeiAuthUrl(host: string, path: string, apiKey: string, apiSecret: string) {
    const date = new Date().toUTCString();
    const tmp = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(tmp)))));
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = btoa(authorizationOrigin);
    const params = new URLSearchParams({ authorization, date, host });
    return `wss://${host}${path}?${params.toString()}`;
}

function appendQuery(url: string, key: string, value: string) {
    const u = new URL(url);
    u.searchParams.set(key, value);
    return u.toString();
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function concatBytes(chunks: Uint8Array[]) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}
