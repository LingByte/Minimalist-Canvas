#!/usr/bin/env node
/**
 * Use Minimalist Canvas desktop AI channels from any local project.
 * Zero npm deps (Node >= 18).
 *
 * Reads: ~/Library/Application Support/com.lingbyte.minimalist-canvas/app_state/minimalist-canvas_ai_config_store.json
 * Override with MINIMALIST_CANVAS_DATA_DIR or --data-dir.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA_DIR = join(homedir(), "Library/Application Support/com.lingbyte.minimalist-canvas");
const CONFIG_FILE = "app_state/minimalist-canvas_ai_config_store.json";
const VIDEO_DONE = new Set(["completed", "succeeded", "success", "ready", "done"]);
const VIDEO_FAIL = new Set(["failed", "error", "cancelled", "canceled"]);

function usage() {
  return `Usage:
  node canvas-media.mjs config [--show]
  node canvas-media.mjs models [--capability image|video|text|audio]
  node canvas-media.mjs image --prompt "..." [--model id] [--size 16:9|1024x1024] [--quality auto] [--out path]
  node canvas-media.mjs video --prompt "..." [--model id] [--seconds 5] [--size 16:9] [--image path|url] [--out path]
  node canvas-media.mjs edit --prompt "..." --image path|url [--model id] [--out path]

Env:
  MINIMALIST_CANVAS_DATA_DIR   override app data root
`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i += 1;
      }
    } else args._.push(token);
  }
  return args;
}

function dataDir(args) {
  return resolve(args["data-dir"] || process.env.MINIMALIST_CANVAS_DATA_DIR || DEFAULT_DATA_DIR);
}

async function loadConfig(args) {
  const path = join(dataDir(args), CONFIG_FILE);
  const raw = JSON.parse(await readFile(path, "utf8"));
  const state = raw.state || raw;
  const config = state.config || state;
  if (!config?.channels) throw new Error(`Invalid canvas config at ${path}`);
  return { path, config };
}

function modelName(value = "") {
  const text = String(value);
  const idx = text.indexOf("::");
  return idx >= 0 ? text.slice(idx + 2) : text;
}

function channelIdOf(value = "") {
  const text = String(value);
  const idx = text.indexOf("::");
  return idx >= 0 ? text.slice(0, idx) : "";
}

function resolveChannel(config, modelValue) {
  const id = channelIdOf(modelValue);
  const name = modelName(modelValue);
  if (id) {
    const channel = config.channels.find((item) => item.id === id);
    if (channel) return { channel, model: name || modelValue };
  }
  const byModel = config.channels.find((item) => (item.models || []).some((m) => m.name === name));
  if (byModel) return { channel: byModel, model: name };
  const fallback = config.channels[0];
  if (!fallback) throw new Error("No channels configured in Minimalist Canvas");
  return { channel: fallback, model: name || fallback.models?.[0]?.name || "" };
}

function pickDefaultModel(config, capability) {
  if (capability === "image" && config.imageModel) return config.imageModel;
  if (capability === "video" && config.videoModel) return config.videoModel;
  if (capability === "text" && config.textModel) return config.textModel;
  if (capability === "audio" && config.audioModel) return config.audioModel;
  for (const channel of config.channels || []) {
    const hit = (channel.models || []).find((m) => !capability || m.capability === capability);
    if (hit) return `${channel.id}::${hit.name}`;
  }
  throw new Error(`No ${capability || "any"} model found in Minimalist Canvas config`);
}

function apiUrl(baseUrl, path) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Channel baseUrl is empty — open Minimalist Canvas → Config and set a channel");
  const withV1 = /\/v1$/i.test(base) ? base : `${base}/v1`;
  return `${withV1}${path.startsWith("/") ? path : `/${path}`}`;
}

function redact(value) {
  const text = String(value || "");
  if (text.length <= 8) return text ? "***" : "";
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

async function apiJson(url, { method = "GET", apiKey, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || data?.msg || text.slice(0, 400) || res.statusText;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return data;
}

function mapSize(size) {
  const value = String(size || "").trim();
  if (!value) return undefined;
  if (/^\d+x\d+$/i.test(value)) return value;
  const ratios = {
    "1:1": "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
    "4:3": "1536x1152",
    "3:4": "1152x1536",
  };
  return ratios[value] || value;
}

function ratioOf(size) {
  const value = String(size || "").trim();
  if (/^\d+:\d+$/.test(value)) return value;
  const m = /^(\d+)x(\d+)$/i.exec(value);
  if (!m) return undefined;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w === h) return "1:1";
  if (w > h) return "16:9";
  return "9:16";
}

async function fileToDataUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith("data:")) return pathOrUrl;
  const abs = resolve(pathOrUrl);
  const buf = await readFile(abs);
  const ext = extname(abs).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function saveDataUrl(dataUrl, outPath) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("Expected data URL image");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(match[2], "base64"));
  return outPath;
}

async function downloadToFile(url, outPath, apiKey) {
  await mkdir(dirname(outPath), { recursive: true });
  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(outPath));
  return outPath;
}

function defaultOut(kind, prompt) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = String(prompt || "media")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const ext = kind === "video" ? "mp4" : "png";
  return resolve(process.cwd(), `canvas-media/${stamp}-${slug || kind}.${ext}`);
}

async function cmdConfig(args) {
  const { path, config } = await loadConfig(args);
  const channels = (config.channels || []).map((channel) => ({
    id: channel.id,
    name: channel.name,
    baseUrl: channel.baseUrl,
    apiFormat: channel.apiFormat,
    apiKey: redact(channel.apiKey),
    models: (channel.models || []).map((m) => ({ name: m.name, capability: m.capability })),
  }));
  console.log(
    JSON.stringify(
      {
        configPath: path,
        imageModel: config.imageModel,
        videoModel: config.videoModel,
        textModel: config.textModel,
        size: config.size,
        quality: config.quality,
        count: config.count,
        videoSeconds: config.videoSeconds,
        channels,
      },
      null,
      2,
    ),
  );
}

async function cmdModels(args) {
  const { config } = await loadConfig(args);
  const capability = args.capability || "";
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
  console.log(JSON.stringify(rows, null, 2));
}

async function generateImage(args) {
  const { config } = await loadConfig(args);
  const prompt = args.prompt;
  if (!prompt) throw new Error("--prompt is required");
  const modelValue = args.model || pickDefaultModel(config, "image");
  const { channel, model } = resolveChannel(config, modelValue);
  if (!channel.apiKey) throw new Error(`Channel 「${channel.name}」 has empty apiKey`);
  const size = mapSize(args.size || config.size || "16:9");
  const quality = args.quality || config.quality || "auto";
  const body = {
    model,
    prompt,
    n: Number(args.n || config.count || 1) || 1,
    ...(size ? { size } : {}),
    ...(quality ? { quality } : {}),
  };
  const data = await apiJson(apiUrl(channel.baseUrl, "/images/generations"), {
    method: "POST",
    apiKey: channel.apiKey,
    body,
  });
  const item = data?.data?.[0] || data?.images?.[0] || data;
  const b64 = item?.b64_json || item?.base64;
  const url = item?.url;
  const out = resolve(args.out || defaultOut("image", prompt));
  if (b64) await saveDataUrl(`data:image/png;base64,${b64}`, out);
  else if (url) await downloadToFile(url, out, channel.apiKey);
  else throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 500)}`);
  console.log(JSON.stringify({ ok: true, kind: "image", model: `${channel.id}::${model}`, out }, null, 2));
}

async function editImage(args) {
  const { config } = await loadConfig(args);
  const prompt = args.prompt;
  const image = args.image;
  if (!prompt || !image) throw new Error("--prompt and --image are required");
  const modelValue = args.model || pickDefaultModel(config, "image");
  const { channel, model } = resolveChannel(config, modelValue);
  const imageUrl = await fileToDataUrl(image);
  const body = {
    model,
    prompt,
    images: [imageUrl],
    n: 1,
  };
  // Prefer generations-with-images (many gateways); fall back to edits.
  let data;
  try {
    data = await apiJson(apiUrl(channel.baseUrl, "/images/generations"), {
      method: "POST",
      apiKey: channel.apiKey,
      body,
    });
  } catch {
    data = await apiJson(apiUrl(channel.baseUrl, "/images/edits"), {
      method: "POST",
      apiKey: channel.apiKey,
      body: { model, prompt, image: imageUrl },
    });
  }
  const item = data?.data?.[0] || data?.images?.[0] || data;
  const b64 = item?.b64_json || item?.base64;
  const url = item?.url;
  const out = resolve(args.out || defaultOut("image", prompt));
  if (b64) await saveDataUrl(`data:image/png;base64,${b64}`, out);
  else if (url) await downloadToFile(url, out, channel.apiKey);
  else throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 500)}`);
  console.log(JSON.stringify({ ok: true, kind: "edit", model: `${channel.id}::${model}`, out }, null, 2));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unwrapVideo(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) return { ...payload, ...payload.data };
  return payload;
}

async function generateVideo(args) {
  const { config } = await loadConfig(args);
  const prompt = args.prompt;
  if (!prompt) throw new Error("--prompt is required");
  const modelValue = args.model || pickDefaultModel(config, "video");
  const { channel, model } = resolveChannel(config, modelValue);
  if (!channel.apiKey) throw new Error(`Channel 「${channel.name}」 has empty apiKey`);
  const size = args.size || config.size || "16:9";
  const seconds = Math.max(1, Number(args.seconds || config.videoSeconds || 5) || 5);
  const body = {
    model,
    prompt,
    seconds,
    size: mapSize(size) || size,
    ratio: ratioOf(size),
    aspect_ratio: ratioOf(size),
    generate_audio: true,
    watermark: false,
  };
  if (args.image) {
    const imageRef = await fileToDataUrl(args.image);
    if (/^https?:\/\//i.test(imageRef)) body.image = imageRef;
    else throw new Error("Video reference image must be a public https URL (upload first). Local files are not accepted by most video gateways.");
  }
  const created = unwrapVideo(
    await apiJson(apiUrl(channel.baseUrl, "/videos"), {
      method: "POST",
      apiKey: channel.apiKey,
      body,
    }),
  );
  const taskId = created.id || created.task_id;
  if (!taskId) throw new Error(`No video task id: ${JSON.stringify(created).slice(0, 500)}`);

  let resultUrl = "";
  for (let i = 0; i < 180; i += 1) {
    await sleep(i < 3 ? 1500 : 3000);
    const polled = unwrapVideo(
      await apiJson(apiUrl(channel.baseUrl, `/videos/${taskId}`), {
        apiKey: channel.apiKey,
      }),
    );
    const status = String(polled.status || "").toLowerCase();
    const progress = polled.progress ?? polled.percent ?? "";
    process.stderr.write(`\r[video] ${status || "pending"} ${progress}${progress === "" ? "" : "%"}   `);
    if (VIDEO_FAIL.has(status)) throw new Error(polled.error?.message || polled.message || `Video failed (${status})`);
    if (VIDEO_DONE.has(status)) {
      resultUrl = polled.url || polled.result_url || polled.video_url || polled.output_url || "";
      break;
    }
  }
  process.stderr.write("\n");
  const out = resolve(args.out || defaultOut("video", prompt));
  if (resultUrl) await downloadToFile(resultUrl, out, channel.apiKey);
  else {
    // Some gateways only expose /content
    await downloadToFile(apiUrl(channel.baseUrl, `/videos/${taskId}/content`), out, channel.apiKey);
  }
  console.log(JSON.stringify({ ok: true, kind: "video", model: `${channel.id}::${model}`, taskId, out }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || args.help || args.h) {
    console.log(usage());
    process.exit(cmd ? 0 : 1);
  }
  if (cmd === "config") return cmdConfig(args);
  if (cmd === "models") return cmdModels(args);
  if (cmd === "image") return generateImage(args);
  if (cmd === "edit") return editImage(args);
  if (cmd === "video") return generateVideo(args);
  throw new Error(`Unknown command: ${cmd}\n${usage()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
