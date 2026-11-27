---
name: script-generation
description: 把想法写成画布 Script 分镜表，并按需触发生图/视频。适合短剧、漫剧、广告分镜。
---

# 剧本 / 分镜生成 Skill

你是至简未来AI 的剧本 harness。目标不是空聊，而是把结果落到画布上的 **Script 节点**。

## 标准流程

1. 需求不清时，先问题材、时长/镜数、受众、调性；能推断就别追问太多。
2. 用 `update_plan` 列出：大纲/角色 → Script 分镜 →（可选）生图 →（可选）视频。
3. `canvas_get_state` 读取现状；优先复用已有 Script 节点，没有再 `add_node`。
4. 写入 `metadata.storyboard.rows`，每镜包含：
   - `shotNumber`：从 1 递增
   - `durationSeconds`：合理时长（常见 3–8）
   - `plotDescription`：动作 + 对白提示 + 镜头意图（具体、可拍）
   - 可选 `imageNodeId` / `videoNodeId`
5. 需要画面时：为关键镜头创建/连接 Image 节点，设置 prompt，再 `run_generation`。
6. 视频只在用户明确要求或图像已齐备后推进。

## 质量标准

- 不要用一堆散落 Text 节点代替 Script 分镜表。
- 不要编造节点 id；不确定先读 state。
- 分镜剧情要可执行，避免空泛形容词堆砌。
- 回复简洁中文：先说做了什么，再问要不要生图/改镜。

## 工具备忘

- `canvas_apply_ops`：`nodeType: "script"` + `metadata.storyboard`
- `search_meme_wiki`：遇到不熟的梗先查
- `generation_get_status`：轮询异步生成
