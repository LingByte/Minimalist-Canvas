---
name: minimalist-canvas-game-assets
description: >-
  Create game art packs with Minimalist Canvas: HD2D/pixel characters, turnaround
  and 8-direction sheets, walk/run/idle/attack action sets, VFX, props, and tiles.
  Use when the user asks for 游戏素材、角色八方向、动作包、立绘三视图、特效序列、
  像素角色、HD2D、sprite sheet, or game asset pipelines on this platform.
disable-model-invocation: false
---

# Minimalist Canvas · 游戏素材

本 skill 负责游戏向素材流水线；生图/视频一律走正在运行的桌面端本机媒体 API（与 `minimalist-canvas-media` 同一通道），不读固定数据目录、不调用第三方游戏站账号。

```bash
# 健康检查 / 生图（本包自带薄封装）
node "{baseDir}/scripts/game-assets.mjs" health
node "{baseDir}/scripts/game-assets.mjs" image --prompt "..." --out ./game-out/char.png

# 也可复用媒体 skill CLI（若已安装）
node path/to/minimalist-canvas-media/scripts/canvas-media.mjs image --prompt "..." --out ./out.png
```

需要 **Minimalist Canvas 桌面端在跑**（默认 `http://127.0.0.1:17373`）。

## 先选路

读 [选路](references/routes.md)。不要把短剧视觉设定或小说大纲任务硬套成游戏动作包。

| 目标 | 参考 |
|------|------|
| 角色设定图、三视图、八方向朝向图 | [角色表](references/character-sheet.md) |
| 走 / 跑 / 待机 / 攻击等动作包 | [动作包](references/action-pack.md) |
| 特效、道具、场景块、贴图 | [特效与道具](references/effects-props.md) |
| 提示词写法、透明底、像素约束 | [提示词模式](references/prompt-patterns.md) |

## Agent 规则

1. 先确认画风（HD2D / 像素 / 厚涂立绘）、透明底需求、方向数（4 或 8）、动作范围与输出目录。
2. `/health` 失败时请用户打开至简画布桌面端，**不要编造 API Key**。
3. 优先正方形或游戏常用比例参考（角色表常用 1:1）；提示词写清「transparent background / pure chroma」并在交付时核对边缘。
4. **八方向默认策略**：生成前、后、左、左下、左上五向，再用脚本水平镜像补右 / 右下 / 右上；用户要求非对称持手或单侧配件时改为八向分别生成。
5. 一次只跑一个生成任务；失败先查本机任务/输出目录，不盲目重提一整包。
6. 成果写在**当前项目**下（建议 `game-assets/<name>/`），交付时给出路径与 `manifest.json`。
7. 换皮/序列若单帧画布超过用户约定的像素预算（常见像素角色 **≤64×64**），先停并报告尺寸，不偷偷缩放糊弄验收。

## 推荐目录

```text
game-assets/<character>/
├── refs/                 # 参考与选中的设定图
├── directions/           # front back left ... (+ mirrored)
├── actions/
│   ├── walk/
│   ├── run/
│   ├── idle/
│   └── attack/
├── effects/              # 可选特效序列
└── manifest.json
```

```bash
node "{baseDir}/scripts/game-assets.mjs" layout --name hero --out ./game-assets
node "{baseDir}/scripts/game-assets.mjs" mirror --in ./game-assets/hero/directions/left.png --out ./game-assets/hero/directions/right.png
```

## 安装

标准 Agent Skills 目录：`./skills/` · `.cursor/skills/` · `.claude/skills/`（或用户级 `~/.cursor/skills/` 等）。

```bash
npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-game-assets -g -y
```

也可从至简画布「外部接入」页下载 zip。
