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
import type { GenerationAssetMedia } from '@/features/generation-assets/types'
import { api } from '@/lib/api'

export type GenerationRecordFile = {
  url?: string
  mime_type?: string
  width?: number
  height?: number
  bytes?: number
  duration_ms?: number
  bitrate_kbps?: number
  video_codec?: string
  frame_rate?: string
  media?: GenerationAssetMedia
  poster_url?: string
}

export type GenerationRecord = {
  id: number
  kind: string
  source: string
  title: string
  prompt: string
  model: string
  status: string
  task_id?: string
  error?: string
  assets: GenerationRecordFile[]
  created_at: number
}

type PageData = {
  items: GenerationRecord[]
  next_cursor: string
  has_more: boolean
}

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

export async function listMyGenerationRecords(params: {
  cursor?: string
  limit?: number
  kind?: string
  status?: string
  source?: string
  keyword?: string
  startTimestamp?: number
  endTimestamp?: number
}): Promise<PageData> {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit || 10))
  if (params.cursor) query.set('cursor', params.cursor)
  if (params.kind) query.set('kind', params.kind)
  if (params.status) query.set('status', params.status)
  if (params.source) query.set('source', params.source)
  if (params.keyword) query.set('keyword', params.keyword)
  if (params.startTimestamp) query.set('start_timestamp', String(params.startTimestamp))
  if (params.endTimestamp) query.set('end_timestamp', String(params.endTimestamp))
  const res = await api.get<ApiEnvelope<PageData>>(
    `/api/generation-assets/?${query.toString()}`
  )
  const body = res.data
  if (!body?.success || !body.data) {
    throw new Error(body?.message || 'failed to load generation records')
  }
  const data = body.data
  return {
    next_cursor: data?.next_cursor || '',
    has_more: Boolean(data?.has_more),
    items: data?.items || [],
  }
}

export function generationRecordUrl(record: GenerationRecord): string {
  for (const file of record.assets || []) {
    const url = file.url?.trim() || ''
    if (/^https?:\/\//i.test(url)) return url
  }
  return ''
}
