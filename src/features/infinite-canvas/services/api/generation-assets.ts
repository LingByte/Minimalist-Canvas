import {
  deleteLocalGenerationLogs,
  listLocalGenerationLogs,
  listLocalImageGenerationLogs,
  listLocalVideoGenerationLogs,
  upsertLocalImageGenerationLog,
  upsertLocalVideoGenerationLog,
  type LocalGenerationLogEntry,
  type LocalImageGenerationLog,
  type LocalVideoGenerationLog,
} from "@canvas/services/local-generation-logs";

export type GenerationAssetKind = "image" | "video";
export type GenerationAssetSource = "workbench" | "canvas" | "api";
export type GenerationAssetStatus = "pending" | "success" | "failed";

export type GenerationAssetFile = {
  url?: string;
  backup_url?: string;
  upstream_url?: string;
  storage_key?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  bytes?: number;
  duration_ms?: number;
  mirror_stage?: string;
  mirror_error?: string;
};

export type GenerationAsset = {
  id: number;
  user_id: number;
  client_id?: string;
  kind: GenerationAssetKind;
  source: GenerationAssetSource;
  title: string;
  prompt: string;
  model: string;
  status: GenerationAssetStatus;
  task_id?: string;
  error?: string;
  config: Record<string, unknown>;
  assets: GenerationAssetFile[];
  created_at: number;
  updated_at: number;
};

export type UpsertGenerationAssetInput = {
  client_id?: string;
  kind: GenerationAssetKind;
  source?: GenerationAssetSource;
  title?: string;
  prompt?: string;
  model?: string;
  status?: GenerationAssetStatus;
  task_id?: string;
  error?: string;
  config?: Record<string, unknown>;
  assets?: GenerationAssetFile[];
  /** One id per canvas/workbench click. Sent as a header, not stored in the body. */
  attempt_id?: string;
};

export type RunCanvasImageJobInput = {
  client_id: string;
  prompt: string;
  model: string;
  title?: string;
  base_url: string;
  api_key: string;
  mode?: "generation" | "edit";
  size?: string;
  quality?: string;
  background?: string;
  references?: string[];
  attempt_id?: string;
};

export type GenerationAssetPage = {
  items: GenerationAsset[];
  next_cursor: string;
  has_more: boolean;
};

type LocalChangeListener = () => void;

const localChangeListeners = new Set<LocalChangeListener>();

/** Subscribe to local generation-log writes/deletes (badge / side panel refresh). */
export function subscribeGenerationAssetChanges(listener: LocalChangeListener) {
  localChangeListeners.add(listener);
  return () => {
    localChangeListeners.delete(listener);
  };
}

function notifyLocalGenerationAssetChanges() {
  for (const listener of localChangeListeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

/** Call after bulk-clearing local generation logs outside upsert/delete helpers. */
export function notifyGenerationLogsCleared() {
  notifyLocalGenerationAssetChanges();
}

function isDurableUrl(url?: string) {
  return Boolean(url && (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")));
}

function isClientTransportError(message?: string) {
  const value = message?.trim() || "";
  return (
    value.includes("网络请求失败，请检查网络后刷新一下试试") ||
    value.includes("Network request failed. Check your connection and provider URL") ||
    value.includes("network request failed") ||
    value.includes("Failed to fetch") ||
    value.includes("Network Error")
  );
}

/** Stable positive int id from client_id (not for security — UI key only). */
function numericIdFromClientId(clientId: string) {
  let hash = 0;
  for (let i = 0; i < clientId.length; i += 1) {
    hash = (hash * 31 + clientId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function sourceFromOrigin(origin?: string): GenerationAssetSource {
  if (origin === "canvas") return "canvas";
  if (origin === "workbench") return "workbench";
  return "workbench";
}

function localEntryToAsset(entry: LocalGenerationLogEntry): GenerationAsset {
  const createdAt = entry.createdAt || Date.now();
  if (entry.kind === "image") {
    return {
      id: numericIdFromClientId(entry.id),
      user_id: 0,
      client_id: entry.id,
      kind: "image",
      source: sourceFromOrigin(entry.origin),
      title: entry.title || "",
      prompt: entry.prompt || "",
      model: entry.model || "",
      status: entry.status === "pending" ? "pending" : entry.status === "failed" ? "failed" : "success",
      error: entry.error,
      config: {
        ...entry.config,
        size: entry.size,
        quality: entry.quality,
        duration_ms: entry.durationMs,
        success_count: entry.successCount,
        fail_count: entry.failCount,
      },
      assets: (entry.images || []).map((image) => ({
        url: image.dataUrl || undefined,
        storage_key: image.storageKey,
        mime_type: image.mimeType,
        width: image.width || undefined,
        height: image.height || undefined,
        bytes: image.bytes || undefined,
        duration_ms: image.durationMs || undefined,
      })),
      created_at: createdAt,
      updated_at: createdAt,
    };
  }

  return {
    id: numericIdFromClientId(entry.id),
    user_id: 0,
    client_id: entry.id,
    kind: "video",
    source: sourceFromOrigin(entry.origin),
    title: entry.title || "",
    prompt: entry.prompt || "",
    model: entry.model || "",
    status: entry.status === "pending" ? "pending" : entry.status === "failed" ? "failed" : "success",
    task_id: entry.task?.id,
    error: entry.error,
    config: {
      ...entry.config,
      size: entry.size,
      resolution: entry.resolution,
      seconds: entry.seconds,
      duration_ms: entry.durationMs,
      task_provider: entry.task?.provider,
    },
    assets: entry.video
      ? [
          {
            url: entry.video.url || undefined,
            storage_key: entry.video.storageKey || undefined,
            mime_type: entry.video.mimeType,
            width: entry.video.width || undefined,
            height: entry.video.height || undefined,
            bytes: entry.video.bytes || undefined,
            duration_ms: entry.video.durationMs || undefined,
          },
        ]
      : [],
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function paginateAssets(items: GenerationAsset[], cursor?: string, limit = 10): GenerationAssetPage {
  const pageSize = Math.max(1, Math.min(100, limit));
  const offset = cursor ? Math.max(0, Number(cursor) || 0) : 0;
  const slice = items.slice(offset, offset + pageSize);
  const nextOffset = offset + slice.length;
  return {
    items: slice,
    next_cursor: nextOffset < items.length ? String(nextOffset) : "",
    has_more: nextOffset < items.length,
  };
}

/** Persist a workbench/canvas generation result locally (best-effort). */
export async function upsertGenerationAsset(input: UpsertGenerationAssetInput): Promise<GenerationAsset | null> {
  if (input.status === "failed" && isClientTransportError(input.error)) {
    return null;
  }

  const clientId = input.client_id?.trim();
  if (!clientId) return null;

  const assets = (input.assets || [])
    .map((item) => ({
      url: isDurableUrl(item.url) ? item.url : undefined,
      storage_key: item.storage_key || undefined,
      mime_type: item.mime_type || undefined,
      width: item.width || undefined,
      height: item.height || undefined,
      bytes: item.bytes || undefined,
      duration_ms: item.duration_ms || undefined,
    }))
    .filter((item) => item.url || item.storage_key);

  if (input.status === "success" && assets.length === 0 && !input.task_id) {
    return null;
  }

  const now = Date.now();
  const title = input.title?.trim() || input.model?.trim() || input.prompt?.trim().slice(0, 12) || "";
  const prompt = input.prompt || "";
  const model = input.model || "";
  const status = input.status || "success";
  const origin = input.source === "canvas" ? ("canvas" as const) : ("workbench" as const);
  const config = input.config || {};

  if (input.kind === "image") {
    const images = assets.map((item, index) => ({
      id: `${clientId}-${index}`,
      dataUrl: item.url || "",
      storageKey: item.storage_key,
      durationMs: item.duration_ms || 0,
      width: item.width || 0,
      height: item.height || 0,
      bytes: item.bytes || 0,
      mimeType: item.mime_type,
    }));
    const size = String(config.size || "");
    const quality = String(config.quality || "");
    const log: LocalImageGenerationLog = {
      id: clientId,
      createdAt: now,
      title,
      prompt,
      time: new Date(now).toLocaleString(undefined, { hour12: false }),
      model,
      config: {
        model,
        imageModel: model,
        quality,
        size,
        count: String(config.count || images.length || 1),
      },
      references: [],
      durationMs: Number(config.duration_ms || 0),
      successCount: status === "success" ? images.length : Number(config.success_count || 0),
      failCount: status === "failed" ? Math.max(1, Number(config.fail_count || 1)) : Number(config.fail_count || 0),
      imageCount: images.length || Number(config.count || 0),
      size,
      quality,
      status: status === "pending" ? "pending" : status === "failed" ? "failed" : "success",
      images,
      thumbnails: images.map((item) => item.dataUrl).filter(Boolean),
      error: status === "failed" ? input.error || undefined : undefined,
      origin,
    };
    await upsertLocalImageGenerationLog(log);
    notifyLocalGenerationAssetChanges();
    return localEntryToAsset({ kind: "image", ...log });
  }

  const file = assets[0];
  const size = String(config.size || "");
  const resolution = String(config.resolution || config.vquality || "");
  const seconds = String(config.seconds || config.videoSeconds || "");
  const log: LocalVideoGenerationLog = {
    id: clientId,
    createdAt: now,
    title,
    prompt,
    time: new Date(now).toLocaleString(undefined, { hour12: false }),
    model,
    config: {
      model,
      videoModel: model,
      size,
      vquality: resolution,
      videoSeconds: seconds,
      videoGenerateAudio: (config.generate_audio ?? config.videoGenerateAudio) as string | boolean | undefined,
      videoWatermark: (config.watermark ?? config.videoWatermark) as string | boolean | undefined,
    },
    references: [],
    durationMs: Number(config.duration_ms || file?.duration_ms || 0),
    size,
    resolution,
    seconds,
    status: status === "pending" ? "pending" : status === "failed" ? "failed" : "success",
    task: input.task_id
      ? {
          id: input.task_id,
          provider: String(config.task_provider || config.taskProvider || ""),
          model,
        }
      : undefined,
    video: file
      ? {
          id: `${clientId}-video`,
          url: file.url || "",
          storageKey: file.storage_key || "",
          durationMs: file.duration_ms || 0,
          width: file.width || 0,
          height: file.height || 0,
          bytes: file.bytes || 0,
          mimeType: file.mime_type || "video/mp4",
        }
      : undefined,
    error: input.error,
    origin,
  };
  await upsertLocalVideoGenerationLog(log);
  notifyLocalGenerationAssetChanges();
  return localEntryToAsset({ kind: "video", ...log });
}

/** Server-side recoverable image jobs are disabled in local-first mode. */
export async function runCanvasImageJob(_input: RunCanvasImageJobInput): Promise<GenerationAsset | null> {
  return null;
}

export async function listGenerationAssets(params?: {
  kind?: GenerationAssetKind;
  source?: GenerationAssetSource;
  status?: GenerationAssetStatus;
  keyword?: string;
  cursor?: string;
  limit?: number;
}): Promise<GenerationAssetPage> {
  const entries = await listLocalGenerationLogs(params?.kind || "all");
  const keyword = params?.keyword?.trim().toLowerCase() || "";
  const filtered = entries
    .map(localEntryToAsset)
    .filter((item) => !params?.source || item.source === params.source)
    .filter((item) => !params?.status || item.status === params.status)
    .filter((item) => {
      if (!keyword) return true;
      return [item.title, item.prompt, item.model, item.client_id].filter(Boolean).join(" ").toLowerCase().includes(keyword);
    });
  return paginateAssets(filtered, params?.cursor, params?.limit || 10);
}

export async function getGenerationAssetByClientId(clientId: string): Promise<GenerationAsset | null> {
  const id = clientId.trim();
  if (!id) return null;
  const [images, videos] = await Promise.all([listLocalImageGenerationLogs(), listLocalVideoGenerationLogs()]);
  const image = images.find((item) => item.id === id);
  if (image) return localEntryToAsset({ kind: "image", ...image });
  const video = videos.find((item) => item.id === id);
  if (video) return localEntryToAsset({ kind: "video", ...video });
  return null;
}

export async function deleteGenerationAssetsByClientIds(clientIds: string[]): Promise<number> {
  const ids = Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return 0;
  await deleteLocalGenerationLogs(ids);
  notifyLocalGenerationAssetChanges();
  return ids.length;
}

export async function deleteGenerationAsset(id: number): Promise<boolean> {
  const page = await listGenerationAssets({ limit: 500 });
  const match = page.items.find((item) => item.id === id);
  if (!match?.client_id) return false;
  await deleteLocalGenerationLogs([match.client_id]);
  notifyLocalGenerationAssetChanges();
  return true;
}
