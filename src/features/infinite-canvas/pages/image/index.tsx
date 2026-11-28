import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, ClipboardPaste, Download, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, Drawer, Dropdown, Empty, Input, Modal, Tag, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { toIntlLocale } from "@/i18n/languages";
import { cn } from "@/lib/utils";

import { CanvasPromptChipInput } from "@canvas/components/canvas/canvas-prompt-chip-input";
import { ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@canvas/components/image-settings-panel";
import { ModelPicker } from "@canvas/components/model-picker";
import { PromptSelectDialog } from "@canvas/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@canvas/components/canvas/asset-picker-modal";
import {
    WorkbenchAddTile,
    WorkbenchBottomBar,
    WorkbenchModeTabs,
    WorkbenchReferenceZone,
    WorkbenchUploadingTile,
    workbenchAsideClassName,
    workbenchComposerClassName,
    workbenchPageClassName,
    workbenchPromptShellClassName,
    workbenchResultsClassName,
} from "@canvas/components/workbench/workbench-studio";
import { PromptOptimizeDialog } from "@canvas/components/workbench/prompt-optimize-dialog";
import { CloudUploadProgress } from "@canvas/components/canvas/cloud-upload-progress";
import { assertCanvasMediaUploadSize, QIHUO_MAX_IMAGE_UPLOAD_BYTES } from "@canvas/services/object-storage";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { expandCanvasResourceMentions, type CanvasResourceReference } from "@canvas/lib/canvas/canvas-resource-references";
import { imageReferenceLabel } from "@canvas/lib/image-reference-prompt";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@canvas/stores/use-config-store";
import { useConfirmGenerationQuota } from "@canvas/lib/use-confirm-generation-quota";
import { useModelUnitPrice } from "@canvas/lib/use-model-unit-price";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { buildWatermarkApplyInput, isWatermarkReady, useWatermarkStore } from "@canvas/stores/use-watermark-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration } from "@canvas/lib/image-utils";
import { applyImageWatermark } from "@canvas/lib/watermark/apply-image-watermark";
import { deleteGenerationAssetsByClientIds, listGenerationAssets, type GenerationAsset } from "@canvas/services/api/generation-assets";
import { onCloudMediaUrl } from "@canvas/services/cloud-upload-progress";
import { isPubliclyReachableMediaUrl } from "@canvas/services/ensure-public-media";
import { deleteStoredImages, resolveImageUrl, uploadImage } from "@canvas/services/image-storage";
import { isTauri } from "@canvas/services/fs-store";
import { saveBlobAs } from "@canvas/lib/save-file";
import {
    failStalePendingImageLogs,
    getActiveImageBatch,
    isAnyImageBatchRunning,
    listActiveImageBatches,
    startWorkbenchImageBatch,
    subscribeImageBatches,
    type WorkbenchImageBatchProgress,
} from "@canvas/services/workbench-image-generation";
import { useAssetStore } from "@canvas/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@canvas/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@canvas/types/image";
import i18n from "@canvas/i18n";
import { SmartImage } from "@/components/smart-image";

type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "pending" | "success" | "failed";
    images: GeneratedImage[];
    thumbnails: string[];
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const RESULT_ACTION_BUTTON_CLASS =
    "!h-8 min-w-0 flex-1 !px-2 text-xs [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:whitespace-nowrap";
export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const confirmGenerationQuota = useConfirmGenerationQuota();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [optimizeOpen, setOptimizeOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [imageLogCursor, setImageLogCursor] = useState("");
    const [imageLogHasMore, setImageLogHasMore] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const [pendingUploads, setPendingUploads] = useState<Array<{ id: string; name: string; previewUrl: string; progress: number }>>([]);
    const pendingUploadControllersRef = useRef(new Map<string, AbortController>());
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const activeBatchIdRef = useRef<string | null>(null);
    const previewLogIdRef = useRef<string | null>(null);

    useEffect(() => {
        previewLogIdRef.current = previewLog?.id || null;
    }, [previewLog?.id]);

    useEffect(() => {
        return onCloudMediaUrl((storageKey, url) => {
            if (!isPubliclyReachableMediaUrl(url)) return;
            setReferences((value) =>
                value.map((item) => (item.storageKey === storageKey ? { ...item, dataUrl: url, url } : item)),
            );
        });
    }, []);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const priceHint = useModelUnitPrice(model);
    const mentionReferences = useMemo<CanvasResourceReference[]>(
        () =>
            references.map((item, index) => ({
                id: item.id,
                nodeId: item.id,
                kind: "image" as const,
                label: imageReferenceLabel(index),
                title: item.name || imageReferenceLabel(index),
                previewUrl: item.dataUrl,
                active: true,
            })),
        [references],
    );
    const promptText = expandCanvasResourceMentions(prompt, mentionReferences).trim();
    const canGenerate = Boolean(promptText);
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    const applyBatchProgress = (progress: WorkbenchImageBatchProgress, options?: { force?: boolean; quiet?: boolean }) => {
        const followBatch =
            options?.force ||
            activeBatchIdRef.current === progress.batchId ||
            previewLogIdRef.current === progress.batchId ||
            (!activeBatchIdRef.current && !previewLogIdRef.current);
        if (followBatch) {
            activeBatchIdRef.current = progress.running ? progress.batchId : activeBatchIdRef.current === progress.batchId ? null : activeBatchIdRef.current;
            setResults(
                progress.results.map((item) =>
                    item.status === "success" && item.image
                        ? { id: item.id, status: "success" as const, image: item.image }
                        : item.status === "failed"
                          ? { id: item.id, status: "failed" as const, error: item.error || t("workbench.generationFailed") }
                          : { id: item.id, status: "pending" as const },
                ),
            );
            if (progress.running) {
                setRunning(true);
                setStartedAt((value) => value || performance.now() - progress.durationMs);
            }
        }
        if (!progress.running) {
            if (activeBatchIdRef.current === progress.batchId) activeBatchIdRef.current = null;
            if (!isAnyImageBatchRunning()) {
                setRunning(false);
                setStartedAt(0);
            }
            if (!options?.quiet && followBatch) {
                progress.successCount
                    ? message.success(t("imageWorkbench.generated"))
                    : message.error(progress.results.find((item) => item.error)?.error || t("workbench.generationFailed"));
            }
            void refreshLogs(false);
        } else {
            void refreshLogs(false);
        }
    };

    useEffect(() => {
        const active = listActiveImageBatches();
        if (active[0]) {
            activeBatchIdRef.current = active[0].batchId;
            applyBatchProgress(active[0], { force: true, quiet: true });
            setRunning(true);
            setStartedAt(performance.now() - active[0].durationMs);
            if (!active[0].durationMs) setElapsedMs(0);
            message.info(t("imageWorkbench.backgroundRunning"));
        }
        const unsubscribe = subscribeImageBatches((progress) => {
            applyBatchProgress(progress, { quiet: false });
        });
        void refreshLogs(true);
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        if (!imageFiles.length) return;
        const room = Math.max(0, 10 - references.length - pendingUploads.length);
        const selected = imageFiles.slice(0, room);
        if (!selected.length) {
            message.warning(t("imageWorkbench.referencesFull"));
            return;
        }

        for (const file of selected) {
            try {
                assertCanvasMediaUploadSize(file.size, file.type, file.name);
            } catch (error) {
                message.error(error instanceof Error ? error.message : t("workbench.uploadFailed"));
                continue;
            }

            const pendingId = nanoid();
            const previewUrl = URL.createObjectURL(file);
            const controller = new AbortController();
            pendingUploadControllersRef.current.set(pendingId, controller);
            setPendingUploads((value) => [...value, { id: pendingId, name: file.name, previewUrl, progress: 0 }]);
            try {
                // Local-first: IndexedDB + blob URL immediately; cloud continues in background.
                const image = await uploadImage(file, {
                    background: true,
                    signal: controller.signal,
                    onProgress: (loaded, total) => {
                        const progress = total > 0 ? (loaded / total) * 100 : 0;
                        setPendingUploads((value) => value.map((item) => (item.id === pendingId ? { ...item, progress } : item)));
                    },
                });
                if (controller.signal.aborted) continue;
                setReferences((value) =>
                    [...value, { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, url: isPubliclyReachableMediaUrl(image.url) ? image.url : undefined, storageKey: image.storageKey }].slice(0, 10),
                );
            } catch (error) {
                if (!isUploadAbortError(error) && !controller.signal.aborted) {
                    message.error(error instanceof Error ? error.message : t("workbench.uploadFailed"));
                }
            } finally {
                pendingUploadControllersRef.current.delete(pendingId);
                setPendingUploads((value) => {
                    const current = value.find((item) => item.id === pendingId);
                    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
                    return value.filter((item) => item.id !== pendingId);
                });
            }
        }
    };

    const cancelPendingUpload = (id: string) => {
        const controller = pendingUploadControllersRef.current.get(id);
        controller?.abort();
        pendingUploadControllersRef.current.delete(id);
        setPendingUploads((value) => {
            const current = value.find((item) => item.id === id);
            if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
            return value.filter((item) => item.id !== id);
        });
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("imageWorkbench.clipboardEmpty"));
                return;
            }
            const room = Math.max(0, 10 - references.length - pendingUploads.length);
            const selected = blobs.slice(0, room);
            const nextReferences: ReferenceImage[] = [];
            for (const [index, blob] of selected.entries()) {
                try {
                    assertCanvasMediaUploadSize(blob.size, blob.type || "image/png", `clipboard-${index + 1}.png`);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("workbench.uploadFailed"));
                    continue;
                }
                const pendingId = nanoid();
                const previewUrl = URL.createObjectURL(blob);
                const name = `clipboard-${index + 1}.png`;
                const controller = new AbortController();
                pendingUploadControllersRef.current.set(pendingId, controller);
                setPendingUploads((value) => [...value, { id: pendingId, name, previewUrl, progress: 0 }]);
                try {
                    const image = await uploadImage(blob, {
                        background: true,
                        signal: controller.signal,
                        onProgress: (loaded, total) => {
                            const progress = total > 0 ? (loaded / total) * 100 : 0;
                            setPendingUploads((value) => value.map((item) => (item.id === pendingId ? { ...item, progress } : item)));
                        },
                    });
                    if (controller.signal.aborted) continue;
                    nextReferences.push({
                        id: nanoid(),
                        name,
                        type: image.mimeType,
                        dataUrl: image.url,
                        url: isPubliclyReachableMediaUrl(image.url) ? image.url : undefined,
                        storageKey: image.storageKey,
                    });
                } catch (error) {
                    if (!isUploadAbortError(error) && !controller.signal.aborted) {
                        message.error(error instanceof Error ? error.message : t("workbench.uploadFailed"));
                    }
                } finally {
                    pendingUploadControllersRef.current.delete(pendingId);
                    setPendingUploads((value) => {
                        const current = value.find((item) => item.id === pendingId);
                        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
                        return value.filter((item) => item.id !== pendingId);
                    });
                }
            }
            if (nextReferences.length) {
                setReferences((value) => [...value, ...nextReferences].slice(0, 10));
                message.success(t("imageWorkbench.clipboardAdded", { count: nextReferences.length }));
            }
        } catch {
            message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const confirmGenerate = () => {
        if (!canGenerate || running) return;
        void generate();
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = promptText;
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        const approved = await confirmGenerationQuota({
            modelValue: model,
            mode: "image",
            count: generationCount,
        });
        if (!approved) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("generationQuota.cancel") });
            return;
        }

        const batchId = nanoid();
        const slotIds = Array.from({ length: generationCount }, () => nanoid());
        activeBatchIdRef.current = batchId;
        setElapsedMs(0);
        setRunning(true);
        setStartedAt(performance.now());
        setPreviewLog(null);
        setResults(slotIds.map((id) => ({ id, status: "pending" as const })));
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });

        const { promise } = startWorkbenchImageBatch({
            batchId,
            slotIds,
            prompt: snapshot.text,
            model,
            config: snapshot.config,
            references: snapshot.references,
            count: generationCount,
        });

        void promise.then((progress) => {
            if (agentTaskId) {
                updateAgentTask(agentTaskId, {
                    status: progress.successCount ? "succeeded" : "failed",
                    successCount: progress.successCount,
                    failCount: progress.failCount,
                    error: progress.successCount ? undefined : progress.results.find((item) => item.error)?.error || t("workbench.generationFailed"),
                });
            }
        });
    };

    // Handle image-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = async (image: GeneratedImage, index: number, withWatermark = false) => {
        const url = (await resolveImageUrl(image.storageKey, image.dataUrl)) || image.dataUrl;
        const watermark = useWatermarkStore.getState();
        let payload: string | Blob = url;
        if (withWatermark && isWatermarkReady(watermark)) {
            try {
                payload = await applyImageWatermark(url, buildWatermarkApplyInput(watermark));
            } catch (error) {
                message.error(error instanceof Error ? error.message : t("watermark.applyFailed"));
                return;
            }
        }
        const path = await saveBlobAs(payload, `image-${index + 1}.png`);
        if (isTauri() && !path) {
            message.info(t("common.downloadCanceled"));
            return;
        }
        message.success(withWatermark ? t("watermark.downloaded") : t("common.downloaded"));
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const displayUrl = (await resolveImageUrl(image.storageKey, image.dataUrl)) || image.dataUrl;
        const stored = image.storageKey
            ? {
                  url: displayUrl,
                  storageKey: image.storageKey,
                  mimeType: image.mimeType || "image/png",
                  width: image.width,
                  height: image.height,
                  bytes: image.bytes,
              }
            : await uploadImage(displayUrl, { background: true });
        setReferences((value) => [
            ...value,
            {
                id: nanoid(),
                name: `result-${index + 1}.png`,
                type: stored.mimeType,
                dataUrl: stored.url,
                storageKey: stored.storageKey,
            },
        ]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const displayUrl = (await resolveImageUrl(image.storageKey, image.dataUrl)) || image.dataUrl;
        const stored = image.storageKey
            ? {
                  url: displayUrl,
                  storageKey: image.storageKey,
                  mimeType: image.mimeType || "image/png",
                  width: image.width,
                  height: image.height,
                  bytes: image.bytes,
              }
            : await uploadImage(displayUrl, { background: true });
        addAsset({
            kind: "image",
            title: t("imageWorkbench.resultTitle", { count: index + 1 }),
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: {
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
            },
            metadata: { source: "image-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl, { background: true });
            setReferences((value) =>
                [
                    ...value,
                    {
                        id: nanoid(),
                        name: payload.title,
                        type: stored.mimeType,
                        dataUrl: stored.url,
                        url: isPubliclyReachableMediaUrl(stored.url) ? stored.url : undefined,
                        storageKey: stored.storageKey,
                    },
                ].slice(0, 10),
            );
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const selected = logs.filter((log) => selectedLogIds.includes(log.id));
        const imageKeys = selected.flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([
            deleteStoredImages(imageKeys),
            deleteGenerationAssetsByClientIds(selectedLogIds),
        ]).then(() => void refreshLogs());
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const refreshLogs = async (resumePending = true) => {
        const page = await readMergedImageLogs();
        setLogs(page.logs);
        setImageLogCursor(page.nextCursor);
        setImageLogHasMore(page.hasMore);
        if (resumePending) resumePendingLogs(page.logs);
        return page.logs;
    };

    const loadMoreImageLogs = async () => {
        if (!imageLogHasMore || !imageLogCursor) return;
        const page = await readMergedImageLogs(imageLogCursor);
        setLogs((current) => {
            const ids = new Set(current.map((item) => item.id));
            return [...current, ...page.logs.filter((log) => !ids.has(log.id))].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        });
        setImageLogCursor(page.nextCursor);
        setImageLogHasMore(page.hasMore);
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        const staleIds: string[] = [];
        for (const log of items) {
            if (log.status !== "pending") continue;
            const active = getActiveImageBatch(log.id);
            if (active) {
                if (!activeBatchIdRef.current) {
                    activeBatchIdRef.current = log.id;
                    applyBatchProgress(active, { force: true, quiet: true });
                }
                continue;
            }
            staleIds.push(log.id);
        }
        if (staleIds.length) {
            void failStalePendingImageLogs(staleIds, t("imageWorkbench.interrupted")).then(() => refreshLogs(false));
        }
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);

        const active = getActiveImageBatch(log.id);
        if (active || log.status === "pending") {
            activeBatchIdRef.current = log.id;
            if (active) {
                applyBatchProgress(active, { force: true, quiet: true });
            } else {
                const count = Math.max(1, Number(log.config.count) || log.imageCount || 1);
                setResults(Array.from({ length: count }, () => ({ id: nanoid(), status: "pending" as const })));
                setRunning(isAnyImageBatchRunning());
            }
            return;
        }

        if (log.status === "failed" && !log.images.length) {
            const count = Math.max(1, Number(log.config.count) || log.imageCount || 1);
            const reason = log.error || t("workbench.generationFailed");
            setResults(
                Array.from({ length: count }, (_, index) => ({
                    id: `${log.id}-${index}`,
                    status: "failed" as const,
                    error: reason,
                })),
            );
            return;
        }

        const images = await Promise.all(
            log.images.map(async (image) => ({
                ...image,
                dataUrl: (await resolveImageUrl(image.storageKey, image.dataUrl)) || image.dataUrl,
            })),
        );
        if (log.status === "failed" && images.length < Math.max(1, Number(log.config.count) || 0)) {
            const count = Math.max(images.length, Number(log.config.count) || images.length || 1);
            const reason = log.error || t("workbench.generationFailed");
            setResults(
                Array.from({ length: count }, (_, index) => {
                    const image = images[index];
                    return image
                        ? { id: image.id, status: "success" as const, image }
                        : { id: `${log.id}-${index}`, status: "failed" as const, error: reason };
                }),
            );
            return;
        }
        setResults(images.map((image) => ({ id: image.id, status: "success" as const, image })));
    };

    const buildRequestSnapshot = () => {
        const text = promptText;
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: { ...effectiveConfig, model, count: "1" }, references: [...references] };
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        if (running) {
            message.warning(t("imageWorkbench.busy"));
            return;
        }

        const batchId = previewLog?.id || activeBatchIdRef.current || nanoid();
        const currentResults = results.length
            ? results
            : [{ id: `${batchId}-0`, status: "failed" as const, error: previewLog?.error }];
        const slotIds = currentResults.map((item, itemIndex) => item.id || `${batchId}-${itemIndex}`);
        const seedResults: WorkbenchImageBatchProgress["results"] = currentResults.map((item, itemIndex) =>
            itemIndex === index
                ? { id: slotIds[itemIndex], status: "pending" }
                : item.status === "success" && item.image
                  ? { id: slotIds[itemIndex], status: "success", image: item.image }
                  : { id: slotIds[itemIndex], status: "failed", error: item.error },
        );

        activeBatchIdRef.current = batchId;
        if (!previewLog || previewLog.id !== batchId) {
            setPreviewLog({
                id: batchId,
                createdAt: previewLog?.createdAt || Date.now(),
                title: snapshot.text.slice(0, 12) || t("workbench.untitled"),
                prompt: snapshot.text,
                time: previewLog?.time || new Date().toLocaleString(toIntlLocale(i18n.resolvedLanguage), { hour12: false }),
                model,
                config: {
                    model,
                    imageModel: model,
                    quality: snapshot.config.quality,
                    size: snapshot.config.size,
                    count: String(seedResults.length),
                },
                references: snapshot.references,
                durationMs: previewLog?.durationMs || 0,
                successCount: 0,
                failCount: 0,
                imageCount: seedResults.length,
                size: snapshot.config.size || "",
                quality: snapshot.config.quality || "",
                status: "pending",
                images: [],
                thumbnails: [],
                error: undefined,
            });
        } else {
            setPreviewLog({ ...previewLog, status: "pending", error: undefined });
        }
        setResults(seedResults.map((item) => ({ id: item.id, status: item.status, image: item.image, error: item.error })));
        setRunning(true);
        setStartedAt(performance.now());
        setElapsedMs(0);

        startWorkbenchImageBatch({
            batchId,
            slotIds,
            onlyIndexes: [index],
            seedResults,
            prompt: snapshot.text,
            model,
            config: snapshot.config,
            references: snapshot.references,
            count: seedResults.length,
        });
    };

    return (
        <div className={workbenchPageClassName()}>
            <CloudUploadProgress variant="page" />
            <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]">
                <aside className={workbenchAsideClassName()}>
                    <LogPanel
                        logs={logs}
                        selectedLogIds={selectedLogIds}
                        activeLogId={previewLog?.id}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={() => setDeleteConfirmOpen(true)}
                        onDeleteLog={(id) => {
                            setSelectedLogIds([id]);
                            setDeleteConfirmOpen(true);
                        }}
                        onPreviewLog={(log) => void previewGenerationLog(log)}
                    />
                </aside>

                <section className="grid min-h-0 bg-white/70 dark:bg-[#0f1116] lg:overflow-hidden xl:grid-cols-[minmax(360px,40%)_minmax(0,1fr)]">
                    <div className={workbenchComposerClassName()}>
                        <div className="flex items-start justify-between gap-3">
                            <WorkbenchModeTabs className="min-w-0 flex-1" />
                            <div className="flex shrink-0 gap-1.5 lg:hidden">
                                <Button size="small" icon={<History className="size-3.5" />} onClick={() => setLogsOpen(true)} />
                                <Button size="small" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setSettingsOpen(true)} />
                            </div>
                        </div>

                        <div className="mt-4 min-w-0">
                            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-stone-400">
                                {t("workbench.model")}
                            </span>
                            <ModelPicker
                                config={effectiveConfig}
                                value={model}
                                onChange={(value) => updateConfig("imageModel", value)}
                                capability="image"
                                fullWidth
                                className="!h-10 !rounded-xl !px-3.5 !text-[13px]"
                                onMissingConfig={() => openConfigDialog(false)}
                            />
                        </div>

                        <div className="mt-5 space-y-5">
                            <WorkbenchReferenceZone
                                title={t("imageWorkbench.references")}
                                countLabel={`${references.length}/10`}
                                dragActive={isReferenceDragActive}
                                onDragEnter={(event) => {
                                    event.preventDefault();
                                    dragDepthRef.current += 1;
                                    if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                                }}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "copy";
                                }}
                                onDragLeave={(event) => {
                                    event.preventDefault();
                                    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                                    if (!dragDepthRef.current) setIsReferenceDragActive(false);
                                }}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    dragDepthRef.current = 0;
                                    setIsReferenceDragActive(false);
                                    void addReferences(event.dataTransfer.files);
                                }}
                                onWheel={(event) => {
                                    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                    event.preventDefault();
                                    event.currentTarget.scrollLeft += event.deltaY;
                                }}
                                actions={
                                    <>
                                        <Button size="small" type="text" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addReferencesFromClipboard()}>
                                            {t("workbench.clipboard")}
                                        </Button>
                                        <Button size="small" type="text" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            {t("workbench.viewAssets")}
                                        </Button>
                                    </>
                                }
                            >
                                <WorkbenchAddTile
                                    onClick={() => fileInputRef.current?.click()}
                                    label={t("workbench.upload")}
                                />
                                {pendingUploads.map((item) => (
                                    <WorkbenchUploadingTile
                                        key={item.id}
                                        name={item.name}
                                        previewUrl={item.previewUrl}
                                        progress={item.progress}
                                        kind="image"
                                        onCancel={() => cancelPendingUpload(item.id)}
                                    />
                                ))}
                                {references.map((item, index) => (
                                    <div key={item.id} className="group relative size-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
                                        <SmartImage src={item.dataUrl} alt={item.name} className="size-full object-cover" fallbackClassName="size-full" fallbackIconClassName="size-4" />
                                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                                        <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                        <button
                                            type="button"
                                            className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex"
                                            onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                            aria-label={t("imageWorkbench.removeReference")}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </WorkbenchReferenceZone>
                            <p className="m-0 text-[11px] leading-4 text-stone-400">
                                {t("workbench.referenceSizeHint", { imageMb: Math.ceil(QIHUO_MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)) })}
                            </p>

                            <div>
                                <div className={workbenchPromptShellClassName()}>
                                    <CanvasPromptChipInput
                                        value={prompt}
                                        onChange={setPrompt}
                                        references={mentionReferences}
                                        placeholder={t("imageWorkbench.promptPlaceholder")}
                                        className="thin-scrollbar min-h-[200px] w-full cursor-text bg-transparent px-3.5 pt-3.5 pb-12 text-sm leading-6 outline-none"
                                    />
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2">
                                        <Tooltip title={prompt.trim() ? t("canvas.promptPanel.optimizePrompt") : t("canvas.promptPanel.optimizeNeedsPrompt")}>
                                            <button
                                                type="button"
                                                disabled={!prompt.trim() || running}
                                                className="pointer-events-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 transition hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-400 dark:hover:text-violet-300"
                                                onClick={() => setOptimizeOpen(true)}
                                            >
                                                <Sparkles className="size-3.5" />
                                                {t("canvas.promptPanel.optimizeTitle")}
                                            </button>
                                        </Tooltip>
                                        <button
                                            type="button"
                                            className="pointer-events-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 transition hover:text-emerald-600 dark:text-stone-400 dark:hover:text-emerald-300"
                                            onClick={() => setPromptDialogOpen(true)}
                                        >
                                            <BookOpen className="size-3.5" />
                                            {t("workbench.styleLibrary")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <WorkbenchBottomBar
                            summary={
                                <>
                                    {imageQualityLabel(effectiveConfig.quality, model)} · {imageSizeLabel(effectiveConfig.size)} · {generationCount}
                                </>
                            }
                            settingsOpen={settingsOpen}
                            onSettingsOpenChange={setSettingsOpen}
                            settings={
                                <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                            }
                            generateLabel={t("workbench.generate")}
                            generatePrice={priceHint || undefined}
                                                        generating={running}
                            disabled={!canGenerate || running}
                            onGenerate={confirmGenerate}
                        />
                    </div>

                    <div className={workbenchResultsClassName()}>
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <h2 className="text-base font-semibold tracking-tight text-stone-800 dark:text-stone-100">
                                {t("workbench.results")}
                            </h2>
                            {running ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                                {results.map((result, index) =>
                                    result.status === "success" && result.image ? (
                                        <ResultImageCard key={result.id} image={result.image} index={index} onEdit={addResultToReferences} onDownload={downloadImage} onSaveAsset={saveResultToAssets} />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={() => retryResult(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200/90 bg-stone-50/40 text-center dark:border-stone-800 dark:bg-[#0c0e13]/60 lg:min-h-[560px]">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("imageWorkbench.empty")} />
                            </div>
                        )}
                    </div>
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onDeleteLog={(id) => {
                        setSelectedLogIds([id]);
                        setDeleteConfirmOpen(true);
                    }}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
                {imageLogHasMore ? (
                    <div className="flex justify-center py-3">
                        <Button onClick={() => void loadMoreImageLogs()}>{t("canvas.sidePanel.loadMoreLogs")}</Button>
                    </div>
                ) : null}
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <PromptOptimizeDialog
                open={optimizeOpen}
                draft={prompt}
                preset="character-asset-sheet"
                onClose={() => setOptimizeOpen(false)}
                onApply={setPrompt}
            />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function GenerationSettings({ config, model, updateConfig }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <ImageSettingsPanel config={{ ...config, model }} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-3" maxCount={10} quickCount={9} compact />
    );
}

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void | Promise<void>;
    onDownload: (image: GeneratedImage, index: number, withWatermark?: boolean) => void | Promise<void>;
    onSaveAsset: (image: GeneratedImage, index: number) => void | Promise<void>;
}) {
    const { t } = useTranslation();
    const watermarkReady = useWatermarkStore(isWatermarkReady);
    const [src, setSrc] = useState(image.dataUrl);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [busyAction, setBusyAction] = useState<"save" | "reference" | "download" | null>(null);

    useEffect(() => {
        let active = true;
        setSrc(image.dataUrl);
        void resolveImageUrl(image.storageKey, image.dataUrl).then((url) => {
            if (active && url) setSrc(url);
        });
        return () => {
            active = false;
        };
    }, [image.storageKey, image.dataUrl]);

    const runAction = async (kind: "save" | "reference" | "download", action: () => void | Promise<void>) => {
        if (busyAction) return;
        setBusyAction(kind);
        try {
            await action();
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <button
                type="button"
                className="group relative block w-full cursor-zoom-in overflow-hidden bg-stone-50 dark:bg-stone-900"
                onClick={() => src && setPreviewOpen(true)}
                aria-label={t("common.view")}
            >
                <SmartImage
                    src={src}
                    alt={t("imageWorkbench.resultAlt", { count: index + 1 })}
                    className="aspect-square w-full object-cover transition group-hover:opacity-95"
                    loading="eager"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 py-2 text-left text-xs text-white opacity-0 transition group-hover:opacity-100">
                    {t("common.view")}
                </span>
            </button>
            <Modal
                open={previewOpen}
                footer={null}
                onCancel={() => setPreviewOpen(false)}
                width="min(96vw, 1100px)"
                centered
                destroyOnHidden
                title={t("imageWorkbench.resultTitle", { count: index + 1 })}
                styles={{ body: { paddingTop: 12 } }}
            >
                <SmartImage
                    src={src}
                    alt={t("imageWorkbench.resultAlt", { count: index + 1 })}
                    className="mx-auto max-h-[78vh] w-auto max-w-full object-contain"
                    loading="eager"
                />
            </Modal>
            <div className="space-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>
                        {image.width}x{image.height}
                    </span>
                    <span>{formatBytes(image.bytes)}</span>
                    <span>{formatDuration(image.durationMs)}</span>
                </div>
                <div className="flex min-w-0 gap-1.5">
                    <Tooltip title={t("common.addToAssets")}>
                        <Button
                            className={RESULT_ACTION_BUTTON_CLASS}
                            size="small"
                            loading={busyAction === "save"}
                            disabled={Boolean(busyAction) && busyAction !== "save"}
                            icon={<FolderPlus className="size-3.5" />}
                            onClick={() => void runAction("save", () => onSaveAsset(image, index))}
                        >
                            {t("imageWorkbench.resultSaveAsset")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("imageWorkbench.addReference")}>
                        <Button
                            className={RESULT_ACTION_BUTTON_CLASS}
                            size="small"
                            loading={busyAction === "reference"}
                            disabled={Boolean(busyAction) && busyAction !== "reference"}
                            icon={<PenLine className="size-3.5" />}
                            onClick={() => void runAction("reference", () => onEdit(image, index))}
                        >
                            {t("imageWorkbench.resultAddReference")}
                        </Button>
                    </Tooltip>
                    {watermarkReady ? (
                        <Dropdown
                            trigger={["hover"]}
                            menu={{
                                items: [
                                    {
                                        key: "without",
                                        label: t("watermark.download.without"),
                                        onClick: () => void runAction("download", () => onDownload(image, index, false)),
                                    },
                                    {
                                        key: "with",
                                        label: t("watermark.download.with"),
                                        onClick: () => void runAction("download", () => onDownload(image, index, true)),
                                    },
                                ],
                            }}
                        >
                            <Button
                                className={RESULT_ACTION_BUTTON_CLASS}
                                size="small"
                                loading={busyAction === "download"}
                                disabled={Boolean(busyAction) && busyAction !== "download"}
                                icon={<Download className="size-3.5" />}
                            >
                                {t("common.download")}
                            </Button>
                        </Dropdown>
                    ) : (
                        <Tooltip title={t("common.download")}>
                            <Button
                                className={RESULT_ACTION_BUTTON_CLASS}
                                size="small"
                                loading={busyAction === "download"}
                                disabled={Boolean(busyAction) && busyAction !== "download"}
                                icon={<Download className="size-3.5" />}
                                onClick={() => void runAction("download", () => onDownload(image, index, false))}
                            >
                                {t("common.download")}
                            </Button>
                        </Tooltip>
                    )}
                </div>
            </div>
        </div>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-square overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-square flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-red-600 dark:text-red-300">{t("workbench.failed")}</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" danger onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
            </div>
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onDeleteLog,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onDeleteLog: (id: string) => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight text-stone-800 dark:text-stone-100">
                    {t("workbench.logs")}
                </h2>
                <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    {logs.length}
                </span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="min-w-0 space-y-1.5 overflow-x-hidden">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                        onDelete={() => onDeleteLog(log.id)}
                    />
                ))}
                {!logs.length ? (
                    <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-stone-300/80 text-center text-sm text-stone-500 dark:border-stone-700/80">
                        {t("workbench.noLogs")}
                    </div>
                ) : null}
            </div>
        </>
    );
}

function LogCard({
    log,
    selected,
    active,
    onSelectedChange,
    onClick,
    onDelete,
}: {
    log: GenerationLog;
    selected: boolean;
    active: boolean;
    onSelectedChange: (checked: boolean) => void;
    onClick: () => void;
    onDelete: () => void;
}) {
    const { t } = useTranslation();
    const [thumbnails, setThumbnails] = useState(() => (log.thumbnails || []).filter(Boolean).slice(0, 4));
    const failed = log.status === "failed" || ((log.failCount ?? 0) > 0 && (log.successCount ?? log.imageCount ?? 0) === 0);
    const pending = log.status === "pending";
    const statusLabel = pending ? t("workbench.generating") : failed ? t("workbench.failed") : t("workbench.success");
    const statusColor = pending ? "processing" : failed ? "red" : "green";

    useEffect(() => {
        let activeResolve = true;
        const sources = log.images?.length
            ? log.images.slice(0, 4)
            : (log.thumbnails || []).slice(0, 4).map((dataUrl) => ({ dataUrl, storageKey: undefined as string | undefined }));
        void Promise.all(
            sources.map(async (image) => (await resolveImageUrl(image.storageKey, image.dataUrl)) || image.dataUrl),
        ).then((urls) => {
            if (activeResolve) setThumbnails(urls.filter(Boolean));
        });
        return () => {
            activeResolve = false;
        };
    }, [log.id, log.images, log.thumbnails]);

    return (
        <div
            className={cn(
                "flex w-full min-w-0 max-w-full items-stretch gap-2 overflow-hidden rounded-xl border p-2 transition",
                active
                    ? "border-emerald-400/50 bg-emerald-400/10 dark:border-emerald-400/40 dark:bg-emerald-400/10"
                    : "border-transparent bg-white/70 hover:bg-white dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
            )}
        >
            <Checkbox className="mt-0.5 shrink-0" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left" onClick={onClick}>
                <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5" title={log.title}>
                            {log.title}
                        </div>
                        <Tag className="m-0 h-5 shrink-0 rounded px-1.5 text-[11px] leading-5" color={statusColor}>
                            {statusLabel}
                        </Tag>
                    </div>
                    {failed && log.error ? (
                        <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-red-500 dark:text-red-400" title={log.error}>
                            {log.error}
                        </div>
                    ) : null}
                    <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                        {!failed ? <Tag className="m-0 h-5 rounded px-1.5 text-[11px] leading-5">{t("workbench.itemCount", { count: log.imageCount || log.successCount || 0 })}</Tag> : null}
                        <Tag className="m-0 h-5 rounded px-1.5 text-[11px] leading-5" color="green">
                            {formatDuration(log.durationMs)}
                        </Tag>
                        <Tag className="m-0 h-5 max-w-full truncate rounded px-1.5 text-[11px] leading-5" title={log.time}>
                            {log.time}
                        </Tag>
                    </div>
                </div>
                {thumbnails.length ? (
                    <div className="relative ml-auto shrink-0 self-center">
                        <SmartImage
                            src={thumbnails[0]}
                            alt=""
                            className="h-10 w-12 rounded-md object-cover ring-1 ring-black/5 dark:ring-white/10"
                            fallbackIconClassName="size-3.5"
                        />
                        {thumbnails.length > 1 ? (
                            <span className="absolute -bottom-1 -right-1 rounded bg-stone-900/85 px-1 text-[10px] font-medium leading-4 text-white">
                                +{thumbnails.length - 1}
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </button>
            <button
                type="button"
                className="inline-flex size-7 shrink-0 items-center justify-center self-start rounded-md text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                aria-label={t("common.delete")}
                title={t("common.delete")}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete();
                }}
            >
                <Trash2 className="size-3.5" />
            </button>
        </div>
    );
}

async function readMergedImageLogs(cursor = "") {
    try {
        const remote = await listGenerationAssets({ kind: "image", cursor, limit: 10 });
        return {
            logs: (remote.items || []).map(remoteImageAssetToLog),
            nextCursor: remote.next_cursor || "",
            hasMore: Boolean(remote.has_more),
        };
    } catch {
        return { logs: [], nextCursor: "", hasMore: false };
    }
}

function remoteImageAssetToLog(asset: GenerationAsset): GenerationLog {
    const createdAtMs = asset.created_at > 1e12 ? asset.created_at : asset.created_at * 1000;
    const images = (asset.assets || []).map((item, index) => ({
        id: `${asset.client_id || asset.id}-${index}`,
        dataUrl: item.url || "",
        storageKey: item.storage_key,
        durationMs: item.duration_ms || 0,
        width: item.width || 0,
        height: item.height || 0,
        bytes: item.bytes || 0,
        mimeType: item.mime_type,
    }));
    const expectedCount = Number(asset.config?.count || 0);
    const config = {
        model: asset.model || "",
        imageModel: asset.model || "",
        quality: String(asset.config?.quality || ""),
        size: String(asset.config?.size || ""),
        count: String(expectedCount || images.length || 1),
    };
    const status: GenerationLog["status"] = asset.status === "pending" ? "pending" : asset.status === "failed" ? "failed" : "success";
    return {
        id: asset.client_id || `remote:${asset.id}`,
        createdAt: createdAtMs,
        title: asset.title || asset.model || i18n.t("workbench.untitled"),
        prompt: asset.prompt || "",
        time: new Date(createdAtMs).toLocaleString(toIntlLocale(i18n.resolvedLanguage), { hour12: false }),
        model: asset.model || "",
        config,
        references: [],
        durationMs: Number(asset.config?.duration_ms || 0),
        successCount: status === "success" ? images.length : Number(asset.config?.success_count || images.length || 0),
        failCount: status === "failed" ? Math.max(1, Number(asset.config?.fail_count || 1)) : Number(asset.config?.fail_count || 0),
        imageCount: images.length || expectedCount || Number(asset.config?.count || 0),
        size: config.size,
        quality: config.quality,
        status,
        images,
        thumbnails: images.map((image) => image.dataUrl).filter(Boolean),
        error: asset.error || undefined,
    };
}


function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function isUploadAbortError(error: unknown) {
    return error instanceof Error && (error.name === "AbortError" || /cancel|abort/i.test(error.message));
}
