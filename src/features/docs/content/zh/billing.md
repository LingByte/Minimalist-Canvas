# 余额

**Endpoint:** `GET {baseUrl}/dashboard/billing/subscription`

OpenAI 兼容的余额上限，不是账户流水。字段名沿用 `*_usd`，数值按站点额度展示单位计算（美元、人民币或 tokens）。无限额度时这三个上限都是 `100000000`，表示不设上限，不是真实余额。真实已用看 [已用额度](/docs/usage)。`access_until` 是过期时间（秒），`0` 表示不过期。

```bash
curl {baseUrl}/dashboard/billing/subscription \
  -H "Authorization: Bearer YOUR_API_KEY"
```

不带 `/v1` 的 `GET /dashboard/billing/subscription` 也可以从站点根调用。
