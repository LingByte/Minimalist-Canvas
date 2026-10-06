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
import type { TFunction } from 'i18next'

import type { GenerationAssetFile } from './types'

type MediaFact = {
  key: string
  label: string
  value: string
}

function formatDuration(seconds?: number, durationMs?: number): string {
  const sec =
    seconds && seconds > 0
      ? seconds
      : durationMs && durationMs > 0
        ? durationMs / 1000
        : 0
  if (sec <= 0) return ''
  return `${sec.toFixed(sec >= 10 ? 1 : 2).replace(/\.0$/, '')}s`
}

function formatBitrate(bps?: number, kbps?: number): string {
  const bits = bps && bps > 0 ? bps : kbps && kbps > 0 ? kbps * 1000 : 0
  if (bits <= 0) return ''
  if (bits >= 1_000_000) {
    return `${(bits / 1_000_000).toFixed(2).replace(/\.00$/, '')} Mbps`
  }
  return `${Math.round(bits / 1000)} kbps`
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function pushFact(
  rows: MediaFact[],
  key: string,
  label: string,
  value: string | number | undefined
) {
  if (value === undefined || value === null || value === '') return
  if (typeof value === 'number' && !Number.isFinite(value)) return
  if (typeof value === 'number' && value === 0) return
  const text = String(value).trim()
  if (!text || text === 'und' || text === '0/0') return
  rows.push({ key, label, value: text })
}

export function collectAssetMediaFacts(
  file: GenerationAssetFile,
  t: TFunction
): MediaFact[] {
  const video = file.media?.video
  const audio = file.media?.audio
  const format = file.media?.format
  const rows: MediaFact[] = []
  const width = video?.width || file.width
  const height = video?.height || file.height
  if (width && height) {
    pushFact(rows, 'resolution', t('Resolution'), `${width}×${height}`)
  }
  pushFact(
    rows,
    'duration',
    t('Duration'),
    formatDuration(video?.duration || format?.duration, file.duration_ms)
  )
  pushFact(
    rows,
    'container',
    t('Container'),
    format?.name?.split(',')[0] || format?.long_name
  )
  pushFact(
    rows,
    'size',
    t('File size'),
    formatBytes(format?.size || file.bytes)
  )
  pushFact(
    rows,
    'container-bitrate',
    t('Container bitrate'),
    formatBitrate(format?.bit_rate, file.bitrate_kbps)
  )
  pushFact(
    rows,
    'video-codec',
    t('Video codec'),
    video?.codec_name || file.video_codec
  )
  pushFact(rows, 'video-profile', t('Video profile'), video?.profile)
  if (video?.level) {
    pushFact(rows, 'video-level', t('Level'), String(video.level))
  }
  pushFact(
    rows,
    'frame-rate',
    t('Frame rate'),
    video?.frame_rate || file.frame_rate
  )
  if (video?.avg_frame_rate && video.avg_frame_rate !== video.frame_rate) {
    pushFact(rows, 'avg-frame-rate', t('Average frame rate'), video.avg_frame_rate)
  }
  pushFact(
    rows,
    'video-bitrate',
    t('Video bitrate'),
    formatBitrate(video?.bit_rate)
  )
  pushFact(rows, 'pixel-format', t('Pixel format'), video?.pix_fmt)
  pushFact(
    rows,
    'aspect-ratio',
    t('Aspect ratio'),
    video?.display_aspect_ratio
  )
  if (video?.coded_width && video?.coded_height) {
    const coded = `${video.coded_width}×${video.coded_height}`
    if (coded !== `${width}×${height}`) {
      pushFact(rows, 'coded', t('Coded resolution'), coded)
    }
  }
  if (video?.nb_frames) {
    pushFact(rows, 'frames', t('Frames'), String(video.nb_frames))
  }
  if (video?.has_b_frames) {
    pushFact(rows, 'b-frames', t('B-frames'), String(video.has_b_frames))
  }
  pushFact(rows, 'video-encoder', t('Video encoder'), video?.encoder)
  pushFact(rows, 'audio-codec', t('Audio codec'), audio?.codec_name)
  pushFact(rows, 'audio-profile', t('Audio profile'), audio?.profile)
  if (audio?.sample_rate) {
    pushFact(rows, 'sample-rate', t('Sample rate'), `${audio.sample_rate} Hz`)
  }
  if (audio?.channels) {
    const layout = audio.channel_layout ? ` (${audio.channel_layout})` : ''
    pushFact(rows, 'channels', t('Channels'), `${audio.channels}${layout}`)
  }
  pushFact(rows, 'sample-fmt', t('Sample format'), audio?.sample_fmt)
  pushFact(
    rows,
    'audio-bitrate',
    t('Audio bitrate'),
    formatBitrate(audio?.bit_rate)
  )
  pushFact(rows, 'audio-encoder', t('Audio encoder'), audio?.encoder)
  pushFact(rows, 'container-encoder', t('Container encoder'), format?.encoder)
  if (format?.nb_streams) {
    pushFact(rows, 'streams', t('Streams'), String(format.nb_streams))
  }
  pushFact(rows, 'mime', t('MIME type'), file.mime_type)
  return rows
}

export function AssetMediaFacts({
  file,
  t,
}: {
  file: GenerationAssetFile
  t: TFunction
}) {
  const rows = collectAssetMediaFacts(file, t)
  if (rows.length === 0) return null
  return (
    <div className='mt-3'>
      <div className='text-muted-foreground mb-2 text-xs font-medium'>
        {t('Media details')}
      </div>
      <dl className='grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3'>
        {rows.map((row) => (
          <div key={row.key} className='min-w-0'>
            <dt className='text-muted-foreground text-[11px]'>{row.label}</dt>
            <dd className='text-foreground truncate text-xs' title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
