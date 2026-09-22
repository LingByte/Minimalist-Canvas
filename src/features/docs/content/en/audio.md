# Audio

OpenAI-compatible text-to-speech, speech-to-text, and translation endpoints.

## Text-to-speech (TTS)

**Endpoint:** `POST {baseUrl}/audio/speech`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | TTS model, e.g. `tts-1` |
| `input` | string | yes | Text to synthesize |
| `voice` | string | yes | Voice id, e.g. `alloy`, `nova` |
| `response_format` | string | no | `mp3`, `opus`, `wav`, etc. |

```bash
curl {baseUrl}/audio/speech \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hello from Simplest Future AI.",
    "voice": "alloy"
  }' \
  --output speech.mp3
```

## Speech-to-text (STT)

**Endpoint:** `POST {baseUrl}/audio/transcriptions`

Upload audio as `multipart/form-data`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | yes | Audio file |
| `model` | string | yes | e.g. `whisper-1` |
| `language` | string | no | ISO-639-1 language code |

```bash
curl {baseUrl}/audio/transcriptions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F file=@sample.mp3 \
  -F model=whisper-1
```

## Translation

**Endpoint:** `POST {baseUrl}/audio/translations`

Translates non-English audio into English text. Same parameters as transcriptions.
