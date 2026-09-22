# Gemini

**Endpoint:** `POST {baseUrl}/models/{model}:generateContent`

模型名写在路径里，请求体是 Gemini 原生格式。认证使用 `Authorization: Bearer YOUR_API_KEY`。

## 常用动作

| 动作 | 说明 |
|------|------|
| `generateContent` | 对话生成 |
| `streamGenerateContent` | 流式生成 |
| `embedContent` | 单条向量 |
| `batchEmbedContents` | 批量向量 |

```bash
curl {baseUrl}/models/gemini-2.0-flash:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello"}]}]
  }'
```

同一套动作也可以走站点根路径 `/v1beta/models/{model}:{action}`，不要再拼一次 `/v1`。
