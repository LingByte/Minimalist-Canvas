#!/usr/bin/env node
/**
 * Call the running Minimalist Canvas desktop app over localhost.
 * The app exposes a media API (default http://127.0.0.1:17373) that uses
 * live in-app channel config — no hardcoded Application Support path.
 *
 * Zero npm deps (Node >= 18).
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const DEFAULT_API = "http://127.0.0.1:17373";
const DISCOVERY_FILE = join(tmpdir(), "minimalist-canvas-media-api.json");

function usage() {
  return `Usage:
  node canvas-media.mjs health
  node canvas-media.mjs config
  node canvas-media.mjs models [--capability image|video|text|audio]
  node canvas-media.mjs image --prompt "..." [--model id] [--size 16:9|1024x1024] [--quality auto] [--out path]
  node canvas-media.mjs video --prompt "..." [--model id] [--seconds 5] [--size 16:9] [--image path|url] [--out path]
  node canvas-media.mjs edit --prompt "..." --image path|url [--model id] [--out path]

Requires Minimalist Canvas desktop to be running.

Env / flags:
  MINIMALIST_CANVAS_API   base URL (default ${DEFAULT_API})
  --api <url>             same as env
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

async function resolveApiBase(args) {
  const fromFlag = args.api || process.env.MINIMALIST_CANVAS_API;
  if (fromFlag) return String(fromFlag).replace(/\/+$/, "");
  try {
    const raw = JSON.parse(await readFile(DISCOVERY_FILE, "utf8"));
    if (raw?.endpoint) return String(raw.endpoint).replace(/\/+$/, "");
  } catch {
    // ignore
  }
  return DEFAULT_API;
}

async function apiJson(base, path, { method = "GET", body } = {}) {
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(
      `Cannot reach Minimalist Canvas media API at ${base} (${error instanceof Error ? error.message : error}). Start the desktop app first.`,
    );
  }
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
  if (!match) throw new Error("Expected data URL media");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(match[2], "base64"));
  return outPath;
}

async function downloadToFile(url, outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  const res = await fetch(url);
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

async function saveImageResult(data, out) {
  const item = data?.data?.[0] || data?.images?.[0] || data;
  const dataUrl = item?.data_url;
  const b64 = item?.b64_json || item?.base64;
  const url = item?.url;
  if (dataUrl?.startsWith("data:")) return saveDataUrl(dataUrl, out);
  if (b64) return saveDataUrl(`data:image/png;base64,${b64}`, out);
  if (url) return downloadToFile(url, out);
  throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 500)}`);
}

async function cmdHealth(base) {
  const data = await apiJson(base, "/health");
  console.log(JSON.stringify({ ...data, api: base }, null, 2));
}

async function cmdConfig(base) {
  const data = await apiJson(base, "/v1/config");
  console.log(JSON.stringify({ api: base, ...data }, null, 2));
}

async function cmdModels(base, args) {
  const capability = args.capability ? `?capability=${encodeURIComponent(args.capability)}` : "";
  const data = await apiJson(base, `/v1/models${capability}`);
  console.log(JSON.stringify(data, null, 2));
}

async function generateImage(base, args) {
  const prompt = args.prompt;
  if (!prompt) throw new Error("--prompt is required");
  const body = {
    prompt,
    ...(args.model ? { model: args.model } : {}),
    ...(args.size ? { size: args.size } : {}),
    ...(args.quality ? { quality: args.quality } : {}),
    ...(args.n ? { n: Number(args.n) } : {}),
  };
  const data = await apiJson(base, "/v1/images/generations", { method: "POST", body });
  const out = resolve(args.out || defaultOut("image", prompt));
  await saveImageResult(data, out);
  console.log(JSON.stringify({ ok: true, kind: "image", api: base, out }, null, 2));
}

async function editImage(base, args) {
  const prompt = args.prompt;
  const image = args.image;
  if (!prompt || !image) throw new Error("--prompt and --image are required");
  const imageUrl = await fileToDataUrl(image);
  const body = {
    prompt,
    image: imageUrl,
    ...(args.model ? { model: args.model } : {}),
  };
  const data = await apiJson(base, "/v1/images/edits", { method: "POST", body });
  const out = resolve(args.out || defaultOut("image", prompt));
  await saveImageResult(data, out);
  console.log(JSON.stringify({ ok: true, kind: "edit", api: base, out }, null, 2));
}

async function generateVideo(base, args) {
  const prompt = args.prompt;
  if (!prompt) throw new Error("--prompt is required");
  const body = {
    prompt,
    ...(args.model ? { model: args.model } : {}),
    ...(args.size ? { size: args.size } : {}),
    ...(args.seconds ? { seconds: Number(args.seconds) } : {}),
  };
  if (args.image) {
    const imageRef = await fileToDataUrl(args.image);
    if (!/^https?:\/\//i.test(imageRef)) {
      throw new Error("Video reference image must be a public https URL (upload first).");
    }
    body.image = imageRef;
  }
  const data = await apiJson(base, "/v1/videos", { method: "POST", body });
  const out = resolve(args.out || defaultOut("video", prompt));
  if (data?.data_url?.startsWith("data:")) await saveDataUrl(data.data_url, out);
  else if (data?.url) await downloadToFile(data.url, out);
  else throw new Error(`No video in response: ${JSON.stringify(data).slice(0, 500)}`);
  console.log(JSON.stringify({ ok: true, kind: "video", api: base, out }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || args.help || args.h) {
    console.log(usage());
    process.exit(cmd ? 0 : 1);
  }
  const base = await resolveApiBase(args);
  if (cmd === "health") return cmdHealth(base);
  if (cmd === "config") return cmdConfig(base);
  if (cmd === "models") return cmdModels(base, args);
  if (cmd === "image") return generateImage(base, args);
  if (cmd === "edit") return editImage(base, args);
  if (cmd === "video") return generateVideo(base, args);
  throw new Error(`Unknown command: ${cmd}\n${usage()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
