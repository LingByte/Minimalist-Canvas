import { nanoid } from "nanoid";

import i18n from "@canvas/i18n";
import { getDataUrlByteSize, readImageMeta } from "@canvas/lib/image-utils";
import { requestEdit, requestGeneration } from "@canvas/services/api/image";
import { upsertGenerationAsset } from "@canvas/services/api/generation-assets";
import { resolveImageUrl, uploadImage } from "@canvas/services/image-storage";
import type { AiConfig } from "@canvas/stores/use-config-store";
import type { ReferenceImage } from "@canvas/types/image";

export type WorkbenchGeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

export type WorkbenchImageSlotResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: WorkbenchGeneratedImage;
    error?: string;
};

export type WorkbenchImageBatchProgress = {
    batchId: string;
    prompt: string;
    model: string;
    config: Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;
    results: WorkbenchImageSlotResult[];
    running: boolean;
    successCount: number;
    failCount: number;
    durationMs: number;
    status: "pending" | "success" | "failed";
};

type Listener = (progress: WorkbenchImageBatchProgress) => void;

type ActiveBatch = {
    progress: WorkbenchImageBatchProgress;
    promise: Promise<WorkbenchImageBatchProgress>;
    listeners: Set<Listener>;
    startedAt: number;
    references: ReferenceImage[];
};

const activeBatches = new Map<string, ActiveBatch>();
const globalListeners = new Set<Listener>();

function cloneProgress(progress: WorkbenchImageBatchProgress): WorkbenchImageBatchProgress {
    return {
        ...progress,
        config: { ...progress.config },
        results: progress.results.map((item) => ({ ...item, image: item.image ? { ...item.image } : undefined })),
    };
}

function emit(batch: ActiveBatch) {
    const snapshot = cloneProgress(batch.progress);
    for (const listener of batch.listeners) {
        try {
            listener(snapshot);
        } catch {
            // ignore subscriber errors
        }
    }
    for (const listener of globalListeners) {
        try {
            listener(snapshot);
        } catch {
            // ignore subscriber errors
        }
    }
}

function recount(progress: WorkbenchImageBatchProgress) {
    progress.successCount = progress.results.filter((item) => item.status === "success").length;
    progress.failCount = progress.results.filter((item) => item.status === "failed").length;
}

function workbenchImageReferenceUrls(references: ReferenceImage[] | undefined) {
    if (!references?.length) return [];
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const item of references) {
        for (const candidate of [item.url, item.storageKey, item.dataUrl && !item.dataUrl.startsWith("data:") ? item.dataUrl : undefined]) {
            const value = candidate?.trim();
            if (!value || /^(image|video|audio):/i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) continue;
            let key = value.toLowerCase();
            try {
                const parsed = new URL(value);
                key = `${parsed.origin}${parsed.pathname}`.toLowerCase();
            } catch {
                // keep lowercased raw
            }
            if (seen.has(key)) continue;
            seen.add(key);
            urls.push(value);
        }
    }
    return urls;
}

async function persistBatch(progress: WorkbenchImageBatchProgress, references: ReferenceImage[]) {
    const referenceUrls = workbenchImageReferenceUrls(references);
    const successImages = progress.results.filter((item) => item.status === "success" && item.image).map((item) => item.image!);
    const firstError = progress.results.find((item) => item.status === "failed" && item.error)?.error;
    await upsertGenerationAsset({
        client_id: progress.batchId,
        kind: "image",
        source: "workbench",
        title: progress.prompt.slice(0, 12) || progress.model || i18n.t("workbench.untitled"),
        prompt: progress.prompt,
        model: progress.model,
        status: progress.status,
        error: progress.status === "failed" ? firstError : undefined,
        config: {
            ...progress.config,
            count: String(progress.results.length || progress.config.count || 1),
            success_count: progress.successCount,
            fail_count: progress.failCount,
            duration_ms: progress.durationMs,
            ...(referenceUrls.length ? { images: referenceUrls } : {}),
        },
        assets: successImages.map((image) => ({
            url: image.dataUrl,
            storage_key: image.storageKey,
            mime_type: image.mimeType,
            width: image.width,
            height: image.height,
            bytes: image.bytes,
            duration_ms: image.durationMs,
        })),
    });
}

export function listActiveImageBatches() {
    return Array.from(activeBatches.values()).map((batch) => cloneProgress(batch.progress));
}

export function getActiveImageBatch(batchId: string) {
    const batch = activeBatches.get(batchId);
    return batch ? cloneProgress(batch.progress) : undefined;
}

export function isAnyImageBatchRunning() {
    return activeBatches.size > 0;
}

export function subscribeImageBatch(batchId: string, listener: Listener) {
    const batch = activeBatches.get(batchId);
    if (!batch) return () => undefined;
    batch.listeners.add(listener);
    listener(cloneProgress(batch.progress));
    return () => {
        batch.listeners.delete(listener);
    };
}

export function subscribeImageBatches(listener: Listener) {
    globalListeners.add(listener);
    for (const batch of activeBatches.values()) listener(cloneProgress(batch.progress));
    return () => {
        globalListeners.delete(listener);
    };
}

export type StartWorkbenchImageBatchInput = {
    batchId?: string;
    slotIds?: string[];
    /** When set, only these slot indexes are regenerated; others keep seedResults. */
    onlyIndexes?: number[];
    seedResults?: WorkbenchImageSlotResult[];
    prompt: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
    count: number;
};

export function startWorkbenchImageBatch(input: StartWorkbenchImageBatchInput) {
    const batchId = input.batchId || nanoid();
    const existing = activeBatches.get(batchId);
    if (existing) return { batchId, promise: existing.promise };

    const count = Math.max(1, Math.min(10, input.count || input.seedResults?.length || 1));
    const slotIds =
        input.slotIds?.length === count
            ? input.slotIds
            : input.seedResults?.length === count
              ? input.seedResults.map((item) => item.id)
              : Array.from({ length: count }, () => nanoid());
    const runIndexes = new Set(
        (input.onlyIndexes?.length ? input.onlyIndexes : Array.from({ length: count }, (_, index) => index)).filter(
            (index) => index >= 0 && index < count,
        ),
    );
    const startedAt = performance.now();
    const requestConfig = { ...input.config, model: input.model || input.config.imageModel || input.config.model, count: "1" };
    const logConfig = {
        model: requestConfig.model,
        imageModel: requestConfig.imageModel || requestConfig.model,
        quality: requestConfig.quality,
        size: requestConfig.size,
        count: String(count),
    };

    const progress: WorkbenchImageBatchProgress = {
        batchId,
        prompt: input.prompt,
        model: input.model,
        config: logConfig,
        results: slotIds.map((id, index) => {
            if (!runIndexes.has(index)) {
                const seeded = input.seedResults?.[index];
                if (seeded) return { ...seeded, id: seeded.id || id };
            }
            return { id, status: "pending" as const };
        }),
        running: true,
        successCount: 0,
        failCount: 0,
        durationMs: 0,
        status: "pending",
    };
    recount(progress);

    const batch: ActiveBatch = {
        progress,
        promise: Promise.resolve(progress),
        listeners: new Set(),
        startedAt,
        references: input.references,
    };

    const promise = (async () => {
        await persistBatch(progress, input.references);
        emit(batch);

        await Promise.allSettled(
            Array.from(runIndexes).map(async (index) => {
                const slotId = slotIds[index] || progress.results[index]?.id || nanoid();
                const itemStartedAt = performance.now();
                try {
                    const result = input.references.length
                        ? await requestEdit(requestConfig, input.prompt, input.references)
                        : await requestGeneration(requestConfig, input.prompt);
                    const image = result[0];
                    if (!image) throw new Error(i18n.t("imageWorkbench.missingResult"));
                    const meta = await readImageMeta(image.dataUrl);
                    const stored = await uploadImage(image.dataUrl);
                    const displayUrl = await resolveImageUrl(stored.storageKey, stored.url);
                    const nextImage: WorkbenchGeneratedImage = {
                        id: image.id,
                        dataUrl: displayUrl || stored.url,
                        storageKey: stored.storageKey,
                        durationMs: performance.now() - itemStartedAt,
                        width: stored.width || meta.width,
                        height: stored.height || meta.height,
                        bytes: stored.bytes || getDataUrlByteSize(image.dataUrl),
                        mimeType: stored.mimeType || meta.mimeType,
                    };
                    progress.results[index] = { id: slotId, status: "success", image: nextImage };
                    recount(progress);
                    progress.durationMs = performance.now() - startedAt;
                    await persistBatch(progress, input.references);
                    emit(batch);
                    return nextImage;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : i18n.t("workbench.generationFailed");
                    progress.results[index] = { id: slotId, status: "failed", error: errorMessage };
                    recount(progress);
                    progress.durationMs = performance.now() - startedAt;
                    await persistBatch(progress, input.references);
                    emit(batch);
                    throw error;
                }
            }),
        );

        recount(progress);
        progress.durationMs = performance.now() - startedAt;
        progress.status = progress.successCount > 0 ? "success" : "failed";
        progress.running = false;
        await persistBatch(progress, input.references);
        emit(batch);
        activeBatches.delete(batchId);
        return cloneProgress(progress);
    })();

    batch.promise = promise;
    activeBatches.set(batchId, batch);
    return { batchId, promise };
}

/** Mark pending rows that no longer have an in-flight runner (e.g. after app restart). */
export async function failStalePendingImageLogs(pendingIds: string[], errorMessage: string) {
    for (const id of pendingIds) {
        if (!id || activeBatches.has(id)) continue;
        await upsertGenerationAsset({
            client_id: id,
            kind: "image",
            source: "workbench",
            status: "failed",
            error: errorMessage,
            config: { fail_count: 1 },
            assets: [],
        });
    }
}
