# Compatible model list

**Endpoint:** `GET {origin}/v1beta/openai/models`

This path starts at the site origin. Do not append it to `{baseUrl}`. The response shape matches [Models](/docs/models) `GET {baseUrl}/models`.

## Example

```bash
curl {origin}/v1beta/openai/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Notes

- Prefer this endpoint when a client expects an OpenAI-compatible model catalog under the Gemini `/v1beta` prefix.
- The native Gemini model list stays at `GET {origin}/v1beta/models`. Send `x-goog-api-key`, or pass `key` as a query parameter.
- Auth still uses the same API key as other OpenAI-compatible routes: `Authorization: Bearer YOUR_API_KEY`.
