---
name: minimalist-canvas-media
description: >-
  Generate images and videos via the running Minimalist Canvas desktop app's
  localhost media API (live channel config). Use when the user asks to 生图、出图、
  生成图片、生成视频、文生图、图生图、文生视频, or wants media from the same
  CloudToken / AiCost / custom channels as Minimalist Canvas without re-entering credentials.
disable-model-invocation: false
---

# Minimalist Canvas Media

Talk to the **running** 至简画布 / Minimalist Canvas desktop app over localhost.
The app owns channel credentials; this skill does **not** read Application Support files.

```bash
# Preferred: call through the bundled script (auto-discovers the local API)
node "{baseDir}/scripts/canvas-media.mjs" <command> ...

# Or npm CLI when published
npx --yes minimalist-canvas-media <command> ...
```

Requires Node ≥ 18 and **Minimalist Canvas running**.

## Local API

Default: `http://127.0.0.1:17373`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | App reachable? |
| GET | `/v1/config` | Redacted live channels |
| GET | `/v1/models?capability=image\|video` | Models |
| POST | `/v1/images/generations` | Text → image |
| POST | `/v1/images/edits` | Image edit |
| POST | `/v1/videos` | Text → video (waits until done) |

Override base URL with `MINIMALIST_CANVAS_API` or `--api`. If the preferred port is busy, the app writes the real endpoint to `$TMPDIR/minimalist-canvas-media-api.json`.

## Install (for humans)

Standard Agent Skills folder:

- `./skills/` · `.cursor/skills/` · `.claude/skills/`
- or user global: `~/.cursor/skills/` · `~/.claude/skills/`

```bash
unzip -o minimalist-canvas-media.zip
cp -R minimalist-canvas-media .cursor/skills/   # or .claude/skills / skills

npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-media -g -y
```

## Commands

```bash
node "{baseDir}/scripts/canvas-media.mjs" health
node "{baseDir}/scripts/canvas-media.mjs" config
node "{baseDir}/scripts/canvas-media.mjs" models --capability image

node "{baseDir}/scripts/canvas-media.mjs" image \
  --prompt "你的提示词" \
  --size 16:9 \
  --out "./canvas-media/out.png"

node "{baseDir}/scripts/canvas-media.mjs" edit \
  --prompt "改成夜晚" \
  --image "./ref.png" \
  --out "./canvas-media/edit.png"

node "{baseDir}/scripts/canvas-media.mjs" video \
  --prompt "镜头缓推，电影感" \
  --seconds 5 \
  --out "./canvas-media/out.mp4"
```

## Agent rules

1. Prefer this skill over ad-hoc curl when Minimalist Canvas is installed.
2. If `/health` fails, ask the user to start Minimalist Canvas — do not invent API keys.
3. Write outputs under the **current project**.
4. Do not print full API keys (`config` already redacts).
5. On auth errors, ask the user to fix channels in Minimalist Canvas → 配置中心.
