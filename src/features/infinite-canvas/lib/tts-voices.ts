import i18n from "@canvas/i18n";
import {
    isTtsEngineReady,
    normalizeTtsEngines,
    normalizeTtsVendor,
    type TtsEngine,
    type TtsVendor,
} from "@canvas/lib/tts-engines";

import aliyunCatalog from "./voicecatalog/aliyun.json";
import awsCatalog from "./voicecatalog/aws.json";
import azureCatalog from "./voicecatalog/azure.json";
import baiduCatalog from "./voicecatalog/baidu.json";
import coquiCatalog from "./voicecatalog/coqui.json";
import elevenlabsCatalog from "./voicecatalog/elevenlabs.json";
import fishaudioCatalog from "./voicecatalog/fishaudio.json";
import fishspeechCatalog from "./voicecatalog/fishspeech.json";
import googleCatalog from "./voicecatalog/google.json";
import minimaxCatalog from "./voicecatalog/minimax.json";
import openaiCatalog from "./voicecatalog/openai.json";
import qcloudCatalog from "./voicecatalog/qcloud.json";
import qiniuCatalog from "./voicecatalog/qiniu.json";
import volcengineCatalog from "./voicecatalog/volcengine.json";
import xunfeiCatalog from "./voicecatalog/xunfei.json";

type CatalogEntry = {
    id: string;
    name?: string;
    label?: string;
    gender?: string;
    locale?: string;
    category?: string;
};

type CatalogFile = {
    provider: string;
    modes?: string[];
    voiceField?: string;
    voices: CatalogEntry[];
};

export type TtsVoice = {
    id: string;
    name: string;
    description: string;
    vendor: TtsVendor;
    upstreamId: string;
    gender?: string;
    locale?: string;
    category?: string;
};

export type VoiceRuntime = {
    voice: TtsVoice;
    engine: TtsEngine;
    upstreamVoice: string;
};

const catalogFiles: CatalogFile[] = [
    openaiCatalog,
    elevenlabsCatalog,
    fishaudioCatalog,
    fishspeechCatalog,
    azureCatalog,
    baiduCatalog,
    qiniuCatalog,
    aliyunCatalog,
    xunfeiCatalog,
    minimaxCatalog,
    volcengineCatalog,
    qcloudCatalog,
    googleCatalog,
    awsCatalog,
    coquiCatalog,
] as CatalogFile[];

const voices: TtsVoice[] = catalogFiles.flatMap((file) => {
    const modes = file.modes || [];
    if (modes.length && !modes.includes("tts")) return [];
    const vendor = normalizeTtsVendor(file.provider);
    return (file.voices || [])
        .filter((entry) => String(entry?.id || "").trim())
        .map((entry) => {
            const upstreamId = String(entry.id).trim();
            return {
                id: makeTtsVoiceId(vendor, upstreamId),
                name: catalogDisplayName(entry),
                description: catalogDescription(entry),
                vendor,
                upstreamId,
                gender: entry.gender?.trim() || undefined,
                locale: entry.locale?.trim() || undefined,
                category: entry.category?.trim() || undefined,
            } satisfies TtsVoice;
        });
});

const voiceById = new Map(voices.map((voice) => [voice.id, voice]));

export const DEFAULT_TTS_VOICE_ID = "openai:alloy";

export function makeTtsVoiceId(vendor: TtsVendor, upstreamId: string) {
    return `${vendor}:${upstreamId}`;
}

export function listTtsVoices(): TtsVoice[] {
    return voices;
}

export function voicesForVendor(vendor: TtsVendor): TtsVoice[] {
    return voices.filter((voice) => voice.vendor === vendor);
}

export function resolveTtsVoice(voiceId: string | undefined | null): TtsVoice | null {
    const id = (voiceId || "").trim();
    if (!id) return null;
    const direct = voiceById.get(id);
    if (direct) return direct;
    // Legacy bare OpenAI voice names (alloy, nova, …).
    const openaiLegacy = voiceById.get(makeTtsVoiceId("openai", id));
    if (openaiLegacy) return openaiLegacy;
    // Allow vendor:id even if not in catalog (custom / future).
    const sep = id.indexOf(":");
    if (sep > 0) {
        const vendor = normalizeTtsVendor(id.slice(0, sep));
        const upstreamId = id.slice(sep + 1).trim();
        if (!upstreamId) return null;
        return {
            id: makeTtsVoiceId(vendor, upstreamId),
            name: upstreamId,
            description: "",
            vendor,
            upstreamId,
        };
    }
    return null;
}

export function ttsVoiceLabel(voiceId: string | undefined | null) {
    const voice = resolveTtsVoice(voiceId);
    if (!voice) return (voiceId || "").trim() || "—";
    return voice.description ? `${voice.name} · ${voice.description}` : voice.name;
}

export function hasReadyTtsChannel(engines: TtsEngine[] | undefined, vendor: TtsVendor) {
    return normalizeTtsEngines(engines).some((engine) => engine.vendor === vendor && isTtsEngineReady(engine));
}

export function listReadyTtsChannels(engines: TtsEngine[] | undefined, vendor: TtsVendor) {
    return normalizeTtsEngines(engines).filter((engine) => engine.vendor === vendor && isTtsEngineReady(engine));
}

/** Pick a ready credential channel for the voice's vendor (random when multiple). */
export function resolveVoiceRuntime(engines: TtsEngine[] | undefined, voiceId: string | undefined | null): VoiceRuntime {
    const voice = resolveTtsVoice(voiceId);
    if (!voice) throw new Error(i18n.t("apiErrors.ttsVoiceRequired"));
    const candidates = listReadyTtsChannels(engines, voice.vendor);
    if (!candidates.length) throw new Error(i18n.t("apiErrors.ttsChannelRequired"));
    const engine = candidates[Math.floor(Math.random() * candidates.length)]!;
    return {
        voice,
        engine: applyUpstreamVoice(engine, voice.upstreamId),
        upstreamVoice: voice.upstreamId,
    };
}

/** First catalog voice for a vendor — used by engine test button. */
export function defaultVoiceForVendor(vendor: TtsVendor): TtsVoice | null {
    return voicesForVendor(vendor)[0] || null;
}

export function migrateLegacyAudioVoiceId(audioVoice: string | undefined, ttsVoiceId: string | undefined): string {
    const existing = (ttsVoiceId || "").trim();
    if (existing && resolveTtsVoice(existing)) return existing;
    if (existing) return existing;
    const legacy = (audioVoice || "").trim();
    if (!legacy) return DEFAULT_TTS_VOICE_ID;
    const resolved = resolveTtsVoice(legacy) || resolveTtsVoice(makeTtsVoiceId("openai", legacy));
    return resolved?.id || DEFAULT_TTS_VOICE_ID;
}

/** Prefer node catalog id; fall back to legacy node audioVoice, then global/default. */
export function resolveNodeTtsVoiceId(options: {
    nodeTtsVoiceId?: string;
    nodeAudioVoice?: string;
    globalTtsVoiceId?: string;
    fallback?: string;
}) {
    const nodeId = (options.nodeTtsVoiceId || "").trim();
    if (nodeId) return nodeId;
    const legacy = (options.nodeAudioVoice || "").trim();
    if (legacy) return migrateLegacyAudioVoiceId(legacy, undefined);
    return (options.globalTtsVoiceId || "").trim() || options.fallback || DEFAULT_TTS_VOICE_ID;
}

function applyUpstreamVoice(engine: TtsEngine, upstreamId: string): TtsEngine {
    const options = { ...engine.options };
    switch (engine.vendor) {
        case "elevenlabs":
        case "fishaudio":
        case "minimax":
            options.voiceId = upstreamId;
            break;
        case "qiniu":
        case "volcengine":
        case "qcloud":
            options.voiceType = upstreamId;
            break;
        case "xunfei":
            options.vcn = upstreamId;
            break;
        case "fishspeech":
        case "coqui":
            options.speaker = upstreamId;
            break;
        default:
            break;
    }
    return { ...engine, voice: upstreamId, options };
}

function catalogDisplayName(entry: CatalogEntry) {
    const label = (entry.label || "").trim();
    const dot = label.indexOf("·");
    if (dot >= 0) {
        const left = label.slice(0, dot).trim();
        if (left) return left;
    }
    const name = (entry.name || "").trim();
    if (name) return name;
    if (label) return label;
    return String(entry.id).trim();
}

function catalogDescription(entry: CatalogEntry) {
    const parts: string[] = [];
    switch ((entry.gender || "").trim().toLowerCase()) {
        case "male":
            parts.push("男声");
            break;
        case "female":
            parts.push("女声");
            break;
        case "neutral":
            parts.push("中性");
            break;
        default:
            break;
    }
    const category = (entry.category || "").trim();
    if (category) parts.push(category);
    const locale = (entry.locale || "").trim();
    if (locale) parts.push(locale);
    if (parts.length) return parts.join(" · ");
    const label = (entry.label || "").trim();
    const dot = label.indexOf("·");
    if (dot >= 0) {
        const right = label.slice(dot + 1).trim();
        if (right) return right;
    }
    return label;
}
