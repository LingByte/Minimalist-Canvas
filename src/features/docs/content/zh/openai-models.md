# 兼容模型列表

**Endpoint:** `GET {origin}/v1beta/openai/models`

这个地址从站点根开始，不要拼在 `{baseUrl}` 后面。返回格式与 [模型列表](/docs/models) 的 `GET {baseUrl}/models` 相同。

## 示例

```bash
curl {origin}/v1beta/openai/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 说明

- 适合需要在 Gemini `/v1beta` 前缀下使用 OpenAI 兼容模型列表的客户端。
- Gemini 原生模型列表仍是 `GET {origin}/v1beta/models`，请求头用 `x-goog-api-key`，或在查询参数里带 `key`。
- 鉴权与其它 OpenAI 兼容接口一致：`Authorization: Bearer YOUR_API_KEY`。
