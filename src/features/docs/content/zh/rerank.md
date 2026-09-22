# 重排序 (Rerank)

**Endpoint:** `POST {baseUrl}/rerank`

对候选文档按与查询的相关性重新排序，常用于 RAG 检索增强。

## 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | Rerank 模型名称 |
| `query` | string | 是 | 查询文本 |
| `documents` | array | 是 | 待排序文档列表 |
| `top_n` | integer | 否 | 返回前 N 条结果 |

## 示例

```bash
curl {baseUrl}/rerank \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-rerank-model",
    "query": "What is an API gateway?",
    "documents": [
      "An API gateway routes and secures API traffic.",
      "Cats are popular pets.",
      "Load balancers distribute requests across servers."
    ],
    "top_n": 2
  }'
```

## 响应

返回 `results` 数组，每项含 `index`（原文档下标）与 `relevance_score`（相关性分数，越高越相关）。
