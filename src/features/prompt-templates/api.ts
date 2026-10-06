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

import type {
  PromptSourceItem,
  PromptTemplateInput,
  PromptTemplateItem,
  PromptTemplatePage,
} from './types'

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

function unwrap<T>(res: { data?: ApiEnvelope<T> }, fallback: string): T {
  const body = res.data
  if (!body?.success || body.data === undefined) {
    throw new Error(body?.message || fallback)
  }
  return body.data
}

function normalizeTemplate(item: PromptTemplateItem): PromptTemplateItem {
  return {
    ...item,
    description: item.description || '',
    coverUrl: item.coverUrl || '',
    referenceImageUrls: Array.isArray(item.referenceImageUrls)
      ? item.referenceImageUrls
      : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    preview: item.preview || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
    sourceId: item.sourceId || '',
    category: item.category || '',
    githubUrl: item.githubUrl || '',
  }
}

export async function listPromptSources(): Promise<PromptSourceItem[]> {
  const res = await api.get<
    ApiEnvelope<{ items: PromptSourceItem[]; total: number }>
  >('/api/prompts/sources')
  const data = unwrap(res, 'failed to load prompt sources')
  return data.items || []
}

export async function setPromptSourceEnabled(
  sourceId: string,
  enabled: boolean
): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>(
    `/api/prompts/sources/${encodeURIComponent(sourceId)}`,
    { enabled }
  )
  unwrap(res, 'failed to update prompt source')
}

export async function createManagedCatalog(input: {
  name: string
  homepage?: string
  id?: string
}): Promise<PromptSourceItem> {
  const res = await api.post<ApiEnvelope<PromptSourceItem>>(
    '/api/prompts/sources/managed',
    {
      name: input.name,
      homepage: input.homepage || '',
      id: input.id || '',
    }
  )
  return unwrap(res, 'failed to create catalog')
}

export async function updateManagedCatalog(
  sourceId: string,
  input: { name: string; homepage?: string }
): Promise<PromptSourceItem> {
  const res = await api.put<ApiEnvelope<PromptSourceItem>>(
    `/api/prompts/sources/${encodeURIComponent(sourceId)}/managed`,
    {
      name: input.name,
      homepage: input.homepage || '',
    }
  )
  return unwrap(res, 'failed to update catalog')
}

export async function deleteManagedCatalog(sourceId: string): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>(
    `/api/prompts/sources/${encodeURIComponent(sourceId)}/managed`
  )
  unwrap(res, 'failed to delete catalog')
}

export async function listPromptTemplatesBySource({
  sourceId,
  keyword = '',
  cursor = '',
  limit = 20,
}: {
  sourceId: string
  keyword?: string
  cursor?: string
  limit?: number
}): Promise<PromptTemplatePage> {
  const params = new URLSearchParams()
  params.set('limit', String(Math.max(1, Math.min(100, limit))))
  if (keyword.trim()) params.set('keyword', keyword.trim())
  if (cursor.trim()) params.set('cursor', cursor.trim())
  const res = await api.get<ApiEnvelope<PromptTemplatePage>>(
    `/api/prompts/by-source/${encodeURIComponent(sourceId)}?${params.toString()}`
  )
  const data = unwrap(res, 'failed to load prompt templates')
  return {
    items: (data.items || []).map(normalizeTemplate),
    nextCursor: data.nextCursor || '',
    total: data.total || 0,
  }
}

export async function createPromptTemplate(
  sourceId: string,
  input: PromptTemplateInput
): Promise<PromptTemplateItem> {
  const res = await api.post<ApiEnvelope<PromptTemplateItem>>(
    `/api/prompts/by-source/${encodeURIComponent(sourceId)}/templates`,
    input
  )
  return normalizeTemplate(unwrap(res, 'failed to create template'))
}

export async function updatePromptTemplate(
  sourceId: string,
  templateId: string,
  input: PromptTemplateInput
): Promise<PromptTemplateItem> {
  const res = await api.put<ApiEnvelope<PromptTemplateItem>>(
    `/api/prompts/by-source/${encodeURIComponent(sourceId)}/templates/${encodeURIComponent(templateId)}`,
    input
  )
  return normalizeTemplate(unwrap(res, 'failed to update template'))
}

export async function deletePromptTemplate(
  sourceId: string,
  templateId: string
): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>(
    `/api/prompts/by-source/${encodeURIComponent(sourceId)}/templates/${encodeURIComponent(templateId)}`
  )
  unwrap(res, 'failed to delete template')
}
