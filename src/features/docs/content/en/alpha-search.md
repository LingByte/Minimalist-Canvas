# Web search

**Endpoint:** `POST {baseUrl}/alpha/search`

Standalone Codex web search. The JSON body must include `model`. Other fields are forwarded as-is. Only Codex-compatible channels accept this path.

## Example

```bash
curl {baseUrl}/alpha/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini"
  }'
```

## Notes

- Auth is the same as other endpoints: `Authorization: Bearer YOUR_API_KEY`
- If the selected channel does not support this path, the gateway returns an error and can retry on a channel that does
