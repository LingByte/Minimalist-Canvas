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

import type { GenerationAssetFile } from './types'

type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data?: T
}

export type AdminTaskDetail = {
  id: number
  task_id: string
  platform: string
  user_id: number
  channel_id: number
  group: string
  quota: number
  action: string
  status: string
  fail_reason: string
  progress: string
  submit_time: number
  start_time: number
  finish_time: number
  created_at: number
  updated_at: number
  properties: { input?: string } | null
  data: unknown
  result_url: string
  result_url_is_cdn: boolean
  upstream_task_id: string
  username?: string
  asset_kind?: string
  assets?: GenerationAssetFile[]
  request_id?: string
  client_ip?: string
  user_agent?: string
  token_id?: number
  token_name?: string
  origin?: string
  path?: string
  attempt_id?: string
}

function unwrap<T>(res: { data: ApiEnvelope<T> }, fallback: string): T {
  if (!res.data?.success || res.data.data == null) {
    throw new Error(res.data?.message || fallback)
  }
  return res.data.data
}

export async function adminGetTaskDetail(
  taskId: string
): Promise<AdminTaskDetail> {
  const res = await api.get<ApiEnvelope<AdminTaskDetail>>(
    `/api/generation-assets/admin/task/${encodeURIComponent(taskId)}`
  )
  return unwrap(res, 'failed to load task detail')
}
