import { nanoid } from "nanoid";

import { publishCloudMediaUrl } from "@canvas/services/cloud-upload-progress";
import { blobStore, isTauri } from "@canvas/services/fs-store";
import {
    uploadCanvasMedia,
    assertCanvasMediaUploadSize,
    isPubliclyReachableMediaUrl,
    MAX_CANVAS_UPLOAD_BYTES,
} from "@canvas/services/object-storage";
import { isObjectStorageConfigured, useConfigStore } from "@canvas/stores/use-config-store";

export type UploadedFile = {
    url: string;
    storageKey: string;
    bytes: number;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    preview?: { url: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string };
    pendingRemoteUpload?: boolean;
};

const store = blobStore("media_files");
const objectUrls = new Map<string, string>();

export type UploadMediaOptions = {
    /** Return the local blob immediately and push the public URL onto the node later. */
    background?: boolean;
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
};

export async function uploadMediaFile(
    input: string | Blob,
    prefix = "file",
    options?: UploadMediaOptions | ((uploadedBytes: number, totalBytes: number) => void),
    _scope?: unknown,
): Promise<UploadedFile> {
    const resolvedOptions: UploadMediaOptions | undefined =
        typeof options === "function" ? { onProgress: options } : options;
    const blob = typeof input === "string" ? await fetchBlob(input) : input;
    const byoConfigured = isObjectStorageConfigured(useConfigStore.getState().objectStorage);
    assertCanvasMediaUploadSize(
        blob.size,
        blob.type,
        input instanceof File ? input.name : "",
        byoConfigured ? MAX_CANVAS_UPLOAD_BYTES : 0,
    );
    const storageKey = `${prefix}:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const localUrl = URL.createObjectURL(blob);
    objectUrls.set(storageKey, localUrl);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(localUrl) : blob.type.startsWith("audio/") ? await readAudioMeta(localUrl) : {};
    const base: UploadedFile = {
        url: localUrl,
        storageKey,
        bytes: blob.size,
        mimeType: blob.type || "application/octet-stream",
        ...meta,
    };

    const cloud = uploadCanvasMedia(blob, {
        filename: input instanceof File ? input.name : undefined,
        contentType: base.mimeType,
        purpose: "canvas",
        onProgress: resolvedOptions?.onProgress,
        signal: resolvedOptions?.signal,
        onSuccess: (uploaded) => {
            if (uploaded.accessUrl && isPubliclyReachableMediaUrl(uploaded.accessUrl)) {
                publishCloudMediaUrl(storageKey, uploaded.accessUrl);
            }
        },
    })
        .then((uploaded) => {
            if (uploaded?.accessUrl && isPubliclyReachableMediaUrl(uploaded.accessUrl)) {
                publishCloudMediaUrl(storageKey, uploaded.accessUrl);
                return uploaded;
            }
            // BYO storage may return LAN/custom domains that still work for model fetch via CDN mapping.
            if (byoConfigured && uploaded?.accessUrl) {
                publishCloudMediaUrl(storageKey, uploaded.accessUrl);
                return uploaded;
            }
            return null;
        })
        .catch((error) => {
            if (isAbortError(error) || resolvedOptions?.signal?.aborted) throw error;
            if (byoConfigured && !resolvedOptions?.background) throw error;
            return null;
        });

    // Local file is already usable. Cloud upload continues in the background.
    if (resolvedOptions?.background) return base;

    const uploaded = await cloud;
    if (resolvedOptions?.signal?.aborted) {
        const error = new Error("Upload canceled");
        error.name = "AbortError";
        throw error;
    }
    if (uploaded?.accessUrl) {
        return { ...base, url: uploaded.accessUrl, bytes: uploaded.bytes || base.bytes, mimeType: uploaded.mimeType || base.mimeType };
    }
    if (byoConfigured) {
        throw new Error("Object storage upload returned no public URL");
    }
    return base;
}

function isAbortError(error: unknown) {
    return error instanceof Error && (error.name === "AbortError" || /cancel|abort/i.test(error.message));
}

/** Tauri fetch bypasses webview CORS so remote media actually lands in the local store. */
async function fetchBlob(url: string): Promise<Blob> {
    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        return (await tauriFetch(url)).blob();
    }
    return (await fetch(url)).blob();
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await Promise.all(unused.map((key) => store.removeItem(key)));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
