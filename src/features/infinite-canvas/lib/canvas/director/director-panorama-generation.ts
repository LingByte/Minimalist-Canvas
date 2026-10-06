import { nanoid } from "nanoid";

import { resolveCanvasGenerationModel } from "@canvas/lib/canvas/director/compat/canvas-project-generation";
import { beginGenerationConsumer } from "@canvas/lib/canvas/director/compat/generation-consumer-lifecycle";
import { modelCapabilityConfigFor } from "@canvas/lib/canvas/director/compat/model-capabilities";
import { persistDirectorLibraryAsset } from "@canvas/lib/canvas/director/director-library-persist";
import { assertUserScope, captureUserScope, isUserScopeAbandonedError } from "@canvas/lib/canvas/director/compat/user-scope-guard";
import { requestEdit } from "@canvas/services/api/image";
import { uploadImage } from "@canvas/services/image-storage";
import { useAssetStore, type ImageAsset } from "@canvas/stores/use-asset-store";
import type { AiConfig } from "@canvas/stores/use-config-store";
import type { ReferenceImage } from "@canvas/types/image";

export const DIRECTOR_PANORAMA_PROMPT = "以参考图中的主体、材质和光影为基础，将环境扩展成完整的 360 度等距柱状全景图。输出 2:1 比例的连续单幅画面，左右边缘自然无缝衔接，保持真实空间尺度；不要拼贴、边框、文字、水印或拍摄设备。";

export type DirectorPanoramaTask = {
    id?: string;
    progress?: number;
    status?: string;
};

export type DirectorPanoramaGenerationInput = {
    file: File;
    config: AiConfig;
    sceneId: string;
    projectId?: string;
    signal?: AbortSignal;
    onTaskUpdate?: (task: DirectorPanoramaTask) => void;
};

export function selectDirectorPanoramaModel(config: AiConfig): string {
    return resolveCanvasGenerationModel(config, config.imageModel, "image") || resolveCanvasGenerationModel(config, config.model, "image");
}

function directorPanoramaSize(config: AiConfig, model: string): string {
    const image = modelCapabilityConfigFor(config, model).image;
    if (image?.size.allowCustom || image?.size.values.includes("2:1")) return "2:1";
    return image?.size.default && image.size.default !== "*" ? image.size.default : config.size;
}

function panoramaSessionGuard(signal?: AbortSignal) {
    const expected = captureUserScope();
    return () => {
        if (signal?.aborted) throw new DOMException("生成会话已结束", "AbortError");
        assertUserScope(expected);
        return expected;
    };
}

export async function generateDirectorPanorama(input: DirectorPanoramaGenerationInput): Promise<{ id: string; name: string; url: string; storageKey: string; width: number; height: number }> {
    const consumer = beginGenerationConsumer(input.signal);
    try {
        const { file, config, sceneId, onTaskUpdate } = input;
        const signal = consumer.signal;
        const assertCurrent = panoramaSessionGuard(signal);
        const expectedScope = assertCurrent();
        if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
        const model = selectDirectorPanoramaModel(config);
        if (!model) throw new Error("请先在模型设置中选择可用的图片模型");
        if (modelCapabilityConfigFor(config, model).image?.references.maxImages === 0) throw new Error("当前图片模型不支持参考图，请选择支持图生图的模型");

        onTaskUpdate?.({ status: "uploading", progress: 8 });
        const source = await uploadImage(file);
        assertCurrent();
        const reference: ReferenceImage = {
            id: nanoid(),
            name: file.name,
            type: source.mimeType,
            dataUrl: source.url,
            url: source.url,
            storageKey: source.storageKey,
            width: source.width,
            height: source.height,
            bytes: source.bytes,
        };
        const imageConfig: AiConfig = { ...config, model, imageModel: model, count: "1", size: directorPanoramaSize(config, model) };
        onTaskUpdate?.({ status: "running", progress: 25 });
        const images = await requestEdit(imageConfig, DIRECTOR_PANORAMA_PROMPT, [reference], undefined, { signal, generationSource: "canvas" });
        assertCurrent();
        const first = images[0];
        if (!first?.dataUrl) throw new Error("图片任务完成，但没有返回全景图");
        onTaskUpdate?.({ status: "saving", progress: 78 });
        const uploaded = await uploadImage(first.dataUrl);
        assertCurrent();
        const title = `AI 全景图 · ${file.name}`;
        const persist = await persistDirectorLibraryAsset({
            asset: {
                kind: "image",
                title,
                coverUrl: uploaded.url,
                tags: ["全景图", "AI生成"],
                source: "导演台",
                data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType },
                metadata: { source: "director-panorama-ai", sceneId },
            },
            expectedScope,
            signal,
            pendingRemoteUpload: uploaded.pendingRemoteUpload,
        });
        onTaskUpdate?.({ status: "succeeded", progress: 100 });
        const asset = useAssetStore.getState().assets.find((item): item is ImageAsset => item.id === persist.assetId && item.kind === "image");
        return {
            id: persist.assetId,
            name: asset?.title || title,
            url: uploaded.url,
            storageKey: uploaded.storageKey,
            width: uploaded.width,
            height: uploaded.height,
        };
    } finally {
        consumer.dispose();
    }
}

export async function recoverDirectorPanoramaTasks(_projectId?: string, sceneId?: string, _signal?: AbortSignal): Promise<number> {
    if (!sceneId) return 0;
    try {
        return useAssetStore.getState().assets.filter((asset) => asset.kind === "image" && asset.metadata?.source === "director-panorama-ai" && asset.metadata?.sceneId === sceneId).length;
    } catch (error) {
        if (isUserScopeAbandonedError(error)) throw error;
        return 0;
    }
}
