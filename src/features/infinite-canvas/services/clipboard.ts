import { isTauri } from "@canvas/services/fs-store";

/**
 * Read an image from the system clipboard.
 *
 * Strategy (optimized for Tauri WebView2 on Windows):
 * 1. Web Clipboard API first — when the user clicks the paste button, the
 *    WebView has focus and user activation, so navigator.clipboard.read()
 *    should work. It can return both image blobs and text (URLs).
 * 2. Tauri clipboard-manager fallback — reads the native OS clipboard
 *    directly (arboard), useful when the web API is unavailable.
 * 3. If we only got a text URL, try to fetch it as an image.
 *
 * Returns a File ready for upload, or null when the clipboard has no image.
 */
export async function readClipboardImage(): Promise<File | null> {
    // 1. Web Clipboard API (works with user activation from button click).
    if (navigator.clipboard && typeof navigator.clipboard.read === "function") {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                // Image blob?
                const imageType = item.types.find((type) => type.startsWith("image/"));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    if (blob.size) {
                        console.log("[clipboard] web API got image", imageType, blob.size);
                        return new File([blob], "clipboard-image.png", { type: imageType });
                    }
                }
                // HTML with embedded <img>? (e.g. copied from a web page)
                const htmlType = item.types.find((type) => type === "text/html");
                if (htmlType) {
                    const htmlBlob = await item.getType(htmlType);
                    const html = await htmlBlob.text();
                    const src = extractImageUrlFromHtml(html);
                    if (src) {
                        console.log("[clipboard] web API got image URL from HTML:", src);
                        const file = await urlToImageFile(src);
                        if (file) return file;
                    }
                }
                // Plain text URL?
                const textType = item.types.find((type) => type === "text/plain");
                if (textType) {
                    const textBlob = await item.getType(textType);
                    const text = (await textBlob.text()).trim();
                    if (isHttpUrl(text)) {
                        console.log("[clipboard] web API got URL from text:", text);
                        const file = await urlToImageFile(text);
                        if (file) return file;
                    }
                }
            }
            console.log("[clipboard] web API: no image found in clipboard items", items.map((i) => i.types));
        } catch (error) {
            console.warn("[clipboard] navigator.clipboard.read failed", error);
        }
    } else {
        console.log("[clipboard] navigator.clipboard.read not available");
    }

    // 2. Tauri clipboard-manager fallback (native OS clipboard).
    if (isTauri()) {
        // 2a. Try native image read.
        try {
            const { readImage } = await import("@tauri-apps/plugin-clipboard-manager");
            const image = await readImage();
            const rgba = await image.rgba();
            const { width, height } = await image.size();
            console.log("[clipboard] tauri readImage ok", { rgbaLen: rgba.length, width, height });

            if (rgba.length && width && height) {
                // Issue #1985: some plugin versions return PNG bytes instead of RGBA.
                const expectedRgbaLen = width * height * 4;
                if (rgba.length === expectedRgbaLen) {
                    const blob = await rgbaToPngBlob(rgba, width, height);
                    if (blob && blob.size) return new File([blob], "clipboard-image.png", { type: "image/png" });
                } else {
                    const blob = new Blob([new Uint8Array(rgba)], { type: "image/png" });
                    if (blob.size) return new File([blob], "clipboard-image.png", { type: "image/png" });
                }
            }
        } catch (error) {
            console.warn("[clipboard] tauri readImage failed", error);
        }

        // 2b. Try native text read — maybe the clipboard has an image URL.
        try {
            const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
            const text = ((await readText()) ?? "").trim();
            if (isHttpUrl(text)) {
                console.log("[clipboard] tauri readText got URL:", text);
                const file = await urlToImageFile(text);
                if (file) return file;
            }
        } catch (error) {
            console.warn("[clipboard] tauri readText failed", error);
        }
    }

    return null;
}

/** Read plain text from the system clipboard. Returns "" when unavailable. */
export async function readClipboardText(): Promise<string> {
    // Web API first (works with user activation).
    if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        try {
            return await navigator.clipboard.readText();
        } catch (error) {
            console.warn("[clipboard] navigator.clipboard.readText failed", error);
        }
    }
    // Tauri fallback.
    if (isTauri()) {
        try {
            const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
            return (await readText()) ?? "";
        } catch (error) {
            console.warn("[clipboard] tauri readText failed", error);
        }
    }
    return "";
}

/** Extract the first <img src="..."> URL from an HTML clipboard payload. */
function extractImageUrlFromHtml(html: string): string | null {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : null;
}

/** Check if a string looks like an HTTP(S) URL. */
function isHttpUrl(text: string): boolean {
    return /^https?:\/\/\S+$/i.test(text);
}

/** Download a URL and return it as a File, using Tauri http to bypass CORS. */
async function urlToImageFile(url: string): Promise<File | null> {
    try {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const res = await tauriFetch(url);
        const contentType = res.headers.get("content-type") || "";
        const blob = await res.blob();
        if (!blob.size) return null;
        // Only accept image content types.
        if (!contentType.startsWith("image/") && !blob.type.startsWith("image/")) {
            console.log("[clipboard] URL did not return an image:", contentType);
            return null;
        }
        const ext = contentType.match(/image\/(\w+)/)?.[1] || url.match(/\.(\w+)(\?|#|$)/)?.[1] || "png";
        return new File([blob], `clipboard-image.${ext}`, { type: blob.type || contentType || "image/png" });
    } catch (error) {
        console.warn("[clipboard] urlToImageFile failed for", url, error);
        return null;
    }
}

/** Convert raw RGBA pixel data into a PNG Blob via an offscreen canvas. */
function rgbaToPngBlob(rgba: Uint8Array, width: number, height: number): Promise<Blob | null> {
    return new Promise((resolve) => {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(null);
            const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
            ctx.putImageData(imageData, 0, 0);
            canvas.toBlob((blob) => resolve(blob), "image/png");
        } catch (error) {
            console.warn("[clipboard] rgbaToPngBlob failed", error);
            resolve(null);
        }
    });
}
