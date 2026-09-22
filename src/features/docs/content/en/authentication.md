# Authentication

Every API request must include a valid API key in the HTTP headers.

## Bearer token (recommended)

```
Authorization: Bearer YOUR_API_KEY
```

## Example

```bash
curl {baseUrl}/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Security best practices

- **Never** commit API keys to public repos or client-side code
- Use separate keys for development and production
- Rotate keys regularly from the console
- Configure **IP allowlists** on keys when possible

## Permissions and quota

- Each key is tied to account quota; successful requests consume quota per model pricing
- Keys may restrict **allowed models**
- Disabled, expired, or exhausted keys return `401` or `403`

## Check balance and logs with a key

These use the same `Authorization: Bearer YOUR_API_KEY`.

| Method | Path | Notes |
|--------|------|-------|
| GET | `{baseUrl}/dashboard/billing/subscription` | Balance. Field names keep OpenAI's `*_usd`, but the numbers follow the site quota display unit |
| GET | `{baseUrl}/dashboard/billing/usage` | Used quota. `total_usage` is used quota × 100 |
| GET | `{origin}/api/usage/token` | Site-root path. Used quota for this key; unlimited keys set `unlimited_quota` |
| GET | `{origin}/api/log/token` | Site-root path. Recent request logs for this key |

`/dashboard/billing/subscription` and `/dashboard/billing/usage` also work from the site root without `/v1`.
