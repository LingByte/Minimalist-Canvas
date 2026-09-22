# 网页搜索

**Endpoint:** `POST {baseUrl}/alpha/search`

Codex 独立网页搜索。请求体必须带 `model`，其余 JSON 字段原样转发给上游。只有 Codex 兼容渠道接受这个路径。

## 示例

```bash
curl {baseUrl}/alpha/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini"
  }'
```

## 说明

- 认证与其他接口相同：`Authorization: Bearer YOUR_API_KEY`
- 渠道不支持该路径时会返回错误，并尝试切换到支持的渠道
