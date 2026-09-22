# Image Generation

OpenAI-compatible image APIs. Capabilities depend on configured upstream models (e.g. DALL·E, Stable Diffusion).

## Create image

**Endpoint:** `POST {baseUrl}/images/generations`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | no | Image model, e.g. `dall-e-3` |
| `prompt` | string | yes | Image description |
| `n` | integer | no | Number of images (default 1) |
| `size` | string | no | e.g. `1024x1024`, `1792x1024` |
| `quality` | string | no | `standard` or `hd` when supported |
| `response_format` | string | no | `url` or `b64_json` |

### Example

```bash
curl {baseUrl}/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "A serene mountain lake at sunset, digital art",
    "size": "1024x1024",
    "n": 1
  }'
```

### Sample response

```json
{
  "created": 1710000000,
  "data": [
    {"url": "https://..."}
  ]
}
```

## Image edits (optional)

**Endpoint:** `POST {baseUrl}/images/edits`

Upload image and mask via multipart/form-data. Availability depends on upstream channels.

## Variations (optional)

**Endpoint:** `POST {baseUrl}/images/variations`

Generate variations from a source image. Supported on select channels.

## Billing

- Billed per request or resolution per model pricing in the console
- Failed generations are typically not charged (see usage logs)
