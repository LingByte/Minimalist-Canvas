import i18n from "@canvas/i18n";
import { saveBlobAs } from "@canvas/lib/save-file";
import {
    defaultObjectStorageConfig,
    useConfigStore,
    type AiConfig,
    type ObjectStorageConfig,
    type WebdavSyncConfig,
} from "@canvas/stores/use-config-store";
import { usePromptSourceStore } from "@canvas/stores/use-prompt-source-store";
import { createPromptSource, type PromptSource } from "@canvas/services/api/prompt-source-presets";
import { invalidateObjectStorageStatusCache } from "@canvas/services/object-storage";

type AppConfigFile = {
    app: "minimalist-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
    webdav: WebdavSyncConfig;
    objectStorage?: ObjectStorageConfig;
    promptSources: {
        sources: PromptSource[];
    };
};

export async function exportAppConfig() {
    const { config, webdav, objectStorage } = useConfigStore.getState();
    const { sources } = usePromptSourceStore.getState();
    const data: AppConfigFile = {
        app: "minimalist-canvas",
        version: 1,
        exportedAt: new Date().toISOString(),
        config,
        webdav,
        objectStorage,
        promptSources: { sources },
    };
    await saveBlobAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "minimalist-canvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error(i18n.t("config.invalidFile"));
    }
    if (data.app !== "minimalist-canvas" || data.version !== 1 || !data.config || !data.webdav || !data.promptSources) throw new Error(i18n.t("config.invalidFile"));
    useConfigStore.setState({
        config: data.config,
        webdav: data.webdav,
        objectStorage: { ...defaultObjectStorageConfig, ...(data.objectStorage || {}) },
    });
    invalidateObjectStorageStatusCache();
    const importedSources = Array.isArray(data.promptSources.sources) ? data.promptSources.sources : [];
    usePromptSourceStore.getState().setSources(importedSources.map((source) => createPromptSource(source)));
}
