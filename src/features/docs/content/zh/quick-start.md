# 快速开始

**至简未来 AI** 提供 **OpenAI 兼容** 的多模态 REST API。将 `{baseUrl}` 作为 Base URL，在任意支持 OpenAI SDK 的客户端中即可调用；同时支持 Claude、Gemini 原生格式与异步任务接口。

## 1. 获取 API Key

1. 登录控制台
2. 进入 **API Keys** 页面
3. 创建密钥并妥善保存（仅显示一次）

## 2. 发送第一个请求

```bash
curl {baseUrl}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 3. 使用 OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="{baseUrl}"
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

## 4. API 概览

`{baseUrl}` 已包含 `/v1`。下面列出当前可以用 **API Key** 调用的接口。请求头统一为 `Authorization: Bearer YOUR_API_KEY`。可用模型取决于管理员配置的渠道。

### 文本与模型

| 能力 | 方法 | 路径 | 文档 |
|------|------|------|------|
| 对话补全 | POST | `/chat/completions` | [对话补全](/docs/chat-completions) |
| 旧版补全 | POST | `/completions` | — |
| Responses | POST | `/responses` | [Responses](/docs/responses) |
| 压缩上下文 | POST | `/responses/compact` | [Responses](/docs/responses) |
| Claude 消息 | POST | `/messages` | [Claude Messages](/docs/claude-messages) |
| 模型列表 | GET | `/models` | [模型列表](/docs/models) |
| 单个模型 | GET | `/models/{model_id}` | [模型列表](/docs/models) |
| 内容审核 | POST | `/moderations` | — |
| 网页搜索 | POST | `/alpha/search` | [Responses](/docs/responses) |
| Gemini 生成 | POST | `/models/{model}:generateContent` | [模型列表](/docs/models) |

Claude 官方 SDK 也可以用 `x-api-key` 加 `anthropic-version` 调 `/messages` 和 `/models`。

### 图像、向量与排序

| 能力 | 方法 | 路径 | 文档 |
|------|------|------|------|
| 图像生成 | POST | `/images/generations` | [图像生成](/docs/image-generation) |
| 图像编辑 | POST | `/images/edits` | [图像生成](/docs/image-generation) |
| 图像编辑（兼容路径） | POST | `/edits` | [图像生成](/docs/image-generation) |
| 向量嵌入 | POST | `/embeddings` | [向量嵌入](/docs/embeddings) |
| 向量嵌入（路径指定模型） | POST | `/engines/{model}/embeddings` | [向量嵌入](/docs/embeddings) |
| 重排序 | POST | `/rerank` | [Rerank](/docs/rerank) |

### 音频

| 能力 | 方法 | 路径 | 文档 |
|------|------|------|------|
| 语音合成 | POST | `/audio/speech` | [音频接口](/docs/audio) |
| 语音识别 | POST | `/audio/transcriptions` | [音频接口](/docs/audio) |
| 语音翻译 | POST | `/audio/translations` | [音频接口](/docs/audio) |
| 语音合成（HTTP） | POST | `/tts` | [音频接口](/docs/audio) |
| Realtime | GET (WebSocket) | `/realtime` | — |
| 语音合成（WebSocket） | GET (WebSocket) | `/tts` | — |
| 语音识别（WebSocket） | GET (WebSocket) | `/asr` | — |

### 视频

异步任务返回 `task_id`，用对应的查询接口轮询。

| 能力 | 方法 | 路径 | 文档 |
|------|------|------|------|
| 创建视频 | POST | `/videos` | [视频生成](/docs/video) |
| 查询视频任务 | GET | `/videos/{task_id}` | [视频生成](/docs/video) |
| 下载视频内容 | GET | `/videos/{task_id}/content` | [视频生成](/docs/video) |
| 视频混剪 | POST | `/videos/{video_id}/remix` | [视频生成](/docs/video) |
| 多参考视频 | POST | `/video/generations` | [视频生成](/docs/video) |
| 查询多参考任务 | GET | `/video/generations/{task_id}` | [视频生成](/docs/video) |

### 余额、用量与日志

`{baseUrl}` 已包含 `/v1`。下面两条余额接口也可以不带 `/v1`，从站点根调用 `/dashboard/billing/...`。`/api/...` 不在 `{baseUrl}` 下，从站点根调用。

| 能力 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 余额 | GET | `/dashboard/billing/subscription` | OpenAI 兼容余额。`soft_limit_usd` / `hard_limit_usd` 按站点额度展示单位计算，无限额度返回一个很大的数。`access_until` 为过期时间（秒），`0` 表示不过期 |
| 已用额度 | GET | `/dashboard/billing/usage` | `total_usage` 是已用额度 × 100 |
| 当前密钥用量 | GET | `{origin}/api/usage/token` | 返回该 Key 的已用额度。无限额度看 `unlimited_quota`，剩余不会是负数 |
| 当前密钥日志 | GET | `{origin}/api/log/token` | 返回该 Key 最近的调用日志，不含渠道密钥 |

### 站点根路径（不在 `{baseUrl}` 下）

这些接口同样使用 API Key，但路径从站点根开始，不要再拼一次 `/v1`。

| 能力 | 方法 | 路径 | 说明 |
|------|------|------|------|
| Gemini 生成 | POST | `{origin}/v1beta/models/{model}:generateContent` | 原生 Gemini 请求体 |
| Gemini 模型列表 | GET | `{origin}/v1beta/models` | 使用 `x-goog-api-key` 或 `?key=` |
| OpenAI 格式模型列表 | GET | `{origin}/v1beta/openai/models` | 与 `GET /v1/models` 相同的列表格式 |
| Kling 文生视频 | POST | `/kling/v1/videos/text2video` | 可灵异步视频 |
| Kling 图生视频 | POST | `/kling/v1/videos/image2video` | 可灵图生视频 |
| Kling 查询文生视频 | GET | `/kling/v1/videos/text2video/{task_id}` | 轮询任务 |
| Kling 查询图生视频 | GET | `/kling/v1/videos/image2video/{task_id}` | 轮询任务 |
| Suno 提交 | POST | `/suno/submit/{action}` | 音乐生成 |
| Suno 批量查询 | POST | `/suno/fetch` | 按 ID 列表查询 |
| Suno 单个查询 | GET | `/suno/fetch/{id}` | 查询单个任务 |
| Midjourney 出图 | POST | `/mj/submit/imagine` | 文生图 |
| Midjourney 查询 | GET | `/mj/task/{id}/fetch` | 轮询任务 |
| 即梦提交 | POST | `/jimeng/` | 官方 Action 参数格式 |

> Files、Fine-tunes、图像变体目前未实现，调用会返回未实现错误。

## 5. 下一步

- [认证方式](/docs/authentication) — Bearer Token 与请求头
- [错误处理](/docs/errors) — 状态码与重试建议
- [对话补全](/docs/chat-completions) — Chat Completions API
- [视频生成](/docs/video) — 异步视频任务与轮询
