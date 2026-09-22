# Rerank

**Endpoint:** `POST {baseUrl}/rerank`

Re-score candidate documents by relevance to a query. Common in RAG pipelines.

## Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Rerank model name |
| `query` | string | yes | Query text |
| `documents` | array | yes | Documents to rank |
| `top_n` | integer | no | Return top N results |

## Example

```bash
curl {baseUrl}/rerank \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-rerank-model",
    "query": "What is an API gateway?",
    "documents": [
      "An API gateway routes and secures API traffic.",
      "Cats are popular pets.",
      "Load balancers distribute requests across servers."
    ],
    "top_n": 2
  }'
```

## Response

The `results` array contains `index` (original document index) and `relevance_score` (higher is more relevant).
