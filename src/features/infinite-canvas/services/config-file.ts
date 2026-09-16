import { saveAs } from "file-saver";

import i18n from "@canvas/i18n";
import { useConfigStore, type AiConfig, type WebdavSyncConfig } from "@canvas/stores/use-config-store";
import { usePromptSourceStore } from "@canvas/stores/use-prompt-source-store";
import type { PromptSource } from "@canvas/services/api/prompt-source-presets";

type AppConfigFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
    webdav: WebdavSyncConfig;
    promptSources: {
        sources: PromptSource[];
    };
};

export function exportAppConfig() {
    const { config, webdav } = useConfigStore.getState();
    const { sources } = usePromptSourceStore.getState();
    const data: AppConfigFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), config, webdav, promptSources: { sources } };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "infinite-canvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error(i18n.t("config.invalidFile"));
    }
    if (data.app !== "infinite-canvas" || data.version !== 1 || !data.config || !data.webdav || !data.promptSources) throw new Error(i18n.t("config.invalidFile"));
    useConfigStore.setState({ config: data.config, webdav: data.webdav });
    await usePromptSourceStore.getState().loadSources();
}
