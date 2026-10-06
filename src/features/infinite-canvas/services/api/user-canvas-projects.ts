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
  /** Object-storage object key when the project body is stored in OSS. */
  content_key?: string
  created_at: number
  updated_at: number
}

export type UserCanvasProjectDTO = {
  id: number
  client_id: string
  title: string
  /** Object-storage object key when the project body is stored in OSS. */
  content_key?: string
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
  const ids = clientIds.map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) return 0
  const res = await api.post<ApiEnvelope<{ deleted?: number }>>(
    '/api/user-canvas-projects/batch-delete-by-client-id',
    { client_ids: ids },
    { skipErrorHandler: true }
  )
  if (!res.data?.success) {
    throw new Error(res.data?.message || 'Failed to delete canvas projects')
  }
  return Number(res.data?.data?.deleted || 0)
}

export type UserCanvasProjectVersionSummary = {
  id: number
  client_id: string
  title: string
  project_size: number
  created_at: number
  is_current?: boolean
}

export async function listUserCanvasProjectVersions(
  clientId: string
): Promise<UserCanvasProjectVersionSummary[]> {
  const res = await api.get<
    ApiEnvelope<{ items?: UserCanvasProjectVersionSummary[]; total?: number }>
  >(`/api/user-canvas-projects/by-client-id/${encodeURIComponent(clientId)}/versions`, {
    skipErrorHandler: true,
  })
  if (!res.data?.success) {
    throw new Error(res.data?.message || 'Failed to load version history')
  }
  return res.data.data?.items || []
}

export async function getUserCanvasProjectVersion(
  clientId: string,
  versionId: number
): Promise<UserCanvasProjectDTO> {
  const res = await api.get<ApiEnvelope<UserCanvasProjectDTO>>(
    `/api/user-canvas-projects/by-client-id/${encodeURIComponent(clientId)}/versions/${versionId}`,
    { skipErrorHandler: true }
  )
  if (!res.data?.success || !res.data.data) {
    throw new Error(res.data?.message || 'Failed to load version')
  }
  return res.data.data
}

export async function restoreUserCanvasProjectVersion(
  clientId: string,
  versionId: number
): Promise<UserCanvasProjectDTO> {
  const res = await api.post<ApiEnvelope<UserCanvasProjectDTO>>(
    `/api/user-canvas-projects/by-client-id/${encodeURIComponent(clientId)}/versions/${versionId}/restore`,
    {},
    { skipErrorHandler: true }
  )
  if (!res.data?.success || !res.data.data) {
    throw new Error(res.data?.message || 'Failed to restore version')
  }
  return res.data.data
}
