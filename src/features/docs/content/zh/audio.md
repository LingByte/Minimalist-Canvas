# 音频接口 (Audio)

平台支持 OpenAI 兼容的语音合成、语音识别与翻译接口。

## 语音合成 (TTS)

**Endpoint:** `POST {baseUrl}/audio/speech`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | TTS 模型，如 `tts-1` |
| `input` | string | 是 | 待合成文本 |
| `voice` | string | 是 | 音色，如 `alloy`、`nova` |
| `response_format` | string | 否 | `mp3`、`opus`、`wav` 等 |

```bash
curl {baseUrl}/audio/speech \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hello from 至简未来 AI.",
    "voice": "alloy"
  }' \
  --output speech.mp3
```

## 语音识别 (STT)

**Endpoint:** `POST {baseUrl}/audio/transcriptions`

使用 `multipart/form-data` 上传音频文件：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 音频文件 |
| `model` | string | 是 | 如 `whisper-1` |
| `language` | string | 否 | ISO-639-1 语言代码 |

```bash
curl {baseUrl}/audio/transcriptions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F file=@sample.mp3 \
  -F model=whisper-1
```

## 语音翻译

**Endpoint:** `POST {baseUrl}/audio/translations`

将非英语音频翻译为英语文本，参数与 `transcriptions` 相同。
