import i18n from "@canvas/i18n";
import { kvStore } from "@canvas/services/fs-store";
import type { ReferenceImage } from "@canvas/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@canvas/types/media";

/** Same store names the image/video workbenches already use. */
export const IMAGE_GENERATION_LOG_STORE = "image_generation_logs";
export const VIDEO_GENERATION_LOG_STORE = "video_generation_logs";

const imageLogStore = kvStore(IMAGE_GENERATION_LOG_STORE);
const videoLogStore = kvStore(VIDEO_GENERATION_LOG_STORE);

export type LocalGeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

export type LocalGeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

export type LocalImageGenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: {
        model?: string;
        imageModel?: string;
        quality?: string;
        size?: string;
        count?: string;
    };
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "success" | "failed";
    images: LocalGeneratedImage[];
    thumbnails: string[];
    /** workbench | canvas — optional, older rows omit it */
    origin?: "workbench" | "canvas";
};

export type LocalVideoGenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: {
        model?: string;
        videoModel?: string;
        size?: string;
        vquality?: string;
        videoSeconds?: string;
        videoGenerateAudio?: string | boolean;
        videoWatermark?: string | boolean;
    };
    references: ReferenceImage[];
    videoReferences?: ReferenceVideo[];
    audioReferences?: ReferenceAudio[];
    durationMs: number;
    size: string;
    resolution: string;
    seconds: string;
    status: "pending" | "success" | "failed";
    task?: { id: string; provider?: string; model?: string };
    video?: LocalGeneratedVideo;
    error?: string;
    origin?: "workbench" | "canvas";
};

export type LocalGenerationLogEntry =
    | ({ kind: "image" } & LocalImageGenerationLog)
    | ({ kind: "video" } & LocalVideoGenerationLog);

function formatTime(ms: number) {
    return new Date(ms).toLocaleString(i18n.resolvedLanguage, { hour12: false });
}

function serializeImageLog(log: LocalImageGenerationLog): LocalImageGenerationLog {
    return {
        ...log,
        references: (log.references || []).map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: (log.images || []).map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
        thumbnails: [],
    };
}

function serializeVideoLog(log: LocalVideoGenerationLog): LocalVideoGenerationLog {
    return {
        ...log,
        references: (log.references || []).map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        videoReferences: (log.videoReferences || []).map((item) => ({ ...item, url: item.storageKey ? "" : item.url })),
        audioReferences: (log.audioReferences || []).map((item) => ({ ...item, url: item.storageKey ? "" : item.url })),
        video: log.video?.storageKey ? { ...log.video, url: "" } : log.video,
    };
}

export async function upsertLocalImageGenerationLog(log: LocalImageGenerationLog): Promise<void> {
    const prev = await imageLogStore.getItem<LocalImageGenerationLog>(log.id);
    const next: LocalImageGenerationLog = {
        ...prev,
        ...log,
        createdAt: prev?.createdAt || log.createdAt || Date.now(),
        time: prev?.time || log.time || formatTime(log.createdAt || Date.now()),
        origin: log.origin || prev?.origin,
    };
    await imageLogStore.setItem(log.id, serializeImageLog(next));
}

export async function upsertLocalVideoGenerationLog(log: LocalVideoGenerationLog): Promise<void> {
    const prev = await videoLogStore.getItem<LocalVideoGenerationLog>(log.id);
    const next: LocalVideoGenerationLog = {
        ...prev,
        ...log,
        createdAt: prev?.createdAt || log.createdAt || Date.now(),
        time: prev?.time || log.time || formatTime(log.createdAt || Date.now()),
        origin: log.origin || prev?.origin,
    };
    await videoLogStore.setItem(log.id, serializeVideoLog(next));
}

export async function listLocalImageGenerationLogs(): Promise<LocalImageGenerationLog[]> {
    const values: LocalImageGenerationLog[] = [];
    await imageLogStore.iterate<LocalImageGenerationLog, void>((value) => {
        if (value?.id) values.push(value);
    });
    return values.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function listLocalVideoGenerationLogs(): Promise<LocalVideoGenerationLog[]> {
    const values: LocalVideoGenerationLog[] = [];
    await videoLogStore.iterate<LocalVideoGenerationLog, void>((value) => {
        if (value?.id) values.push(value);
    });
    return values.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function listLocalGenerationLogs(kind: "all" | "image" | "video" = "all"): Promise<LocalGenerationLogEntry[]> {
    const [images, videos] = await Promise.all([
        kind === "video" ? Promise.resolve([] as LocalImageGenerationLog[]) : listLocalImageGenerationLogs(),
        kind === "image" ? Promise.resolve([] as LocalVideoGenerationLog[]) : listLocalVideoGenerationLogs(),
    ]);
    const entries: LocalGenerationLogEntry[] = [
        ...images.map((item) => ({ kind: "image" as const, ...item })),
        ...videos.map((item) => ({ kind: "video" as const, ...item })),
    ];
    return entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function deleteLocalGenerationLogs(ids: string[]): Promise<void> {
    const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    await Promise.all(
        unique.flatMap((id) => [imageLogStore.removeItem(id), videoLogStore.removeItem(id)]),
    );
}

/** Persist a canvas image result into the same local store the image workbench reads. */
export async function syncCanvasImageToLocalLogs(input: {
    clientId: string;
    prompt?: string;
    model?: string;
    url?: string;
    storageKey?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    bytes?: number;
    status?: "success" | "failed";
    error?: string;
    config?: Record<string, unknown>;
}): Promise<void> {
    const id = input.clientId.trim();
    if (!id) return;
    const now = Date.now();
    const prompt = (input.prompt || "").trim();
    const model = (input.model || "").trim();
    const url = (input.url || "").trim();
    const status = input.status || (url || input.storageKey ? "success" : "failed");
    const images: LocalGeneratedImage[] =
        url || input.storageKey
            ? [
                  {
                      id: `${id}-0`,
                      dataUrl: url,
                      storageKey: input.storageKey,
                      durationMs: 0,
                      width: input.width || 0,
                      height: input.height || 0,
                      bytes: input.bytes || 0,
                      mimeType: input.mimeType,
                  },
              ]
            : [];
    const size = String(input.config?.size || "");
    const quality = String(input.config?.quality || "");
    const count = String(input.config?.count || images.length || 1);
    await upsertLocalImageGenerationLog({
        id,
        createdAt: now,
        title: prompt.slice(0, 12) || model || i18n.t("workbench.untitled"),
        prompt,
        time: formatTime(now),
        model,
        config: {
            model,
            imageModel: model,
            quality,
            size,
            count,
        },
        references: [],
        durationMs: 0,
        successCount: status === "success" ? images.length : 0,
        failCount: status === "failed" ? 1 : 0,
        imageCount: images.length || Number(count) || 0,
        size,
        quality,
        status: status === "failed" ? "failed" : "success",
        images,
        thumbnails: images.map((item) => item.dataUrl).filter(Boolean),
        origin: "canvas",
    });
}

/** Persist a canvas video result into the same local store the video workbench reads. */
export async function syncCanvasVideoToLocalLogs(input: {
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
    config?: Record<string, unknown>;
}): Promise<void> {
    const id = input.clientId.trim();
    if (!id) return;
    const now = Date.now();
    const prompt = (input.prompt || "").trim();
    const model = (input.model || "").trim();
    const url = (input.url || "").trim();
    const status = input.status || (url || input.storageKey ? "success" : "pending");
    const size = String(input.config?.size || "");
    const resolution = String(input.config?.resolution || input.config?.quality || input.config?.vquality || "");
    const seconds = String(input.config?.seconds || input.config?.videoSeconds || "");
    const video: LocalGeneratedVideo | undefined =
        url || input.storageKey
            ? {
                  id: `${id}-video`,
                  url,
                  storageKey: input.storageKey || "",
                  durationMs: input.durationMs || 0,
                  width: input.width || 0,
                  height: input.height || 0,
                  bytes: input.bytes || 0,
                  mimeType: input.mimeType || "video/mp4",
              }
            : undefined;
    await upsertLocalVideoGenerationLog({
        id,
        createdAt: now,
        title: prompt.slice(0, 12) || model || i18n.t("workbench.untitled"),
        prompt,
        time: formatTime(now),
        model,
        config: {
            model,
            videoModel: model,
            size,
            vquality: resolution,
            videoSeconds: seconds,
            videoGenerateAudio: input.config?.generate_audio ?? input.config?.videoGenerateAudio,
            videoWatermark: input.config?.watermark ?? input.config?.videoWatermark,
        },
        references: [],
        durationMs: input.durationMs || 0,
        size,
        resolution,
        seconds,
        status,
        task: input.taskId
            ? {
                  id: input.taskId,
                  provider: String(input.config?.task_provider || input.config?.taskProvider || ""),
                  model,
              }
            : undefined,
        video,
        error: input.error,
        origin: "canvas",
    });
}
