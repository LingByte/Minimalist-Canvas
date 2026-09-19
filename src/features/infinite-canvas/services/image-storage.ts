import { nanoid } from "nanoid";
import i18n from "@canvas/i18n";
import { readImageMeta } from "@canvas/lib/image-utils";
import { blobStore, isTauri, kvStore } from "@canvas/services/fs-store";
import { uploadCanvasMedia, assertCanvasMediaUploadSize } from "@canvas/services/object-storage";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = blobStore("image_files");
const imageLogStore = kvStore("image_generation_logs");
const videoLogStore = kvStore("video_generation_logs");
const objectUrls = new Map<string, string>();

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    // Mirrored / public HTTPS urls: keep the URL as-is. Browser fetch would hit CORS
    // on third-party CDNs; <img> + naturalWidth still works without CORS.
    if (typeof input === "string" && /^https?:\/\//i.test(input)) {
        const meta = await readImageMeta(input);
        const storageKey = `image:${nanoid()}`;
        // Remote URLs (CDN / signed object-storage links) expire — keep a local copy.
        void cacheRemoteImageLocally(storageKey, input);
        return {
            url: input,
            storageKey,
            width: meta.width,
            height: meta.height,
            bytes: 0,
            mimeType: meta.mimeType || "image/png",
        };
    }

    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    assertCanvasMediaUploadSize(blob.size, blob.type, input instanceof File ? input.name : "");
    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const localUrl = URL.createObjectURL(blob);
    objectUrls.set(storageKey, localUrl);
    const meta = await readImageMeta(localUrl);
    const mimeType = blob.type || meta.mimeType;

    // Prefer a public 七猴 URL. Keep the local blob under storageKey for preview / APIs.
    let url = localUrl;
    try {
        const uploaded = await uploadCanvasMedia(blob, {
            filename: input instanceof File ? input.name : undefined,
            contentType: mimeType,
            purpose: "canvas",
        });
        if (uploaded?.accessUrl) url = uploaded.accessUrl;
    } catch {
        // Fall back to local blob URL when storage is disabled or upload fails.
    }

    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType };
}

/** Best-effort: pull a remote image URL into the local blob store under a known key. */
async function cacheRemoteImageLocally(storageKey: string, url: string) {
    try {
        if (await store.getItem<Blob>(storageKey)) return;
        const blob = isTauri()
            ? await (await import("@tauri-apps/plugin-http")).fetch(url).then((res) => res.blob())
            : await (await fetch(url)).blob();
        if (!blob.size) return;
        await setImageBlob(storageKey, blob);
    } catch {
        // Preview still uses the remote URL; the backup is best-effort.
    }
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    if (image.dataUrl?.startsWith("data:")) return image.dataUrl;
    // Prefer the locally cached blob so image edit APIs get a real data URL without refetching CDN.
    if (image.storageKey) {
        const blob = await store.getItem<Blob>(image.storageKey);
        if (blob) return blobToDataUrl(blob);
    }
    const url = image.dataUrl || image.url || (await resolveImageUrl(image.storageKey, ""));
    if (!url) return "";
    if (url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    await Promise.all([
        imageLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
        videoLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
    ]);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}
