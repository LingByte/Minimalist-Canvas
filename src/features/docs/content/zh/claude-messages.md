# Claude Messages

**Endpoint:** `POST {baseUrl}/messages`

Anthropic Claude Messages API 兼容接口。请使用 Claude 风格请求头。

## 请求头

| Header | 说明 |
|--------|------|
| `x-api-key` | 平台 API Key |
| `anthropic-version` | 如 `2023-06-01` |
| `Content-Type` | `application/json` |

## 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | Claude 模型名称 |
| `max_tokens` | integer | 是 | 最大输出 token |
| `messages` | array | 是 | 对话消息，`role` 为 `user` / `assistant` |

## 示例

```bash
curl {baseUrl}/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Explain API gateways briefly."}
    ]
  }'
```

## 响应

返回 `content` 数组（`type: text`）及 `usage.input_tokens` / `usage.output_tokens`。
