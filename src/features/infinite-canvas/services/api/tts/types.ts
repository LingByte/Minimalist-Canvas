import type { TtsEngine } from "@canvas/lib/tts-engines";

export type SynthesizeInput = {
    text: string;
    voice: string;
    format: string;
    speed: number;
    instructions?: string;
    signal?: AbortSignal;
};

export type SynthesizeResult = {
    blob: Blob;
    mimeType: string;
};

export type TtsSynthesizer = (engine: TtsEngine, input: SynthesizeInput) => Promise<SynthesizeResult>;
