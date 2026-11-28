#!/usr/bin/env node
/**
 * Game-asset helpers for Minimalist Canvas.
 * Generation talks to the live desktop media API (same as canvas-media).
 * Extra commands: layout / mirror / mirror-dir / manifest.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

const DEFAULT_API = "http://127.0.0.1:17373";
const DISCOVERY_FILE = join(tmpdir(), "minimalist-canvas-media-api.json");

function usage() {
  return `Usage:
  node game-assets.mjs health
  node game-assets.mjs image --prompt "..." [--size 1:1] [--out path]
  node game-assets.mjs layout --name hero [--out ./game-assets]
  node game-assets.mjs mirror --in left.png --out right.png
  node game-assets.mjs mirror-dir --in ./directions --map left:right,frontLeft:frontRight,backLeft:backRight
  node game-assets.mjs manifest --root ./game-assets/hero

Requires Minimalist Canvas desktop running for health/image.
mirror needs Python 3 + Pillow (PIL), or macOS sips fallback for simple H-flip.
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
      `Cannot reach Minimalist Canvas at ${base} (${error instanceof Error ? error.message : error}). Start the desktop app first.`,
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
    const msg = data?.error?.message || data?.message || text || res.statusText;
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return data;
}

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function writeImageResult(data, outPath) {
  await ensureDir(outPath);
  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (b64) {
    await writeFile(outPath, Buffer.from(b64, "base64"));
    return outPath;
  }
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    await pipeline(res.body, createWriteStream(outPath));
    return outPath;
  }
  throw new Error("No image payload in response");
}

async function cmdHealth(args) {
  const base = await resolveApiBase(args);
  const data = await apiJson(base, "/health");
  console.log(JSON.stringify({ ok: true, api: base, ...data }, null, 2));
}

async function cmdImage(args) {
  const prompt = args.prompt;
  if (!prompt) throw new Error("--prompt is required");
  const base = await resolveApiBase(args);
  const body = {
    prompt: String(prompt),
    size: args.size || "1:1",
  };
  if (args.model) body.model = String(args.model);
  if (args.quality) body.quality = String(args.quality);
  const data = await apiJson(base, "/v1/images/generations", { method: "POST", body });
  const out = resolve(String(args.out || "./game-assets/out.png"));
  await writeImageResult(data, out);
  console.log(JSON.stringify({ ok: true, out }, null, 2));
}

async function cmdLayout(args) {
  const name = String(args.name || "character").replace(/[^\w.-]+/g, "-");
  const root = resolve(String(args.out || "./game-assets"), name);
  const dirs = ["refs", "directions", "actions/walk", "actions/run", "actions/idle", "actions/attack", "effects", "props"];
  for (const dir of dirs) await mkdir(join(root, dir), { recursive: true });
  const manifest = {
    name,
    style: "",
    directions: {},
    actions: { walk: {}, run: {}, idle: {}, attack: {} },
    effects: {},
    props: {},
  };
  await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, root }, null, 2));
}

function flipWithPython(inPath, outPath) {
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(inPath)})
im.transpose(Image.FLIP_LEFT_RIGHT).save(${JSON.stringify(outPath)})
`;
  const result = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "python3 mirror failed (need Pillow)");
  }
}

function flipWithSips(inPath, outPath) {
  // sips flips in place — copy first
  const resultCopy = spawnSync("cp", [inPath, outPath], { encoding: "utf8" });
  if (resultCopy.status !== 0) throw new Error(resultCopy.stderr || "cp failed");
  const result = spawnSync("sips", ["--flip", "horizontal", outPath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "sips mirror failed");
}

async function mirrorFile(inPath, outPath) {
  await ensureDir(outPath);
  try {
    flipWithPython(inPath, outPath);
  } catch (pyErr) {
    try {
      flipWithSips(inPath, outPath);
    } catch (sipsErr) {
      throw new Error(
        `mirror failed.\nPython: ${pyErr instanceof Error ? pyErr.message : pyErr}\nsips: ${sipsErr instanceof Error ? sipsErr.message : sipsErr}`,
      );
    }
  }
}

async function cmdMirror(args) {
  const inPath = resolve(String(args.in || ""));
  const outPath = resolve(String(args.out || ""));
  if (!args.in || !args.out) throw new Error("--in and --out are required");
  await mirrorFile(inPath, outPath);
  console.log(JSON.stringify({ ok: true, in: inPath, out: outPath }, null, 2));
}

async function cmdMirrorDir(args) {
  const dir = resolve(String(args.in || ""));
  const mapRaw = String(args.map || "left:right,frontLeft:frontRight,backLeft:backRight");
  const pairs = mapRaw.split(",").map((part) => part.trim()).filter(Boolean);
  const results = [];
  for (const pair of pairs) {
    const [srcKey, dstKey] = pair.split(":").map((s) => s.trim());
    if (!srcKey || !dstKey) continue;
    const files = await readdir(dir);
    const src = files.find((f) => basename(f, extname(f)) === srcKey);
    if (!src) {
      results.push({ srcKey, skipped: true, reason: "source missing" });
      continue;
    }
    const ext = extname(src) || ".png";
    const outPath = join(dir, `${dstKey}${ext}`);
    await mirrorFile(join(dir, src), outPath);
    results.push({ srcKey, dstKey, out: outPath });
  }
  console.log(JSON.stringify({ ok: true, dir, results }, null, 2));
}

async function collectPngs(dir) {
  try {
    const files = await readdir(dir);
    return files.filter((f) => /\.(png|webp|gif|jpe?g)$/i.test(f)).sort();
  } catch {
    return [];
  }
}

async function cmdManifest(args) {
  const root = resolve(String(args.root || "."));
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  } catch {
    manifest = { name: basename(root) };
  }
  const directions = {};
  for (const file of await collectPngs(join(root, "directions"))) {
    directions[basename(file, extname(file))] = `directions/${file}`;
  }
  const actions = {};
  for (const action of ["walk", "run", "idle", "attack"]) {
    const files = await collectPngs(join(root, "actions", action));
    actions[action] = Object.fromEntries(files.map((f) => [basename(f, extname(f)), `actions/${action}/${f}`]));
  }
  manifest.directions = directions;
  manifest.actions = actions;
  manifest.updatedAt = new Date().toISOString();
  await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, root, manifest }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || args.help || args.h) {
    console.log(usage());
    process.exit(cmd ? 0 : 1);
  }
  switch (cmd) {
    case "health":
      await cmdHealth(args);
      break;
    case "image":
      await cmdImage(args);
      break;
    case "layout":
      await cmdLayout(args);
      break;
    case "mirror":
      await cmdMirror(args);
      break;
    case "mirror-dir":
      await cmdMirrorDir(args);
      break;
    case "manifest":
      await cmdManifest(args);
      break;
    default:
      console.error(usage());
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
