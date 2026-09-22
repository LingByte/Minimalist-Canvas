# Quick Start

**Simplest Future AI** exposes an **OpenAI-compatible** multimodal REST API. Use `{baseUrl}` as your base URL in any OpenAI SDK client. Claude, Gemini native formats, and async task APIs are also supported.

## 1. Get an API Key

1. Sign in to the console
2. Open **API Keys**
3. Create a key and store it securely (shown only once)

## 2. Send your first request

```bash
curl {baseUrl}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 3. Use the OpenAI SDK

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

## 4. API overview

`{baseUrl}` already includes `/v1`. These are the endpoints you can call with an **API Key** today. Send `Authorization: Bearer YOUR_API_KEY` on every request. Available models depend on the channels an admin has configured.

### Text and models

| Capability | Method | Path | Docs |
|------------|--------|------|------|
| Chat completions | POST | `/chat/completions` | [Chat Completions](/docs/chat-completions) |
| Legacy completions | POST | `/completions` | — |
| Responses | POST | `/responses` | [Responses](/docs/responses) |
| Compact context | POST | `/responses/compact` | [Responses](/docs/responses) |
| Claude messages | POST | `/messages` | [Claude Messages](/docs/claude-messages) |
| List models | GET | `/models` | [Models](/docs/models) |
| Retrieve model | GET | `/models/{model_id}` | [Models](/docs/models) |
| Moderations | POST | `/moderations` | — |
| Web search | POST | `/alpha/search` | [Responses](/docs/responses) |
| Gemini generate | POST | `/models/{model}:generateContent` | [Models](/docs/models) |

The Claude SDK can also call `/messages` and `/models` with `x-api-key` and `anthropic-version`.

### Images, embeddings, and ranking

| Capability | Method | Path | Docs |
|------------|--------|------|------|
| Image generation | POST | `/images/generations` | [Image Generation](/docs/image-generation) |
| Image edits | POST | `/images/edits` | [Image Generation](/docs/image-generation) |
| Image edits (compat) | POST | `/edits` | [Image Generation](/docs/image-generation) |
| Embeddings | POST | `/embeddings` | [Embeddings](/docs/embeddings) |
| Embeddings (model in path) | POST | `/engines/{model}/embeddings` | [Embeddings](/docs/embeddings) |
| Rerank | POST | `/rerank` | [Rerank](/docs/rerank) |

### Audio

| Capability | Method | Path | Docs |
|------------|--------|------|------|
| Speech | POST | `/audio/speech` | [Audio](/docs/audio) |
| Transcription | POST | `/audio/transcriptions` | [Audio](/docs/audio) |
| Translation | POST | `/audio/translations` | [Audio](/docs/audio) |
| Speech (HTTP) | POST | `/tts` | [Audio](/docs/audio) |
| Realtime | GET (WebSocket) | `/realtime` | — |
| Speech (WebSocket) | GET (WebSocket) | `/tts` | — |
| Transcription (WebSocket) | GET (WebSocket) | `/asr` | — |

### Video

Async jobs return a `task_id`. Poll the matching GET endpoint.

| Capability | Method | Path | Docs |
|------------|--------|------|------|
| Create video | POST | `/videos` | [Video](/docs/video) |
| Fetch video task | GET | `/videos/{task_id}` | [Video](/docs/video) |
| Download video | GET | `/videos/{task_id}/content` | [Video](/docs/video) |
| Remix video | POST | `/videos/{video_id}/remix` | [Video](/docs/video) |
| Multi-reference video | POST | `/video/generations` | [Video](/docs/video) |
| Fetch multi-reference task | GET | `/video/generations/{task_id}` | [Video](/docs/video) |

### Balance, usage, and logs

`{baseUrl}` already includes `/v1`. The two billing paths also work from the site root as `/dashboard/billing/...` without `/v1`. `/api/...` is not under `{baseUrl}`; call it from the site origin.

| Capability | Method | Path | Notes |
|------------|--------|------|-------|
| Balance | GET | `/dashboard/billing/subscription` | OpenAI-compatible balance. `soft_limit_usd` / `hard_limit_usd` follow the site quota display unit. Unlimited keys return a very large limit. `access_until` is expiry in seconds; `0` means no expiry |
| Used quota | GET | `/dashboard/billing/usage` | `total_usage` is used quota × 100 |
| This key's usage | GET | `{origin}/api/usage/token` | Used quota for this key. Unlimited keys set `unlimited_quota`; remaining is not negative |
| This key's logs | GET | `{origin}/api/log/token` | Recent logs for this key. Channel secrets are not included |

### Site-root paths (not under `{baseUrl}`)

These also use an API Key, but the path starts at the site origin. Do not append another `/v1`.

| Capability | Method | Path | Notes |
|------------|--------|------|-------|
| Gemini generate | POST | `{origin}/v1beta/models/{model}:generateContent` | Native Gemini body |
| Gemini models | GET | `{origin}/v1beta/models` | `x-goog-api-key` or `?key=` |
| OpenAI-format model list | GET | `{origin}/v1beta/openai/models` | Same list shape as `GET /v1/models` |
| Kling text-to-video | POST | `/kling/v1/videos/text2video` | Async video |
| Kling image-to-video | POST | `/kling/v1/videos/image2video` | Async video |
| Kling text-to-video status | GET | `/kling/v1/videos/text2video/{task_id}` | Poll |
| Kling image-to-video status | GET | `/kling/v1/videos/image2video/{task_id}` | Poll |
| Suno submit | POST | `/suno/submit/{action}` | Music generation |
| Suno batch fetch | POST | `/suno/fetch` | Fetch by id list |
| Suno fetch one | GET | `/suno/fetch/{id}` | Fetch one task |
| Midjourney imagine | POST | `/mj/submit/imagine` | Text-to-image |
| Midjourney fetch | GET | `/mj/task/{id}/fetch` | Poll |
| Jimeng submit | POST | `/jimeng/` | Official Action query format |

> Files, fine-tunes, and image variations are not implemented.

## 5. Next steps

- [Authentication](/docs/authentication) — Bearer token and headers
- [Error handling](/docs/errors) — Status codes and retries
- [Chat Completions](/docs/chat-completions) — Chat API reference
- [Video](/docs/video) — Async video jobs and polling
