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
import { api } from '@/lib/api'

import type { Campaign, CampaignInput } from './types'

type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

function unwrap<T>(body: ApiResponse<T>): T {
  if (!body.success || body.data === undefined) {
    throw new Error(body.message || 'Request failed')
  }
  return body.data
}

export async function listActiveCampaigns(): Promise<Campaign[]> {
  const res = await api.get<ApiResponse<Campaign[] | null>>('/api/campaigns/')
  return unwrap(res.data) ?? []
}

/** Resolves to null when the campaign does not exist or is not running. */
export async function getActiveCampaign(
  slug: string
): Promise<Campaign | null> {
  const res = await api.get<ApiResponse<Campaign>>(
    `/api/campaigns/by-slug/${encodeURIComponent(slug)}`,
    { skipErrorHandler: true, validateStatus: (s) => s < 500 }
  )
  if (res.status === 404) return null
  return unwrap(res.data)
}

export async function adminListCampaigns(): Promise<Campaign[]> {
  const res = await api.get<ApiResponse<Campaign[] | null>>(
    '/api/campaigns/admin/'
  )
  return unwrap(res.data) ?? []
}

export async function adminGetCampaign(id: number): Promise<Campaign> {
  const res = await api.get<ApiResponse<Campaign>>(`/api/campaigns/admin/${id}`)
  return unwrap(res.data)
}

export async function adminSaveCampaign(
  id: number | null,
  input: CampaignInput
): Promise<Campaign> {
  const res =
    id === null
      ? await api.post<ApiResponse<Campaign>>('/api/campaigns/admin/', input)
      : await api.put<ApiResponse<Campaign>>(
          `/api/campaigns/admin/${id}`,
          input
        )
  return unwrap(res.data)
}

export async function adminDeleteCampaign(id: number): Promise<void> {
  const res = await api.delete<ApiResponse<null>>(`/api/campaigns/admin/${id}`)
  if (!res.data.success) throw new Error(res.data.message || 'Request failed')
}

type UploadResponse = {
  success: boolean
  message?: string
  data?: { access_url: string }
}

/** Uploads a campaign image to object storage and returns its public URL. */
export async function uploadCampaignImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', 'campaign')
  const res = await api.post<UploadResponse>('/api/storage/upload', form, {
    skipErrorHandler: true,
  })
  const url = res.data?.data?.access_url
  if (!res.data?.success || !url) {
    throw new Error(res.data?.message || 'Upload failed')
  }
  return url
}
