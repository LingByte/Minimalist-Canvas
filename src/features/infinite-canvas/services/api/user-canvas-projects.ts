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
import type { CanvasProject } from '@canvas/stores/canvas/use-canvas-store'

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

export type UserCanvasProjectSummary = {
  id: number
  client_id: string
  title: string
  created_at: number
  updated_at: number
}

export type UserCanvasProjectDTO = {
  id: number
  client_id: string
  title: string
  project: CanvasProject
  created_at: number
  updated_at: number
}

export async function listUserCanvasProjects(): Promise<UserCanvasProjectSummary[]> {
  try {
    const res = await api.get<
      ApiEnvelope<{ items?: UserCanvasProjectSummary[]; total?: number }>
    >('/api/user-canvas-projects/', { skipErrorHandler: true })
    if (!res.data?.success || !res.data.data?.items) return []
    return res.data.data.items
  } catch {
    return []
  }
}

export async function getUserCanvasProjectByClientId(
  clientId: string
): Promise<UserCanvasProjectDTO | null> {
  try {
    const res = await api.get<ApiEnvelope<UserCanvasProjectDTO>>(
      `/api/user-canvas-projects/by-client-id/${encodeURIComponent(clientId)}`,
      { skipErrorHandler: true }
    )
    if (!res.data?.success || !res.data.data) return null
    return res.data.data
  } catch {
    return null
  }
}

/** Silent backup upsert — failures are swallowed by the caller. */
export async function putUserCanvasProjectByClientId(
  clientId: string,
  project: CanvasProject
): Promise<UserCanvasProjectDTO | null> {
  try {
    const res = await api.put<ApiEnvelope<UserCanvasProjectDTO>>(
      `/api/user-canvas-projects/by-client-id/${encodeURIComponent(clientId)}`,
      project,
      { skipErrorHandler: true }
    )
    if (!res.data?.success || !res.data.data) return null
    return res.data.data
  } catch {
    return null
  }
}

export async function deleteUserCanvasProjectsByClientIds(
  clientIds: string[]
): Promise<number> {
  try {
    const res = await api.post<ApiEnvelope<{ deleted?: number }>>(
      '/api/user-canvas-projects/batch-delete-by-client-id',
      { client_ids: clientIds },
      { skipErrorHandler: true }
    )
    return Number(res.data?.data?.deleted || 0)
  } catch {
    return 0
  }
}
