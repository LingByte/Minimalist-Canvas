# 视频生成 (Video)

视频生成为 **异步任务**：先提交任务，再轮询状态直至完成，最后获取视频内容。

## 创建视频任务

**Endpoint:** `POST {baseUrl}/videos`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 视频模型名称，如 `dq-sd933-pro` |
| `prompt` | string | 是 | 视频描述文本 |
| `seconds` | number | 否 | 视频时长（秒），默认取决于模型 |
| `ratio` | string | 否 | 画面比例，如 `16:9`、`9:16` |

> **也支持 messages 格式**：如果不传 `prompt`，可传 `messages`（OpenAI chat 格式），网关会自动从 `messages[].content` 提取 prompt。

### 标准用法（推荐）

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dq-sd933-pro",
    "prompt": "A cat walking on a sunny beach, cinematic",
    "seconds": 4,
    "ratio": "16:9"
  }'
```

### messages 兼容用法

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dq-sd933-pro",
    "messages": [
      {"role": "user", "content": "A cat walking on a sunny beach, cinematic"}
    ]
  }'
```

网关会自动把 `messages` 内容提取为 `prompt` 后发给上游。

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
| `queued` / `pending` | 排队中 |
| `processing` / `in_progress` | 生成中 |
| `completed` | 已完成 |
| `failed` / `cancelled` | 失败或取消 |

## MaxForAI 渠道接入说明

MaxForAI 上游使用标准的 `prompt` 字段（不是 messages），支持的字段包括 `model`、`prompt`、`seconds`、`ratio`。

在管理后台新建渠道时：
- **类型**选 `MaxForAI`
- **Base URL**：`https://maxforai.top`（默认已填）
- **Key**：MaxForAI 令牌页的 API Key
- **模型**：视频模型如 `dq-sd933-pro`；聊天模型自行添加

聊天补全仍使用标准 OpenAI 路径：`POST {baseUrl}/chat/completions`（同一 MaxForAI 渠道即可）。

## OmegaAI 渠道接入说明

[ΩMEGA AI](https://omegaai.xin/) **仅支持异步视频 / 图片**（上游聊天接口当前不可用）。网关侧用 `POST {baseUrl}/videos` 提交，适配器转发到上游 `POST /v1/media/generate`。

轮询上游为 `GET /v1/tasks/{task_id}`。**成功状态是 `succeeded`（不是 `completed`）**；结果地址在 `result.url`（可能是相对路径，网关会自动补全）。

在管理后台新建渠道时：
- **类型**选 `OmegaAI`
- **Base URL**：`https://omegaai.xin`（默认已填）
- **Key**：用户中心生成的 API Key
- **模型**示例：
  - 异步图片：`gemini-3.1-flash-image-preview`
  - 视频：`seedance-v2-720p`、`cvk`、`db-ai-video-v1`、`sd-2-c3`、`d-ai-video-v3`、`seedance2.5-900`

视频 / 异步图片提交示例：

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-v2-720p",
    "prompt": "城市夜景延时摄影",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'
```

可选字段：`duration` / `seconds`、`aspect_ratio` / `ratio`、`resolution`、`images` / `videos` / `audios`（公网 URL 数组）、`auto_face_mask`。

> 上游文档里的 `POST /v1/images/generations` 与 `POST /v1/videos/generations` 是演示占位端点；真实生成请走本网关的 `/videos`（转发到 `/v1/media/generate`）。

## XManWay 渠道接入说明

[XManWay](https://newapi.xmanway.com/) 提供多种视频模型，支持两种请求格式：

| 格式 | 网关 Endpoint | 适用场景 |
|------|---------------|----------|
| OpenAI 视频格式 | `POST {baseUrl}/videos` | 文生视频、单图生视频 |
| 多参考格式 | `POST {baseUrl}/video/generations` | 多图 / 视频 / 音频参考 |

**模型：** `seedance-2.0`、`seedance-2.0-fast`、`minimax-h3`、`kling-3.0-omni`、`happyhorse`

OpenAI 格式成功状态为 `completed`；多参考格式为 `succeeded`。OpenAI 格式可用 `GET {baseUrl}/videos/{task_id}/content` 下载成品；多参考格式从轮询响应中获取 URL。

在管理后台新建渠道时：
- **类型**选 `XManWay`
- **Base URL**：`https://newapi.xmanway.com`（默认已填）
- **Key**：控制台生成的 API Key

OpenAI 格式示例：

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2.0",
    "prompt": "海边日落，镜头缓慢向前移动",
    "seconds": 8,
    "size": "1080p",
    "aspect_ratio": "16:9"
  }'
```

多参考格式示例：

```bash
curl {baseUrl}/video/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax-h3",
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

无公网素材 URL 时，可在 `input_reference` / `image_references` 等字段中声明 `type: "upload"`，按响应中的 `upload.slots` 上传文件后调用 `POST /v1/uploads/complete` 确认（请求体原样透传上游）。

## 注意事项

- 视频生成耗时较长，请轮询状态
- 渠道「测试」按钮会跳过视频 / 媒体模型以避免扣费，请用 curl 手动验证
- 可在控制台 **任务日志** 中查看历史记录
