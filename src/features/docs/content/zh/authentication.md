# 认证

所有 API 请求必须在 HTTP Header 中携带有效的 API Key。

## Bearer Token（推荐）

```
Authorization: Bearer YOUR_API_KEY
```

## 示例

```bash
curl {baseUrl}/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 安全建议

- **不要** 将 API Key 提交到公开仓库或前端代码
- 为不同环境（开发 / 生产）使用不同密钥
- 在控制台中定期轮换密钥
- 可在密钥设置中配置 **IP 白名单** 限制访问来源

## 权限与配额

- 每个 Key 绑定账户配额，请求成功后会按模型计费规则扣减
- Key 可设置 **模型限制**，仅允许访问指定模型
- Key 被禁用、过期或余额不足时，API 将返回 `401` 或 `403`

## 用 Key 查余额和日志

这些接口使用同一个 `Authorization: Bearer YOUR_API_KEY`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `{baseUrl}/dashboard/billing/subscription` | 余额。字段名沿用 OpenAI 的 `*_usd`，数值按站点额度展示单位计算 |
| GET | `{baseUrl}/dashboard/billing/usage` | 已用额度。`total_usage` 为已用额度 × 100 |
| GET | `{origin}/api/usage/token` | 站点根路径。当前 Key 的已用额度；无限额度看 `unlimited_quota` |
| GET | `{origin}/api/log/token` | 站点根路径。当前 Key 的最近调用日志 |

不带 `/v1` 的 `/dashboard/billing/subscription` 和 `/dashboard/billing/usage` 也可以从站点根调用。
