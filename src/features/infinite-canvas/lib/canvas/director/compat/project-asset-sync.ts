import type { CapturedUserScope } from "@canvas/lib/canvas/director/compat/user-scope-guard";
import type { CanvasNodeData } from "@canvas/types/canvas";

export async function ensureCanvasNodeAsset(_input: {
    canvasId: string;
    domainProjectId?: string;
    node: CanvasNodeData;
    source?: string;
    expectedScope?: CapturedUserScope;
}) {
    return { assetId: _input.node.metadata?.assetId || _input.node.id, confirmed: true };
}

export async function materializeGenerationTaskAssets(_task: unknown, _signal?: AbortSignal): Promise<{ outputs?: { mediaType: string; materializedAssetId: string }[] }> {
    throw new Error("当前画布暂不支持导演台 AI 全景图任务");
}
