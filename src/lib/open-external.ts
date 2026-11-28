/** Optional remote origin for desktop absolute `/api/storage` URLs. */
export const SITE_BASE_URL = (import.meta.env.VITE_REACT_APP_SERVER_URL || "").replace(/\/+$/, "");

/** Same as SITE_BASE_URL; kept for callers that need an Origin header value. */
export const SITE_ORIGIN = SITE_BASE_URL;

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
