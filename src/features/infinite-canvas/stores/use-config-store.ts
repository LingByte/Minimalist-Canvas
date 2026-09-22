import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import i18n from "@canvas/i18n";
import { localForageStorage } from "@canvas/lib/localforage-storage";

export type ApiCallFormat = "openai" | "gemini";
export type ModelCapability = "image" | "video" | "text" | "audio";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    script?: string;
    /** Model metadata note from pricing / model admin (shown beside the name). */
    description?: string;
};

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: ChannelModel[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    serverUrl: string;
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    reasoningEffort: ReasoningEffort;
    models: string[];
    quality: string;
    size: string;
    imageResolution: string;
    background: string;
    count: string;
    canvasImageCount: string;
    customDataDir: string;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "preferences" | "webdav" | "local-storage";

export const CONFIG_STORE_KEY = "minimalist-canvas:ai_config_store";
const CHANNEL_MODEL_SEPARATOR = "::";
const DEFAULT_OPENAI_BASE_URL = "http://localhost:3000";
const LEGACY_OPENAI_BASE_URL = "https://api.openai.com";
const LEGACY_PRODUCT_BASE_URLS = [
    "https://canvas.lingecho.com",
    "http://1.14.99.158:9000",
    "https://simplefuture.zone",
    "https://ai.lingecho.com",
];
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
/** Built-in relay key for this desktop build. */
const BUILTIN_API_KEY = "sk-VsOmVvXFwhvpDeJSK5RFWYWo2xMtL37FIv6ju0goTUzOUPTA";

export const defaultConfig: AiConfig = {
    channelMode: "remote",
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    apiKey: BUILTIN_API_KEY,
    apiFormat: "openai",
    serverUrl: "",
    channels: [
        {
            id: "default",
            name: i18n.t("config.channels.defaultName"),
            baseUrl: DEFAULT_OPENAI_BASE_URL,
            apiKey: BUILTIN_API_KEY,
            apiFormat: "openai",
            // No baked-in demo models — gateway sync / channel editor fills this.
            models: [],
        },
    ],
    model: "",
    imageModel: "",
    videoModel: "",
    textModel: "",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    reasoningEffort: "auto",
    models: [],
    quality: "auto",
    size: "1:1",
    imageResolution: "2K",
    background: "",
    count: "1",
    canvasImageCount: "1",
    customDataDir: "",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "minimalist-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const VIDEO_KEYWORDS = ["video", "sora", "veo", "kling", "wan", "hailuo", "grok-imagine", "runway", "luma", "minimax-h", "seedance", "happyhorse"];

export function boolConfig(value: string, fallback: boolean) {
    return value ? value === "true" : fallback;
}

const AUDIO_KEYWORDS = ["audio", "tts", "speech", "voice", "music", "sound"];
const IMAGE_KEYWORDS = ["seedream", "gpt-image", "nano-banana", "banana", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney", "recraft", "ideogram", "kolors", "qwen-image"];

/** Best-effort default capability for a freshly fetched model name; user can override in the channel editor. */
export function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    // MiniMax-M2 / M2.x / M3 are chat models. Do not treat the whole MiniMax family as video.
    if (/minimax-m\d/.test(value)) return "text";
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video";
    if (AUDIO_KEYWORDS.some((keyword) => value.includes(keyword))) return "audio";
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image";
    return "text";
}

function findChannelModel(config: AiConfig, value: string): { channel: ModelChannel; model: ChannelModel } | null {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || value;
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.some((model) => model.name === name));
    const model = channel?.models.find((item) => item.name === name);
    return channel && model ? { channel, model } : null;
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return findChannelModel(config, value)?.model.capability;
}

export function modelDescriptionOf(config: AiConfig, value: string) {
    return findChannelModel(config, value)?.model.description?.trim() || "";
}

/** Best-effort unit price snippet from model description (e.g. "2.99元一条"). */
export function modelPriceHint(config: AiConfig, value: string) {
    const description = modelDescriptionOf(config, value);
    if (!description) return "";
    const match = description.match(/(?:¥|￥|\$)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元[^\s，,、]*/);
    return match?.[0]?.trim() || "";
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    if (!capability) return true;
    return modelCapabilityOf(config, value) === capability;
}

export function resolveModelForCapability(config: AiConfig, currentModel: string | undefined, capability: ModelCapability) {
    const defaultModel = capability === "image" ? config.imageModel : capability === "video" ? config.videoModel : capability === "audio" ? config.audioModel : config.textModel;
    if (currentModel && modelMatchesCapability(config, currentModel, capability)) return currentModel;
    if (defaultModel && modelMatchesCapability(config, defaultModel, capability)) return defaultModel;
    const available = selectableModelsByCapability(config, capability);
    return available[0] || "";
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => encodeChannelModel(channel.id, model.name)));
}

/** The user script (if any) attached to a model; empty string means use the system default call. */
export function resolveModelScript(config: AiConfig, value: string) {
    return findChannelModel(config, value)?.model.script?.trim() || "";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                // Empty persisted channels wipe the baked-in default; restore it.
                if (!Array.isArray(persistedConfig.channels) || persistedConfig.channels.length === 0) {
                    config.channels = defaultConfig.channels;
                }
                config.baseUrl = migrateLegacyOpenAIBaseUrl(config.baseUrl || defaultConfig.baseUrl);
                config.apiKey = config.apiKey?.trim() || BUILTIN_API_KEY;
                const channels = stripPlaceholderChannelModels(
                    normalizeChannels(config).map((channel) => ({
                        ...channel,
                        baseUrl: migrateLegacyOpenAIBaseUrl(channel.baseUrl || defaultConfig.baseUrl),
                        apiKey: channel.apiKey?.trim() || BUILTIN_API_KEY,
                    })),
                );
                const models = modelOptionsFromChannels(channels);
                const textModel = normalizeModelOptionValue(config.textModel || config.model, channels)
                    || pickHydratedDefaultModel(channels, "text");
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: persistedConfig.channelMode === "local" ? "local" : "remote",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels)
                            || pickHydratedDefaultModel(channels, "image"),
                        videoModel: normalizeModelOptionValue(config.videoModel, channels)
                            || pickHydratedDefaultModel(channels, "video"),
                        textModel,
                        audioModel: normalizeModelOptionValue(config.audioModel, channels)
                            || pickHydratedDefaultModel(channels, "audio"),
                        model: normalizeModelOptionValue(config.model, channels)
                            || textModel
                            || pickHydratedDefaultModel(channels, "image"),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        reasoningEffort: config.reasoningEffort || "auto",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        imageResolution: config.imageResolution || "2K",
                        canvasImageCount: config.canvasImageCount || "1",
                        customDataDir: config.customDataDir || "",
                    },
                };
            },
        },
    ),
);

function pickHydratedDefaultModel(channels: ModelChannel[], capability: ModelCapability) {
    for (const channel of channels) {
        const match = channel.models.find(
            (model) => model.capability === capability || guessCapability(model.name) === capability,
        );
        if (match) return encodeChannelModel(channel.id, match.name);
    }
    return "";
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

/** Normalize a mixed list of raw model names or model objects into deduped ChannelModel entries. */
export function normalizeChannelModels(models: Array<string | ChannelModel> | undefined): ChannelModel[] {
    const seen = new Set<string>();
    const result: ChannelModel[] = [];
    for (const item of models || []) {
        const name = (typeof item === "string" ? item : item?.name || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const capability = typeof item === "string" ? guessCapability(name) : item.capability || guessCapability(name);
        const script = typeof item === "string" ? undefined : item.script?.trim() || undefined;
        const description = typeof item === "string" ? undefined : item.description?.trim() || undefined;
        result.push({ name, capability, script, description });
    }
    return result;
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || i18n.t("config.channels.newName"),
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: normalizeChannelModels(channel?.models),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model.name))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.some((item) => item.name === decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.some((entry) => entry.name === model)) || channels[0];
    return channel && channel.models.some((item) => item.name === model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.some((item) => item.name === model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: i18n.t("config.channels.defaultName"), baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName).map((name) => ({ name, capability: guessCapability(name) })) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? i18n.t("config.channels.defaultName") : i18n.t("config.channels.indexedName", { index: index + 1 })),
            models: normalizeChannelModels(channel.models),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: i18n.t("config.channels.defaultName"),
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: normalizeChannelModels([config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel].map(modelOptionName)),
            }),
        );
    }
    return channels;
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    if (apiFormat === "gemini") return GEMINI_BASE_URL;
    return DEFAULT_OPENAI_BASE_URL;
}

/** Migrate placeholder / previous product hosts to the current canvas default. */
function migrateLegacyOpenAIBaseUrl(baseUrl: string) {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    const normalized = trimmed.replace(/\/v1$/, "");
    const lower = normalized.toLowerCase();
    // Desktop / Vite used to auto-bridge to same-origin /v1 which has no NewAPI relay.
    if (
        lower.startsWith("http://localhost") ||
        lower.startsWith("https://localhost") ||
        lower.startsWith("http://127.0.0.1") ||
        lower.startsWith("https://127.0.0.1") ||
        lower.startsWith("tauri://") ||
        lower.startsWith("http://tauri.localhost") ||
        lower.startsWith("https://tauri.localhost")
    ) {
        return DEFAULT_OPENAI_BASE_URL;
    }
    if (
        !normalized ||
        normalized === LEGACY_OPENAI_BASE_URL ||
        LEGACY_PRODUCT_BASE_URLS.includes(normalized)
    ) {
        return DEFAULT_OPENAI_BASE_URL;
    }
    return baseUrl;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? apiFormat : "openai";
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

/** Legacy seed catalog shipped with older canvas builds; drop when hydrating. */
const LEGACY_PLACEHOLDER_MODEL_NAMES = new Set(["gpt-image-2", "grok-imagine-video", "gpt-5.5", "gpt-4o-mini-tts"]);

function stripPlaceholderChannelModels(channels: ModelChannel[]) {
    return channels.map((channel) => {
        const models = channel.models.filter((model) => !LEGACY_PLACEHOLDER_MODEL_NAMES.has(model.name));
        // If the channel was only the old demo list, clear it so gateway sync can refill.
        if (!models.length && channel.models.every((model) => LEGACY_PLACEHOLDER_MODEL_NAMES.has(model.name))) {
            return { ...channel, models: [] };
        }
        return models.length === channel.models.length ? channel : { ...channel, models };
    });
}

export function buildApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}
