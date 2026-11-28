---
name: minimalist-canvas-media
description: >-
  Generate images and videos using the user's Minimalist Canvas desktop AI
  channels (OpenAI-compatible base URL + API key already configured in the app).
  Use when the user asks to 生图、出图、生成图片、生成视频、文生图、图生图、文生视频,
  or wants media from the same CloudToken / AiCost / custom channels as
  Minimalist Canvas without re-entering credentials.
disable-model-invocation: false
---

# Minimalist Canvas Media

Reuse **至简画布 / Minimalist Canvas** desktop channel credentials from any local Cursor project to generate images and videos.

`{baseDir}` = this skill directory. CLI:

```bash
node "{baseDir}/scripts/canvas-media.mjs" <command> ...
```

Requires Node >= 18. Zero npm dependencies.

## When to use

- User wants an image or video and already uses Minimalist Canvas
- User says “用画布的渠道 / CloudToken / aicost 出图/出视频”
- Avoid inventing new API keys; prefer the app’s saved config

## Config source

Default macOS path:

`~/Library/Application Support/com.lingbyte.minimalist-canvas/app_state/minimalist-canvas_ai_config_store.json`

Override:

- env `MINIMALIST_CANVAS_DATA_DIR`
- or `--data-dir /path/to/com.lingbyte.minimalist-canvas`

The app must already have at least one channel with `baseUrl` + `apiKey` and image/video models.

## Step 0 — Inspect config (once per machine / when unsure)

```bash
node "{baseDir}/scripts/canvas-media.mjs" config
node "{baseDir}/scripts/canvas-media.mjs" models --capability image
node "{baseDir}/scripts/canvas-media.mjs" models --capability video
```

Do **not** print full API keys in chat. The CLI redacts keys in `config` output.

If config is missing or `baseUrl` empty: tell the user to open Minimalist Canvas → 配置中心 → 渠道, then retry.

## Generate image (text-to-image)

```bash
node "{baseDir}/scripts/canvas-media.mjs" image \
  --prompt "你的提示词" \
  --out "./out/hero.png"
```

Optional:

- `--model "<channelId>::<modelName>"` (from `models --capability image`; default = canvas `imageModel`)
- `--size 16:9|9:16|1:1|1024x1024`
- `--quality auto|high|medium|low`

CLI prints JSON `{ ok, kind, model, out }`. Show the user the `out` path and that the file was written.

## Edit image (image + prompt)

```bash
node "{baseDir}/scripts/canvas-media.mjs" edit \
  --prompt "改成夜晚霓虹" \
  --image "./refs/character.png" \
  --out "./out/edit.png"
```

## Generate video

```bash
node "{baseDir}/scripts/canvas-media.mjs" video \
  --prompt "镜头缓缓推近，电影感光影" \
  --seconds 5 \
  --size 16:9 \
  --out "./out/clip.mp4"
```

Optional:

- `--model "<channelId>::<modelName>"` (default = canvas `videoModel`)
- `--image https://...` public reference image URL only (local files are rejected by most video gateways)

Progress logs go to stderr; final JSON to stdout.

## Agent rules

1. Prefer this skill over ad-hoc curl when Minimalist Canvas is installed on the machine.
2. Write outputs under the **current project** (`./canvas-media/` or a path the user asks for). Never write into the Canvas app data dir.
3. Keep prompts in the user’s language unless they ask otherwise.
4. On HTTP/auth errors, re-run `config` / `models` and ask the user to fix the channel in the app — do not invent alternate providers unless asked.
5. Do not commit API keys. Config is read only from the local app data file.

## Examples

User: “用画布渠道出一张 16:9 海报”

```bash
node "{baseDir}/scripts/canvas-media.mjs" image --prompt "极简产品海报，留白，衬线大标题" --size 16:9 --out "./canvas-media/poster.png"
```

User: “同一渠道生成 5 秒视频”

```bash
node "{baseDir}/scripts/canvas-media.mjs" video --prompt "城市日落航拍，缓慢推进" --seconds 5 --out "./canvas-media/sunset.mp4"
```
