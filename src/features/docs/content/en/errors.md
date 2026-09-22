# Error Handling

Errors generally follow the OpenAI error envelope:

```json
{
  "error": {
    "message": "Human-readable description",
    "type": "invalid_request_error",
    "code": "model_not_found"
  }
}
```

## Common HTTP status codes

| Code | Meaning | Typical cause |
|------|---------|---------------|
| `400` | Bad request | Missing fields, invalid JSON, unknown model |
| `401` | Unauthorized | Missing or invalid API key |
| `403` | Forbidden | Disabled key, model not allowed, insufficient quota |
| `429` | Too many requests | Rate limit — retry with backoff |
| `500` | Server error | Upstream failure — retry later |
| `502` / `503` | Unavailable | Channel outage or maintenance |

## Error types

| type | Description |
|------|-------------|
| `invalid_request_error` | Client request issue |
| `authentication_error` | Auth failure |
| `permission_error` | Permission or quota issue |
| `rate_limit_error` | Rate limited |
| `server_error` | Server or upstream error |

## Retry guidance

1. **`429`** — Exponential backoff (1s, 2s, 4s…); respect rate-limit headers
2. **`500` / `502` / `503`** — Limited retries with backoff
3. **`400` / `401` / `403`** — Fix the request or key; do not blindly retry

## Debugging

- Inspect **Usage logs** in the console
- Verify `{baseUrl}`, key permissions, and model name spelling
- For streaming, check timeouts and proxy settings
