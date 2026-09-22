# Responses API

**Endpoint:** `POST {baseUrl}/responses`

OpenAI-compatible Responses API for agent workflows, tool use, and structured output. Uses `input` instead of `messages`.

## Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Model name |
| `input` | string / array | yes | User input or structured messages |
| `stream` | boolean | no | Enable streaming |
| `tools` | array | no | Tool definitions |

## Example

```bash
curl {baseUrl}/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "input": "Summarize API gateways in one sentence."
  }'
```

## Response

The `output` array contains items such as `type: output_text` with model text. Token usage is in `usage`.

## Related

- `POST {baseUrl}/responses/compact` — compact conversation history (model-dependent)

## Web search

**Endpoint:** `POST {baseUrl}/alpha/search`

Standalone Codex web search. The JSON body must include `model`. Other fields are forwarded as-is. Only Codex-compatible channels accept this path.

```bash
curl {baseUrl}/alpha/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini"
  }'
```
