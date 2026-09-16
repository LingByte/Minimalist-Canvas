/** Fixed backend site for this desktop build — auth, prompts, assets APIs. */
export const SITE_BASE_URL = "https://canvas.lingecho.com";

/** Resolve the configured backend site base URL (no trailing slash). */
export function siteBaseUrl(): string {
    return SITE_BASE_URL;
}

/** Build an absolute URL on the configured site, e.g. siteUrl("/profile"). */
export function siteUrl(path: string): string {
    const base = siteBaseUrl();
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Open a URL in the system browser under Tauri, or a new tab on web. */
export async function openExternal(url: string): Promise<void> {
    try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
    } catch {
        window.open(url, "_blank", "noopener,noreferrer");
    }
}

/** Open a page on the configured site in the system browser. */
export async function openSitePage(path: string): Promise<void> {
    await openExternal(siteUrl(path));
}
