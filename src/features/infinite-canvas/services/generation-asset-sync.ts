import { upsertGenerationAsset } from "@canvas/services/api/generation-assets";
import { useGenerationLogsBadgeStore } from "@canvas/stores/use-generation-logs-badge-store";
import { isUnstableMediaUrl } from "@canvas/lib/signed-url";

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
  attemptId?: string;
};

/** Compact request-param snapshot for generation_assets.config. */
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
  putString(config, "size", input.size);
  putString(config, "quality", input.quality);
  putString(config, "background", input.background);
  putString(config, "mode", input.mode);
  putString(config, "resolution", input.resolution);
  putString(config, "ratio", input.ratio);
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

/** Best-effort persist a canvas image generation for later download. */
export function syncCanvasImageGenerationAsset(input: CanvasImageAssetInput) {
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
  }).then((row) => {
    if (row) void useGenerationLogsBadgeStore.getState().refresh();
  });
}

/** Best-effort persist a canvas video generation for later download. */
export async function syncCanvasVideoGenerationAsset(input: CanvasVideoAssetInput) {
  if (isExcludedAssetUrl(input.url, input.excludeUrls)) return;
  // Never persist short-lived upstream hotlinks into generation_assets.
  if (input.url && isUnstableMediaUrl(input.url)) return;
  // Local config gaps and poll give-ups must not mark the generation record
  // failed while the task log is still running.
  if (shouldKeepVideoAssetPending(input.status, input.error)) return;
  const row = await upsertGenerationAsset({
    client_id: input.clientId,
    kind: "video",
    source: "canvas",
    title: input.model || "video",
    prompt: input.prompt || "",
    model: input.model || "",
    status: input.status || "success",
    task_id: input.taskId,
    error: input.error,
    attempt_id: input.attemptId,
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
  if (row) void useGenerationLogsBadgeStore.getState().refresh();
}

/** True when a failed sync is only the browser giving up, not an upstream result. */
export function shouldKeepVideoAssetPending(status?: string, error?: string) {
  return status === "failed" && (isClientConfigIncompleteError(error) || isClientPollGiveUp(error) || isClientRemirrorError(error));
}

/** Remirror / OSS upload failures must not mark generation_assets failed. */
function isClientRemirrorError(message?: string) {
  const msg = message?.trim() || "";
  if (!msg) return false;
  const lower = msg.toLowerCase();
  const needles = [
    "object storage is required",
    "画布媒体必须上传到对象存储",
    "failed to download upstream video",
    "upstream video download was empty",
    "failed to presign upload",
    "proxy upload failed",
    "direct upload failed",
    "failed to mirror remote media",
    "failed to fetch",
    "networkerror",
    "network request failed",
    "load failed",
    "cors",
  ];
  return needles.some((needle) => msg.includes(needle) || lower.includes(needle));
}

function isClientPollGiveUp(message?: string) {
  const msg = message?.trim() || "";
  if (!msg) return false;
  const lower = msg.toLowerCase();
  const needles = [
    "视频生成超时",
    "video generation timed out",
    "视频任务查询失败",
    "failed to query video task",
    "请求已取消",
    "request canceled",
    "画布媒体必须上传到对象存储",
    "object storage is required",
  ];
  return needles.some((needle) => msg.includes(needle) || lower.includes(needle));
}

function isClientConfigIncompleteError(message?: string) {
  const msg = message?.trim() || "";
  if (!msg) return false;
  return (
    msg.includes("请先配置 API Key") ||
    msg.includes("Configure the API key first") ||
    msg.includes("请先配置 Base URL") ||
    msg.includes("Configure the Base URL first") ||
    msg.includes("请先填写接口地址和 API Key") ||
    msg.includes("Enter an API endpoint and API key first")
  );
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
