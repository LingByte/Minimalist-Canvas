import { saveAs } from "file-saver";

import { isTauri, storageRoot } from "@canvas/services/fs-store";

async function fetchBlob(url: string): Promise<Blob> {
    // Remote URLs go through the Tauri http plugin to bypass webview CORS.
    if (/^https?:\/\//i.test(url)) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        return (await tauriFetch(url)).blob();
    }
    return (await fetch(url)).blob();
}

/**
 * Save a blob/URL to disk. In the desktop app this shows the native save dialog
 * (defaulting to <storage-root>/exports/<filename>) and returns the chosen path.
 * In web builds it falls back to a browser download and returns null.
 */
export async function saveBlobAs(input: string | Blob, filename: string): Promise<string | null> {
    if (!isTauri()) {
        saveAs(input as Blob, filename);
        return null;
    }
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { join } = await import("@tauri-apps/api/path");
    const { mkdir, exists, writeFile } = await import("@tauri-apps/plugin-fs");
    const exportsDir = await join(await storageRoot(), "exports");
    if (!(await exists(exportsDir))) await mkdir(exportsDir, { recursive: true });
    const target = await save({ defaultPath: await join(exportsDir, filename) });
    if (!target) return null;
    const blob = typeof input === "string" ? await fetchBlob(input) : input;
    await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
    return target;
}
