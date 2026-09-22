# Chat Completions

**Endpoint:** `POST {baseUrl}/chat/completions`

OpenAI-compatible chat API supporting multi-turn conversations, streaming, and tool use (model-dependent).

## Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Model name |
| `messages` | array | yes | Messages with `role` and `content` |
| `stream` | boolean | no | Stream responses (default `false`) |
| `temperature` | number | no | Sampling temperature 0–2 |
| `max_tokens` | integer | no | Max tokens to generate |

## Non-streaming example

```bash
curl {baseUrl}/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain API gateways briefly."}
    ]
  }'
```

## Streaming example

```bash
curl {baseUrl}/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role": "user", "content": "Count from 1 to 5."}]
  }'
```

Streaming uses SSE (`text/event-stream`) with `data: {...}` lines and `data: [DONE]` at the end.

## Response shape

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "..."},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```
