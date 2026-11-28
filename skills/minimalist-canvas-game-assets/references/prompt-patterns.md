# 提示词模式

在至简画布渠道上生成时，把约束写进 prompt，而不是依赖第三方站点的模板 ID。

## 画风锚点（择一写清）

- **HD2D**：`HD-2D game character, crisp outlines, stable color blocks, soft contact shadow, full body`
- **像素**：`pixel art sprite, visible pixels, limited palette, no anti-aliasing, game ready`
- **厚涂立绘**：`game character illustration, clean silhouette, production art`

## 透明与构图

- `isolated on transparent background` 或 `solid #00FF00 chroma key background`（后续本地抠图）
- `centered, full body in frame, consistent proportions, empty margin around silhouette`
- 避免：风景大背景、复杂地面透视（除非用户要场景）

## 一致性

- 锁定：发型、服装主色、标志性道具、体型关键词。
- 多张任务重复同一角色锁定句；换朝向/动作时只改方向与动作子句。

## 尺寸

- 通用设定图：按渠道支持的 `1:1` / `1024x1024` 等。
- 像素角色：在 prompt 中写目标像素（如 `64x64 sprite`）；超预算素材先停，征得同意再缩放或重出。

## 负面（若渠道支持）

`blurry, photo, watermark, text, cropped head, extra limbs, busy background`
