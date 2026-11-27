import { audioBlob, mimeForFormat, pcmToWavBlob, readErrorText, ttsFetch } from "./http";
import type { TtsSynthesizer } from "./types";

export const synthesizeOpenAI: TtsSynthesizer = async (engine, input) => {
    const base = (engine.baseUrl || "https://api.openai.com").replace(/\/+$/, "");
    const url = /\/v1$/i.test(base) ? `${base}/audio/speech` : `${base}/v1/audio/speech`;
    const response = await ttsFetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${engine.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: engine.model || "tts-1",
            input: input.text,
            voice: input.voice || engine.voice || "alloy",
            response_format: input.format || "mp3",
            speed: input.speed || 1,
            ...(input.instructions ? { instructions: input.instructions } : {}),
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "OpenAI TTS failed"));
    const mime = mimeForFormat(input.format);
    return { blob: audioBlob(await response.arrayBuffer(), mime), mimeType: mime };
};

export const synthesizeElevenLabs: TtsSynthesizer = async (engine, input) => {
    const voiceId = engine.options.voiceId || input.voice || engine.voice;
    if (!voiceId) throw new Error("ElevenLabs voiceId is required");
    const base = (engine.baseUrl || "https://api.elevenlabs.io").replace(/\/+$/, "");
    const url = `${base}/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
    const response = await ttsFetch(url, {
        method: "POST",
        headers: {
            "xi-api-key": engine.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify({
            text: input.text,
            model_id: engine.model || "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "ElevenLabs TTS failed"));
    return { blob: audioBlob(await response.arrayBuffer(), "audio/mpeg"), mimeType: "audio/mpeg" };
};

export const synthesizeFishAudio: TtsSynthesizer = async (engine, input) => {
    const base = (engine.baseUrl || "https://api.fish.audio").replace(/\/+$/, "");
    const referenceId = engine.options.voiceId || input.voice || engine.voice;
    const response = await ttsFetch(`${base}/v1/tts`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${engine.apiKey}`,
            "Content-Type": "application/json",
            model: engine.model || "s1",
        },
        body: JSON.stringify({
            text: input.text,
            ...(referenceId ? { reference_id: referenceId } : {}),
            format: input.format === "wav" ? "wav" : "mp3",
            ...(input.speed && input.speed !== 1 ? { speed: input.speed } : {}),
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Fish Audio TTS failed"));
    const mime = input.format === "wav" ? "audio/wav" : "audio/mpeg";
    return { blob: audioBlob(await response.arrayBuffer(), mime), mimeType: mime };
};

export const synthesizeFishSpeech: TtsSynthesizer = async (engine, input) => {
    if (!engine.baseUrl.trim()) throw new Error("Fish Speech base URL is required");
    const base = engine.baseUrl.replace(/\/+$/, "");
    const response = await ttsFetch(`${base}/v1/tts`, {
        method: "POST",
        headers: {
            ...(engine.apiKey ? { Authorization: `Bearer ${engine.apiKey}` } : {}),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            text: input.text,
            ...(engine.options.speaker || input.voice ? { speaker: engine.options.speaker || input.voice } : {}),
            format: input.format === "wav" ? "wav" : "mp3",
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Fish Speech TTS failed"));
    const mime = input.format === "wav" ? "audio/wav" : "audio/mpeg";
    return { blob: audioBlob(await response.arrayBuffer(), mime), mimeType: mime };
};

export const synthesizeAzure: TtsSynthesizer = async (engine, input) => {
    const region = engine.options.region?.trim();
    if (!region) throw new Error("Azure region is required");
    const voice = input.voice || engine.voice || "zh-CN-XiaoxiaoNeural";
    const language =
        engine.options.language ||
        (voice.includes("-") ? voice.split("-").slice(0, 2).join("-") : "zh-CN");
    const url = engine.baseUrl.trim() || `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = `<speak version="1.0" xml:lang="${escapeXml(language)}"><voice xml:lang="${escapeXml(language)}" name="${escapeXml(voice)}">${escapeXml(input.text)}</voice></speak>`;
    const response = await ttsFetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "Ocp-Apim-Subscription-Key": engine.apiKey,
            "User-Agent": "MinimalistCanvas",
        },
        body: ssml,
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Azure TTS failed"));
    return { blob: audioBlob(await response.arrayBuffer(), "audio/mpeg"), mimeType: "audio/mpeg" };
};

export const synthesizeBaidu: TtsSynthesizer = async (engine, input) => {
    const secret = engine.options.apiSecret?.trim();
    if (!secret) throw new Error("Baidu apiSecret is required");
    const token = await fetchBaiduToken(engine.apiKey, secret, input.signal);
    const per = input.voice || engine.voice || "0";
    const params = new URLSearchParams({
        tok: token,
        tex: input.text,
        cuid: "minimalist-canvas",
        ctp: "1",
        lan: "zh",
        per,
        aue: input.format === "wav" || input.format === "pcm" ? "6" : "3",
        spd: String(Math.round(Math.max(0, Math.min(15, input.speed * 5)))),
    });
    const response = await ttsFetch(`https://tsn.baidu.com/text2audio?${params.toString()}`, {
        method: "GET",
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Baidu TTS failed"));
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    if (contentType.includes("json") || contentType.includes("text")) {
        throw new Error(new TextDecoder().decode(buffer).slice(0, 300) || "Baidu TTS failed");
    }
    const mime = contentType.startsWith("audio/") ? contentType : input.format === "wav" ? "audio/wav" : "audio/mpeg";
    return { blob: audioBlob(buffer, mime), mimeType: mime };
};

async function fetchBaiduToken(apiKey: string, secret: string, signal?: AbortSignal) {
    const response = await ttsFetch(
        `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secret)}`,
        { method: "POST", signal },
    );
    if (!response.ok) throw new Error(await readErrorText(response, "Baidu token failed"));
    const payload = (await response.json()) as { access_token?: string; error_description?: string };
    if (!payload.access_token) throw new Error(payload.error_description || "Baidu token missing");
    return payload.access_token;
}

export const synthesizeQiniu: TtsSynthesizer = async (engine, input) => {
    if (!engine.baseUrl.trim()) throw new Error("Qiniu TTS base URL is required");
    const base = engine.baseUrl.replace(/\/+$/, "");
    const voiceType = engine.options.voiceType || input.voice || engine.voice;
    const response = await ttsFetch(`${base}/voice/tts`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${engine.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            audio: { voice_type: voiceType, encoding: "mp3", speed_ratio: input.speed || 1 },
            request: { text: input.text },
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Qiniu TTS failed"));
    const payload = (await response.json()) as { data?: string; message?: string };
    if (!payload.data) throw new Error(payload.message || "Qiniu TTS returned no audio");
    const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
    return { blob: audioBlob(bytes, "audio/mpeg"), mimeType: "audio/mpeg" };
};

export const synthesizeCoqui: TtsSynthesizer = async (engine, input) => {
    if (!engine.baseUrl.trim()) throw new Error("Coqui TTS base URL is required");
    const base = engine.baseUrl.replace(/\/+$/, "");
    const response = await ttsFetch(`${base}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            text: input.text,
            speaker_id: engine.options.speaker || input.voice || engine.voice || undefined,
            language_id: engine.options.language || undefined,
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Coqui TTS failed"));
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json")) {
        const payload = (await response.json()) as { audio?: string };
        if (!payload.audio) throw new Error("Coqui TTS returned no audio");
        const bytes = Uint8Array.from(atob(payload.audio), (c) => c.charCodeAt(0));
        return { blob: pcmToWavBlob(bytes, 16000), mimeType: "audio/wav" };
    }
    return { blob: audioBlob(await response.arrayBuffer(), "audio/wav"), mimeType: "audio/wav" };
};

export const synthesizeGoogle: TtsSynthesizer = async (engine, input) => {
    const base = (engine.baseUrl || "https://texttospeech.googleapis.com").replace(/\/+$/, "");
    const voice = input.voice || engine.voice || "en-US-Neural2-A";
    const languageCode = engine.options.language || (voice.includes("-") ? voice.split("-").slice(0, 2).join("-") : "en-US");
    const url = `${base}/v1/text:synthesize?key=${encodeURIComponent(engine.apiKey)}`;
    const response = await ttsFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            input: { text: input.text },
            voice: { languageCode, name: voice },
            audioConfig: {
                audioEncoding: input.format === "wav" || input.format === "pcm" ? "LINEAR16" : "MP3",
                speakingRate: input.speed || 1,
            },
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Google TTS failed"));
    const payload = (await response.json()) as { audioContent?: string };
    if (!payload.audioContent) throw new Error("Google TTS returned no audio");
    const bytes = Uint8Array.from(atob(payload.audioContent), (c) => c.charCodeAt(0));
    if (input.format === "wav" || input.format === "pcm") {
        return { blob: pcmToWavBlob(bytes, 24000), mimeType: "audio/wav" };
    }
    return { blob: audioBlob(bytes, "audio/mpeg"), mimeType: "audio/mpeg" };
};

export const synthesizeVolcHttp: TtsSynthesizer = async (engine, input) => {
    const appId = engine.options.appId?.trim();
    const accessToken = engine.options.accessToken?.trim();
    const cluster = engine.options.cluster?.trim() || "volcano_tts";
    const voiceType = engine.options.voiceType || input.voice || engine.voice || "BV700_streaming";
    if (!appId || !accessToken) throw new Error("Volcengine appId and accessToken are required");
    const reqid = crypto.randomUUID();
    const response = await ttsFetch("https://openspeech.bytedance.com/api/v1/tts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer;${accessToken}`,
        },
        body: JSON.stringify({
            app: { appid: appId, token: "access_token", cluster },
            user: { uid: "minimalist-canvas" },
            audio: {
                voice_type: voiceType,
                encoding: "mp3",
                speed_ratio: input.speed || 1,
                volume_ratio: 1,
                pitch_ratio: 1,
            },
            request: {
                reqid,
                text: input.text,
                text_type: "plain",
                operation: "query",
            },
        }),
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "Volcengine TTS failed"));
    const payload = (await response.json()) as { code?: number; message?: string; data?: string };
    if (payload.code && payload.code !== 3000) throw new Error(payload.message || `Volcengine error ${payload.code}`);
    if (!payload.data) throw new Error(payload.message || "Volcengine TTS returned no audio");
    const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
    return { blob: audioBlob(bytes, "audio/mpeg"), mimeType: "audio/mpeg" };
};

export const synthesizeQcloud: TtsSynthesizer = async (engine, input) => {
    const appId = engine.options.appId?.trim();
    const secretId = engine.options.secretId?.trim();
    const secretKey = engine.options.secretKey?.trim();
    const voiceType = Number(engine.options.voiceType || input.voice || engine.voice || "1001");
    if (!appId || !secretId || !secretKey) throw new Error("QCloud appId / secretId / secretKey are required");

    // TC3: Action / Version / Region belong in X-TC-* headers only — not the JSON body.
    const payload = {
        Text: input.text,
        SessionId: crypto.randomUUID(),
        VoiceType: voiceType,
        Codec: "mp3",
        SampleRate: 16000,
        Speed: Math.max(-2, Math.min(6, Math.round((input.speed - 1) * 2))),
        ProjectId: Number(appId) || 0,
        ModelType: 1,
    };
    const body = JSON.stringify(payload);
    const headers = await signTencentTc3(secretId, secretKey, "tts", "ap-guangzhou", body, "TextToVoice");
    const response = await ttsFetch("https://tts.tencentcloudapi.com", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
        body,
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "QCloud TTS failed"));
    const result = (await response.json()) as {
        Response?: { Audio?: string; Error?: { Message?: string } };
    };
    if (result.Response?.Error?.Message) throw new Error(result.Response.Error.Message);
    const audio = result.Response?.Audio;
    if (!audio) throw new Error("QCloud TTS returned no audio");
    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    return { blob: audioBlob(bytes, "audio/mpeg"), mimeType: "audio/mpeg" };
};

export const synthesizeAws: TtsSynthesizer = async (engine, input) => {
    const accessKeyId = engine.options.accessKeyId?.trim();
    const secretAccessKey = engine.options.secretAccessKey?.trim();
    const region = engine.options.region?.trim() || "us-east-1";
    const voice = input.voice || engine.voice || "Joanna";
    if (!accessKeyId || !secretAccessKey) throw new Error("AWS accessKeyId and secretAccessKey are required");

    const host = `polly.${region}.amazonaws.com`;
    const path = "/v1/speech";
    const requestBody = JSON.stringify(
        input.speed && input.speed !== 1
            ? {
                  Text: `<speak><prosody rate="${Math.round(input.speed * 100)}%">${escapeXml(input.text)}</prosody></speak>`,
                  TextType: "ssml",
                  OutputFormat: "mp3",
                  VoiceId: voice,
                  Engine: "neural",
              }
            : {
                  Text: input.text,
                  OutputFormat: "mp3",
                  VoiceId: voice,
                  Engine: "neural",
              },
    );
    const headers = await signAws4({
        method: "POST",
        host,
        path,
        region,
        service: "polly",
        accessKeyId,
        secretAccessKey,
        body: requestBody,
        contentType: "application/json",
    });
    const response = await ttsFetch(`https://${host}${path}`, {
        method: "POST",
        headers,
        body: requestBody,
        signal: input.signal,
    });
    if (!response.ok) throw new Error(await readErrorText(response, "AWS Polly TTS failed"));
    return { blob: audioBlob(await response.arrayBuffer(), "audio/mpeg"), mimeType: "audio/mpeg" };
};

function escapeXml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function sha256Hex(message: string) {
    const data = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string) {
    const keyBytes = key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key);
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function signAws4(opts: {
    method: string;
    host: string;
    path: string;
    region: string;
    service: string;
    accessKeyId: string;
    secretAccessKey: string;
    body: string;
    contentType: string;
}) {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(opts.body);
    const canonicalHeaders = `content-type:${opts.contentType}\nhost:${opts.host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-date";
    const canonicalRequest = `${opts.method}\n${opts.path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
    const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${opts.secretAccessKey}`), dateStamp);
    const kRegion = await hmacSha256(kDate, opts.region);
    const kService = await hmacSha256(kRegion, opts.service);
    const kSigning = await hmacSha256(kService, "aws4_request");
    const signature = [...new Uint8Array(await hmacSha256(kSigning, stringToSign))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return {
        "Content-Type": opts.contentType,
        Host: opts.host,
        "X-Amz-Date": amzDate,
        Authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
}

async function signTencentTc3(secretId: string, secretKey: string, service: string, region: string, payload: string, action: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const hashedRequestPayload = await sha256Hex(payload);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:tts.tencentcloudapi.com\n`;
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\ncontent-type;host\n${hashedRequestPayload}`;
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
    const secretDate = await hmacSha256(new TextEncoder().encode(`TC3${secretKey}`), date);
    const secretService = await hmacSha256(secretDate, service);
    const secretSigning = await hmacSha256(secretService, "tc3_request");
    const signature = [...new Uint8Array(await hmacSha256(secretSigning, stringToSign))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return {
        Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`,
        "X-TC-Action": action,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Version": "2019-08-23",
        "X-TC-Region": region,
        Host: "tts.tencentcloudapi.com",
    };
}
