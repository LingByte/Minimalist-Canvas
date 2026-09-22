# Path embeddings

**Endpoint:** `POST {baseUrl}/engines/{model}/embeddings`

Azure-compatible path. The model name is in the URL. The body matches [Embeddings](/docs/embeddings), and `model` may be omitted.

## Example

```bash
curl {baseUrl}/engines/text-embedding-3-small/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```

## Notes

- `{model}` is a path parameter, not a body field
- The response matches `POST {baseUrl}/embeddings`
