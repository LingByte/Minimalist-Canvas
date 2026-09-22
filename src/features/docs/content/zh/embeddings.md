# 向量嵌入 (Embeddings)

**Endpoint:** `POST {baseUrl}/embeddings`

将文本转换为向量表示，用于语义搜索、RAG、聚类等场景。与 OpenAI Embeddings API 兼容。

## 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | Embedding 模型，如 `text-embedding-3-small` |
| `input` | string / array | 是 | 待嵌入文本，可为字符串或字符串数组 |
| `encoding_format` | string | 否 | `float` 或 `base64` |

## 单条文本示例

```bash
curl {baseUrl}/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```

## 批量示例

```bash
curl {baseUrl}/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      "First document to embed.",
      "Second document to embed."
    ]
  }'
```

## 响应示例

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0123, -0.0456, "..."]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

## 使用 OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="{baseUrl}")

result = client.embeddings.create(
    model="text-embedding-3-small",
    input="Hello world"
)
vector = result.data[0].embedding
```

## 说明

- 计费通常按 input token 数计算
- 不同模型向量维度不同，混用时需分别存储
- 部分 Gemini 等模型也支持 batch embedding 接口

## 路径指定模型

**Endpoint:** `POST {baseUrl}/engines/{model}/embeddings`

Azure 兼容路径。模型名写在 URL 里，请求体与上面相同，`model` 可以省略。

```bash
curl {baseUrl}/engines/text-embedding-3-small/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```
