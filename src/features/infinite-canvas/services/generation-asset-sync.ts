import { upsertGenerationAsset } from "@canvas/services/api/generation-assets";

export type GenerationAssetConfigSnapshot = Record<string, unknown>;

type CanvasImageAssetInput = {
  clientId: string;
  prompt?: string;
  model?: string;
  url?: string;
  storageKey?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bytes?: number;
  config?: GenerationAssetConfigSnapshot;
};

type CanvasVideoAssetInput = {
  clientId: string;
  prompt?: string;
  model?: string;
  taskId?: string;
  url?: string;
  storageKey?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bytes?: number;
  durationMs?: number;
  status?: "pending" | "success" | "failed";
  error?: string;
  excludeUrls?: string[];
  config?: GenerationAssetConfigSnapshot;
  attemptId?: string;
};

/** Compact request-param snapshot for local generation logs. */
export function buildCanvasImageAssetConfig(input: {
  size?: string;
  quality?: string;
  background?: string;
  mode?: string;
  count?: string | number;
  images?: string[];
  resolution?: string;
  ratio?: string;
}): GenerationAssetConfigSnapshot {
  const config: GenerationAssetConfigSnapshot = {};
  if (input.size?.trim()) config.size = input.size.trim();
  if (input.quality?.trim()) config.quality = input.quality.trim();
  if (input.background?.trim()) config.background = input.background.trim();
  if (input.mode?.trim()) config.mode = input.mode.trim();
  if (input.resolution?.trim()) config.resolution = input.resolution.trim();
  if (input.ratio?.trim()) config.ratio = input.ratio.trim();
  if (input.count != null && String(input.count).trim() !== "") config.count = String(input.count);
  if (input.images?.length) config.images = input.images;
  return config;
}

export function buildCanvasVideoAssetConfig(input: {
  size?: string;
  seconds?: string;
  resolution?: string;
  quality?: string;
  generateAudio?: boolean;
  watermark?: boolean;
  images?: string[];
  videos?: string[];
  audios?: string[];
  taskProvider?: string;
}): GenerationAssetConfigSnapshot {
  const config: GenerationAssetConfigSnapshot = {};
  if (input.size?.trim()) config.size = input.size.trim();
  if (input.seconds?.trim()) config.seconds = input.seconds.trim();
  if (input.resolution?.trim()) config.resolution = input.resolution.trim();
  if (input.quality?.trim()) config.quality = input.quality.trim();
  if (input.taskProvider?.trim()) config.task_provider = input.taskProvider.trim();
  if (typeof input.generateAudio === "boolean") config.generate_audio = input.generateAudio;
  if (typeof input.watermark === "boolean") config.watermark = input.watermark;
  if (input.images?.length) config.images = input.images;
  if (input.videos?.length) config.videos = input.videos;
  if (input.audios?.length) config.audios = input.audios;
  return config;
}

/** Persist canvas image generation into local generation history. */
export async function syncCanvasImageGenerationAsset(input: CanvasImageAssetInput): Promise<void> {
  const clientId = input.clientId.trim();
  if (!clientId) return;
  const url = input.url?.trim();
  const status = url || input.storageKey ? "success" : "failed";
  await upsertGenerationAsset({
    client_id: clientId,
    kind: "image",
    source: "canvas",
    title: (input.prompt || "").trim().slice(0, 12) || input.model || "",
    prompt: input.prompt || "",
    model: input.model || "",
    status,
    config: input.config || {},
    assets:
      url || input.storageKey
        ? [
            {
              url,
              storage_key: input.storageKey,
              mime_type: input.mimeType,
              width: input.width,
              height: input.height,
              bytes: input.bytes,
            },
          ]
        : [],
  });
}

/** Persist canvas video generation into local generation history. */
export async function syncCanvasVideoGenerationAsset(input: CanvasVideoAssetInput): Promise<void> {
  const clientId = input.clientId.trim();
  if (!clientId) return;
  if (shouldKeepVideoAssetPending(input.status, input.error)) return;

  const url = input.url?.trim();
  const exclude = (input.excludeUrls || []).map((item) => item.trim()).filter(Boolean);
  if (url && exclude.some((item) => item === url)) return;

  await upsertGenerationAsset({
    client_id: clientId,
    kind: "video",
    source: "canvas",
    title: (input.prompt || "").trim().slice(0, 12) || input.model || "",
    prompt: input.prompt || "",
    model: input.model || "",
    status: input.status || (url || input.storageKey ? "success" : "pending"),
    task_id: input.taskId,
    error: input.error,
    attempt_id: input.attemptId,
    config: input.config || {},
    assets:
      url || input.storageKey
        ? [
            {
              url,
              storage_key: input.storageKey,
              mime_type: input.mimeType,
              width: input.width,
              height: input.height,
              bytes: input.bytes,
              duration_ms: input.durationMs,
            },
          ]
        : [],
  });
}

/** When true, callers skip persisting a failed video to generation logs. */
export function shouldKeepVideoAssetPending(status?: string, error?: string) {
  if (status !== "failed") return false;
  const msg = error?.trim() || "";
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    msg.includes("请先配置") ||
    lower.includes("configure the api") ||
    lower.includes("timed out") ||
    lower.includes("cloud storage is required") ||
    lower.includes("network")
  );
}

export function isTaskNotExistError(_message?: string) {
  return false;
}
