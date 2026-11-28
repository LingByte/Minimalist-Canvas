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

Reuse **至简画布 / Minimalist Canvas** desktop channel credentials from any local project.

Prefer the published CLI when available; fall back to the bundled script.

```bash
# Preferred (after npm i -g / npx)
npx --yes minimalist-canvas-media <command> ...
# or
canvas-media <command> ...

# Fallback when this skill folder is installed locally
node "{baseDir}/scripts/canvas-media.mjs" <command> ...
```

Requires Node ≥ 18. Zero npm dependencies for the CLI itself.

## Install (for humans)

```bash
# CLI only
npm i -g minimalist-canvas-media

# Cursor / agent skill from GitHub
npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-media -g -a cursor -y
```

## When to use

- User wants an image or video and already uses Minimalist Canvas
- User says “用画布的渠道 / CloudToken / aicost 出图/出视频”
- Avoid inventing new API keys; prefer the app’s saved config

## Config source

Default macOS path:

`~/Library/Application Support/com.lingbyte.minimalist-canvas/app_state/minimalist-canvas_ai_config_store.json`

Override with `MINIMALIST_CANVAS_DATA_DIR` or `--data-dir`.

## Commands

```bash
npx --yes minimalist-canvas-media config
npx --yes minimalist-canvas-media models --capability image
npx --yes minimalist-canvas-media models --capability video

npx --yes minimalist-canvas-media image \
  --prompt "你的提示词" \
  --size 16:9 \
  --out "./canvas-media/out.png"

npx --yes minimalist-canvas-media edit \
  --prompt "改成夜晚" \
  --image "./ref.png" \
  --out "./canvas-media/edit.png"

npx --yes minimalist-canvas-media video \
  --prompt "镜头缓推，电影感" \
  --seconds 5 \
  --out "./canvas-media/out.mp4"
```

Optional `--model "<channelId>::<modelName>"` from `models` output. Defaults to canvas `imageModel` / `videoModel`.

Video `--image` must be a public `https://` URL.

## Agent rules

1. Prefer this skill over ad-hoc curl when Minimalist Canvas is installed.
2. Write outputs under the **current project**. Never write into the Canvas app data dir.
3. Do not print full API keys (`config` already redacts).
4. On auth errors, ask the user to fix channels in Minimalist Canvas → 配置中心.
