import { isTauri } from "@canvas/services/fs-store";

import {
    buildObjectAccessUrl,
    buildObjectKey,
    buildObjectUploadUrl,
    normalizePathPrefix,
    resolveForcePathStyle,
    resolveObjectStorageEndpoint,
    resolveSigningRegion,
} from "./providers";
import { signS3Request } from "./s3-sigv4";
import { isObjectStorageConfigured, type ObjectStorageConfig } from "./types";

export type ObjectStorageListedObject = {
    key: string;
    size: number;
    lastModified?: string;
    etag?: string;
};

export type ObjectStorageListResult = {
    objects: ObjectStorageListedObject[];
    prefixes: string[];
    isTruncated: boolean;
    nextContinuationToken?: string;
    keyCount: number;
};

export type ObjectStorageUsageSummary = {
    objectCount: number;
    totalBytes: number;
    truncated: boolean;
    prefix: string;
};

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

/** List objects via S3 ListObjectsV2 (works across COS/OSS/OBS/TOS/MinIO/S3/Kodo S3). */
export async function listObjects(
    config: ObjectStorageConfig,
    options?: {
        prefix?: string;
        delimiter?: string;
        maxKeys?: number;
        continuationToken?: string;
        signal?: AbortSignal;
    },
): Promise<ObjectStorageListResult> {
    assertConfigured(config);
    const params = new URLSearchParams();
    params.set("list-type", "2");
    params.set("max-keys", String(Math.min(1000, Math.max(1, options?.maxKeys || 100))));
    if (options?.prefix) params.set("prefix", options.prefix);
    if (options?.delimiter) params.set("delimiter", options.delimiter);
    if (options?.continuationToken) params.set("continuation-token", options.continuationToken);

    const url = `${buildBucketRootUrl(config)}?${params.toString()}`;
    const xml = await s3FetchText(config, "GET", url, undefined, options?.signal);
    return parseListObjectsXml(xml);
}

/** Delete many keys with bounded concurrency (single-object DELETE for max compatibility). */
export async function deleteObjectsAtKeys(config: ObjectStorageConfig, keys: string[], concurrency = 4) {
    assertConfigured(config);
    const unique = [...new Set(keys.map((key) => key.replace(/^\/+/, "")).filter(Boolean))];
    const errors: string[] = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, unique.length) || 1 }, async () => {
        while (cursor < unique.length) {
            const index = cursor;
            cursor += 1;
            const key = unique[index];
            try {
                await deleteObjectAtKey(config, key);
            } catch (error) {
                errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    });
    await Promise.all(workers);
    if (errors.length) throw new Error(errors.slice(0, 5).join("; "));
}

/** Walk ListObjectsV2 under a prefix to estimate storage usage (object count + bytes). */
export async function summarizeObjectStorageUsage(
    config: ObjectStorageConfig,
    options?: { prefix?: string; maxPages?: number; signal?: AbortSignal },
): Promise<ObjectStorageUsageSummary> {
    assertConfigured(config);
    const prefix = options?.prefix ?? normalizePathPrefix(config.pathPrefix);
    const maxPages = Math.max(1, options?.maxPages || 20);
    let continuationToken: string | undefined;
    let objectCount = 0;
    let totalBytes = 0;
    let truncated = false;

    for (let page = 0; page < maxPages; page += 1) {
        const result = await listObjects(config, {
            prefix,
            maxKeys: 1000,
            continuationToken,
            signal: options?.signal,
        });
        objectCount += result.objects.length;
        totalBytes += result.objects.reduce((sum, item) => sum + (item.size || 0), 0);
        if (!result.isTruncated || !result.nextContinuationToken) {
            truncated = false;
            break;
        }
        continuationToken = result.nextContinuationToken;
        truncated = true;
        if (page === maxPages - 1) truncated = true;
    }

    return { objectCount, totalBytes, truncated, prefix };
}

function assertConfigured(config: ObjectStorageConfig) {
    if (!isObjectStorageConfigured(config)) throw new Error("Object storage is not configured");
    if (!resolveObjectStorageEndpoint(config)) throw new Error("Object storage endpoint is missing");
}

export function buildBucketRootUrl(config: ObjectStorageConfig) {
    const endpoint = resolveObjectStorageEndpoint(config);
    if (!endpoint) throw new Error("Object storage endpoint is missing");
    const bucket = config.bucket.trim();
    if (resolveForcePathStyle(config)) {
        return `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(bucket)}`;
    }
    const url = new URL(endpoint.includes("://") ? endpoint : `https://${endpoint}`);
    const host = url.hostname.toLowerCase();
    if (!host.startsWith(`${bucket}.`.toLowerCase())) {
        url.hostname = `${bucket}.${url.hostname}`;
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
}

async function s3FetchText(
    config: ObjectStorageConfig,
    method: string,
    url: string,
    body?: string,
    signal?: AbortSignal,
) {
    const headers = await signS3Request({
        method,
        url,
        accessKeyId: config.accessKeyId.trim(),
        secretAccessKey: config.secretAccessKey.trim(),
        region: resolveSigningRegion(config),
        extraHeaders: body ? { "content-type": "application/xml" } : undefined,
    });
    const requestHeaders = { ...headers };
    delete requestHeaders.host;

    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const response = await tauriFetch(url, { method, headers: requestHeaders, body, signal });
        const text = await response.text().catch(() => "");
        if (!response.ok) throw new Error(text.slice(0, 240) || `${method} failed (${response.status})`);
        return text;
    }

    const response = await fetch(url, { method, headers: requestHeaders, body, signal });
    const text = await response.text().catch(() => "");
    if (!response.ok) throw new Error(text.slice(0, 240) || `${method} failed (${response.status})`);
    return text;
}

function parseListObjectsXml(xml: string): ObjectStorageListResult {
    const objects: ObjectStorageListedObject[] = [];
    const prefixes: string[] = [];
    const contentBlocks = xml.match(/<Contents\b[\s\S]*?<\/Contents>/gi) || [];
    for (const block of contentBlocks) {
        const key = xmlTag(block, "Key");
        if (!key) continue;
        objects.push({
            key,
            size: Number(xmlTag(block, "Size") || 0) || 0,
            lastModified: xmlTag(block, "LastModified") || undefined,
            etag: xmlTag(block, "ETag")?.replace(/"/g, "") || undefined,
        });
    }
    const prefixBlocks = xml.match(/<CommonPrefixes\b[\s\S]*?<\/CommonPrefixes>/gi) || [];
    for (const block of prefixBlocks) {
        const prefix = xmlTag(block, "Prefix");
        if (prefix) prefixes.push(prefix);
    }
    const isTruncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
    const nextContinuationToken = xmlTag(xml, "NextContinuationToken") || undefined;
    const keyCount = Number(xmlTag(xml, "KeyCount") || objects.length) || objects.length;
    return { objects, prefixes, isTruncated, nextContinuationToken, keyCount };
}

function xmlTag(xml: string, tag: string) {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    if (!match) return "";
    return match[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .trim();
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
