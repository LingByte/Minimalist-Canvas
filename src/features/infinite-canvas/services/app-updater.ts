import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { t } from "i18next";
import { toast } from "sonner";

import { isTauri } from "@canvas/services/fs-store";

const AUTO_CHECK_DELAY_MS = 4000;

let checking = false;
let autoCheckTimer: number | null = null;
/** Version already prompted this session — don't re-toast on repeated checks. */
let promptedVersion = "";

/** Current installed version ("0.1.6"), or null outside Tauri. */
export async function appVersion(): Promise<string | null> {
    if (!isTauri()) return null;
    try {
        return await getVersion();
    } catch {
        return null;
    }
}

/** One auto check shortly after startup; call from the root layout. */
export function scheduleAutoUpdateCheck() {
    if (!isTauri() || autoCheckTimer !== null) return;
    autoCheckTimer = window.setTimeout(() => {
        autoCheckTimer = null;
        void checkForAppUpdate();
    }, AUTO_CHECK_DELAY_MS);
}

/** Check GitHub latest.json; prompts a toast with an install action when a newer release exists. */
export async function checkForAppUpdate(options?: { manual?: boolean }) {
    if (!isTauri() || checking) return;
    checking = true;
    try {
        const update = await check();
        if (!update || update.version === promptedVersion) {
            if (!update && options?.manual) toast.success(t("You're up to date"));
            return;
        }
        promptedVersion = update.version;
        toast(t("A new version {{version}} is available", { version: update.version }), {
            id: "app-update",
            duration: Infinity,
            action: {
                label: t("Update now"),
                onClick: () => void downloadAndInstall(update),
            },
        });
    } catch (error) {
        console.error("[updater] check failed", error);
        if (options?.manual) toast.error(t("Update check failed"));
    } finally {
        checking = false;
    }
}

async function downloadAndInstall(update: Update) {
    const toastId = "app-update-download";
    let total = 0;
    let downloaded = 0;
    toast.loading(t("Downloading update"), { id: toastId });
    try {
        await update.downloadAndInstall((event) => {
            if (event.event === "Started") {
                total = event.data.contentLength ?? 0;
            } else if (event.event === "Progress") {
                downloaded += event.data.chunkLength;
                if (total > 0) {
                    const percent = Math.min(99, Math.floor((downloaded / total) * 100));
                    toast.loading(t("Downloading update {{percent}}%", { percent }), { id: toastId });
                }
            }
        });
        toast.dismiss(toastId);
        toast(t("Update ready — relaunch to apply"), {
            id: "app-update-ready",
            duration: Infinity,
            action: { label: t("Relaunch"), onClick: () => void relaunch() },
        });
    } catch (error) {
        console.error("[updater] download/install failed", error);
        toast.error(t("Update failed"), { id: toastId });
    }
}
