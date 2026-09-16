import localforage from "localforage";
import { nanoid } from "nanoid";

import { uploadCanvasMedia, assertCanvasMediaUploadSize } from "@canvas/services/object-storage";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const objectUrls = new Map<string, string>();

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    assertCanvasMediaUploadSize(blob.size, blob.type, input instanceof File ? input.name : "");
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

    // Prefer a publicly reachable 七猴 URL so upstream video workers can fetch.
    try {
        const uploaded = await uploadCanvasMedia(blob, {
            filename: input instanceof File ? input.name : undefined,
            contentType: base.mimeType,
            purpose: "canvas",
        });
        if (uploaded?.accessUrl && isPubliclyReachableMediaUrl(uploaded.accessUrl)) {
            return { ...base, url: uploaded.accessUrl, bytes: uploaded.bytes || base.bytes, mimeType: uploaded.mimeType || base.mimeType };
        }
    } catch {
        // Local blob URL remains usable for canvas preview.
    }
    return base;
}

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
