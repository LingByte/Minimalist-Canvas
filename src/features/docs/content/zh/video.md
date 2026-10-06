# 视频生成 (Video)

视频生成为 **异步任务**：先提交任务，再轮询状态直至完成，最后获取视频内容。

> **不同模型的参数不一样。** 画面比例有的模型用 `ratio`，有的用 `aspect_ratio`；时长有的用 `seconds`，有的用 `duration`，还有的模型时长固定。请先在下方 [模型与参数](#模型与参数) 中找到你要用的模型，再按对应说明传参。模型列表会根据当前可用的模型实时更新。

## 创建视频任务

**Endpoint:** `POST {baseUrl}/videos`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 视频模型名称，见 [模型与参数](#模型与参数) |
| `prompt` | string | 是 | 视频描述文本 |
| 时长、比例等 | — | 否 | 字段名因模型而异，见 [模型与参数](#模型与参数) |

> **也支持 messages 格式**：如果不传 `prompt`，可传 `messages`（OpenAI chat 格式），网关会自动从 `messages[].content` 提取 prompt。

### 标准用法（推荐）

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:standard}}",
    "prompt": "A cat walking on a sunny beach, cinematic",
    "seconds": 4,
    "ratio": "16:9"
  }'
```

### 响应示例

```json
{
  "id": "video_abc123",
  "object": "video",
  "status": "queued"
}
```

## 查询任务状态

**Endpoint:** `GET {baseUrl}/videos/{task_id}`

```bash
curl {baseUrl}/videos/video_abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 获取视频内容

任务完成后，通过内容代理下载：

**Endpoint:** `GET {baseUrl}/videos/{task_id}/content`

## 任务状态说明

| 状态 | 说明 |
|------|------|
| `queued` | 排队中 |
| `in_progress` | 生成中 |
| `completed` | 已完成（多参考格式 `/video/generations` 为 `succeeded`） |
| `failed` | 失败 |

## 模型与参数

### 标准视频模型

**可用模型：** {{videoModels:standard}}

| 字段 | 说明 |
|------|------|
| `prompt` | 视频描述；也可以用 `messages` 代替 |
| `seconds` | 时长（秒），可选值取决于模型 |
| `ratio` | 画面比例，如 `16:9`、`9:16`（注意是 `ratio`，不是 `size`） |

请求示例见上方 [标准用法](#标准用法推荐)。

### 视频 / 异步图片模型

**可用模型：** {{videoModels:media}}

这组模型既有视频模型也有异步图片模型，都通过 `POST {baseUrl}/videos` 提交，查询和下载方式与上文一致。

| 字段 | 说明 |
|------|------|
| `duration` / `seconds` | 时长（秒），两者任选其一 |
| `aspect_ratio` / `ratio` | 画面比例，如 `16:9` |
| `resolution` | 分辨率，如 `720p` |
| `images` / `videos` / `audios` | 参考素材，公网可访问的 URL 数组 |
| `auto_face_mask` | 是否自动遮挡人脸 |

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:media}}",
    "prompt": "城市夜景延时摄影",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'
```

### 多参考视频模型

**可用模型：** {{videoModels:multi_reference}}

这组模型支持两种提交方式：

| 方式 | Endpoint | 适用场景 | 成功状态 |
|------|----------|----------|----------|
| 标准格式 | `POST {baseUrl}/videos` | 文生视频、单图参考 | `completed` |
| 多参考格式 | `POST {baseUrl}/video/generations` | 多图 / 视频 / 音频参考 | `succeeded` |

标准格式字段：`seconds`（时长）、`size`（分辨率，如 `1080p`）、`aspect_ratio`（画面比例），单张参考图用 `images` 或 `input_reference.image_url`。可用 `GET {baseUrl}/videos/{task_id}/content` 下载成品。

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:multi_reference}}",
    "prompt": "海边日落，镜头缓慢向前移动",
    "seconds": 8,
    "size": "1080p",
    "aspect_ratio": "16:9"
  }'
```

多参考格式字段：`duration`（时长）、`resolution`（分辨率）、`aspect_ratio`（画面比例）、`image_references`（参考图 URL 数组）。通过 `GET {baseUrl}/video/generations/{task_id}` 查询，成品地址在响应的 `url` 字段中。

```bash
curl {baseUrl}/video/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:multi_reference}}",
    "prompt": "让图像1中的人物走向图像2中的建筑",
    "duration": 10,
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "image_references": [
      "https://example.com/image-1.jpg",
      "https://example.com/image-2.jpg"
    ]
  }'
```

参考素材请使用公网可访问的 URL。

### 30 秒长视频模型

**可用模型：** {{videoModels:fixed_30s}}

| 字段 | 说明 |
|------|------|
| `ratio` | 画面比例，仅支持 `16:9`、`9:16`、`1:1`、`3:4`、`4:3`、`21:9`；不传或传其他值时按 `16:9` 生成。也兼容 `aspect_ratio` |
| `seconds` | **固定为 30 秒**，传入其他值会被忽略 |
| `images` | 参考图，最多 9 张，仅支持 JPG / PNG，单边不超过 8192 像素，总大小不超过 50 MB |

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:fixed_30s}}",
    "prompt": "A cat walking on a sunny beach, cinematic",
    "ratio": "9:16"
  }'
```

## 注意事项

- 视频生成耗时较长，请轮询状态
- 可在控制台 **任务日志** 中查看历史记录
