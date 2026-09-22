# Gemini

**Endpoint:** `POST {baseUrl}/models/{model}:generateContent`

The model name is in the path. The body is native Gemini JSON. Auth is `Authorization: Bearer YOUR_API_KEY`.

## Common actions

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

The same actions are also available from the site root as `/v1beta/models/{model}:{action}`. Do not append another `/v1`.
