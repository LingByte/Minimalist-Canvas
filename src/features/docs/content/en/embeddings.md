# Embeddings

**Endpoint:** `POST {baseUrl}/embeddings`

Convert text to vector representations for semantic search, RAG, clustering, etc. OpenAI-compatible.

## Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Embedding model, e.g. `text-embedding-3-small` |
| `input` | string / array | yes | Text or array of strings |
| `encoding_format` | string | no | `float` or `base64` |

## Single text example

```bash
curl {baseUrl}/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```

## Batch example

```bash
curl {baseUrl}/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      "First document to embed.",
      "Second document to embed."
    ]
  }'
```

## Sample response

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0123, -0.0456, "..."]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

## OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="{baseUrl}")

result = client.embeddings.create(
    model="text-embedding-3-small",
    input="Hello world"
)
vector = result.data[0].embedding
```

## Notes

- Billed by input tokens in most cases
- Vector dimensions differ per model — store separately when mixing
- Some providers (e.g. Gemini) support batch embedding endpoints

## Model in the path

**Endpoint:** `POST {baseUrl}/engines/{model}/embeddings`

Azure-compatible path. The model name is in the URL. The body matches the endpoint above, and `model` may be omitted.

```bash
curl {baseUrl}/engines/text-embedding-3-small/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```
