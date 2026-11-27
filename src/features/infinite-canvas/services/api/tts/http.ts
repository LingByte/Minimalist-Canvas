export async function ttsFetch(url: string, init: RequestInit = {}) {
    const { isTauri } = await import("@canvas/services/fs-store");
    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        return tauriFetch(url, init);
    }
    return fetch(url, init);
}

export async function readErrorText(response: Response, fallback: string) {
    const text = await response.text().catch(() => "");
    if (!text) return `${fallback} (HTTP ${response.status})`;
    try {
        const payload = JSON.parse(text) as Record<string, unknown>;
        const error = payload.error;
        if (typeof payload.message === "string" && payload.message) return payload.message;
        if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
            return (error as { message: string }).message;
        }
        if (typeof payload.msg === "string" && payload.msg) return payload.msg;
    } catch {
        // plain text
    }
    return text.slice(0, 300) || `${fallback} (HTTP ${response.status})`;
}

export function audioBlob(data: ArrayBuffer | Uint8Array | Blob, mimeType: string) {
    if (data instanceof Blob) {
        return data.type.startsWith("audio/") ? data : new Blob([data], { type: mimeType });
    }
    return new Blob([data as BlobPart], { type: mimeType });
}

export function mimeForFormat(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "opus") return "audio/opus";
    if (format === "aac") return "audio/aac";
    if (format === "flac") return "audio/flac";
    if (format === "pcm") return "audio/pcm";
    return "audio/mpeg";
}

/** Wrap raw PCM (s16le mono) as a minimal WAV container for playback. */
export function pcmToWavBlob(pcm: Uint8Array, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const blockAlign = (channels * bitDepth) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);
    new Uint8Array(buffer, 44).set(pcm);
    return new Blob([buffer], { type: "audio/wav" });
}
