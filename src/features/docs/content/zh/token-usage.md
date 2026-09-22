# 密钥用量

**Endpoint:** `GET {origin}/api/usage/token`

这个地址从站点根开始，不要拼在 `{baseUrl}` 后面。返回当前 API Key 的名称、已用额度、是否无限、模型限制和过期时间。`expires_at` 为秒，`0` 表示不过期。

```bash
curl {origin}/api/usage/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

额度是站点内部整数，不是美元金额。

无限额度时看 `unlimited_quota: true`。这种 Key 不按剩余额度拦截，`total_used` 是实际已用。`total_available` 不会再出现负数；它不是还能花多少，余额上限请看 [余额](/docs/billing)。
