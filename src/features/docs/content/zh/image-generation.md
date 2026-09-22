# 图像生成 (Image Generation)

支持 OpenAI 兼容的图像生成接口，具体能力取决于所配置的 upstream 模型（如 DALL·E、Stable Diffusion 等）。

## 创建图像

**Endpoint:** `POST {baseUrl}/images/generations`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 图像模型，如 `dall-e-3` |
| `prompt` | string | 是 | 图像描述 |
| `n` | integer | 否 | 生成数量，默认 1 |
| `size` | string | 否 | 如 `1024x1024`、`1792x1024` |
| `quality` | string | 否 | `standard` 或 `hd`（模型支持时） |
| `response_format` | string | 否 | `url` 或 `b64_json` |

### 示例

```bash
curl {baseUrl}/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "A serene mountain lake at sunset, digital art",
    "size": "1024x1024",
    "n": 1
  }'
```

### 响应示例

```json
{
  "created": 1710000000,
  "data": [
    {"url": "https://..."}
  ]
}
```

## 图像编辑（可选）

**Endpoint:** `POST {baseUrl}/images/edits`

需上传原图与 mask（multipart/form-data），参数与 OpenAI Images Edits API 一致。是否可用取决于上游渠道。

## 图像变体（可选）

**Endpoint:** `POST {baseUrl}/images/variations`

基于输入图像生成变体，multipart 上传。部分模型/渠道支持。

## 计费说明

- 按次或按分辨率计费，以控制台模型定价为准
- 生成失败通常不扣费（以实际日志为准）
