import { App, Button } from "antd";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppConfigPanel } from "@canvas/components/layout/app-config-modal";
import { isTauri, storageRoot } from "@canvas/services/fs-store";

export default function ConfigPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();

    const openStorage = async (subpath?: string) => {
        if (!isTauri()) {
            message.info(t("config.localStorage.openPathFailed"));
            return;
        }
        try {
            const root = await storageRoot();
            const sep = root.includes("\\") ? "\\" : "/";
            const path = subpath
                ? `${root.replace(/[/\\]+$/, "")}${sep}${subpath}`
                : root;
            const { openPath, revealItemInDir } = await import("@tauri-apps/plugin-opener");
            try {
                await openPath(path);
            } catch {
                await revealItemInDir(path);
            }
        } catch (err) {
            message.error(t("config.localStorage.openPathFailed") + ": " + String(err));
        }
    };

    return (
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto max-w-6xl px-6 py-6">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-stone-950 dark:text-stone-100">{t("config.title")}</h1>
                        <p className="mt-1 text-sm text-stone-500">{t("config.description")}</p>
                    </div>
                    {isTauri() ? (
                        <div className="flex flex-wrap gap-2">
                            <Button icon={<FolderOpen className="size-3.5" />} onClick={() => void openStorage()}>
                                {t("config.localStorage.openPath")}
                            </Button>
                            <Button type="primary" icon={<FolderOpen className="size-3.5" />} onClick={() => void openStorage("app_state")}>
                                {t("config.localStorage.openConfigJson")}
                            </Button>
                        </div>
                    ) : null}
                </div>
                <AppConfigPanel />
            </div>
        </main>
    );
}
