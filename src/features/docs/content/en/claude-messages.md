# Claude Messages

**Endpoint:** `POST {baseUrl}/messages`

Anthropic Claude Messages API compatible endpoint. Use Claude-style headers.

## Headers

| Header | Description |
|--------|-------------|
| `x-api-key` | Your platform API key |
| `anthropic-version` | e.g. `2023-06-01` |
| `Content-Type` | `application/json` |

## Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Claude model name |
| `max_tokens` | integer | yes | Max output tokens |
| `messages` | array | yes | Chat messages with `user` / `assistant` roles |

## Example

```bash
curl {baseUrl}/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Explain API gateways briefly."}
    ]
  }'
```

## Response

Returns a `content` array (`type: text`) and `usage.input_tokens` / `usage.output_tokens`.
