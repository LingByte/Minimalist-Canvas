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
import { uploadToObjectStorage } from '@/features/infinite-canvas/services/object-storage'
import {
  generationRecordUrl,
  type GenerationRecord,
} from '@/features/generation-records/api'
import { SmartImage } from '@/components/smart-image'
import { cn } from '@/lib/utils'

import type { CirclePost } from './api'

export function isVideoMediaUrl(url?: string) {
  const raw = url?.trim() || ''
  return /\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(raw)
}

export function isVideoPost(post: Pick<CirclePost, 'kind' | 'cover_url' | 'assets'>) {
  if (post.kind === 'video') return true
  if (isVideoMediaUrl(post.cover_url)) return true
  return (post.assets || []).some((file) => isVideoMediaUrl(file.url))
}

export function circleCoverUrl(post: Pick<CirclePost, 'cover_url' | 'assets'>) {
  const cover = post.cover_url?.trim() || ''
  if (cover && !isVideoMediaUrl(cover)) return cover
  for (const file of post.assets || []) {
    const poster = file.poster_url?.trim() || ''
    if (poster && !isVideoMediaUrl(poster)) return poster
  }
  return ''
}

export function circlePlaybackUrl(post: Pick<CirclePost, 'cover_url' | 'assets'>) {
  for (const file of post.assets || []) {
    const url = file.url?.trim() || ''
    if (url && isVideoMediaUrl(url)) return url
  }
  const cover = post.cover_url?.trim() || ''
  return isVideoMediaUrl(cover) ? cover : ''
}

export function recordStillUrl(record: GenerationRecord) {
  for (const file of record.assets || []) {
    const poster = file.poster_url?.trim() || ''
    if (poster && !isVideoMediaUrl(poster)) return poster
  }
  if (record.kind === 'video') return ''
  return generationRecordUrl(record)
}

export function CoverStill(props: { src: string; className?: string }) {
  return (
    <SmartImage
      src={props.src || undefined}
      alt=''
      loading='lazy'
      decoding='async'
      className={cn('bg-muted size-full object-cover', props.className)}
      fallbackClassName='size-full'
      fallbackIconClassName='size-6'
    />
  )
}

export async function captureVideoFirstFrame(src: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    const finish = (blob: Blob | null) => {
      video.removeAttribute('src')
      video.load()
      resolve(blob)
    }
    video.addEventListener('error', () => finish(null), { once: true })
    video.addEventListener(
      'seeked',
      () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, video.videoWidth)
        canvas.height = Math.max(1, video.videoHeight)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          finish(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.86)
      },
      { once: true }
    )
    video.addEventListener(
      'loadeddata',
      () => {
        try {
          video.currentTime = 0.05
        } catch {
          finish(null)
        }
      },
      { once: true }
    )
    video.src = src
  })
}

export async function resolveCirclePublishCover(
  record: GenerationRecord,
  customFile?: File | null
): Promise<string | undefined> {
  if (customFile) {
    const uploaded = await uploadToObjectStorage(customFile, {
      filename: customFile.name || 'cover.jpg',
      contentType: customFile.type || 'image/jpeg',
      purpose: 'canvas',
    })
    return uploaded?.accessUrl
  }
  const existing = recordStillUrl(record)
  if (existing) return existing
  if (record.kind !== 'video') return undefined
  const playback = generationRecordUrl(record)
  if (!playback) return undefined
  const frame = await captureVideoFirstFrame(playback)
  if (!frame) return undefined
  const uploaded = await uploadToObjectStorage(frame, {
    filename: 'cover.jpg',
    contentType: 'image/jpeg',
    purpose: 'canvas',
  })
  return uploaded?.accessUrl
}
