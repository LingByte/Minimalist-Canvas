import { api } from '@/lib/api'
import i18n from '@canvas/i18n'

/** 七猴公开图床：画布参考图/视频直传，不经本站 presign。 */
const QIHUO_UPLOAD_URL = 'https://imageproxy.zhongzhuan.chat/api/upload'
/** Client-side cap for 七猴图床 video uploads. */
export const QIHUO_MAX_UPLOAD_BYTES = 40 * 1024 * 1024
/** Client-side cap for canvas image uploads (七猴图床). */
export const QIHUO_MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024

/** Hard client-side upload cap for our object-storage path (admin / audio fallback). */
export const MAX_CANVAS_UPLOAD_BYTES = 100 * 1024 * 1024
/** Product-level video upload cap (all storage paths). */
export const CANVAS_MAX_VIDEO_BYTES = 50 * 1024 * 1024

function bytesToMb(bytes: number) {
  return Math.max(1, Math.ceil(bytes / (1024 * 1024)))
}

/** Throws when size exceeds min(backend limit, 100 MB hard cap). */
export function assertCanvasUploadSize(size: number, backendLimit = 0): void {
  const limit =
    backendLimit > 0
      ? Math.min(backendLimit, MAX_CANVAS_UPLOAD_BYTES)
      : MAX_CANVAS_UPLOAD_BYTES
  if (size <= limit) return
  throw new Error(
    i18n.t('common.uploadTooLarge', {
      sizeMb: bytesToMb(size),
      limitMb: bytesToMb(limit),
    })
  )
}

/** Throws with an image-specific hint when over 8MB, videos over 50MB, otherwise the generic cap. */
export function assertCanvasMediaUploadSize(
  size: number,
  mimeType: string,
  filename = '',
  backendLimit = 0
): void {
  const mime = canonicalizeContentType(mimeType, filename)
  if (mime.startsWith('image/')) {
    if (size <= QIHUO_MAX_IMAGE_UPLOAD_BYTES) return
    throw new Error(
      i18n.t('common.uploadImageTooLarge', {
        sizeMb: bytesToMb(size),
        limitMb: bytesToMb(QIHUO_MAX_IMAGE_UPLOAD_BYTES),
      })
    )
  }
  if (mime.startsWith('video/')) {
    const limit =
      backendLimit > 0
        ? Math.min(backendLimit, CANVAS_MAX_VIDEO_BYTES)
        : CANVAS_MAX_VIDEO_BYTES
    assertCanvasUploadSize(size, limit)
    return
  }
  assertCanvasUploadSize(size, backendLimit)
}

export type ObjectStorageStatus = {
  enabled: boolean
  provider: string
  source?: string
  supports_direct: boolean
  max_upload_bytes: number
  public_base?: string
}

type DirectUpload = {
  provider: string
  method: string
  url: string
  headers?: Record<string, string>
  form?: Record<string, string>
  fileField?: string
  key: string
  expiresAt?: string
}

type PresignResult = {
  mode: 'direct' | 'proxy'
  key: string
  access_url: string
  expires_at?: string
  upload?: DirectUpload
}

export type ObjectStorageUploadResult = {
  key: string
  accessUrl: string
  bytes: number
  mimeType: string
}

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

let statusCache: { value: ObjectStorageStatus; at: number } | null = null
const STATUS_TTL_MS = 30_000

export async function getObjectStorageStatus(force = false): Promise<ObjectStorageStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) {
    return statusCache.value
  }
  const res = await api.get<ApiEnvelope<ObjectStorageStatus>>('/api/storage/status', {
    skipErrorHandler: true,
  })
  const data = res.data?.data
  const status: ObjectStorageStatus = {
    enabled: Boolean(data?.enabled),
    provider: data?.provider || '',
    source: data?.source,
    supports_direct: Boolean(data?.supports_direct),
    max_upload_bytes: Number(data?.max_upload_bytes) || 0,
    public_base: typeof data?.public_base === 'string' ? data.public_base : '',
  }
  statusCache = { value: status, at: Date.now() }
  return status
}

export type CanvasMediaUploadOptions = {
  filename?: string
  purpose?: string
  contentType?: string
  onProgress?: (loaded: number, total: number) => void
}

/**
 * Canvas user media goes through the backend object storage (七牛 presign/proxy).
 * The public 七猴图床 is only a fallback for when object storage is disabled;
 * it rejects audio, so audio never uses it.
 */
export async function uploadCanvasMedia(
  input: Blob | File,
  options?: CanvasMediaUploadOptions
): Promise<ObjectStorageUploadResult | null> {
  const filename =
    options?.filename || (input instanceof File && input.name) || ''
  const mimeType = canonicalizeContentType(
    options?.contentType || input.type || 'application/octet-stream',
    filename
  )
  if (mimeType.startsWith('audio/')) {
    return uploadToObjectStorage(input, options)
  }
  const resolvedFilename = filename || guessFilename(mimeType)
  const blob =
    input.type === mimeType ? input : new Blob([input], { type: mimeType })
  assertCanvasMediaUploadSize(blob.size, mimeType, resolvedFilename)

  const stored = await uploadToObjectStorage(blob, options)
  if (stored) return stored

  // Object storage disabled — fall back to the public 七猴 host (40MB video cap).
  if (mimeType.startsWith('video/')) {
    assertCanvasUploadSize(blob.size, QIHUO_MAX_UPLOAD_BYTES)
  }

  const form = new FormData()
  form.append('file', blob, resolvedFilename)

  const text = await xhrUploadWithResponse(
    QIHUO_UPLOAD_URL,
    'POST',
    form,
    undefined,
    options?.onProgress
  )
  let data: { url?: string; error?: string; code?: number } = {}
  try {
    data = JSON.parse(text) as { url?: string; error?: string; code?: number }
  } catch {
    throw new Error(text.slice(0, 200) || 'qihou upload failed')
  }
  const accessUrl = typeof data.url === 'string' ? data.url.trim() : ''
  if (!accessUrl) {
    throw new Error(data.error || 'qihou upload failed')
  }
  return {
    key: keyFromPublicUrl(accessUrl),
    accessUrl,
    bytes: blob.size,
    mimeType,
  }
}

export async function uploadToObjectStorage(
  input: Blob | File,
  options?: CanvasMediaUploadOptions
): Promise<ObjectStorageUploadResult | null> {
  const status = await getObjectStorageStatus()
  if (!status.enabled) return null

  const filename =
    options?.filename ||
    (input instanceof File && input.name) ||
    ''
  const mimeType = canonicalizeContentType(
    options?.contentType || input.type || 'application/octet-stream',
    filename
  )
  const resolvedFilename = filename || guessFilename(mimeType)
  const purpose = options?.purpose || 'canvas'
  // Keep Blob.type aligned with the presigned mimeLimit (Qiniu rejects mismatches).
  const blob =
    input.type === mimeType ? input : new Blob([input], { type: mimeType })

  assertCanvasMediaUploadSize(blob.size, mimeType, resolvedFilename, status.max_upload_bytes)

  const presignRes = await api.post<ApiEnvelope<PresignResult>>(
    '/api/storage/presign',
    { filename: resolvedFilename, content_type: mimeType, purpose },
    { skipErrorHandler: true }
  )
  const presign = presignRes.data?.data
  if (!presign?.key || !presign.access_url) {
    throw new Error(presignRes.data?.message || 'failed to presign upload')
  }

  if (presign.mode === 'direct' && presign.upload?.url) {
    await performDirectUpload(
      presign.upload,
      blob,
      mimeType,
      resolvedFilename,
      options?.onProgress
    )
    return {
      key: presign.key,
      accessUrl: absoluteAccessUrl(presign.access_url),
      bytes: blob.size,
      mimeType,
    }
  }

  const form = new FormData()
  form.append('file', blob, resolvedFilename)
  form.append('key', presign.key)
  form.append('content_type', mimeType)
  form.append('purpose', purpose)
  const uploadRes = await api.post<
    ApiEnvelope<{ key: string; access_url: string; bytes: number; mime_type: string }>
  >('/api/storage/upload', form, {
    skipErrorHandler: true,
    onUploadProgress: (event) => {
      if (options?.onProgress && event.total) {
        options.onProgress(event.loaded, event.total)
      }
    },
  })
  const uploaded = uploadRes.data?.data
  if (!uploaded?.access_url) {
    throw new Error(uploadRes.data?.message || 'proxy upload failed')
  }
  return {
    key: uploaded.key || presign.key,
    accessUrl: absoluteAccessUrl(uploaded.access_url),
    bytes: uploaded.bytes || blob.size,
    mimeType: uploaded.mime_type || mimeType,
  }
}

/** Server-side remirror of an upstream media URL onto ailingecho/ (adds hotlink Referer). */
export async function mirrorRemoteToObjectStorage(
  url: string,
  kind: 'video' | 'image' = 'video'
): Promise<ObjectStorageUploadResult | null> {
  const status = await getObjectStorageStatus()
  if (!status.enabled) return null
  const res = await api.post<
    ApiEnvelope<{ key?: string; access_url?: string; kind?: string }>
  >('/api/storage/mirror-remote', { url, kind }, { skipErrorHandler: true })
  const data = res.data?.data
  if (!data?.access_url) {
    throw new Error(res.data?.message || 'failed to mirror remote media')
  }
  return {
    key: data.key || '',
    accessUrl: absoluteAccessUrl(data.access_url),
    bytes: 0,
    mimeType: kind === 'video' ? 'video/mp4' : 'image/png',
  }
}

async function performDirectUpload(
  upload: DirectUpload,
  blob: Blob,
  mimeType: string,
  filename: string,
  onProgress?: (loaded: number, total: number) => void
) {
  const method = (upload.method || 'PUT').toUpperCase()
  if (method === 'POST') {
    const form = new FormData()
    for (const [key, value] of Object.entries(upload.form || {})) {
      form.append(key, value)
    }
    form.append(upload.fileField || 'file', blob, filename)
    await xhrUpload(upload.url, 'POST', form, undefined, onProgress)
    return
  }

  const headers: Record<string, string> = { ...(upload.headers || {}) }
  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = mimeType
  }
  await xhrUpload(upload.url, 'PUT', blob, headers, onProgress)
}

function xhrUpload(
  url: string,
  method: string,
  body: Blob | FormData,
  headers?: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return xhrUploadWithResponse(url, method, body, headers, onProgress).then(() => undefined)
}

function xhrUploadWithResponse(
  url: string,
  method: string,
  body: Blob | FormData,
  headers?: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value)
      }
    }
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded, event.total)
        }
      }
    }
    xhr.onload = () => {
      const text = xhr.responseText || ''
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(text)
        return
      }
      let detail = `direct upload failed (${xhr.status})`
      try {
        const parsed = JSON.parse(text) as { error?: string }
        if (parsed.error) detail = parsed.error
      } catch {
        if (text) detail = text.slice(0, 200)
      }
      reject(new Error(detail))
    }
    xhr.onerror = () => reject(new Error('direct upload failed (network error)'))
    xhr.send(body)
  })
}

function keyFromPublicUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop()
    return last || url
  } catch {
    return url
  }
}

/** Align browser MIME aliases with types our API / storage expect. */
function canonicalizeContentType(mimeType: string, filename = ''): string {
  const raw = (mimeType || '').split(';')[0].trim().toLowerCase()
  switch (raw) {
    case 'audio/x-wav':
    case 'audio/wave':
    case 'audio/vnd.wave':
      return 'audio/wav'
    case 'audio/mp3':
    case 'audio/x-mp3':
    case 'audio/mpeg3':
    case 'audio/x-mpeg':
    case 'audio/x-mpeg-3':
      return 'audio/mpeg'
    case 'audio/x-flac':
      return 'audio/flac'
    case 'audio/x-aac':
    case 'audio/aacp':
      return 'audio/aac'
    case 'audio/x-m4a':
    case 'audio/m4a':
      return 'audio/mp4'
    case 'audio/x-aiff':
    case 'audio/aif':
      return 'audio/aiff'
    case 'audio/x-ogg':
    case 'application/ogg':
      return 'audio/ogg'
    case 'audio/x-opus':
      return 'audio/opus'
    case 'image/jpg':
      return 'image/jpeg'
  }
  if (!raw || raw === 'application/octet-stream' || raw === 'binary/octet-stream') {
    const fromName = contentTypeFromFilename(filename)
    if (fromName) return fromName
  }
  return raw || 'application/octet-stream'
}

function contentTypeFromFilename(filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : ''
  switch (ext) {
    case '.wav':
      return 'audio/wav'
    case '.mp3':
      return 'audio/mpeg'
    case '.flac':
      return 'audio/flac'
    case '.aac':
      return 'audio/aac'
    case '.m4a':
      return 'audio/mp4'
    case '.ogg':
    case '.oga':
      return 'audio/ogg'
    case '.opus':
      return 'audio/opus'
    case '.aiff':
    case '.aif':
      return 'audio/aiff'
    case '.wma':
      return 'audio/x-ms-wma'
    case '.amr':
      return 'audio/amr'
    case '.pcm':
      return 'audio/pcm'
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return ''
  }
}

function absoluteAccessUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url
  if (typeof window === 'undefined') return url
  return new URL(url, window.location.origin).toString()
}

function guessFilename(mimeType: string) {
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/webp'
          ? 'webp'
          : mimeType === 'image/gif'
            ? 'gif'
            : mimeType === 'audio/wav'
              ? 'wav'
              : mimeType === 'audio/mpeg'
                ? 'mp3'
                : mimeType === 'audio/flac'
                  ? 'flac'
                  : mimeType === 'audio/aac'
                    ? 'aac'
                    : mimeType === 'audio/mp4'
                      ? 'm4a'
                      : mimeType === 'audio/ogg'
                        ? 'ogg'
                        : mimeType === 'audio/opus'
                          ? 'opus'
                          : mimeType === 'audio/aiff'
                            ? 'aiff'
                            : mimeType === 'audio/pcm'
                              ? 'pcm'
                              : mimeType.startsWith('video/')
                                ? 'mp4'
                                : mimeType.startsWith('audio/')
                                  ? 'bin'
                                  : 'bin'
  return `upload.${ext}`
}
