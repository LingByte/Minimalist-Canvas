# 密钥日志

**Endpoint:** `GET {origin}/api/log/token`

这个地址从站点根开始，不要拼在 `{baseUrl}` 后面。返回当前 API Key 最近的调用日志，按时间倒序。响应里不含渠道密钥。

```bash
curl {origin}/api/log/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

每条日志包含模型、额度、时间、请求 ID 和 IP。只返回这个 Key 自己的记录。
