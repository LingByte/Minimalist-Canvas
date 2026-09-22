import i18n from "@canvas/i18n";
import { publishCloudMediaUrl } from "@canvas/services/cloud-upload-progress";
import { getImageBlob, resolveImageUrl } from "@canvas/services/image-storage";
import { getMediaBlob } from "@canvas/services/file-storage";
import { uploadCanvasMedia } from "@canvas/services/object-storage";
import type { ReferenceImage } from "@canvas/types/image";

export type EnsurePublicMediaOptions = {
    signal?: AbortSignal;
    /** Prefer this name when re-uploading from a local blob. */
    filename?: string;
    contentType?: string;
};

/**
 * True when an upstream worker (often remote) can fetch the URL.
 * Rejects localhost / private LAN hosts that only the desktop can reach.
 */
export function isPubliclyReachableMediaUrl(value: string): boolean {
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

/** Ensure one image reference resolves to a publicly reachable HTTPS URL (upload if needed). */
export async function ensurePublicImageUrl(
    image: {
        url?: string;
        dataUrl?: string;
        storageKey?: string;
        name?: string;
        type?: string;
    },
    options?: EnsurePublicMediaOptions,
): Promise<string> {
    const existing = (image.url || image.dataUrl || "").trim();
    if (isPubliclyReachableMediaUrl(existing)) return existing;

    if (options?.signal?.aborted) {
        throw abortError();
    }

    const blob = await imageSourceToBlob(image);
    if (!blob) {
        throw new Error(i18n.t("apiErrors.referenceImageUploadRequired"));
    }

    let uploaded;
    try {
        uploaded = await uploadCanvasMedia(blob, {
            filename: options?.filename || image.name || undefined,
            contentType: options?.contentType || image.type || blob.type || "image/png",
            purpose: "canvas",
            signal: options?.signal,
        });
    } catch (error) {
        if (isAbortError(error) || options?.signal?.aborted) throw abortError();
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(i18n.t("apiErrors.referenceImageUploadFailed", { detail }));
    }

    if (!uploaded?.accessUrl) {
        throw new Error(i18n.t("apiErrors.referenceImageUploadFailed", { detail: "empty access url" }));
    }
    if (!isPubliclyReachableMediaUrl(uploaded.accessUrl)) {
        throw new Error(i18n.t("apiErrors.referenceMediaUrlNotPublic", { url: uploaded.accessUrl }));
    }
    if (image.storageKey) {
        publishCloudMediaUrl(image.storageKey, uploaded.accessUrl);
    }
    return uploaded.accessUrl;
}

/**
 * Ensure every reference image is a public cloud URL before generation.
 * Dedupes concurrent uploads by storageKey.
 */
export async function ensurePublicImageUrls(
    references: ReferenceImage[],
    options?: EnsurePublicMediaOptions,
): Promise<ReferenceImage[]> {
    if (!references.length) return [];
    const cache = new Map<string, Promise<string>>();

    return Promise.all(
        references.map(async (image) => {
            const cacheKey = image.storageKey || image.id || `${image.name}:${image.dataUrl?.slice(0, 64) || image.url || ""}`;
            let pending = cache.get(cacheKey);
            if (!pending) {
                pending = ensurePublicImageUrl(image, options);
                cache.set(cacheKey, pending);
            }
            const url = await pending;
            return { ...image, url, dataUrl: url };
        }),
    );
}

/** Same as ensurePublicImageUrl but for video/audio file refs keyed by storageKey + url. */
export async function ensurePublicFileUrl(
    item: { url?: string; storageKey?: string; name?: string; type?: string },
    kind: "video" | "audio",
    options?: EnsurePublicMediaOptions,
): Promise<string> {
    const existing = (item.url || "").trim();
    if (isPubliclyReachableMediaUrl(existing)) return existing;

    if (options?.signal?.aborted) throw abortError();

    let blob: Blob | null = null;
    if (item.storageKey) {
        blob = await getMediaBlob(item.storageKey);
    }
    if (!blob && item.url && (item.url.startsWith("blob:") || item.url.startsWith("data:") || /^https?:\/\//i.test(item.url))) {
        try {
            blob = await (await fetch(item.url)).blob();
        } catch {
            blob = null;
        }
    }
    if (!blob) {
        throw new Error(i18n.t(kind === "video" ? "apiErrors.invalidReferenceVideo" : "apiErrors.invalidReferenceAudio"));
    }

    let uploaded;
    try {
        uploaded = await uploadCanvasMedia(blob, {
            filename: options?.filename || item.name || undefined,
            contentType: options?.contentType || item.type || blob.type || "application/octet-stream",
            purpose: "canvas",
            signal: options?.signal,
        });
    } catch (error) {
        if (isAbortError(error) || options?.signal?.aborted) throw abortError();
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
            i18n.t(kind === "video" ? "apiErrors.referenceVideoUploadFailed" : "apiErrors.referenceAudioUploadFailed", { detail }),
        );
    }
    if (!uploaded?.accessUrl) {
        throw new Error(
            i18n.t(kind === "video" ? "apiErrors.referenceVideoUploadFailed" : "apiErrors.referenceAudioUploadFailed", {
                detail: "empty access url",
            }),
        );
    }
    if (!isPubliclyReachableMediaUrl(uploaded.accessUrl)) {
        throw new Error(i18n.t("apiErrors.referenceMediaUrlNotPublic", { url: uploaded.accessUrl }));
    }
    if (item.storageKey) {
        publishCloudMediaUrl(item.storageKey, uploaded.accessUrl);
    }
    return uploaded.accessUrl;
}

async function imageSourceToBlob(image: {
    url?: string;
    dataUrl?: string;
    storageKey?: string;
}): Promise<Blob | null> {
    if (image.storageKey) {
        const stored = await getImageBlob(image.storageKey);
        if (stored) return stored;
    }
    const source = image.dataUrl || image.url || (await resolveImageUrl(image.storageKey, ""));
    if (!source) return null;
    if (source.startsWith("data:") || source.startsWith("blob:") || /^https?:\/\//i.test(source)) {
        try {
            return await (await fetch(source)).blob();
        } catch {
            return null;
        }
    }
    return null;
}

function abortError() {
    const error = new Error(i18n.t("apiErrors.requestCanceled"));
    error.name = "AbortError";
    return error;
}

function isAbortError(error: unknown) {
    return error instanceof Error && (error.name === "AbortError" || /cancel|abort/i.test(error.message));
}
