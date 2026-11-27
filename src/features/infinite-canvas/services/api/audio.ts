import axios from "axios";

import i18n from "@canvas/i18n";
import { audioMimeType, normalizeAudioFormatValue, normalizeAudioSpeedValue } from "@canvas/lib/audio-generation";
import { resolveVoiceRuntime } from "@canvas/lib/tts-voices";
import { uploadMediaFile, type UploadedFile } from "@canvas/services/file-storage";
import { trackUsageWithTokens, type UsageOrigin } from "@canvas/services/usage-meter";
import { resolveModelRequestConfig, resolveModelScript, type AiConfig } from "@canvas/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import { synthesizeSpeech } from "./tts";

type RequestOptions = { signal?: AbortSignal; generationClientId?: string; generationSource?: "canvas" | "workbench"; generationAttemptId?: string };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

function audioOrigin(source?: "canvas" | "workbench"): UsageOrigin {
    if (source === "workbench") return "workbench";
    if (source === "canvas") return "canvas";
    return "other";
}

export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<Blob> {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.audioModel);
    const model = requestConfig.model.trim();
    const format = normalizeAudioFormatValue(config.audioFormat);
    const script = resolveModelScript(config, config.model || config.audioModel);
    const startedAt = Date.now();
    const characters = prompt.trim().length;
    const origin = audioOrigin(options?.generationSource);
    const meterModel = model || config.ttsVoiceId || "tts";

    let runtime;
    try {
        runtime = resolveVoiceRuntime(config.ttsEngines, config.ttsVoiceId);
    } catch (error) {
        if (script) {
            // Plugin path can still run with a bare upstream voice string when catalog resolve fails.
            runtime = null;
        } else {
            throw error instanceof Error ? error : new Error(apiText("ttsChannelRequired"));
        }
    }

    const upstreamVoice = runtime?.upstreamVoice || (config.audioVoice || "").trim() || "alloy";

    try {
        let blob: Blob;
        if (script) {
            if (!model) throw new Error(apiText("audioModelRequired"));
            if (!requestConfig.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
            if (!requestConfig.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
            try {
                const result = await runModelPlugin({
                    capability: "audio",
                    script,
                    config: requestConfig,
                    prompt,
                    params: {
                        voice: upstreamVoice,
                        format,
                        speed: normalizeAudioSpeedValue(config.audioSpeed),
                        instructions: config.audioInstructions.trim(),
                    },
                    signal: options?.signal,
                });
                blob = await audioPluginBlob(result, format);
            } catch (error) {
                throw new Error(readAxiosError(error, apiText("audioGenerationFailed")));
            }
        } else {
            if (!runtime) throw new Error(apiText("ttsChannelRequired"));
            try {
                let engine = runtime.engine;
                if (engine.vendor === "openai" && (!engine.apiKey.trim() || !engine.baseUrl.trim())) {
                    engine = {
                        ...engine,
                        baseUrl: engine.baseUrl.trim() || requestConfig.baseUrl,
                        apiKey: engine.apiKey.trim() || requestConfig.apiKey,
                        model: engine.model.trim() || model || engine.model,
                    };
                }

                const result = await synthesizeSpeech(engine, {
                    text: prompt,
                    voice: runtime.upstreamVoice,
                    format,
                    speed: Number(normalizeAudioSpeedValue(config.audioSpeed)),
                    instructions: config.audioInstructions.trim() || undefined,
                    signal: options?.signal,
                });
                blob = result.blob;
            } catch (error) {
                throw new Error(readAxiosError(error, apiText("audioGenerationFailed")));
            }
        }
        trackUsageWithTokens({
            capability: "audio",
            model: meterModel,
            origin,
            status: "success",
            durationMs: Date.now() - startedAt,
            units: characters,
            unitKind: "characters",
        });
        return blob;
    } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
            trackUsageWithTokens({
                capability: "audio",
                model: meterModel,
                origin,
                status: "failed",
                durationMs: Date.now() - startedAt,
                units: characters,
                unitKind: "characters",
                error: error instanceof Error ? error.message : String(error),
            });
        }
        throw error;
    }
}

async function audioPluginBlob(result: unknown, format: string): Promise<Blob> {
    if (result instanceof Blob) return result.type.startsWith("audio/") ? result : new Blob([result], { type: audioMimeType(format) });
    let source = "";
    if (typeof result === "string") source = result;
    else if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        source = typeof record.b64_json === "string" ? record.b64_json : typeof record.data === "string" ? record.data : typeof record.url === "string" ? record.url : "";
    }
    if (!source) throw new Error(apiText("scriptNoAudio"));
    const url = source.startsWith("data:") || /^https?:/i.test(source) ? source : `data:${audioMimeType(format)};base64,${source}`;
    const blob = await (await fetch(url)).blob();
    return blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
    const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
    return uploadMediaFile(audio, "audio");
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    const errorMsg = typeof payload.error === "string" ? payload.error : (payload.error as { message?: unknown })?.message;
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(errorMsg) || readApiErrorMessage(payload.detail) || "";
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("networkRequestFailed");
        const apiMsg = readApiErrorMessage(error.response?.data);
        if (apiMsg) return apiMsg;
        const status = error.response?.status;
        if (status === 401 || status === 403) return apiText("authenticationFailed");
        if (status === 429) return apiText("rateLimited");
        return error.message || fallback;
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? error.message || fallback : fallback;
}
