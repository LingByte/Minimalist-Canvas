import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, ClipboardPaste, Download, FolderPlus, History, LoaderCircle, Music2, Plus, SlidersHorizontal, Sparkles, Trash2, Upload, VideoIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { App, Button, Checkbox, Drawer, Empty, Modal, Tag, Typography } from "antd";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { toIntlLocale } from "@/i18n/languages";

import { AssetPickerModal, type InsertAssetPayload } from "@canvas/components/canvas/asset-picker-modal";
import { CanvasResourceMentionTextarea } from "@canvas/components/canvas/canvas-resource-mention-textarea";
import { ModelPicker } from "@canvas/components/model-picker";
import { PromptSelectDialog } from "@canvas/components/prompts/prompt-select-dialog";
import { VideoSettingsPanel, VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN, normalizeVideoResolutionValue, normalizeVideoSizeValue, videoSizeLabel } from "@canvas/components/video-settings-panel";
import {
    WorkbenchAddTile,
    WorkbenchBottomBar,
    WorkbenchModeTabs,
    WorkbenchReferenceZone,
    workbenchAsideClassName,
    workbenchComposerClassName,
    workbenchPageClassName,
    workbenchPromptShellClassName,
    workbenchResultsClassName,
} from "@canvas/components/workbench/workbench-studio";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import type { CanvasResourceReference } from "@canvas/lib/canvas/canvas-resource-references";
import { buildImageReferencePromptText, imageReferenceLabel } from "@canvas/lib/image-reference-prompt";
import { formatBytes, formatDuration } from "@canvas/lib/image-utils";
import { deleteStoredMedia, uploadMediaFile } from "@canvas/services/file-storage";
import { saveBlobAs } from "@canvas/lib/save-file";
import { uploadImage } from "@canvas/services/image-storage";
import { VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_MAX_ATTEMPTS, createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@canvas/services/api/video";
import { deleteGenerationAssetsByClientIds, listGenerationAssets, upsertGenerationAsset, type GenerationAsset } from "@canvas/services/api/generation-assets";
import { shouldKeepVideoAssetPending } from "@canvas/services/generation-asset-sync";
import { useAssetStore } from "@canvas/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@canvas/stores/use-workbench-agent-store";
import { boolConfig, modelPriceHint, useConfigStore, useEffectiveConfig, type AiConfig } from "@canvas/stores/use-config-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import type { ReferenceImage } from "@canvas/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@canvas/types/media";
import i18n from "@canvas/i18n";
import { SmartImage } from "@/components/smart-image";

const MAX_REFERENCE_IMAGES = 9;
const MAX_REFERENCE_VIDEOS = 3;
const MAX_REFERENCE_AUDIOS = 3;
const VIDEO_MAX_GENERATION_COUNT = 5;
const VIDEO_BATCH_CONCURRENCY = 1;
const VIDEO_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    video?: GeneratedVideo;
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
    videoReferences?: ReferenceVideo[];
    audioReferences?: ReferenceAudio[];
    durationMs: number;
    size: string;
    resolution: string;
    seconds: string;
    status: "pending" | "success" | "failed";
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

export default function VideoPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoFileInputRef = useRef<HTMLInputElement>(null);
    const audioFileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
    const pollGateRef = useRef({ active: 0, waiters: [] as Array<() => void> });
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [videoReferences, setVideoReferences] = useState<ReferenceVideo[]>([]);
    const [audioReferences, setAudioReferences] = useState<ReferenceAudio[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
    const [videoLogCursor, setVideoLogCursor] = useState("");
    const [videoLogHasMore, setVideoLogHasMore] = useState(false);
    const [referenceDragTarget, setReferenceDragTarget] = useState(false);
    const [generationCount, setGenerationCount] = useState(1);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.videoModel || effectiveConfig.model;
    const priceHint = modelPriceHint(effectiveConfig, model);
    const canGenerate = Boolean(prompt.trim());
    const mentionReferences = useMemo<CanvasResourceReference[]>(() => {
        const images = references.map((item, index) => ({
            id: item.id,
            nodeId: item.id,
            kind: "image" as const,
            label: imageReferenceLabel(index),
            title: item.name || imageReferenceLabel(index),
            previewUrl: item.dataUrl,
            active: true,
        }));
        const videos = videoReferences.map((item, index) => {
            const label = `${t("videoWorkbench.videoReferences")} ${index + 1}`;
            return { id: item.id, nodeId: item.id, kind: "video" as const, label, title: item.name || label, previewUrl: item.url, active: true };
        });
        const audios = audioReferences.map((item, index) => {
            const label = `${t("videoWorkbench.audioReferences")} ${index + 1}`;
            return { id: item.id, nodeId: item.id, kind: "audio" as const, label, title: item.name || label, active: true };
        });
        return [...images, ...videos, ...audios];
    }, [audioReferences, references, t, videoReferences]);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !/^(image|video|audio)\//.test(file.type));
        if (unsupported.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/")).slice(0, MAX_REFERENCE_IMAGES - references.length);
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, MAX_REFERENCE_IMAGES));

        const videoFiles = selectedFiles.filter((file) => file.type.startsWith("video/")).slice(0, MAX_REFERENCE_VIDEOS - videoReferences.length);
        const nextVideos = await Promise.all(
            videoFiles.map(async (file) => {
                const media = await uploadMediaFile(file, "video");
                return { id: nanoid(), name: file.name, type: media.mimeType, url: media.url, storageKey: media.storageKey, bytes: media.bytes, width: media.width, height: media.height, durationMs: media.durationMs };
            }),
        );
        setVideoReferences((value) => [...value, ...nextVideos].slice(0, MAX_REFERENCE_VIDEOS));

        const audioFiles = selectedFiles.filter((file) => file.type.startsWith("audio/")).slice(0, MAX_REFERENCE_AUDIOS - audioReferences.length);
        const nextAudios = await Promise.all(
            audioFiles.map(async (file) => {
                const media = await uploadMediaFile(file, "audio");
                return { id: nanoid(), name: file.name, type: media.mimeType, url: media.url, storageKey: media.storageKey, durationMs: media.durationMs };
            }),
        );
        setAudioReferences((value) => [...value, ...nextAudios].slice(0, MAX_REFERENCE_AUDIOS));
    };

    const handleReferenceDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setReferenceDragTarget(true);
    };

    const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setReferenceDragTarget(false);
    };

    const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setReferenceDragTarget(false);
        void addReferences(event.dataTransfer.files);
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("videoWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, MAX_REFERENCE_IMAGES - references.length).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, MAX_REFERENCE_IMAGES));
            message.success(t("videoWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("videoWorkbench.clipboardEmpty"));
        }
    };
    const acquirePollSlot = async () => {
        if (pollGateRef.current.active < VIDEO_BATCH_CONCURRENCY) {
            pollGateRef.current.active += 1;
            return;
        }
        await new Promise<void>((resolve) => {
            pollGateRef.current.waiters.push(resolve);
        });
        pollGateRef.current.active += 1;
    };

    const releasePollSlot = () => {
        pollGateRef.current.active = Math.max(0, pollGateRef.current.active - 1);
        const next = pollGateRef.current.waiters.shift();
        if (next) next();
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }
        const count = Math.max(1, Math.min(VIDEO_MAX_GENERATION_COUNT, generationCount));
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        const slots = Array.from({ length: count }, () => ({ id: nanoid(), status: "pending" as const }));
        setResults(slots);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        const requestPrompt = buildImageReferencePromptText(snapshot.text, snapshot.references);
        let successCount = 0;
        let failCount = 0;
        let lastError: string | undefined;

        await runPool(slots, VIDEO_BATCH_CONCURRENCY, async (slot) => {
            try {
                const task = await createVideoGenerationTask(snapshot.config, requestPrompt, {
                    images: snapshot.references,
                    videos: snapshot.videoReferences,
                    audios: snapshot.audioReferences,
                });
                const log = buildLog({
                    id: slot.id,
                    prompt: snapshot.text,
                    model,
                    config: snapshot.config,
                    references: snapshot.references,
                    videoReferences: snapshot.videoReferences,
                    audioReferences: snapshot.audioReferences,
                    durationMs: 0,
                    status: "pending",
                    task,
                });
                await saveLog(log, false);
                const pollError = await pollGenerationLog(log, snapshot.config, { quiet: true, resultId: slot.id });
                if (!pollError) successCount += 1;
                else {
                    failCount += 1;
                    lastError = pollError;
                }
            } catch (error) {
                failCount += 1;
                const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
                lastError = errorMessage;
                setResults((value) => value.map((item) => (item.id === slot.id ? { id: slot.id, status: "failed", error: errorMessage } : item)));
                await saveLog(
                    buildLog({
                        id: slot.id,
                        prompt: snapshot.text,
                        model,
                        config: snapshot.config,
                        references: snapshot.references,
                        videoReferences: snapshot.videoReferences,
                        audioReferences: snapshot.audioReferences,
                        durationMs: performance.now() - batchStartedAt,
                        status: "failed",
                        error: errorMessage,
                    }),
                    false,
                );
            }
        });

        if (agentTaskId) {
            updateAgentTask(agentTaskId, {
                status: successCount ? "succeeded" : "failed",
                successCount,
                failCount,
                error: successCount ? undefined : lastError,
            });
        }
        if (count > 1) {
            if (successCount && failCount) message.warning(t("videoWorkbench.batchPartial", { success: successCount, fail: failCount }));
            else if (successCount) message.success(t("videoWorkbench.batchDone", { count: successCount }));
            else message.error(lastError || t("workbench.generationFailed"));
        } else if (successCount) {
            message.success(t("videoWorkbench.generated"));
        } else {
            message.error(lastError || t("workbench.generationFailed"));
        }
        if (!activeLogIdsRef.current.size) {
            setRunning(false);
            setStartedAt(0);
        }
    };

    // Handle video-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!videoCommand || videoCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = videoCommand.nonce;
        clearVideoCommand();
        if (typeof videoCommand.prompt === "string") setPrompt(videoCommand.prompt);
        if (videoCommand.run && running) {
            if (videoCommand.taskId) updateAgentTask(videoCommand.taskId, { status: "failed", error: t("videoWorkbench.busy") });
            return;
        }
        if (videoCommand.run) {
            agentTaskIdRef.current = videoCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [videoCommand, clearVideoCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("videoWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: buildVideoConfig(effectiveConfig, model), references: [...references], videoReferences: [...videoReferences], audioReferences: [...audioReferences] };
    };

    const requestGenerate = () => {
        if (!canGenerate || running) return;
        const count = Math.max(1, Math.min(VIDEO_MAX_GENERATION_COUNT, generationCount));
        if (count > 1) {
            setBatchConfirmOpen(true);
            return;
        }
        const content = priceHint
            ? t("workbench.confirmSpend", { price: priceHint })
            : t("workbench.confirmSpendTitle");
        Modal.confirm({
            title: t("workbench.confirmSpendTitle"),
            content,
            okText: t("workbench.confirmSpendOk"),
            cancelText: t("common.cancel"),
            onOk: () => void generate(),
        });
    };

    const confirmBatchGenerate = () => {
        setBatchConfirmOpen(false);
        void generate();
    };

    const retryResult = () => {
        requestGenerate();
    };

    const downloadVideo = (video: GeneratedVideo) => {
        void saveBlobAs(video.url, "video.mp4");
    };

    const saveResultToAssets = (video: GeneratedVideo, index: number) => {
        addAsset({
            kind: "video",
            title: t("videoWorkbench.resultTitle", { count: index + 1 }),
            coverUrl: "",
            tags: [],
            source: t("videoWorkbench.source"),
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: {
                source: "video-page",
                prompt,
                ...( /^https?:\/\//i.test(video.url) ? { upstreamUrl: video.url } : {}),
            },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }].slice(0, MAX_REFERENCE_IMAGES));
        } else if (payload.kind === "video") {
            setVideoReferences((value) => [...value, { id: nanoid(), name: payload.title, type: "video/mp4", url: payload.url, storageKey: payload.storageKey, width: payload.width, height: payload.height }].slice(0, MAX_REFERENCE_VIDEOS));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setVideoReferences([]);
        setAudioReferences([]);
        setResults([]);
        setGenerationCount(1);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const mediaKeys = logs
            .filter((log) => selectedLogIds.includes(log.id))
            .map((log) => log.video?.storageKey)
            .filter((key): key is string => Boolean(key));
        void Promise.all([
            deleteStoredMedia(mediaKeys),
            deleteGenerationAssetsByClientIds(selectedLogIds),
        ]).then(() => void refreshLogs());
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = async (log: GenerationLog, resumePending = true) => {
        await syncGenerationAsset(log);
        await refreshLogs(resumePending);
    };

    const refreshLogs = async (resumePending = true) => {
        const page = await readMergedVideoLogs();
        setLogs(page.logs);
        setVideoLogCursor(page.nextCursor);
        setVideoLogHasMore(page.hasMore);
        if (resumePending) resumePendingLogs(page.logs);
        return page.logs;
    };

    const loadMoreVideoLogs = async () => {
        if (!videoLogHasMore || !videoLogCursor) return;
        const page = await readMergedVideoLogs(videoLogCursor);
        setLogs((current) => {
            const ids = new Set(current.map((item) => item.id));
            const taskIds = new Set(current.map((item) => item.task?.id).filter(Boolean));
            const extra = page.logs.filter((log) => !ids.has(log.id) && !(log.task?.id && taskIds.has(log.task.id)));
            return [...current, ...extra].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        });
        setVideoLogCursor(page.nextCursor);
        setVideoLogHasMore(page.hasMore);
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        for (const log of items) {
            if (log.status === "pending" && log.task) void pollGenerationLog(log, undefined, { resultId: log.id });
        }
    };

    const pollGenerationLog = async (
        log: GenerationLog,
        configOverride?: AiConfig,
        options?: { quiet?: boolean; resultId?: string; agentTaskId?: string },
    ): Promise<string | null> => {
        if (!log.task) return t("workbench.generationFailed");
        if (activeLogIdsRef.current.has(log.id)) return null;
        const resultId = options?.resultId || log.id;
        const quiet = Boolean(options?.quiet);
        const agentTaskId = options?.agentTaskId;
        activeLogIdsRef.current.add(log.id);
        setRunning(true);
        setStartedAt((value) => value || performance.now());
        setResults((value) => {
            if (value.some((item) => item.id === resultId)) {
                return value.map((item) => (item.id === resultId ? { ...item, status: "pending", error: undefined } : item));
            }
            return value.length ? [...value, { id: resultId, status: "pending" }] : [{ id: resultId, status: "pending" }];
        });
        const taskConfig = buildVideoConfig({ ...effectiveConfig, ...log.config }, log.task.model || log.model);
        const ignoreResultUrls = allWorkbenchReferenceUrls(log);
        await acquirePollSlot();
        try {
            for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt += 1) {
                const state = await pollVideoGenerationTask(configOverride || taskConfig, log.task, {
                    ...(ignoreResultUrls.length ? { ignoreResultUrls } : {}),
                });
                if (state.status === "completed") {
                    const stored = await storeGeneratedVideo(state.result, {
                        onRemirrored: (file) => {
                            const remirrored: GeneratedVideo = {
                                id: nanoid(),
                                url: file.url,
                                storageKey: file.storageKey,
                                durationMs: Date.now() - log.createdAt,
                                width: file.width || 1280,
                                height: file.height || 720,
                                bytes: file.bytes,
                                mimeType: file.mimeType,
                            };
                            setResults((value) =>
                                value.map((item) => (item.id === resultId ? { id: resultId, status: "success", video: remirrored } : item)),
                            );
                            void saveLog({ ...log, status: "success", durationMs: remirrored.durationMs, video: remirrored, error: undefined });
                        },
                    });
                    if (ignoreResultUrls.some((url) => normalizeWorkbenchUrlKey(url) === normalizeWorkbenchUrlKey(stored.url))) {
                        throw new Error(t("workbench.generationFailed"));
                    }
                    const nextVideo: GeneratedVideo = {
                        id: nanoid(),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        durationMs: Date.now() - log.createdAt,
                        width: stored.width || 1280,
                        height: stored.height || 720,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    setResults((value) => value.map((item) => (item.id === resultId ? { id: resultId, status: "success", video: nextVideo } : item)));
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                    await saveLog({ ...log, status: "success", durationMs: nextVideo.durationMs, video: nextVideo, error: undefined });
                    if (!quiet) message.success(t("videoWorkbench.generated"));
                    return null;
                }
                if (state.status === "failed") throw new Error(state.error);
                if (attempt === VIDEO_POLL_MAX_ATTEMPTS - 1) throw new Error(t("videoWorkbench.timeout"));
                await delay(VIDEO_POLL_INTERVAL_MS);
            }
            return t("workbench.generationFailed");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults((value) => value.map((item) => (item.id === resultId ? { id: resultId, status: "failed", error: errorMessage } : item)));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog({ ...log, status: "failed", durationMs: Date.now() - log.createdAt, error: errorMessage });
            if (!quiet) message.error(errorMessage);
            return errorMessage;
        } finally {
            releasePollSlot();
            activeLogIdsRef.current.delete(log.id);
            if (!activeLogIdsRef.current.size) {
                setRunning(false);
                setStartedAt(0);
            }
        }
    };

    const previewGenerationLog = (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        setVideoReferences(log.videoReferences || []);
        setAudioReferences(log.audioReferences || []);
        if (log.config.videoModel || log.model) updateConfig("videoModel", log.config.videoModel || log.model);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        setResults(log.status === "pending" ? [{ id: log.id, status: "pending" }] : log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || t("workbench.generationFailed") }]);
    };

    return (
        <div className={workbenchPageClassName()}>
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)]">
                <aside className={workbenchAsideClassName()}>
                    <LogPanel logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} />
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[min(440px,42%)_minmax(0,1fr)]">
                    <div className={workbenchComposerClassName()}>
                        <div className="flex items-start justify-between gap-3">
                            <WorkbenchModeTabs className="min-w-0 flex-1" />
                            <div className="flex shrink-0 gap-1.5 lg:hidden">
                                <Button size="small" icon={<History className="size-3.5" />} onClick={() => setLogsOpen(true)} />
                                <Button size="small" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setSettingsOpen(true)} />
                            </div>
                        </div>

                        <div className="mt-3 min-w-0">
                            <span className="mb-1.5 block text-xs font-medium text-stone-500">{t("workbench.model")}</span>
                            <ModelPicker
                                config={effectiveConfig}
                                value={model}
                                onChange={(value) => updateConfig("videoModel", value)}
                                capability="video"
                                fullWidth
                                className="!h-10 !rounded-xl !px-3.5 !text-[13px]"
                                onMissingConfig={() => openConfigDialog(false)}
                            />
                        </div>

                        <div className="mt-4 space-y-4">
                            <WorkbenchReferenceZone
                                title={t("videoWorkbench.references")}
                                countLabel={`${references.length}/${MAX_REFERENCE_IMAGES}`}
                                dragActive={referenceDragTarget}
                                onDragEnter={handleReferenceDragEnter}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "copy";
                                }}
                                onDragLeave={handleReferenceDragLeave}
                                onDrop={handleReferenceDrop}
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
                                <WorkbenchAddTile onClick={() => fileInputRef.current?.click()} label={t("workbench.addImageRef")} />
                                {references.map((item, index) => (
                                    <div key={item.id} className="group relative size-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
                                        <SmartImage src={item.dataUrl} alt={item.name} className="size-full object-cover" fallbackClassName="size-full" fallbackIconClassName="size-4" />
                                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                                        <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                        <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))} aria-label={t("videoWorkbench.removeImage")}>
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </WorkbenchReferenceZone>

                            <WorkbenchReferenceZone
                                title={t("videoWorkbench.videoReferences")}
                                countLabel={`${videoReferences.length}/${MAX_REFERENCE_VIDEOS}`}
                                dragActive={referenceDragTarget}
                                onDragEnter={handleReferenceDragEnter}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "copy";
                                }}
                                onDragLeave={handleReferenceDragLeave}
                                onDrop={handleReferenceDrop}
                                onWheel={(event) => {
                                    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                    event.preventDefault();
                                    event.currentTarget.scrollLeft += event.deltaY;
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => videoFileInputRef.current?.click()}
                                    className="grid size-[5.5rem] shrink-0 place-items-center rounded-2xl border border-dashed border-stone-300/90 bg-stone-100/80 text-stone-400 transition hover:border-sky-400 hover:bg-sky-400/10 hover:text-sky-600 dark:border-stone-700 dark:bg-stone-900/80"
                                    aria-label={t("workbench.addVideoRef")}
                                >
                                    <VideoIcon className="size-7 opacity-80" />
                                </button>
                                {videoReferences.map((item, index) => (
                                    <div key={item.id} className="group relative size-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-black dark:border-stone-800">
                                        <video src={item.url} muted className="size-full object-cover" />
                                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{index + 1}</span>
                                        <ReferenceOrderButtons index={index} total={videoReferences.length} onMove={(offset) => setVideoReferences((value) => moveListItem(value, index, offset))} />
                                        <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={() => setVideoReferences((value) => value.filter((ref) => ref.id !== item.id))} aria-label={t("videoWorkbench.removeVideo")}>
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </WorkbenchReferenceZone>

                            <WorkbenchReferenceZone
                                title={t("videoWorkbench.audioReferences")}
                                countLabel={`${audioReferences.length}/${MAX_REFERENCE_AUDIOS}`}
                                dragActive={referenceDragTarget}
                                onDragEnter={handleReferenceDragEnter}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "copy";
                                }}
                                onDragLeave={handleReferenceDragLeave}
                                onDrop={handleReferenceDrop}
                                onWheel={(event) => {
                                    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                    event.preventDefault();
                                    event.currentTarget.scrollLeft += event.deltaY;
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => audioFileInputRef.current?.click()}
                                    className="grid size-[5.5rem] shrink-0 place-items-center rounded-2xl border border-dashed border-stone-300/90 bg-stone-100/80 text-stone-400 transition hover:border-sky-400 hover:bg-sky-400/10 hover:text-sky-600 dark:border-stone-700 dark:bg-stone-900/80"
                                    aria-label={t("workbench.addAudioRef")}
                                >
                                    <Music2 className="size-7 opacity-80" />
                                </button>
                                {audioReferences.map((item, index) => (
                                    <div key={item.id} className="group relative flex h-[5.5rem] w-36 shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-stone-200 px-2 dark:border-stone-800">
                                        <Music2 className="size-4 shrink-0 text-stone-500" />
                                        <span className="min-w-0 truncate text-xs">{item.name || `${index + 1}`}</span>
                                        <ReferenceOrderButtons index={index} total={audioReferences.length} onMove={(offset) => setAudioReferences((value) => moveListItem(value, index, offset))} />
                                        <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={() => setAudioReferences((value) => value.filter((ref) => ref.id !== item.id))} aria-label={t("videoWorkbench.removeAudio")}>
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </WorkbenchReferenceZone>

                            <div>
                                <div className={workbenchPromptShellClassName()}>
                                    <CanvasResourceMentionTextarea
                                        value={prompt}
                                        onChange={setPrompt}
                                        references={mentionReferences}
                                        rows={7}
                                        placeholder={t("videoWorkbench.promptPlaceholder")}
                                        className="min-h-[160px] w-full resize-y border-0 bg-transparent px-3 pt-3 pb-12 text-sm leading-6 text-stone-900 outline-none dark:text-stone-100"
                                        style={{ color: "inherit" }}
                                    />
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 p-2">
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
                                    {normalizeResolution(effectiveConfig.vquality)}p · {videoSizeLabel(effectiveConfig.size)} · {normalizeVideoSeconds(effectiveConfig.videoSeconds)}s · {generationCount}
                                </>
                            }
                            settingsOpen={settingsOpen}
                            onSettingsOpenChange={setSettingsOpen}
                            settings={
                                <GenerationSettings
                                    config={effectiveConfig}
                                    model={model}
                                    updateConfig={updateConfig}
                                    openConfigDialog={openConfigDialog}
                                    generationCount={generationCount}
                                    onGenerationCountChange={setGenerationCount}
                                />
                            }
                            generateLabel={t("workbench.generate")}
                            generatePrice={priceHint || undefined}
                            generating={running}
                            disabled={!canGenerate || running}
                            onGenerate={requestGenerate}
                        />
                    </div>

                    <div className={workbenchResultsClassName()}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold tracking-tight">{t("workbench.results")}</h2>
                            {running ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className="grid gap-4">
                                {results.map((result, index) =>
                                    result.status === "success" && result.video ? (
                                        <ResultVideoCard key={result.id} video={result.video} onDownload={downloadVideo} onSaveAsset={() => saveResultToAssets(result.video!, index)} />
                                    ) : result.status === "failed" ? (
                                        <FailedVideoCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={retryResult} />
                                    ) : (
                                        <PendingVideoCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 text-center dark:border-stone-700 lg:min-h-[560px]">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("videoWorkbench.empty")} />
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
            <input
                ref={videoFileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={audioFileInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} />
                {videoLogHasMore ? (
                    <div className="flex justify-center py-3">
                        <Button onClick={() => void loadMoreVideoLogs()}>{t("canvas.sidePanel.loadMoreLogs")}</Button>
                    </div>
                ) : null}
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
            <Modal
                title={t("videoWorkbench.batchConfirmTitle")}
                open={batchConfirmOpen}
                onCancel={() => setBatchConfirmOpen(false)}
                onOk={confirmBatchGenerate}
                okText={t("videoWorkbench.batchConfirmOk")}
                cancelText={t("common.cancel")}
            >
                {priceHint
                    ? t("workbench.confirmSpendCount", { count: Math.max(1, Math.min(VIDEO_MAX_GENERATION_COUNT, generationCount)), price: priceHint })
                    : t("videoWorkbench.batchHint", { count: Math.max(1, Math.min(VIDEO_MAX_GENERATION_COUNT, generationCount)) })}
            </Modal>
        </div>
    );
}

function GenerationSettings({
    config,
    model,
    updateConfig,
    openConfigDialog,
    generationCount,
    onGenerationCountChange,
}: {
    config: AiConfig;
    model: string;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    generationCount: number;
    onGenerationCountChange: (count: number) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <span className="block text-xs font-medium text-stone-500">{t("settingsPanels.video.count")}</span>
                <div className="grid grid-cols-5 gap-1.5">
                    {VIDEO_COUNT_OPTIONS.map((value) => (
                        <button
                            key={value}
                            type="button"
                            className="h-8 rounded-lg border text-xs transition hover:opacity-80"
                            style={{
                                borderColor: generationCount === value ? theme.node.text : theme.node.stroke,
                                color: theme.node.text,
                                background: "transparent",
                            }}
                            onClick={() => onGenerationCountChange(value)}
                        >
                            {value}
                        </button>
                    ))}
                </div>
            </div>
            <VideoSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-3" compact />
        </div>
    );
}

function ResultVideoCard({ video, onDownload, onSaveAsset }: { video: GeneratedVideo; onDownload: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <video src={video.url} controls className="aspect-video w-full bg-black object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>
                        {video.width}x{video.height}
                    </span>
                    <span>{formatBytes(video.bytes)}</span>
                    <span>{formatDuration(video.durationMs)}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)}>
                        {t("common.addToAssets")}
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PendingVideoCard() {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-video overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedVideoCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
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

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{t("workbench.logs")}</h2>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
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
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard key={log.id} log={log} selected={selectedLogIds.includes(log.id)} active={activeLogId === log.id} onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))} onClick={() => onPreviewLog(log)} />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button type="button" className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`} onClick={onClick}>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.resolution}p</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.seconds}s</Tag>
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={log.status === "success" ? "blue" : log.status === "pending" ? "processing" : "red"}>
                        {t(`workbench.${log.status === "success" ? "success" : log.status === "pending" ? "generating" : "failed"}`)}
                    </Tag>
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                        {formatDuration(log.durationMs)}
                    </Tag>
                </div>
            </div>
        </button>
    );
}

async function readMergedVideoLogs(cursor = "") {
    try {
        const remote = await listGenerationAssets({ kind: "video", cursor, limit: 10 });
        return {
            logs: (remote.items || []).map(remoteVideoAssetToLog),
            nextCursor: remote.next_cursor || "",
            hasMore: Boolean(remote.has_more),
        };
    } catch {
        return { logs: [], nextCursor: "", hasMore: false };
    }
}

function remoteVideoAssetToLog(asset: GenerationAsset): GenerationLog {
    const createdAtMs = asset.created_at > 1e12 ? asset.created_at : asset.created_at * 1000;
    const file = asset.assets?.[0];
    const config = {
        model: asset.model || "",
        videoModel: asset.model || "",
        size: String(asset.config?.size || ""),
        vquality: String(asset.config?.resolution || asset.config?.vquality || ""),
        videoSeconds: String(asset.config?.seconds || ""),
        videoGenerateAudio: String(asset.config?.videoGenerateAudio ?? asset.config?.generate_audio ?? "true"),
        videoWatermark: String(asset.config?.videoWatermark ?? asset.config?.watermark ?? "false"),
    };
    return {
        id: asset.client_id || `remote:${asset.id}`,
        createdAt: createdAtMs,
        title: asset.title || asset.model || i18n.t("workbench.untitled"),
        prompt: asset.prompt || "",
        time: new Date(createdAtMs).toLocaleString(toIntlLocale(i18n.resolvedLanguage), { hour12: false }),
        model: asset.model || "",
        config,
        references: [],
        durationMs: Number(asset.config?.duration_ms || file?.duration_ms || 0),
        size: config.size,
        resolution: config.vquality,
        seconds: config.videoSeconds,
        status: asset.status === "pending" ? "pending" : asset.status === "failed" ? "failed" : "success",
        task: asset.task_id ? { id: asset.task_id, provider: "openai", model: asset.model || "" } : undefined,
        video: file
            ? {
                  id: String(asset.id),
                  url: file.url || "",
                  storageKey: file.storage_key || "",
                  durationMs: file.duration_ms || 0,
                  width: file.width || 1280,
                  height: file.height || 720,
                  bytes: file.bytes || 0,
                  mimeType: file.mime_type || "video/mp4",
              }
            : undefined,
        error: asset.error,
    };
}



async function syncGenerationAsset(log: GenerationLog) {
    if (shouldKeepVideoAssetPending(log.status, log.error)) return;
    const excludeUrls = allWorkbenchReferenceUrls(log);
    if (log.video?.url && excludeUrls.some((url) => normalizeWorkbenchUrlKey(url) === normalizeWorkbenchUrlKey(log.video!.url))) {
        return;
    }
    const imageUrls = workbenchReferenceUrls(log.references);
    const videoUrls = workbenchReferenceUrls(log.videoReferences);
    const audioUrls = workbenchReferenceUrls(log.audioReferences);
    await upsertGenerationAsset({
        client_id: log.id,
        kind: "video",
        source: "workbench",
        title: log.title,
        prompt: log.prompt,
        model: log.model,
        status: log.status,
        task_id: log.task?.id,
        error: log.error,
        attempt_id: log.task?.attemptId,
        config: {
            size: log.size,
            resolution: log.resolution || log.config?.vquality,
            seconds: log.seconds,
            duration_ms: log.durationMs,
            task_provider: log.task?.provider,
            ...(typeof log.config?.videoGenerateAudio === "boolean"
                ? { generate_audio: log.config.videoGenerateAudio }
                : log.config?.videoGenerateAudio != null
                  ? { generate_audio: String(log.config.videoGenerateAudio) === "true" }
                  : {}),
            ...(typeof log.config?.videoWatermark === "boolean"
                ? { watermark: log.config.videoWatermark }
                : log.config?.videoWatermark != null
                  ? { watermark: String(log.config.videoWatermark) === "true" }
                  : {}),
            ...(imageUrls.length ? { images: imageUrls } : {}),
            ...(videoUrls.length ? { videos: videoUrls } : {}),
            ...(audioUrls.length ? { audios: audioUrls } : {}),
        },
        assets: log.video
            ? [
                  {
                      url: log.video.url,
                      storage_key: log.video.storageKey,
                      mime_type: log.video.mimeType,
                      width: log.video.width,
                      height: log.video.height,
                      bytes: log.video.bytes,
                      duration_ms: log.video.durationMs,
                  },
              ]
            : [],
    });
}

function allWorkbenchReferenceUrls(log: Pick<GenerationLog, "references" | "videoReferences" | "audioReferences">) {
    return [...workbenchReferenceUrls(log.references), ...workbenchReferenceUrls(log.videoReferences), ...workbenchReferenceUrls(log.audioReferences)];
}

function workbenchReferenceUrls(items: Array<{ url?: string; storageKey?: string; dataUrl?: string }> | undefined) {
    if (!items?.length) return [];
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
        for (const candidate of [item.url, item.storageKey, item.dataUrl && !item.dataUrl.startsWith("data:") ? item.dataUrl : undefined]) {
            const value = candidate?.trim();
            if (!value || /^(image|video|audio):/i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) continue;
            const key = normalizeWorkbenchUrlKey(value);
            if (seen.has(key)) continue;
            seen.add(key);
            urls.push(value);
        }
    }
    return urls;
}

function normalizeWorkbenchUrlKey(url: string) {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {
        return url.trim().toLowerCase();
    }
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


function buildLog({
    id,
    prompt,
    model,
    config,
    references,
    videoReferences,
    audioReferences,
    durationMs,
    status,
    task,
    video,
    error,
}: {
    id?: string;
    prompt: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
    videoReferences?: ReferenceVideo[];
    audioReferences?: ReferenceAudio[];
    durationMs: number;
    status: GenerationLog["status"];
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
}): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
    };
    return {
        id: id || nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || i18n.t("workbench.untitled"),
        prompt,
        time: new Date().toLocaleString(toIntlLocale(i18n.resolvedLanguage), { hour12: false }),
        model,
        config: logConfig,
        references,
        videoReferences,
        audioReferences,
        durationMs,
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        error,
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    return {
        ...config,
        model,
        videoModel: model,
        size: normalizeVideoSize(config.size),
        videoSeconds: normalizeVideoSeconds(config.videoSeconds),
        vquality: normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, true)),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(VIDEO_SECONDS_MIN, Math.min(VIDEO_SECONDS_MAX, seconds)));
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
    if (!items.length) return;
    let cursor = 0;
    const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            await worker(items[index], index);
        }
    });
    await Promise.all(runners);
}
