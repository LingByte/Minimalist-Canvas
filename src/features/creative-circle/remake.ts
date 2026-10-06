/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { nanoid } from 'nanoid'

import type { ReferenceImage } from '@canvas/types/image'
import type { ReferenceAudio, ReferenceVideo } from '@canvas/types/media'

import type { CircleRemakePayload } from './api'

/** Apply Creative Circle remake config onto the workbench config store. */
export function applyCircleRemakeConfig(
  kind: 'image' | 'video',
  config: Record<string, unknown> | undefined,
  model: string | undefined,
  updateConfig: (key: string, value: string) => void
) {
  if (!config) {
    if (model) {
      if (kind === 'image') updateConfig('imageModel', model)
      else updateConfig('videoModel', model)
    }
    return
  }

  const asString = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return ''
  }

  if (kind === 'image') {
    const imageModel = asString(config.imageModel) || model || ''
    if (imageModel) updateConfig('imageModel', imageModel)
    const quality = asString(config.quality)
    if (quality) updateConfig('quality', quality)
    const size = asString(config.size)
    if (size) updateConfig('size', size)
    const count = asString(config.count)
    if (count) updateConfig('count', count)
    return
  }

  const videoModel = asString(config.videoModel) || model || ''
  if (videoModel) updateConfig('videoModel', videoModel)
  const size = asString(config.size)
  if (size) updateConfig('size', size)
  const seconds = asString(config.seconds) || asString(config.videoSeconds)
  if (seconds) updateConfig('videoSeconds', seconds)
  const resolution = asString(config.resolution) || asString(config.vquality)
  if (resolution) updateConfig('vquality', resolution)
  const generateAudio =
    asString(config.generate_audio) || asString(config.videoGenerateAudio)
  if (generateAudio) updateConfig('videoGenerateAudio', generateAudio)
  const watermark =
    asString(config.watermark) || asString(config.videoWatermark)
  if (watermark) updateConfig('videoWatermark', watermark)
}

function durableHttpUrls(...sources: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    const list = Array.isArray(source)
      ? source
      : typeof source === 'string'
        ? [source]
        : []
    for (const raw of list) {
      if (typeof raw !== 'string') continue
      const url = raw.trim()
      if (!/^https?:\/\//i.test(url)) continue
      const key = url.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(url)
    }
  }
  return out
}

function guessMime(url: string, fallback: string) {
  const lower = url.toLowerCase()
  if (/\.png(\?|$)/.test(lower)) return 'image/png'
  if (/\.jpe?g(\?|$)/.test(lower)) return 'image/jpeg'
  if (/\.webp(\?|$)/.test(lower)) return 'image/webp'
  if (/\.gif(\?|$)/.test(lower)) return 'image/gif'
  if (/\.mp4(\?|$)/.test(lower)) return 'video/mp4'
  if (/\.webm(\?|$)/.test(lower)) return 'video/webm'
  if (/\.mov(\?|$)/.test(lower)) return 'video/quicktime'
  if (/\.mp3(\?|$)/.test(lower)) return 'audio/mpeg'
  if (/\.wav(\?|$)/.test(lower)) return 'audio/wav'
  return fallback
}

function fileNameFromUrl(url: string, fallback: string) {
  try {
    const pathname = new URL(url).pathname
    const base = pathname.split('/').pop()
    if (base?.trim()) return decodeURIComponent(base)
  } catch {
    // ignore
  }
  return fallback
}

/** Hydrate workbench reference slots from a Creative Circle remake payload. */
export function circleRemakeReferenceImages(
  payload: CircleRemakePayload
): ReferenceImage[] {
  let urls = durableHttpUrls(
    payload.images,
    payload.config?.images,
    payload.config?.references,
    payload.config?.input_images
  )
  // When the original had no reference images, use the finished cover as a reference.
  if (urls.length === 0) {
    const cover =
      typeof payload.config?.cover_url === 'string'
        ? payload.config.cover_url
        : ''
    urls = durableHttpUrls(cover)
  }
  return urls.map((url, index) => ({
    id: nanoid(),
    name: fileNameFromUrl(url, `reference-${index + 1}.jpg`),
    type: guessMime(url, 'image/jpeg'),
    dataUrl: url,
    url,
  }))
}

export function circleRemakeReferenceVideos(
  payload: CircleRemakePayload
): ReferenceVideo[] {
  const urls = durableHttpUrls(payload.videos, payload.config?.videos)
  return urls.map((url, index) => ({
    id: nanoid(),
    name: fileNameFromUrl(url, `reference-${index + 1}.mp4`),
    type: guessMime(url, 'video/mp4'),
    url,
  }))
}

export function circleRemakeReferenceAudios(
  payload: CircleRemakePayload
): ReferenceAudio[] {
  const urls = durableHttpUrls(payload.audios, payload.config?.audios)
  return urls.map((url, index) => ({
    id: nanoid(),
    name: fileNameFromUrl(url, `reference-${index + 1}.mp3`),
    type: guessMime(url, 'audio/mpeg'),
    url,
  }))
}
