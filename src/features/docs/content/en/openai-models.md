# Compatible model list

**Endpoint:** `GET {origin}/v1beta/openai/models`

This path starts at the site origin. Do not append it to `{baseUrl}`. The response matches [Models](/docs/models) `GET {baseUrl}/models`.

```bash
curl {origin}/v1beta/openai/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The native Gemini model list is `GET {origin}/v1beta/models`. Send `x-goog-api-key`, or pass `key` as a query parameter.
