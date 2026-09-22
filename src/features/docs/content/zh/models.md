# 模型列表

**Endpoint:** `GET {baseUrl}/models`

返回当前 API Key 可用的模型列表，格式与 OpenAI Models API 兼容。

## 示例

```bash
curl {baseUrl}/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 响应示例

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai"
    }
  ]
}
```

## 获取单个模型

**Endpoint:** `GET {baseUrl}/models/{model_id}`

```bash
curl {baseUrl}/models/gpt-4o-mini \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 说明

- 可用模型取决于管理员配置的上游渠道与您的密钥权限
- 可在控制台 **模型选用** 查看定价与能力说明
- 部分模型仅支持特定接口（如仅 Embedding 或仅生图）

## Gemini 原生请求（`/v1`）

**Endpoint:** `POST {baseUrl}/models/{model}:{action}`

模型名写在路径里，请求体是 Gemini 原生格式。常用动作：

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

同一套动作也可以走站点根路径 `/v1beta/models/{model}:{action}`。

## OpenAI 格式的 Gemini 模型列表

**Endpoint:** `GET /v1beta/openai/models`

从站点根调用，不要拼在 `{baseUrl}` 后面。返回格式与 `GET {baseUrl}/models` 相同。

```bash
curl https://YOUR_SITE/v1beta/openai/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```
