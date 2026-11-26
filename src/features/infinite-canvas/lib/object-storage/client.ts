import { isTauri } from "@canvas/services/fs-store";

import {
    buildObjectAccessUrl,
    buildObjectKey,
    buildObjectUploadUrl,
    resolveObjectStorageEndpoint,
    resolveSigningRegion,
} from "./providers";
import { signS3Request } from "./s3-sigv4";
import { isObjectStorageConfigured, type ObjectStorageConfig } from "./types";

export type LocalObjectUploadResult = {
    key: string;
    accessUrl: string;
    bytes: number;
    mimeType: string;
};

export type LocalObjectUploadOptions = {
    filename?: string;
    contentType?: string;
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
};

function abortError() {
    const error = new Error("Upload canceled");
    error.name = "AbortError";
    return error;
}

export async function uploadToConfiguredObjectStorage(
    config: ObjectStorageConfig,
    input: Blob | File,
    options?: LocalObjectUploadOptions,
): Promise<LocalObjectUploadResult> {
    if (!isObjectStorageConfigured(config)) {
        throw new Error("Object storage is not configured");
    }
    if (!resolveObjectStorageEndpoint(config)) {
        throw new Error("Object storage endpoint is missing");
    }

    const filename =
        options?.filename ||
        (input instanceof File && input.name) ||
        guessFilename(options?.contentType || input.type || "application/octet-stream");
    const mimeType = (options?.contentType || input.type || "application/octet-stream").split(";")[0].trim() || "application/octet-stream";
    const blob = input.type === mimeType ? input : new Blob([input], { type: mimeType });
    const key = buildObjectKey(config.pathPrefix, filename);
    const uploadUrl = buildObjectUploadUrl(config, key);

    const extraHeaders: Record<string, string> = {
        "Content-Type": mimeType,
    };
    if (config.publicRead) {
        extraHeaders["x-amz-acl"] = "public-read";
    }

    const headers = await signS3Request({
        method: "PUT",
        url: uploadUrl,
        accessKeyId: config.accessKeyId.trim(),
        secretAccessKey: config.secretAccessKey.trim(),
        region: resolveSigningRegion(config),
        extraHeaders,
    });

    // Host is implied by the URL; browsers/XHR reject an explicit Host header.
    const requestHeaders = { ...headers };
    delete requestHeaders.host;

    await putObject(uploadUrl, blob, requestHeaders, options?.onProgress, options?.signal);

    return {
        key,
        accessUrl: buildObjectAccessUrl(config, key),
        bytes: blob.size,
        mimeType,
    };
}

/** Write a tiny probe object then delete it to verify credentials/bucket. */
export async function testObjectStorageConnection(config: ObjectStorageConfig) {
    const probe = new Blob([`minimalist-canvas-probe ${new Date().toISOString()}`], { type: "text/plain" });
    const uploaded = await uploadToConfiguredObjectStorage(config, probe, {
        filename: "connection-probe.txt",
        contentType: "text/plain",
    });
    try {
        await deleteObjectAtKey(config, uploaded.key);
    } catch {
        // Probe upload success is enough; delete is best-effort (some keys disallow delete).
    }
    return uploaded;
}

/** PUT an object at an exact key (no timestamp/random suffix). */
export async function putObjectAtKey(
    config: ObjectStorageConfig,
    key: string,
    body: Blob | File,
    options?: { contentType?: string; signal?: AbortSignal },
): Promise<LocalObjectUploadResult> {
    if (!isObjectStorageConfigured(config)) {
        throw new Error("Object storage is not configured");
    }
    if (!resolveObjectStorageEndpoint(config)) {
        throw new Error("Object storage endpoint is missing");
    }
    const mimeType =
        (options?.contentType || body.type || "application/octet-stream").split(";")[0].trim() || "application/octet-stream";
    const blob = body.type === mimeType ? body : new Blob([body], { type: mimeType });
    const normalizedKey = key.replace(/^\/+/, "");
    const uploadUrl = buildObjectUploadUrl(config, normalizedKey);
    const extraHeaders: Record<string, string> = { "Content-Type": mimeType };
    if (config.publicRead) extraHeaders["x-amz-acl"] = "public-read";
    const headers = await signS3Request({
        method: "PUT",
        url: uploadUrl,
        accessKeyId: config.accessKeyId.trim(),
        secretAccessKey: config.secretAccessKey.trim(),
        region: resolveSigningRegion(config),
        extraHeaders,
    });
    const requestHeaders = { ...headers };
    delete requestHeaders.host;
    await putObject(uploadUrl, blob, requestHeaders, undefined, options?.signal);
    return {
        key: normalizedKey,
        accessUrl: buildObjectAccessUrl(config, normalizedKey),
        bytes: blob.size,
        mimeType,
    };
}

/** GET object body as text. Returns null on 404. */
export async function getObjectText(config: ObjectStorageConfig, key: string, signal?: AbortSignal): Promise<string | null> {
    if (!isObjectStorageConfigured(config)) {
        throw new Error("Object storage is not configured");
    }
    const normalizedKey = key.replace(/^\/+/, "");
    const url = buildObjectUploadUrl(config, normalizedKey);
    const headers = await signS3Request({
        method: "GET",
        url,
        accessKeyId: config.accessKeyId.trim(),
        secretAccessKey: config.secretAccessKey.trim(),
        region: resolveSigningRegion(config),
    });
    const requestHeaders = { ...headers };
    delete requestHeaders.host;

    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const response = await tauriFetch(url, { method: "GET", headers: requestHeaders, signal });
        if (response.status === 404) return null;
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text.slice(0, 200) || `download failed (${response.status})`);
        }
        return response.text();
    }

    const response = await fetch(url, { method: "GET", headers: requestHeaders, signal });
    if (response.status === 404) return null;
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text.slice(0, 200) || `download failed (${response.status})`);
    }
    return response.text();
}

export async function deleteObjectAtKey(config: ObjectStorageConfig, key: string) {
    const uploadUrl = buildObjectUploadUrl(config, key.replace(/^\/+/, ""));
    const headers = await signS3Request({
        method: "DELETE",
        url: uploadUrl,
        accessKeyId: config.accessKeyId.trim(),
        secretAccessKey: config.secretAccessKey.trim(),
        region: resolveSigningRegion(config),
    });
    const requestHeaders = { ...headers };
    delete requestHeaders.host;

    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const response = await tauriFetch(uploadUrl, { method: "DELETE", headers: requestHeaders });
        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`delete failed (${response.status})`);
        }
        return;
    }

    const response = await fetch(uploadUrl, { method: "DELETE", headers: requestHeaders });
    if (!response.ok && response.status !== 204 && response.status !== 404) {
        throw new Error(`delete failed (${response.status})`);
    }
}

async function putObject(
    url: string,
    body: Blob,
    headers: Record<string, string>,
    onProgress?: (loaded: number, total: number) => void,
    signal?: AbortSignal,
) {
    if (signal?.aborted) throw abortError();

    // Desktop: bypass webview CORS against vendor endpoints.
    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const response = await tauriFetch(url, {
            method: "PUT",
            headers,
            body: await body.arrayBuffer(),
            signal,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text.slice(0, 200) || `upload failed (${response.status})`);
        }
        onProgress?.(body.size, body.size);
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        for (const [key, value] of Object.entries(headers)) {
            xhr.setRequestHeader(key, value);
        }
        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) onProgress(event.loaded, event.total);
            };
        }
        const onAbort = () => {
            xhr.abort();
            reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        xhr.onload = () => {
            signal?.removeEventListener("abort", onAbort);
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }
            reject(new Error((xhr.responseText || "").slice(0, 200) || `upload failed (${xhr.status})`));
        };
        xhr.onerror = () => {
            signal?.removeEventListener("abort", onAbort);
            reject(new Error("upload failed (network error)"));
        };
        xhr.onabort = () => {
            signal?.removeEventListener("abort", onAbort);
            reject(abortError());
        };
        xhr.send(body);
    });
}

function guessFilename(mimeType: string) {
    if (mimeType === "image/png") return "image.png";
    if (mimeType === "image/jpeg") return "image.jpg";
    if (mimeType === "image/webp") return "image.webp";
    if (mimeType.startsWith("video/")) return "video.mp4";
    if (mimeType.startsWith("audio/")) return "audio.bin";
    return "file.bin";
}
