# 已用额度

**Endpoint:** `GET {baseUrl}/dashboard/billing/usage`

返回当前密钥已经用掉的额度。`total_usage` 是已用额度 × 100，单位与站点额度展示方式一致。

```bash
curl {baseUrl}/dashboard/billing/usage \
  -H "Authorization: Bearer YOUR_API_KEY"
```

不带 `/v1` 的 `GET /dashboard/billing/usage` 也可以从站点根调用。
