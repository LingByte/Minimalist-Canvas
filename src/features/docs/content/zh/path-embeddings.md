# 路径嵌入

**Endpoint:** `POST {baseUrl}/engines/{model}/embeddings`

Azure 兼容路径。模型名写在 URL 里，请求体与 [向量嵌入](/docs/embeddings) 相同，`model` 可以省略。

## 示例

```bash
curl {baseUrl}/engines/text-embedding-3-small/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```

## 说明

- `{model}` 是路径参数，不是请求体字段
- 响应格式与 `POST {baseUrl}/embeddings` 相同
