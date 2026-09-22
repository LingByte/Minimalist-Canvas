# Models

**Endpoint:** `GET {baseUrl}/models`

Returns models available to your API key in OpenAI-compatible format.

## Example

```bash
curl {baseUrl}/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Sample response

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai"
    }
  ]
}
```

## Retrieve a model

**Endpoint:** `GET {baseUrl}/models/{model_id}`

```bash
curl {baseUrl}/models/gpt-4o-mini \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Notes

- Available models depend on upstream channels and key restrictions
- See **Model Selection** in the console for pricing and capabilities
- Some models support only specific endpoints (e.g. embeddings or images only)

## Gemini native requests (`/v1`)

**Endpoint:** `POST {baseUrl}/models/{model}:{action}`

The model name is in the path. The body is native Gemini JSON. Common actions:

| Action | Purpose |
|--------|---------|
| `generateContent` | Generate a reply |
| `streamGenerateContent` | Stream a reply |
| `embedContent` | One embedding |
| `batchEmbedContents` | Batch embeddings |

```bash
curl {baseUrl}/models/gemini-2.0-flash:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello"}]}]
  }'
```

The same actions are also available at the site root as `/v1beta/models/{model}:{action}`.

## OpenAI-format Gemini model list

**Endpoint:** `GET /v1beta/openai/models`

Call this from the site origin. Do not append it to `{baseUrl}`. The response matches `GET {baseUrl}/models`.

```bash
curl https://YOUR_SITE/v1beta/openai/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```
