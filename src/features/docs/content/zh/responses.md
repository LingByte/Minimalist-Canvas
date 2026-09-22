# Responses API

**Endpoint:** `POST {baseUrl}/responses`

OpenAI Responses API 兼容接口，适合 agent 工作流、工具调用与结构化输出。请求体使用 `input` 字段而非 `messages`。

## 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型名称 |
| `input` | string / array | 是 | 用户输入或消息结构 |
| `stream` | boolean | 否 | 是否流式返回 |
| `tools` | array | 否 | 可用工具定义 |

## 示例

```bash
curl {baseUrl}/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "input": "Summarize API gateways in one sentence."
  }'
```

## 响应

返回 `output` 数组，其中 `type: output_text` 的项包含模型文本；`usage` 字段记录 token 用量。

## 相关接口

- `POST {baseUrl}/responses/compact` — 压缩历史上下文（部分模型支持）

## 网页搜索

**Endpoint:** `POST {baseUrl}/alpha/search`

Codex 独立网页搜索。请求体必须带 `model`，其余 JSON 字段原样转发给上游。只有 Codex 兼容渠道接受这个路径。

```bash
curl {baseUrl}/alpha/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini"
  }'
```
