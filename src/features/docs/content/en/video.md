# Video Generation

Video generation is **asynchronous**: submit a task, poll until it finishes, then fetch the content.

## Create a video task

**Endpoint:** `POST {baseUrl}/videos`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Video model name, e.g. `dq-sd933-pro` |
| `prompt` | string | yes | Video description |
| `seconds` | number | no | Duration in seconds (model-dependent) |
| `ratio` | string | no | Aspect ratio, e.g. `16:9`, `9:16` |

> **messages format also accepted**: if `prompt` is absent, you may send `messages` (OpenAI chat format) and the gateway will extract the prompt from `messages[].content` automatically.

### Standard usage (recommended)

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dq-sd933-pro",
    "prompt": "A cat walking on a sunny beach, cinematic",
    "seconds": 4,
    "ratio": "16:9"
  }'
```

### messages compatibility

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dq-sd933-pro",
    "messages": [
      {"role": "user", "content": "A cat walking on a sunny beach, cinematic"}
    ]
  }'
```

The gateway automatically extracts message content into the `prompt` field before forwarding upstream.

### Sample response

```json
{
  "id": "video_abc123",
  "object": "video",
  "status": "queued"
}
```

## Poll task status

**Endpoint:** `GET {baseUrl}/videos/{task_id}`

```bash
curl {baseUrl}/videos/video_abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Fetch video content

After the task completes, download via the content proxy:

**Endpoint:** `GET {baseUrl}/videos/{task_id}/content`

## Status values

| Status | Meaning |
|--------|---------|
| `queued` / `pending` | Waiting |
| `processing` / `in_progress` | Generating |
| `completed` | Done |
| `failed` / `cancelled` | Failed or cancelled |

## MaxForAI channel setup

MaxForAI upstream uses a standard `prompt` field (not messages). Supported fields: `model`, `prompt`, `seconds`, `ratio`.

When creating a channel in the admin panel:
- **Type**: select `MaxForAI`
- **Base URL**: `https://maxforai.top` (pre-filled)
- **Key**: API Key from the MaxForAI token page
- **Models**: video models like `dq-sd933-pro`; add chat models yourself

Chat completions use the standard OpenAI path: `POST {baseUrl}/chat/completions` (same MaxForAI channel).

## OmegaAI channel setup

[ΩMEGA AI](https://omegaai.xin/) supports **async video/image only** (upstream chat is currently unavailable). Submit via `POST {baseUrl}/videos`; the adaptor forwards to upstream `POST /v1/media/generate`.

Polling uses `GET /v1/tasks/{task_id}`. **Success status is `succeeded` (not `completed`)**. Result URL is in `result.url` (may be relative; the gateway resolves it).

When creating a channel in the admin panel:
- **Type**: select `OmegaAI`
- **Base URL**: `https://omegaai.xin` (pre-filled)
- **Key**: API Key from the OmegaAI user center
- **Models**:
  - Async image: `gemini-3.1-flash-image-preview`
  - Video: `seedance-v2-720p`, `cvk`, `db-ai-video-v1`, `sd-2-c3`, `d-ai-video-v3`, `seedance2.5-900`

Submit example:

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-v2-720p",
    "prompt": "City night timelapse",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'
```

Optional fields: `duration` / `seconds`, `aspect_ratio` / `ratio`, `resolution`, `images` / `videos` / `audios` (public URL arrays), `auto_face_mask`.

> Upstream `POST /v1/images/generations` and `POST /v1/videos/generations` are demo stubs. Use this gateway's `/videos` (forwarded to `/v1/media/generate`) for real generation.

## XManWay channel setup

[XManWay](https://newapi.xmanway.com/) provides multiple video models with two request formats:

| Format | Gateway endpoint | Use case |
|--------|------------------|----------|
| OpenAI video | `POST {baseUrl}/videos` | Text-to-video, single-image reference |
| Multi-reference | `POST {baseUrl}/video/generations` | Image / video / audio references |

**Models:** `seedance-2.0`, `seedance-2.0-fast`, `minimax-h3`, `kling-3.0-omni`, `happyhorse`

OpenAI format success status is `completed`; multi-reference format uses `succeeded`. Download via `GET {baseUrl}/videos/{task_id}/content` for OpenAI format; multi-reference tasks return a URL in the poll response.

When creating a channel in the admin panel:
- **Type**: select `XManWay`
- **Base URL**: `https://newapi.xmanway.com` (pre-filled)
- **Key**: API Key from the console

OpenAI format example:

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-2.0",
    "prompt": "Sunset at the beach, slow dolly forward",
    "seconds": 8,
    "size": "1080p",
    "aspect_ratio": "16:9"
  }'
```

Multi-reference example:

```bash
curl {baseUrl}/video/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax-h3",
    "prompt": "Person in image 1 walks toward the building in image 2",
    "duration": 10,
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "image_references": [
      "https://example.com/image-1.jpg",
      "https://example.com/image-2.jpg"
    ]
  }'
```

For local assets without a public URL, declare `type: "upload"` in `input_reference` / `image_references`, upload via `upload.slots`, then call `POST /v1/uploads/complete` (request body is passed through upstream).

## Notes

- Video jobs can take minutes; poll until completion
- The channel Test button skips video/media models to avoid billed generation — verify with curl instead
- Check **Task logs** in the console for history
