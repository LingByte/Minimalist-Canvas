import i18n from "@canvas/i18n";
import { isTtsEngineReady, type TtsEngine } from "@canvas/lib/tts-engines";
import {
    synthesizeAws,
    synthesizeAzure,
    synthesizeBaidu,
    synthesizeCoqui,
    synthesizeElevenLabs,
    synthesizeFishAudio,
    synthesizeFishSpeech,
    synthesizeGoogle,
    synthesizeOpenAI,
    synthesizeQcloud,
    synthesizeQiniu,
    synthesizeVolcHttp,
} from "./providers-http";
import { synthesizeAliyun, synthesizeMinimax, synthesizeXunfei } from "./providers-ws";
import type { SynthesizeInput, SynthesizeResult, TtsSynthesizer } from "./types";

const synthesizers: Record<TtsEngine["vendor"], TtsSynthesizer> = {
    openai: synthesizeOpenAI,
    elevenlabs: synthesizeElevenLabs,
    fishaudio: synthesizeFishAudio,
    fishspeech: synthesizeFishSpeech,
    azure: synthesizeAzure,
    baidu: synthesizeBaidu,
    qiniu: synthesizeQiniu,
    aliyun: synthesizeAliyun,
    xunfei: synthesizeXunfei,
    minimax: synthesizeMinimax,
    volcengine: synthesizeVolcHttp,
    qcloud: synthesizeQcloud,
    google: synthesizeGoogle,
    aws: synthesizeAws,
    coqui: synthesizeCoqui,
};

export async function synthesizeSpeech(engine: TtsEngine, input: SynthesizeInput): Promise<SynthesizeResult> {
    if (!input.text.trim()) throw new Error(i18n.t("apiErrors.audioGenerationFailed"));
    if (!isTtsEngineReady(engine)) throw new Error(i18n.t("apiErrors.ttsEngineRequired"));
    const run = synthesizers[engine.vendor];
    if (!run) throw new Error(i18n.t("apiErrors.ttsVendorUnsupported", { vendor: engine.vendor }));
    return run(engine, input);
}

export type { SynthesizeInput, SynthesizeResult };
