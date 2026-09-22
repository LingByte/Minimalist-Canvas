# Key usage

**Endpoint:** `GET {origin}/api/usage/token`

This path starts at the site origin. Do not append it to `{baseUrl}`. It returns this API key's name, used quota, unlimited flag, model limits, and expiry. `expires_at` is seconds; `0` means no expiry.

```bash
curl {origin}/api/usage/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Quota fields are internal quota integers, not dollar amounts.

When the key is unlimited, `unlimited_quota` is `true`. That key is not blocked by remaining quota, and `total_used` is the amount already consumed. `total_available` is never negative; it is not a spendable balance. The limit is on [Balance](/docs/billing).
