# Video Generation

Video generation is **asynchronous**: submit a task, poll until it finishes, then fetch the content.

> **Parameters differ by model.** Some models take the aspect ratio as `ratio`, others as `aspect_ratio`; some take duration as `seconds`, others as `duration`, and some have a fixed duration. Find your model under [Models and parameters](#models-and-parameters) below and follow its field list. The model lists update live from the models currently available.

## Create a video task

**Endpoint:** `POST {baseUrl}/videos`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Video model name, see [Models and parameters](#models-and-parameters) |
| `prompt` | string | yes | Video description |
| Duration, ratio, etc. | — | no | Field names depend on the model, see [Models and parameters](#models-and-parameters) |

> **messages format also accepted**: if `prompt` is absent, you may send `messages` (OpenAI chat format) and the gateway will extract the prompt from `messages[].content` automatically.

### Standard usage (recommended)

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:standard}}",
    "prompt": "A cat walking on a sunny beach, cinematic",
    "seconds": 4,
    "ratio": "16:9"
  }'
```

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
| `queued` | Waiting |
| `in_progress` | Generating |
| `completed` | Done (`succeeded` for the multi-reference `/video/generations` format) |
| `failed` | Failed |

## Models and parameters

### Standard video models

**Available models:** {{videoModels:standard}}

| Field | Description |
|-------|-------------|
| `prompt` | Video description; `messages` also accepted |
| `seconds` | Duration in seconds; allowed values depend on the model |
| `ratio` | Aspect ratio, e.g. `16:9`, `9:16` (use `ratio`, not `size`) |

See [Standard usage](#standard-usage-recommended) above for a request example.

### Video / async image models

**Available models:** {{videoModels:media}}

This group contains both video models and async image models. All are submitted via `POST {baseUrl}/videos` and polled / downloaded as described above.

| Field | Description |
|-------|-------------|
| `duration` / `seconds` | Duration in seconds (either one) |
| `aspect_ratio` / `ratio` | Aspect ratio, e.g. `16:9` |
| `resolution` | Resolution, e.g. `720p` |
| `images` / `videos` / `audios` | Reference media as arrays of public URLs |
| `auto_face_mask` | Automatically mask faces |

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:media}}",
    "prompt": "City night timelapse",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'
```

### Multi-reference video models

**Available models:** {{videoModels:multi_reference}}

These models accept two request formats:

| Format | Endpoint | Use case | Success status |
|--------|----------|----------|----------------|
| Standard | `POST {baseUrl}/videos` | Text-to-video, single-image reference | `completed` |
| Multi-reference | `POST {baseUrl}/video/generations` | Image / video / audio references | `succeeded` |

Standard format fields: `seconds` (duration), `size` (resolution, e.g. `1080p`), `aspect_ratio`; pass a single reference image via `images` or `input_reference.image_url`. Download with `GET {baseUrl}/videos/{task_id}/content`.

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:multi_reference}}",
    "prompt": "Sunset at the beach, slow dolly forward",
    "seconds": 8,
    "size": "1080p",
    "aspect_ratio": "16:9"
  }'
```

Multi-reference format fields: `duration`, `resolution`, `aspect_ratio`, `image_references` (array of image URLs). Poll with `GET {baseUrl}/video/generations/{task_id}`; the result URL is in the response `url` field.

```bash
curl {baseUrl}/video/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:multi_reference}}",
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

Use publicly accessible URLs for reference media.

### 30-second video models

**Available models:** {{videoModels:fixed_30s}}

| Field | Description |
|-------|-------------|
| `ratio` | Aspect ratio; only `16:9`, `9:16`, `1:1`, `3:4`, `4:3`, `21:9`. Missing or other values fall back to `16:9`. `aspect_ratio` is also accepted |
| `seconds` | **Always 30 seconds**; any other value is ignored |
| `images` | Up to 9 reference images, JPG / PNG only, each side ≤ 8192 px, 50 MB total |

```bash
curl {baseUrl}/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "{{videoModel:fixed_30s}}",
    "prompt": "A cat walking on a sunny beach, cinematic",
    "ratio": "9:16"
  }'
```

## Notes

- Video jobs can take minutes; poll until completion
- Check **Task logs** in the console for history
