import { upsertGenerationAsset } from "@canvas/services/api/generation-assets";
import { syncCanvasImageToLocalLogs, syncCanvasVideoToLocalLogs } from "@canvas/services/local-generation-logs";

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
  /** Reference media URLs that must not be persisted as the generation result. */
  excludeUrls?: string[];
  config?: GenerationAssetConfigSnapshot;
};

/** Compact request-param snapshot for generation_assets.config. */
export function buildCanvasImageAssetConfig(input: {
  size?: string;
  quality?: string;
  background?: string;
  mode?: string;
  count?: string | number;
  images?: string[];
}): GenerationAssetConfigSnapshot {
  const config: GenerationAssetConfigSnapshot = {};
  putString(config, "size", input.size);
  putString(config, "quality", input.quality);
  putString(config, "background", input.background);
  putString(config, "mode", input.mode);
  if (input.count != null && String(input.count).trim() !== "") {
    config.count = String(input.count);
  }
  const images = durableHttpUrls(input.images);
  if (images?.length) config.images = images;
  return config;
}

/** Compact request-param snapshot for canvas/workbench video assets. */
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
  putString(config, "size", input.size);
  putString(config, "seconds", input.seconds);
  putString(config, "resolution", input.resolution);
  putString(config, "quality", input.quality);
  putString(config, "task_provider", input.taskProvider);
  if (typeof input.generateAudio === "boolean") config.generate_audio = input.generateAudio;
  if (typeof input.watermark === "boolean") config.watermark = input.watermark;
  const images = durableHttpUrls(input.images);
  const videos = durableHttpUrls(input.videos);
  const audios = durableHttpUrls(input.audios);
  if (images?.length) config.images = images;
  if (videos?.length) config.videos = videos;
  if (audios?.length) config.audios = audios;
  return config;
}

/**
 * Persist canvas image generation to the shared local workbench log store
 * (image_generation_logs), and best-effort sync to the cloud API.
 */
export function syncCanvasImageGenerationAsset(input: CanvasImageAssetInput) {
  void syncCanvasImageToLocalLogs({
    clientId: input.clientId,
    prompt: input.prompt,
    model: input.model,
    url: input.url,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    status: "success",
    config: input.config,
  }).catch(() => undefined);
  void upsertGenerationAsset({
    client_id: input.clientId,
    kind: "image",
    source: "canvas",
    title: input.model || "image",
    prompt: input.prompt || "",
    model: input.model || "",
    status: "success",
    config: input.config && Object.keys(input.config).length ? input.config : undefined,
    assets: [
      {
        url: input.url,
        storage_key: input.storageKey,
        mime_type: input.mimeType,
        width: input.width,
        height: input.height,
        bytes: input.bytes,
      },
    ],
  });
}

/**
 * Persist canvas video generation to the shared local workbench log store
 * (video_generation_logs), and best-effort sync to the cloud API.
 */
export async function syncCanvasVideoGenerationAsset(input: CanvasVideoAssetInput) {
  if (isExcludedAssetUrl(input.url, input.excludeUrls)) return;
  await syncCanvasVideoToLocalLogs({
    clientId: input.clientId,
    prompt: input.prompt,
    model: input.model,
    taskId: input.taskId,
    url: input.url,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    durationMs: input.durationMs,
    status: input.status || "success",
    error: input.error,
    config: input.config,
  }).catch(() => undefined);
  await upsertGenerationAsset({
    client_id: input.clientId,
    kind: "video",
    source: "canvas",
    title: input.model || "video",
    prompt: input.prompt || "",
    model: input.model || "",
    status: input.status || "success",
    task_id: input.taskId,
    error: input.error,
    config: input.config && Object.keys(input.config).length ? input.config : undefined,
    assets: input.url || input.storageKey
      ? [
          {
            url: input.url,
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

function putString(config: GenerationAssetConfigSnapshot, key: string, value?: string) {
  const trimmed = value?.trim();
  if (trimmed) config[key] = trimmed;
}

function durableHttpUrls(urls?: string[]) {
  if (!urls?.length) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const value = compactMediaRef(raw);
    if (!value) continue;
    const key = normalizeAssetUrlKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.length ? out : undefined;
}

const MAX_EMBEDDED_MEDIA_PREVIEW_CHARS = 48;

/** Keep http(s); truncate data:/blob: to a short prefix for config storage. */
function compactMediaRef(raw?: string) {
  const value = raw?.trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return value;
  if (!lower.startsWith("data:") && !lower.startsWith("blob:")) return "";
  if (value.length <= MAX_EMBEDDED_MEDIA_PREVIEW_CHARS) return value;
  return `${value.slice(0, MAX_EMBEDDED_MEDIA_PREVIEW_CHARS - 1)}…`;
}

function normalizeAssetUrlKey(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function isExcludedAssetUrl(url: string | undefined, excludeUrls?: string[]) {
  if (!url || !excludeUrls?.length) return false;
  const key = normalizeAssetUrlKey(url);
  return excludeUrls.some((candidate) => candidate && normalizeAssetUrlKey(candidate) === key);
}
