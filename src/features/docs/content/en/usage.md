# Used quota

**Endpoint:** `GET {baseUrl}/dashboard/billing/usage`

Returns quota already consumed by the current key. `total_usage` is used quota × 100, in the site quota display unit.

```bash
curl {baseUrl}/dashboard/billing/usage \
  -H "Authorization: Bearer YOUR_API_KEY"
```

`GET /dashboard/billing/usage` also works from the site root without `/v1`.
