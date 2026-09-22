import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { APP_VERSION } from "@canvas/constant/env";
import type { ReleaseInfo } from "@canvas/lib/release";
import { isTauri } from "@canvas/services/fs-store";

function readLocalReleases(): ReleaseInfo[] {
    return __APP_RELEASES__ || [];
}

type UpdateProgress = {
    downloaded: number;
    total: number | null;
};

export function useVersionCheck() {
    const { t } = useTranslation();
    const currentVersion = APP_VERSION;
    const { message } = App.useApp();
    const localReleases = useMemo(readLocalReleases, []);
    const [open, setOpen] = useState(false);
    const [checking, setChecking] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [latestVersion, setLatestVersion] = useState(currentVersion);
    const [hasNewVersion, setHasNewVersion] = useState(false);
    const [updateNotes, setUpdateNotes] = useState<string | null>(null);
    const [progress, setProgress] = useState<UpdateProgress | null>(null);
    const updateRef = useRef<Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>>(null);
    const checkedOnce = useRef(false);

    const clearPendingUpdate = useCallback(() => {
        updateRef.current = null;
        setHasNewVersion(false);
        setLatestVersion(currentVersion);
        setUpdateNotes(null);
        setProgress(null);
    }, [currentVersion]);

    const checkLatestRelease = useCallback(
        async (showMessage = false) => {
            setChecking(true);
            try {
                if (!isTauri()) {
                    clearPendingUpdate();
                    if (showMessage) message.success(t("version.updated"));
                    return true;
                }

                const { check } = await import("@tauri-apps/plugin-updater");
                const update = await check();
                if (!update) {
                    clearPendingUpdate();
                    if (showMessage) message.success(t("version.upToDate"));
                    return true;
                }

                updateRef.current = update;
                setHasNewVersion(true);
                setLatestVersion(update.version);
                setUpdateNotes(update.body ?? null);
                if (showMessage) {
                    message.info(t("version.updateAvailable", { version: update.version }));
                }
                return true;
            } catch (error) {
                console.error(error);
                if (showMessage) {
                    message.error(
                        error instanceof Error ? error.message : t("version.updateFailed")
                    );
                }
                return false;
            } finally {
                setChecking(false);
            }
        },
        [clearPendingUpdate, message, t]
    );

    const installUpdate = useCallback(async () => {
        const update = updateRef.current;
        if (!update || !isTauri()) return false;

        setInstalling(true);
        setProgress({ downloaded: 0, total: null });
        try {
            let downloaded = 0;
            let total: number | null = null;
            await update.downloadAndInstall((event) => {
                if (event.event === "Started") {
                    total = event.data.contentLength ?? null;
                    downloaded = 0;
                    setProgress({ downloaded, total });
                } else if (event.event === "Progress") {
                    downloaded += event.data.chunkLength;
                    setProgress({ downloaded, total });
                } else if (event.event === "Finished") {
                    setProgress({ downloaded: total ?? downloaded, total });
                }
            });

            message.success(t("version.installReady"));
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
            return true;
        } catch (error) {
            console.error(error);
            message.error(
                error instanceof Error ? error.message : t("version.installFailed")
            );
            return false;
        } finally {
            setInstalling(false);
        }
    }, [message, t]);

    useEffect(() => {
        if (!isTauri() || checkedOnce.current) return;
        checkedOnce.current = true;
        void checkLatestRelease(false);
    }, [checkLatestRelease]);

    const openReleaseModal = useCallback(() => {
        setOpen(true);
    }, []);

    return {
        open,
        setOpen,
        openReleaseModal,
        latestVersion,
        releases: localReleases,
        checking,
        installing,
        hasNewVersion,
        updateNotes,
        progress,
        checkLatestRelease,
        installUpdate,
    };
}
