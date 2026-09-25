/** Fixed backend site for this desktop build — auth, prompts, assets APIs. */
export const SITE_BASE_URL = "https://canvas.lingecho.com";

/** Origin accepted by the backend's auth allowlist (its configured server_address). */
export const SITE_ORIGIN = "https://canvas.lingecho.com";

function isDesktop() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type OpenerModule = typeof import("@tauri-apps/plugin-opener");
type ShellModule = typeof import("@tauri-apps/plugin-shell");

let openerModule: Promise<OpenerModule> | null = null;
let shellModule: Promise<ShellModule> | null = null;

// Warm the plugin chunks at import time so a click never waits on a network/bundle load.
if (typeof window !== "undefined" && isDesktop()) {
    void loadOpener().catch(() => {});
    void loadShell().catch(() => {});
}

function loadOpener() {
    openerModule ??= import("@tauri-apps/plugin-opener");
    return openerModule;
}

function loadShell() {
    shellModule ??= import("@tauri-apps/plugin-shell");
    return shellModule;
}

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
    if (isDesktop()) {
        try {
            const { openUrl } = await loadOpener();
            await openUrl(url);
            return;
        } catch {
            // fall through to shell.open
        }
        try {
            const { open } = await loadShell();
            await open(url);
            return;
        } catch {
            // fall through to window.open
        }
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

/** Open a page on the configured site in the system browser. */
export async function openSitePage(path: string): Promise<void> {
    await openExternal(siteUrl(path));
}
