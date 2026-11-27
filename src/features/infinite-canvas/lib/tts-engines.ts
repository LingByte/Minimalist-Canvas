import { nanoid } from "nanoid";

import i18n from "@canvas/i18n";

export const TTS_VENDORS = [
    "openai",
    "elevenlabs",
    "fishaudio",
    "fishspeech",
    "azure",
    "baidu",
    "qiniu",
    "aliyun",
    "xunfei",
    "minimax",
    "volcengine",
    "qcloud",
    "google",
    "aws",
    "coqui",
] as const;

export type TtsVendor = (typeof TTS_VENDORS)[number];

export type TtsEngine = {
    id: string;
    name: string;
    vendor: TtsVendor;
    apiKey: string;
    baseUrl: string;
    /** Vendor-specific fields (region, appId, voiceId, secrets, …). */
    options: Record<string, string>;
    voice: string;
    model: string;
};

export type TtsFieldKey =
    | "apiKey"
    | "baseUrl"
    | "voice"
    | "model"
    | "region"
    | "appId"
    | "apiSecret"
    | "secretId"
    | "secretKey"
    | "accessToken"
    | "cluster"
    | "voiceId"
    | "voiceType"
    | "resId"
    | "vcn"
    | "speaker"
    | "language"
    | "languageType"
    | "accessKeyId"
    | "secretAccessKey";

export type TtsVendorMeta = {
    vendor: TtsVendor;
    labelKey: string;
    fields: TtsFieldKey[];
    defaults: Partial<TtsEngine> & { options?: Record<string, string> };
};

export const TTS_VENDOR_META: TtsVendorMeta[] = [
    {
        vendor: "openai",
        labelKey: "config.tts.vendors.openai",
        fields: ["apiKey", "baseUrl", "model"],
        defaults: { voice: "alloy", model: "tts-1", baseUrl: "", options: {} },
    },
    {
        vendor: "elevenlabs",
        labelKey: "config.tts.vendors.elevenlabs",
        fields: ["apiKey", "baseUrl", "model"],
        defaults: {
            voice: "21m00Tcm4TlvDq8ikWAM",
            model: "eleven_multilingual_v2",
            baseUrl: "https://api.elevenlabs.io",
            options: { voiceId: "21m00Tcm4TlvDq8ikWAM" },
        },
    },
    {
        vendor: "fishaudio",
        labelKey: "config.tts.vendors.fishaudio",
        fields: ["apiKey", "baseUrl", "model"],
        defaults: { voice: "", model: "s1", baseUrl: "https://api.fish.audio", options: { voiceId: "" } },
    },
    {
        vendor: "fishspeech",
        labelKey: "config.tts.vendors.fishspeech",
        fields: ["apiKey", "baseUrl"],
        defaults: { voice: "", model: "", baseUrl: "", options: { speaker: "" } },
    },
    {
        vendor: "azure",
        labelKey: "config.tts.vendors.azure",
        fields: ["apiKey", "region", "language"],
        defaults: {
            voice: "zh-CN-XiaoxiaoNeural",
            model: "",
            baseUrl: "",
            options: { region: "eastasia", language: "zh-CN" },
        },
    },
    {
        vendor: "baidu",
        labelKey: "config.tts.vendors.baidu",
        fields: ["apiKey", "apiSecret"],
        defaults: { voice: "0", model: "", baseUrl: "", options: { apiSecret: "" } },
    },
    {
        vendor: "qiniu",
        labelKey: "config.tts.vendors.qiniu",
        fields: ["apiKey", "baseUrl"],
        defaults: {
            voice: "qiniu_zh_female_tmjxxy",
            model: "",
            baseUrl: "",
            options: { voiceType: "qiniu_zh_female_tmjxxy" },
        },
    },
    {
        vendor: "aliyun",
        labelKey: "config.tts.vendors.aliyun",
        fields: ["apiKey", "baseUrl", "model", "languageType"],
        defaults: {
            voice: "Cherry",
            model: "qwen3-tts-flash-realtime",
            baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
            options: { languageType: "Auto" },
        },
    },
    {
        vendor: "xunfei",
        labelKey: "config.tts.vendors.xunfei",
        fields: ["appId", "apiKey", "apiSecret", "resId"],
        defaults: { voice: "x5_clone", model: "", baseUrl: "", options: { appId: "", apiSecret: "", resId: "", vcn: "x5_clone" } },
    },
    {
        vendor: "minimax",
        labelKey: "config.tts.vendors.minimax",
        fields: ["apiKey", "model"],
        defaults: {
            voice: "",
            model: "speech-02-hd",
            baseUrl: "wss://api.minimaxi.com/ws/v1/t2a_v2",
            options: { voiceId: "" },
        },
    },
    {
        vendor: "volcengine",
        labelKey: "config.tts.vendors.volcengine",
        fields: ["appId", "accessToken", "cluster"],
        defaults: {
            voice: "BV700_streaming",
            model: "",
            baseUrl: "",
            options: { appId: "", accessToken: "", cluster: "volcano_tts", voiceType: "BV700_streaming" },
        },
    },
    {
        vendor: "qcloud",
        labelKey: "config.tts.vendors.qcloud",
        fields: ["appId", "secretId", "secretKey"],
        defaults: {
            voice: "1001",
            model: "",
            baseUrl: "",
            options: { appId: "", secretId: "", secretKey: "", voiceType: "1001" },
        },
    },
    {
        vendor: "google",
        labelKey: "config.tts.vendors.google",
        fields: ["apiKey", "baseUrl", "language"],
        defaults: {
            voice: "en-US-Neural2-A",
            model: "",
            baseUrl: "https://texttospeech.googleapis.com",
            options: { language: "en-US" },
        },
    },
    {
        vendor: "aws",
        labelKey: "config.tts.vendors.aws",
        fields: ["accessKeyId", "secretAccessKey", "region"],
        defaults: {
            voice: "Joanna",
            model: "",
            baseUrl: "",
            options: { accessKeyId: "", secretAccessKey: "", region: "us-east-1" },
        },
    },
    {
        vendor: "coqui",
        labelKey: "config.tts.vendors.coqui",
        fields: ["baseUrl", "language"],
        defaults: { voice: "p226", model: "", baseUrl: "", options: { speaker: "p226", language: "en_US" } },
    },
];

export function normalizeTtsVendor(value: unknown): TtsVendor {
    return TTS_VENDORS.includes(value as TtsVendor) ? (value as TtsVendor) : "openai";
}

export function ttsVendorMeta(vendor: TtsVendor) {
    return TTS_VENDOR_META.find((item) => item.vendor === vendor) || TTS_VENDOR_META[0];
}

export function createTtsEngine(partial?: Partial<TtsEngine>): TtsEngine {
    const vendor = normalizeTtsVendor(partial?.vendor);
    const meta = ttsVendorMeta(vendor);
    return {
        id: partial?.id?.trim() || nanoid(),
        name: partial?.name?.trim() || i18n.t("config.tts.defaultName", { vendor: i18n.t(meta.labelKey) }),
        vendor,
        apiKey: partial?.apiKey || "",
        baseUrl: partial?.baseUrl?.trim() || meta.defaults.baseUrl || "",
        options: { ...(meta.defaults.options || {}), ...(partial?.options || {}) },
        voice: partial?.voice?.trim() || meta.defaults.voice || "",
        model: partial?.model?.trim() || meta.defaults.model || "",
    };
}

export function normalizeTtsEngines(engines: TtsEngine[] | undefined): TtsEngine[] {
    return (engines || []).map((engine) => createTtsEngine(engine));
}

export function resolveTtsEngine(engines: TtsEngine[], engineId: string | undefined): TtsEngine | null {
    const normalized = normalizeTtsEngines(engines);
    if (!normalized.length) return null;
    return normalized.find((engine) => engine.id === engineId) || normalized[0];
}

export function isTtsEngineReady(engine: TtsEngine) {
    switch (engine.vendor) {
        case "openai":
        case "elevenlabs":
        case "fishaudio":
        case "aliyun":
        case "minimax":
        case "google":
            return Boolean(engine.apiKey.trim());
        case "fishspeech":
        case "qiniu":
            return Boolean(engine.apiKey.trim() && engine.baseUrl.trim());
        case "azure":
            return Boolean(engine.apiKey.trim() && engine.options.region?.trim());
        case "baidu":
            return Boolean(engine.apiKey.trim() && engine.options.apiSecret?.trim());
        case "xunfei":
            return Boolean(engine.options.appId?.trim() && engine.apiKey.trim() && engine.options.apiSecret?.trim());
        case "volcengine":
            return Boolean(engine.options.appId?.trim() && engine.options.accessToken?.trim());
        case "qcloud":
            return Boolean(engine.options.appId?.trim() && engine.options.secretId?.trim() && engine.options.secretKey?.trim());
        case "aws":
            return Boolean(engine.options.accessKeyId?.trim() && engine.options.secretAccessKey?.trim() && engine.options.region?.trim());
        case "coqui":
            return Boolean(engine.baseUrl.trim());
        default:
            return false;
    }
}
