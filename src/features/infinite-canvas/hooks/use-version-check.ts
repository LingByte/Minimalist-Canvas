import { useCallback, useMemo, useState } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "@canvas/constant/env";
import type { ReleaseInfo } from "@canvas/lib/release";

function readLocalReleases(): ReleaseInfo[] {
    return __APP_RELEASES__ || [];
}

/** Embedded canvas uses bundled VERSION/CHANGELOG only — no upstream GitHub fetch. */
export function useVersionCheck() {
    const { t } = useTranslation();
    const currentVersion = APP_VERSION;
    const { message } = App.useApp();
    const localReleases = useMemo(readLocalReleases, []);
    const [open, setOpen] = useState(false);
    const [checking, setChecking] = useState(false);

    const checkLatestRelease = useCallback(
        async (showMessage = false) => {
            setChecking(true);
            try {
                if (showMessage) message.success(t("version.updated"));
                return true;
            } finally {
                setChecking(false);
            }
        },
        [message, t],
    );

    const openReleaseModal = useCallback(() => {
        setOpen(true);
    }, []);

    return {
        open,
        setOpen,
        openReleaseModal,
        latestVersion: currentVersion,
        releases: localReleases,
        checking,
        hasNewVersion: false,
        checkLatestRelease,
    };
}
