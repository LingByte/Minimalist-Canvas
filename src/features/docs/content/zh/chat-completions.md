# 对话补全 (Chat Completions)

**Endpoint:** `POST {baseUrl}/chat/completions`

与 OpenAI Chat Completions API 兼容，支持多轮对话、流式输出和工具调用（取决于上游模型）。

## 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型名称 |
| `messages` | array | 是 | 消息列表，含 `role` 与 `content` |
| `stream` | boolean | 否 | 是否流式返回，默认 `false` |
| `temperature` | number | 否 | 采样温度 0–2 |
| `max_tokens` | integer | 否 | 最大生成 token 数 |

## 非流式示例

```bash
curl {baseUrl}/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain API gateways briefly."}
    ]
  }'
```

## 流式示例

```bash
curl {baseUrl}/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role": "user", "content": "Count from 1 to 5."}]
  }'
```

流式响应为 SSE（`text/event-stream`），每行 `data: {...}`，结束时为 `data: [DONE]`。

## 响应结构

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "..."},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```
