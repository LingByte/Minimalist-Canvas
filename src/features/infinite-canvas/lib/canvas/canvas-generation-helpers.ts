import axios from "axios";
import { defaultConfig, resolveModelForCapability, type AiConfig } from "@canvas/stores/use-config-store";
import i18n from "@canvas/i18n";
import { resolveImageUrl, uploadImage } from "@canvas/services/image-storage";
import { resolveMediaUrl } from "@canvas/services/file-storage";
import { imageMetadata, referenceUrl } from "@canvas/lib/canvas/canvas-node-factory";
import type { NodeGenerationInput } from "@canvas/components/canvas/canvas-node-generation";
import type { CanvasNodeGenerationMode } from "@canvas/components/canvas/canvas-node-prompt-panel";
import type { CanvasImageAngleParams } from "@canvas/components/canvas/canvas-node-angle-dialog";
import type { ReferenceImage } from "@canvas/types/image";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@canvas/types/canvas";

export function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

export function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

/**
 * Collect reference media URLs that may appear in upstream poll bodies.
 * Skip local IndexedDB keys (`image:`/`video:`/`audio:`) and data URLs — those
 * never match CDN echoes, and preferring them previously disabled ignore lists.
 */
export function generationReferenceUrls(context: {
    referenceImages: ReferenceImage[];
    referenceVideos: Array<{ storageKey?: string; url?: string }>;
    referenceAudios?: Array<{ storageKey?: string; url?: string }>;
}) {
    return dedupeReferenceUrls([
        ...context.referenceImages.flatMap((image) => [
            image.url,
            image.storageKey,
            image.dataUrl && !image.dataUrl.startsWith("data:") ? image.dataUrl : undefined,
            referenceUrl(image),
        ]),
        ...context.referenceVideos.flatMap((video) => [video.url, video.storageKey]),
        ...(context.referenceAudios || []).flatMap((audio) => [audio.url, audio.storageKey]),
    ]);
}

function dedupeReferenceUrls(candidates: Array<string | undefined>) {
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
        const value = candidate?.trim();
        if (!value) continue;
        if (/^(image|video|audio):/i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        urls.push(value);
    }
    return urls;
}

export async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

export async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            // Keep durable https content for video/audio so generation ignore lists can
            // still match upstream reference echoes after project reload.
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && node.metadata?.storageKey) {
                if (content && /^https?:\/\//i.test(content)) return node;
                return { ...node, metadata: { ...node.metadata, content: await resolveMediaUrl(node.metadata.storageKey, content) } };
            }
            if (node.type !== CanvasNodeType.Image || !content) return node;
            const images = await Promise.all((node.metadata?.images || []).map(async (image) => (image.content ? { ...image, content: await resolveImageUrl(image.storageKey, image.content) } : image)));
            if (node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveImageUrl(node.metadata.storageKey, content), images } };
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

export async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

export function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

export function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}

export function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode): AiConfig {
    return {
        ...config,
        model: resolveModelForCapability(config, node?.metadata?.model, mode),
        reasoningEffort: node?.metadata?.reasoningEffort || config.reasoningEffort || defaultConfig.reasoningEffort,
        quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
        size: node?.metadata?.size || config.size || defaultConfig.size,
        imageResolution: node?.metadata?.imageResolution || config.imageResolution || defaultConfig.imageResolution,
        background: node?.metadata?.background ?? config.background ?? defaultConfig.background,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node?.metadata?.audioVoice || config.audioVoice || defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat || config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed || config.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node?.metadata?.audioInstructions || config.audioInstructions || defaultConfig.audioInstructions,
        count: String(node?.metadata?.count || (mode === "image" ? config.canvasImageCount || config.count : config.count) || defaultConfig.count),
    };
}

export function isRecoverableVideoGeneration(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Video) return false;
    const taskId = node.metadata?.videoTaskId?.trim();
    if (!taskId) return false;
    // Plugin video scripts finish create+poll in one shot and only keep results in memory.
    if (node.metadata?.videoTaskProvider === "plugin") return false;
    const status = node.metadata?.status;
    // Resume in-flight tasks after refresh, and let failed nodes with a gateway task id be re-polled.
    return status === "loading" || status === "error";
}

export function isRecoverableImageGeneration(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Image) return false;
    if (node.metadata?.status !== "loading") return false;
    if (!node.metadata?.imageJobRecoverable) return false;
    const loadingImages = node.metadata.images?.filter((image) => image.status === "loading") || [];
    if (loadingImages.length) return true;
    // Single-image node without batch slots still recoverable while loading.
    return !node.metadata.images?.length;
}

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => {
        if (node.metadata?.status !== "loading") return node;
        // Gateway video tasks survive refresh via videoTaskId; keep loading so polling can resume.
        if (isRecoverableVideoGeneration(node)) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    errorDetails: undefined,
                    generationProgress: node.metadata.generationProgress,
                },
            };
        }
        // Server image jobs survive refresh via generation_assets client_id (= image slot id).
        if (isRecoverableImageGeneration(node)) {
            return {
                ...node,
                metadata: {
                    ...node.metadata,
                    errorDetails: undefined,
                    images: node.metadata.images?.map((image) =>
                        image.status === "loading" ? { ...image, errorDetails: undefined } : image,
                    ),
                },
            };
        }
        return {
            ...node,
            metadata: {
                ...node.metadata,
                status: "error" as const,
                errorDetails: i18n.t("canvas.generation.interrupted"),
                images: node.metadata.images?.map((image) =>
                    image.status === "loading"
                        ? { ...image, status: "error" as const, errorDetails: i18n.t("canvas.generation.interrupted") }
                        : image,
                ),
            },
        };
    });
}

export function isGenerationCanceled(error: unknown) {
    if (axios.isCancel(error)) return true;
    if (!(error instanceof Error)) return false;
    const message = error.message.trim().toLowerCase();
    return (
        error.name === "AbortError" ||
        error.name === "CanceledError" ||
        error.message === i18n.t("common.requestCanceled") ||
        error.message === i18n.t("apiErrors.requestCanceled") ||
        message === "canceled" ||
        message === "cancelled" ||
        message === "aborted"
    );
}

export function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

export function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

export function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

export function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? i18n.t("canvas.generation.front") : params.horizontalAngle > 0 ? i18n.t("canvas.generation.rotateRight", { angle: params.horizontalAngle }) : i18n.t("canvas.generation.rotateLeft", { angle: Math.abs(params.horizontalAngle) });
    const pitch = params.pitchAngle === 0 ? i18n.t("canvas.generation.level") : params.pitchAngle > 0 ? i18n.t("canvas.generation.topDown", { angle: params.pitchAngle }) : i18n.t("canvas.generation.lowAngle", { angle: Math.abs(params.pitchAngle) });
    return i18n.t("canvas.generation.angleLabel", { horizontal, pitch, distance: params.cameraDistance.toFixed(1), lens: i18n.t(params.wideAngle ? "canvas.editors.wide" : "canvas.editors.standard") });
}

export function buildAnglePrompt(params: CanvasImageAngleParams) {
    return i18n.t("canvas.generation.anglePrompt", { angle: buildAngleLabel(params) });
}
