import axios from "axios";
import { nanoid } from "nanoid";

import i18n from "@canvas/i18n";
import { getMediaBlob, setMediaBlob, uploadMediaFile, type UploadedFile } from "@canvas/services/file-storage";
import { getImageBlob, imageToDataUrl, resolveImageUrl } from "@canvas/services/image-storage";
import { getObjectStorageStatus, mirrorRemoteToObjectStorage, uploadCanvasMedia, assertCanvasUploadSize } from "@canvas/services/object-storage";
import { VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN } from "@canvas/components/video-settings-panel";
import { VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_MAX_ATTEMPTS, VIDEO_POLL_TIMEOUT_MS } from "@canvas/constant/video-generation";
import { boolConfig, buildApiUrl, modelOptionName, resolveModelRequestConfig, resolveModelScript, type AiConfig } from "@canvas/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import type { ReferenceImage } from "@canvas/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@canvas/types/media";

/** Soft caps aligned with Seedance2.5 / AICost docs. */
const MAX_REFERENCE_IMAGES = 30;
const MAX_REFERENCE_VIDEOS = 10;
const MAX_REFERENCE_AUDIOS = 10;

export type VideoGenerationReferences = {
    images?: ReferenceImage[];
    videos?: ReferenceVideo[];
    audios?: ReferenceAudio[];
};

type VideoResponse = {
    id: string;
    status?: string;
    progress?: number | string;
    fail_reason?: string;
    error?: { message?: string } | string | null;
    url?: string;
    result_url?: string;
    video_url?: string;
    content?: { video_url?: string; result_url?: string; url?: string } | string | null;
    metadata?: Record<string, unknown> | null;
    data?: Record<string, unknown> | null;
};
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
    /** URLs that must not be treated as a finished generation result (e.g. reference videos). */
    ignoreResultUrls?: string[];
};
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

/** Success statuses seen across OpenAI-compatible and upstream passthrough channels. */
const VIDEO_SUCCESS_STATUSES = new Set(["completed", "succeeded", "success", "done", "finished"]);
const VIDEO_FAILURE_STATUSES = new Set(["failed", "cancelled", "canceled", "error"]);
const VIDEO_POLL_TRANSIENT_RETRIES = 3;

export { VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_MAX_ATTEMPTS, VIDEO_POLL_TIMEOUT_MS } from "@canvas/constant/video-generation";

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = {
    id: string;
    provider: "openai" | "plugin";
    model: string;
    /** Public media URLs actually submitted upstream (after resolve/upload). */
    submittedReferenceUrls?: string[];
};
export type VideoGenerationTaskState =
    | { status: "pending"; progress?: number }
    | { status: "completed"; result: VideoGenerationResult }
    | { status: "failed"; error: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] | VideoGenerationReferences = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, options);
    return waitForVideoGenerationTask(config, task, options);
}

/** Poll until the task completes, fails, or times out. Soft network blips are retried. */
export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationResult> {
    let transientFailures = 0;
    const pollOptions = withSubmittedReferenceIgnores(task, options);
    for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
            const state = await pollVideoGenerationTask(config, task, pollOptions);
            transientFailures = 0;
            if (state.status === "completed") return state.result;
            if (state.status === "failed") throw new Error(state.error);
            if (typeof state.progress === "number") options?.onProgress?.(state.progress);
            if (attempt === VIDEO_POLL_MAX_ATTEMPTS - 1) throw new Error(apiText("videoTimeout", { provider: "" }));
        } catch (error) {
            if (axios.isCancel(error) || options?.signal?.aborted) throw error;
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            // Definitive failure from poll (failed status) should not be retried as transient.
            if (error instanceof Error && !isLikelyTransientPollError(error)) throw error;
            transientFailures += 1;
            if (transientFailures > VIDEO_POLL_TRANSIENT_RETRIES || attempt === VIDEO_POLL_MAX_ATTEMPTS - 1) {
                throw error instanceof Error ? error : new Error(apiText("videoTaskQueryFailed"));
            }
        }
        await delay(VIDEO_POLL_INTERVAL_MS, options?.signal);
    }
    throw new Error(apiText("videoTimeout", { provider: "" }));
}

function isLikelyTransientPollError(error: Error) {
    const message = error.message || "";
    // Download failures after a completed task are not transient — surface them so the
    // user can retry "check status" once content is available.
    if (message.includes(apiText("videoDownloadFailed"))) return false;
    if (message.includes(apiText("videoGenerationFailed"))) return false;
    return (
        message.includes(apiText("videoTaskQueryFailed")) ||
        /network|timeout|502|503|504|ECONNRESET|Failed to fetch/i.test(message)
    );
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] | VideoGenerationReferences = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const script = resolveModelScript(config, selectedModel);
    const refs = normalizeVideoReferences(references);
    if (script) return createPluginVideoTask(requestConfig, selectedModel, script, prompt, refs, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, refs, options);
}

export function normalizeVideoReferences(references: ReferenceImage[] | VideoGenerationReferences): VideoGenerationReferences {
    if (Array.isArray(references)) {
        return { images: references, videos: [], audios: [] };
    }
    return {
        images: references.images || [],
        videos: references.videos || [],
        audios: references.audios || [],
    };
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const pollOptions = withSubmittedReferenceIgnores(task, options);
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        if (!result) return { status: "failed", error: apiText("pluginVideoExpired") };
        if (result.url && isIgnoredResultUrl(result.url, pollOptions.ignoreResultUrls)) {
            return { status: "failed", error: apiText("videoGenerationFailed") };
        }
        return { status: "completed", result };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    return pollOpenAIVideoTask(requestConfig, task, pollOptions);
}

function withSubmittedReferenceIgnores(task: VideoGenerationTask, options?: RequestOptions): RequestOptions {
    const ignoreResultUrls = mergeIgnoreResultUrls(options?.ignoreResultUrls, task.submittedReferenceUrls);
    return ignoreResultUrls.length ? { ...options, ignoreResultUrls } : { ...options };
}

function mergeIgnoreResultUrls(...groups: Array<string[] | undefined>) {
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
        for (const candidate of group || []) {
            const value = candidate?.trim();
            if (!value || /^(image|video|audio):/i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) continue;
            const key = normalizeResultUrlKey(value);
            if (seen.has(key)) continue;
            seen.add(key);
            urls.push(value);
        }
    }
    return urls;
}

async function createPluginVideoTask(config: AiConfig, model: string, script: string, prompt: string, references: VideoGenerationReferences, options?: RequestOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    const images = await resolveImageReferences((references.images || []).slice(0, MAX_REFERENCE_IMAGES));
    const videoInputs = (references.videos || []).slice(0, MAX_REFERENCE_VIDEOS);
    const audioInputs = (references.audios || []).slice(0, MAX_REFERENCE_AUDIOS);
    const videos = await resolveFileReferences(videoInputs, "video");
    const audios = await resolveFileReferences(audioInputs, "audio");
    const submittedReferenceUrls = mergeIgnoreResultUrls(images, videos, audios, options?.ignoreResultUrls);
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images,
            videos,
            audios,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds),
                size: normalizeVideoSize(config.size),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: config.size,
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
                videos,
                audios,
            },
            signal: options?.signal,
        }),
        submittedReferenceUrls,
    );
    const id = nanoid();
    pluginVideoResults.set(id, result);
    return { id, provider: "plugin", model, submittedReferenceUrls };
}

function videoPluginResult(result: unknown, ignoreResultUrls?: string[]): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") {
        if (isIgnoredResultUrl(result, ignoreResultUrls)) throw new Error(apiText("videoGenerationFailed"));
        return { url: result, mimeType: "video/mp4" };
    }
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.result_url, record.url, record.video_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) {
            if (isIgnoredResultUrl(url, ignoreResultUrls)) throw new Error(apiText("videoGenerationFailed"));
            return { url, mimeType: "video/mp4" };
        }
    }
    throw new Error(apiText("scriptNoVideo"));
}

export async function storeGeneratedVideo(
    result: VideoGenerationResult,
    options?: { onRemirrored?: (file: UploadedFile) => void },
): Promise<UploadedFile> {
    // Public upstream URL: show it immediately, then remirror on the server so
    // Dola/Akamai hotlink rules (Referer) can be satisfied and the canvas gets a CDN URL.
    if (result.url && isPublicMediaUrl(result.url)) {
        const upstreamUrl = result.url;
        void remirrorPublicVideoInBackground(upstreamUrl, result.mimeType, options?.onRemirrored);
        void cachePublicVideoLocally(upstreamUrl, result.mimeType);
        return {
            url: upstreamUrl,
            storageKey: "",
            bytes: 0,
            mimeType: result.mimeType || "video/mp4",
        };
    }
    if (result.blob) {
        const stored = await uploadMediaFile(result.blob, "video");
        // No upstream URL on blob results — CDN is the durable fallback.
        try {
            const uploaded = await uploadCanvasMedia(result.blob, {
                contentType: stored.mimeType || result.mimeType || "video/mp4",
                purpose: "canvas",
            });
            if (uploaded?.accessUrl) return { ...stored, url: uploaded.accessUrl };
        } catch {
            // Keep local blob URL when object storage is unavailable.
        }
        return stored;
    }
    if (result.url) {
        try {
            return await uploadMediaFile(result.url, "video");
        } catch {
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error(apiText("noPlayableVideo"));
}

/** Best-effort server remirror; updates the node via onRemirrored when CDN is ready. */
async function remirrorPublicVideoInBackground(url: string, mimeType: string | undefined, onRemirrored?: (file: UploadedFile) => void) {
    try {
        const mirrored = await mirrorRemoteToObjectStorage(url, "video");
        if (!mirrored?.accessUrl) return;
        const file: UploadedFile = {
            url: mirrored.accessUrl,
            storageKey: mirrored.key,
            bytes: mirrored.bytes || 0,
            mimeType: mirrored.mimeType || mimeType || "video/mp4",
        };
        void cachePublicVideoLocally(file.url, file.mimeType);
        onRemirrored?.(file);
    } catch {
        // Upstream may expire; the node already shows the original public URL.
    }
}

/** Best-effort local cache; never blocks the UI on object-storage uploads. */
async function cachePublicVideoLocally(url: string, _mimeType?: string) {
    try {
        const blob = await (await fetch(url)).blob();
        await setMediaBlob(`video:${nanoid()}`, blob);
    } catch {
        // Preview already uses the public URL; offline cache is optional.
    }
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: VideoGenerationReferences, options?: RequestOptions): Promise<VideoGenerationTask> {
    const modelName = modelOptionName(model);
    const seconds = normalizeVideoSeconds(config.videoSeconds);
    const size = normalizeVideoSize(config.size);
    const resolution = normalizeVideoResolution(config.vquality);
    // Prefer public 七猴 URLs for references. Large data URLs often
    // trip upstream nginx body limits (HTML 400 / fail_to_fetch_task).
    const imageRefs = await resolveImageReferences((references.images || []).slice(0, MAX_REFERENCE_IMAGES));
    const videoInputs = (references.videos || []).slice(0, MAX_REFERENCE_VIDEOS);
    const audioInputs = (references.audios || []).slice(0, MAX_REFERENCE_AUDIOS);
    // Must yield public https URLs. Fail before submit — silent drops made
    // upstream (Dola) reply “please upload reference video 1”.
    const videoRefs = await resolveFileReferences(videoInputs, "video");
    const audioRefs = await resolveFileReferences(audioInputs, "audio");

    try {
        const payload: Record<string, unknown> = {
            model: modelName,
            prompt,
            seconds,
            resolution,
            resolution_name: resolution,
            preset: "normal",
        };
        if (size) {
            payload.size = size;
            // Some video channels (MaxForAI) accept ratio instead of WxH size.
            const ratio = sizeToAspectRatio(size);
            if (ratio) {
                payload.ratio = ratio;
                payload.aspect_ratio = ratio;
            }
        }
        // Upstream (e.g. dq-sd933) rejects multiple image fields at once:
        // "use only one image reference field, got images and image"
        if (imageRefs.length === 1) {
            payload.image = imageRefs[0];
        } else if (imageRefs.length > 1) {
            payload.images = imageRefs;
        }
        // Always use array fields for video/audio so we never collide with
        // boolean `audio: true` (MiniMax H3 generate-audio flag).
        if (videoRefs.length) payload.videos = videoRefs;
        if (audioRefs.length) payload.audios = audioRefs;

        const created = unwrapVideoResponse(
            (
                await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), payload, {
                    headers: aiHeaders(config, "application/json"),
                    signal: options?.signal,
                })
            ).data,
        );
        if (!created.id) throw new Error(apiText("noVideoTaskId"));
        return {
            id: created.id,
            provider: "openai",
            model,
            submittedReferenceUrls: mergeIgnoreResultUrls(imageRefs, videoRefs, audioRefs, options?.ignoreResultUrls),
        };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

/** Upload canvas image refs to 七猴图床; fall back to data URLs if upload fails. */
async function resolveImageReferences(references: ReferenceImage[]): Promise<string[]> {
    return Promise.all(references.map((image) => resolveOneImageReference(image)));
}

async function resolveOneImageReference(image: ReferenceImage): Promise<string> {
    if (image.url && isPublicMediaUrl(image.url)) return image.url;
    if (image.dataUrl && isPublicMediaUrl(image.dataUrl)) return image.dataUrl;

    try {
        const blob = await imageReferenceToBlob(image);
        if (blob) {
            const uploaded = await uploadCanvasMedia(blob, {
                filename: image.name || undefined,
                contentType: image.type || blob.type || "image/png",
                purpose: "canvas",
            });
            if (uploaded?.accessUrl) return uploaded.accessUrl;
        }
    } catch {
        // Fall back to data URL when storage is unavailable or upload fails.
    }

    return imageToDataUrl(image);
}

async function imageReferenceToBlob(image: ReferenceImage): Promise<Blob | null> {
    if (image.storageKey) {
        const stored = await getImageBlob(image.storageKey);
        if (stored) return stored;
    }
    const source = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!source) return null;
    if (source.startsWith("data:") || isPublicMediaUrl(source) || source.startsWith("blob:")) {
        return (await fetch(source)).blob();
    }
    return null;
}

type FileReference = { url?: string; storageKey?: string; name?: string; type?: string };

async function resolveFileReferences(references: FileReference[], kind: "video" | "audio"): Promise<string[]> {
    return Promise.all(references.map((item) => resolveOneFileReference(item, kind)));
}

/**
 * Reference video/audio must be a URL the upstream worker can fetch.
 * Local blob:/data: URLs and localhost links are rejected with an explicit
 * error — never silently dropped (that produced “please upload reference video 1”).
 */
async function resolveOneFileReference(item: FileReference, kind: "video" | "audio"): Promise<string> {
    if (item.url && isPubliclyReachableMediaUrl(item.url)) return item.url;

    const blob = await fileReferenceToBlob(item);
    if (!blob) {
        throw new Error(apiText(kind === "video" ? "invalidReferenceVideo" : "invalidReferenceAudio"));
    }

    if (kind === "audio") {
        const status = await getObjectStorageStatus();
        if (!status.enabled) {
            throw new Error(apiText("referenceMediaStorageRequired"));
        }
        assertCanvasUploadSize(blob.size, status.max_upload_bytes);
    } else {
        assertCanvasUploadSize(blob.size);
    }

    let uploaded;
    try {
        uploaded = await uploadCanvasMedia(blob, {
            filename: item.name || undefined,
            contentType: item.type || blob.type || "application/octet-stream",
            purpose: "canvas",
        });
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(apiText(kind === "video" ? "referenceVideoUploadFailed" : "referenceAudioUploadFailed", { detail }));
    }
    if (!uploaded?.accessUrl) {
        throw new Error(apiText(kind === "video" ? "referenceVideoUploadFailed" : "referenceAudioUploadFailed", { detail: "empty access url" }));
    }
    if (!isPubliclyReachableMediaUrl(uploaded.accessUrl)) {
        throw new Error(apiText("referenceMediaUrlNotPublic", { url: uploaded.accessUrl }));
    }
    return uploaded.accessUrl;
}

async function fileReferenceToBlob(item: FileReference): Promise<Blob | null> {
    if (item.storageKey) {
        const stored = await getMediaBlob(item.storageKey);
        if (stored) return stored;
    }
    if (!item.url) return null;
    if (item.url.startsWith("data:") || isPublicMediaUrl(item.url) || item.url.startsWith("blob:")) {
        return (await fetch(item.url)).blob();
    }
    return null;
}

/** True when an upstream (often remote) worker can likely fetch the URL. */
function isPubliclyReachableMediaUrl(value: string) {
    if (!/^https?:\/\//i.test(value || "")) return false;
    try {
        const host = new URL(value).hostname.toLowerCase();
        if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return false;
        if (host.endsWith(".local") || host.endsWith(".internal")) return false;
        if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
        return true;
    } catch {
        return false;
    }
}

function sizeToAspectRatio(size: string): string | null {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return null;
    if (width === height) return "1:1";
    if (width > height) return "16:9";
    return "9:16";
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        const nestedStatus =
            video && typeof video === "object" && "data" in video && video.data && typeof video.data === "object"
                ? String((video.data as { status?: unknown }).status || "").trim().toLowerCase()
                : "";
        const status = String(video.status || nestedStatus || "").trim().toLowerCase();
        if (VIDEO_SUCCESS_STATUSES.has(status)) {
            const url = videoResultUrl(video);
            // When the only poll URL is a known reference, do not fall back to /content —
            // some gateways proxy ResultURL which is still the reference echo.
            if (url && isIgnoredResultUrl(url, options?.ignoreResultUrls)) {
                return { status: "pending", progress: readVideoProgress(video) };
            }
            if (url) {
                return { status: "completed", result: await videoResultFromUrl(url, options) };
            }
            try {
                const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
                await assertVideoBlob(content.data);
                return { status: "completed", result: { blob: content.data } };
            } catch (error) {
                if (axios.isCancel(error) || options?.signal?.aborted) throw error;
                // Success without a usable URL yet — keep polling until result_url appears.
                return { status: "pending", progress: readVideoProgress(video) };
            }
        }
        if (VIDEO_FAILURE_STATUSES.has(status)) {
            return {
                status: "failed",
                error: readVideoFailureMessage(video) || apiText("videoGenerationFailed"),
            };
        }
        return { status: "pending", progress: readVideoProgress(video) };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        if (error instanceof Error && error.message.includes(apiText("videoDownloadFailed"))) throw error;
        // Some gateways return HTTP 4xx with the failed-task body still populated.
        if (axios.isAxiosError(error) && error.response?.data) {
            const failed = readFailedTaskState(error.response.data);
            if (failed) return failed;
        }
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

function readVideoFailureMessage(video: VideoResponse): string {
    const nested = video.data && typeof video.data === "object" ? video.data : null;
    return (
        readApiErrorMessage(video.fail_reason) ||
        readApiErrorMessage(video.error) ||
        (nested
            ? readApiErrorMessage(nested.fail_reason) ||
              readApiErrorMessage(nested.error) ||
              readApiErrorMessage(nested.message) ||
              readApiErrorMessage(nested.msg)
            : "") ||
        ""
    );
}

function readFailedTaskState(payload: unknown): Extract<VideoGenerationTaskState, { status: "failed" }> | null {
    if (!payload || typeof payload !== "object") return null;
    const video = payload as VideoResponse;
    const nested = video.data && typeof video.data === "object" ? video.data : null;
    const status = String(video.status || nested?.status || "")
        .trim()
        .toLowerCase();
    const reason = readVideoFailureMessage(video);
    if (VIDEO_FAILURE_STATUSES.has(status) || reason) {
        return { status: "failed", error: reason || apiText("videoGenerationFailed") };
    }
    return null;
}

function readVideoProgress(video: VideoResponse): number | undefined {
    const nested = video.data && typeof video.data === "object" ? video.data : null;
    const metadata = video.metadata && typeof video.metadata === "object" ? video.metadata : null;
    const raw =
        video.progress ??
        nested?.progress ??
        metadata?.progress;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.max(0, Math.min(100, Math.round(raw)));
    }
    if (typeof raw === "string") {
        const matched = raw.trim().match(/^(\d+(?:\.\d+)?)\s*%?$/);
        if (!matched) return undefined;
        const value = Number(matched[1]);
        if (!Number.isFinite(value)) return undefined;
        return Math.max(0, Math.min(100, Math.round(value)));
    }
    return undefined;
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    // Prefer the public URL so the canvas can render immediately. Downloading the
    // full MP4 here (and then re-uploading) left nodes stuck on "generating".
    if (isPublicMediaUrl(url)) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return { url, mimeType: "video/mp4" };
    }
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error(apiText("videoModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    if (config.apiFormat === "gemini") throw new Error(apiText("geminiVideoUnsupported"));
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(VIDEO_SECONDS_MIN, Math.min(VIDEO_SECONDS_MAX, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, apiText("noVideoTask"));
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || apiText("requestFailed"));
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse) {
    const nested = payload.data && typeof payload.data === "object" ? payload.data : null;
    const contentUrl =
        typeof payload.content === "string"
            ? payload.content
            : payload.content && typeof payload.content === "object"
              ? [payload.content.result_url, payload.content.video_url, payload.content.url].find((value) => typeof value === "string" && value)
              : undefined;
    const nestedContent = nested?.content;
    const nestedContentUrl =
        typeof nestedContent === "string"
            ? nestedContent
            : nestedContent && typeof nestedContent === "object"
              ? [
                    (nestedContent as { result_url?: unknown }).result_url,
                    (nestedContent as { video_url?: unknown }).video_url,
                    (nestedContent as { url?: unknown }).url,
                ].find((value) => typeof value === "string" && value)
              : undefined;
    const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : null;
    const metadataUrl = metadata
        ? [metadata.result_url, metadata.download_url, metadata.url, metadata.video_url].find((value) => typeof value === "string" && value)
        : undefined;
    const nestedUrl = nested
        ? [nested.result_url, nested.url, nested.video_url, nested.local_preview_url, nestedContentUrl].find((value) => typeof value === "string" && value)
        : undefined;
    // Prefer dedicated result fields over bare video_url/url — upstream often echoes the
    // reference video in video_url while the finished output is only in result_url.
    return [payload.result_url, payload.url, payload.video_url, contentUrl, nestedUrl, metadataUrl].find(
        (url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)),
    );
}

function normalizeResultUrlKey(url: string) {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {
        return url.trim().toLowerCase();
    }
}

function isIgnoredResultUrl(url: string, ignoreResultUrls?: string[]) {
    if (!url || !ignoreResultUrls?.length) return false;
    const key = normalizeResultUrlKey(url);
    return ignoreResultUrls.some((candidate) => candidate && normalizeResultUrlKey(candidate) === key);
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
    const payload = value as {
        msg?: unknown;
        message?: unknown;
        error?: unknown;
        detail?: unknown;
        fail_reason?: unknown;
        data?: unknown;
    };
    // error may be a string or an object containing a message.
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    const nested =
        payload.data && typeof payload.data === "object"
            ? (payload.data as { error?: unknown; fail_reason?: unknown; message?: unknown; msg?: unknown })
            : null;
    return (
        readApiErrorMessage(payload.fail_reason) ||
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        (nested
            ? readApiErrorMessage(nested.fail_reason) ||
              readApiErrorMessage(nested.error) ||
              readApiErrorMessage(nested.message) ||
              readApiErrorMessage(nested.msg)
            : "") ||
        ""
    );
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("networkRequestFailed");
        const responseData = error.response?.data;
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || apiText("videoDownloadFailed"));
    if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
