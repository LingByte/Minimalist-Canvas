# Balance

**Endpoint:** `GET {baseUrl}/dashboard/billing/subscription`

OpenAI-compatible limit, not a ledger. Field names keep `*_usd`, but the numbers follow the site quota display unit (USD, CNY, or tokens). Unlimited keys return `100000000` for all three limits. That means no cap, not a real balance. Consumed quota is on [Used quota](/docs/usage). `access_until` is expiry in seconds; `0` means no expiry.

```bash
curl {baseUrl}/dashboard/billing/subscription \
  -H "Authorization: Bearer YOUR_API_KEY"
```

`GET /dashboard/billing/subscription` also works from the site root without `/v1`.
