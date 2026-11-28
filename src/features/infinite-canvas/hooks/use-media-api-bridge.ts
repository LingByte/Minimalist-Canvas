import { useEffect } from "react";

import { requestEdit, requestGeneration } from "@canvas/services/api/image";
import { requestVideoGeneration } from "@canvas/services/api/video";
import { isTauri } from "@canvas/services/fs-store";
import { useConfigStore, type AiConfig } from "@canvas/stores/use-config-store";

type MediaApiRequest = {
    requestId: number;
    action: string;
    arguments?: Record<string, unknown>;
};

function redactKey(value: string | undefined) {
    const text = String(value || "");
    if (text.length <= 8) return text ? "***" : "";
    return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function asString(value: unknown) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
}

function withOverrides(config: AiConfig, args: Record<string, unknown>, capability: "image" | "video"): AiConfig {
    const model = asString(args.model);
    const size = asString(args.size);
    const quality = asString(args.quality);
    const count = asString(args.n ?? args.count);
    const seconds = asString(args.seconds);
    return {
        ...config,
        ...(capability === "image" && model ? { model, imageModel: model } : {}),
        ...(capability === "video" && model ? { model, videoModel: model } : {}),
        ...(size ? { size } : {}),
        ...(quality ? { quality } : {}),
        ...(count ? { count } : {}),
        ...(seconds ? { videoSeconds: seconds } : {}),
    };
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read video blob"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(blob);
    });
}

async function handleMediaAction(action: string, args: Record<string, unknown>) {
    const config = useConfigStore.getState().config;

    if (action === "config") {
        return {
            ok: true,
            source: "live",
            imageModel: config.imageModel,
            videoModel: config.videoModel,
            textModel: config.textModel,
            size: config.size,
            quality: config.quality,
            count: config.count,
            videoSeconds: config.videoSeconds,
            channels: (config.channels || []).map((channel) => ({
                id: channel.id,
                name: channel.name,
                baseUrl: channel.baseUrl,
                apiFormat: channel.apiFormat,
                apiKey: redactKey(channel.apiKey),
                models: (channel.models || []).map((m) => ({ name: m.name, capability: m.capability })),
            })),
        };
    }

    if (action === "models") {
        const capability = asString(args.capability);
        const rows = [];
        for (const channel of config.channels || []) {
            for (const model of channel.models || []) {
                if (capability && model.capability !== capability) continue;
                rows.push({
                    id: `${channel.id}::${model.name}`,
                    channel: channel.name,
                    model: model.name,
                    capability: model.capability,
                    baseUrl: channel.baseUrl,
                });
            }
        }
        return rows;
    }

    if (action === "images.generations") {
        const prompt = asString(args.prompt);
        if (!prompt) throw new Error("prompt is required");
        const requestConfig = withOverrides(config, args, "image");
        const images = await requestGeneration(requestConfig, prompt);
        return {
            created: Math.floor(Date.now() / 1000),
            data: images.map((item) => {
                const dataUrl = item.dataUrl || "";
                const b64 = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1] : undefined;
                return {
                    b64_json: b64,
                    url: !b64 && dataUrl ? dataUrl : undefined,
                    data_url: dataUrl,
                };
            }),
        };
    }

    if (action === "images.edits") {
        const prompt = asString(args.prompt);
        const image = asString(args.image) || (Array.isArray(args.images) ? asString(args.images[0]) : "");
        if (!prompt || !image) throw new Error("prompt and image are required");
        const requestConfig = withOverrides(config, args, "image");
        const images = await requestEdit(requestConfig, prompt, [
            {
                id: "ref",
                name: "ref",
                type: "image/png",
                dataUrl: image,
                ...( /^https?:\/\//i.test(image) ? { url: image } : {}),
            },
        ]);
        return {
            created: Math.floor(Date.now() / 1000),
            data: images.map((item) => {
                const dataUrl = item.dataUrl || "";
                const b64 = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1] : undefined;
                return {
                    b64_json: b64,
                    url: !b64 && dataUrl ? dataUrl : undefined,
                    data_url: dataUrl,
                };
            }),
        };
    }

    if (action === "videos.create") {
        const prompt = asString(args.prompt);
        if (!prompt) throw new Error("prompt is required");
        const requestConfig = withOverrides(config, args, "video");
        const image = asString(args.image);
        const references = image
            ? [
                  {
                      id: "ref",
                      name: "ref",
                      type: "image/png",
                      dataUrl: image,
                      ...( /^https?:\/\//i.test(image) ? { url: image } : {}),
                  },
              ]
            : [];
        const result = await requestVideoGeneration(requestConfig, prompt, references);
        let dataUrl = "";
        if (result.blob) dataUrl = await blobToDataUrl(result.blob);
        return {
            ok: true,
            status: "completed",
            url: result.url || undefined,
            data_url: dataUrl || undefined,
            mimeType: result.mimeType || result.blob?.type || "video/mp4",
        };
    }

    throw new Error(`unknown media action: ${action}`);
}

/** Forwards localhost media-api requests to live canvas channel generation. */
export function useMediaApiBridge() {
    useEffect(() => {
        if (!isTauri()) return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        void (async () => {
            const [{ listen }, { invoke }] = await Promise.all([
                import("@tauri-apps/api/event"),
                import("@tauri-apps/api/core"),
            ]);
            if (disposed) return;
            unlisten = await listen<MediaApiRequest>("media-api:request", async (event) => {
                const { requestId, action, arguments: args } = event.payload;
                try {
                    const result = await handleMediaAction(action, args ?? {});
                    await invoke("media_api_result", { requestId, ok: true, payload: result ?? null });
                } catch (error) {
                    const text = error instanceof Error ? error.message : String(error);
                    await invoke("media_api_result", { requestId, ok: false, payload: text }).catch(() => undefined);
                }
            });
        })();
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);
}
