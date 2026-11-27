import { nanoid } from "nanoid";

import i18n from "@canvas/i18n";
import { normalizePathPrefix } from "@canvas/lib/object-storage/providers";
import { deleteObjectAtKey, getObjectText, putObjectAtKey } from "@canvas/lib/object-storage/client";
import { isObjectStorageConfigured, type ObjectStorageConfig } from "@canvas/lib/object-storage/types";
import { sanitizeProjectForSync } from "@canvas/services/sanitize-canvas-project";
import { useCanvasStore, type CanvasProject } from "@canvas/stores/canvas/use-canvas-store";
import { useConfigStore } from "@canvas/stores/use-config-store";

export const CANVAS_CLOUD_VERSION_LIMIT = 30;

export type CanvasCloudVersionMeta = {
    id: string;
    createdAt: string;
    title: string;
    bytes: number;
    key: string;
};

type CanvasCloudVersionManifest = {
    projectId: string;
    updatedAt: string;
    currentKey: string;
    versions: CanvasCloudVersionMeta[];
};

function storageConfig(): ObjectStorageConfig {
    return useConfigStore.getState().objectStorage;
}

function assertConfigured() {
    const config = storageConfig();
    if (!isObjectStorageConfigured(config)) {
        throw new Error(i18n.t("canvas.cloudVersion.configureFirst"));
    }
    return config;
}

function projectRoot(config: ObjectStorageConfig, projectId: string) {
    return `${normalizePathPrefix(config.pathPrefix)}canvas-versions/${projectId}/`;
}

function currentKey(config: ObjectStorageConfig, projectId: string) {
    return `${projectRoot(config, projectId)}current.json`;
}

function manifestKey(config: ObjectStorageConfig, projectId: string) {
    return `${projectRoot(config, projectId)}manifest.json`;
}

function historyKey(config: ObjectStorageConfig, projectId: string, versionId: string) {
    return `${projectRoot(config, projectId)}history/${versionId}.json`;
}

async function readJson<T>(config: ObjectStorageConfig, key: string): Promise<T | null> {
    const text = await getObjectText(config, key);
    if (!text) return null;
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(i18n.t("canvas.cloudVersion.corrupt"));
    }
}

async function writeJson(config: ObjectStorageConfig, key: string, value: unknown) {
    const body = new Blob([JSON.stringify(value)], { type: "application/json" });
    return putObjectAtKey(config, key, body, { contentType: "application/json" });
}

async function readManifest(config: ObjectStorageConfig, projectId: string): Promise<CanvasCloudVersionManifest> {
    const existing = await readJson<CanvasCloudVersionManifest>(config, manifestKey(config, projectId));
    if (existing?.projectId === projectId && Array.isArray(existing.versions)) {
        return {
            projectId,
            updatedAt: existing.updatedAt || new Date().toISOString(),
            currentKey: existing.currentKey || currentKey(config, projectId),
            versions: existing.versions,
        };
    }
    return {
        projectId,
        updatedAt: new Date().toISOString(),
        currentKey: currentKey(config, projectId),
        versions: [],
    };
}

async function trimVersions(config: ObjectStorageConfig, manifest: CanvasCloudVersionManifest) {
    const overflow = manifest.versions.slice(CANVAS_CLOUD_VERSION_LIMIT);
    manifest.versions = manifest.versions.slice(0, CANVAS_CLOUD_VERSION_LIMIT);
    await Promise.all(
        overflow.map(async (item) => {
            try {
                await deleteObjectAtKey(config, item.key);
            } catch {
                // best-effort prune
            }
        }),
    );
}

/** Upload the current local canvas as the cloud tip; archive the previous tip into history (max 30). */
export async function uploadCanvasCloudVersion(projectId: string) {
    const config = assertConfigured();
    const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    if (!project) throw new Error(i18n.t("canvas.projectPage.notFound"));

    const sanitized = sanitizeProjectForSync(project);
    const tipKey = currentKey(config, projectId);
    const manifest = await readManifest(config, projectId);
    const previous = await readJson<CanvasProject>(config, tipKey);
    let archived = false;

    if (previous?.id) {
        const versionId = nanoid();
        const key = historyKey(config, projectId, versionId);
        const uploaded = await writeJson(config, key, previous);
        manifest.versions = [
            {
                id: versionId,
                createdAt: previous.cloudSyncedAt || previous.updatedAt || new Date().toISOString(),
                title: previous.title || project.title,
                bytes: uploaded.bytes,
                key,
            },
            ...manifest.versions.filter((item) => item.id !== versionId),
        ];
        archived = true;
        await trimVersions(config, manifest);
    }

    await writeJson(config, tipKey, sanitized);
    const syncedAt = new Date().toISOString();
    manifest.currentKey = tipKey;
    manifest.updatedAt = syncedAt;
    await writeJson(config, manifestKey(config, projectId), manifest);
    useCanvasStore.getState().markProjectCloudSynced(projectId, syncedAt);

    return { syncedAt, archived, versionCount: manifest.versions.length };
}

export async function listCanvasCloudVersions(projectId: string): Promise<CanvasCloudVersionMeta[]> {
    const config = assertConfigured();
    const manifest = await readManifest(config, projectId);
    return manifest.versions;
}

export async function getCanvasCloudVersion(projectId: string, versionId: string): Promise<CanvasProject> {
    const config = assertConfigured();
    const manifest = await readManifest(config, projectId);
    const meta = manifest.versions.find((item) => item.id === versionId);
    if (!meta) throw new Error(i18n.t("canvas.versions.loadFailed"));
    const project = await readJson<CanvasProject>(config, meta.key);
    if (!project?.id) throw new Error(i18n.t("canvas.versions.loadFailed"));
    return project;
}

/** Delete one archived cloud version (does not touch the live tip). */
export async function deleteCanvasCloudVersion(projectId: string, versionId: string) {
    const config = assertConfigured();
    const manifest = await readManifest(config, projectId);
    const meta = manifest.versions.find((item) => item.id === versionId);
    if (!meta) throw new Error(i18n.t("canvas.versions.loadFailed"));
    try {
        await deleteObjectAtKey(config, meta.key);
    } catch {
        // still drop from manifest if the object is already gone
    }
    manifest.versions = manifest.versions.filter((item) => item.id !== versionId);
    manifest.updatedAt = new Date().toISOString();
    await writeJson(config, manifestKey(config, projectId), manifest);
    return manifest.versions;
}

/**
 * Archive the live canvas first (so restore is reversible), then return the selected history snapshot.
 */
export async function prepareCanvasCloudVersionRestore(projectId: string, versionId: string) {
    await uploadCanvasCloudVersion(projectId);
    return getCanvasCloudVersion(projectId, versionId);
}
