# minimalist-canvas-media

用 **至简画布 / Minimalist Canvas** 桌面端已配置好的 AI 渠道（CloudToken / AiCost / 自定义 OpenAI 兼容网关）在任意项目里生图、生视频。

提供两样东西：

1. **CLI** — `npx` / 全局安装后直接出图出视频  
2. **Agent Skill** — 给 Cursor / Claude Code 等代理自动调用

零运行时依赖，Node ≥ 18。

## 安装

### A. 只当命令行用（推荐先试）

```bash
# 临时跑，不装进项目
npx minimalist-canvas-media config
npx minimalist-canvas-media models --capability image
npx minimalist-canvas-media image --prompt "极简海报" --out ./out.png
npx minimalist-canvas-media video --prompt "日落航拍" --seconds 5 --out ./out.mp4

# 或装到本机
npm i -g minimalist-canvas-media
canvas-media image --prompt "…" --out ./out.png
```

### B. 装成 Cursor / 其他 Agent 的 Skill

用官方 [skills](https://github.com/vercel-labs/skills) 从本仓库安装：

```bash
# 装到当前项目（可提交进 git）
npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-media -a cursor -y

# 装到本机全局（所有项目可用）
npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-media -g -a cursor -y
```

或从 npm 依赖同步：

```bash
npm i -D minimalist-canvas-media skills
npx skills experimental_sync -a cursor -y
```

装好后在 Cursor 里说：「用画布渠道生图 / 用 minimalist-canvas-media」。

## 前置条件

本机已安装并配置过 [Minimalist Canvas](https://github.com/LingByte/Minimalist-Canvas) 桌面端，渠道里有 `baseUrl` + `apiKey` 以及 image/video 模型。

默认读取（macOS）：

```text
~/Library/Application Support/com.lingbyte.minimalist-canvas/app_state/minimalist-canvas_ai_config_store.json
```

可用环境变量覆盖：

```bash
export MINIMALIST_CANVAS_DATA_DIR="/path/to/com.lingbyte.minimalist-canvas"
```

## CLI

```bash
canvas-media config
canvas-media models [--capability image|video|text|audio]
canvas-media image --prompt "…" [--model id] [--size 16:9] [--out path]
canvas-media edit  --prompt "…" --image ./ref.png [--out path]
canvas-media video --prompt "…" [--seconds 5] [--size 16:9] [--image https://…] [--out path]
```

`config` 输出会脱敏 API Key。

## 包布局（给 skills / npm）

```text
skills/cursor-media/
├── package.json
├── bin/canvas-media.mjs          # npm bin
└── skills/minimalist-canvas-media/
    ├── SKILL.md                  # Agent skill
    └── scripts/canvas-media.mjs
```

## 发布（维护者）

```bash
cd skills/cursor-media
npm publish --access public
```

发版后其他人即可：

```bash
npx minimalist-canvas-media image --prompt "hello" --out ./x.png
npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-media -g -a cursor -y
```
