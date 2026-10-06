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

export type LibraryPrompt = {
  id: string
  title: string
  prompt: string
  description: string
  coverUrl: string
  tags: string[]
  author?: string
  category: string
}

export type LibraryPage = {
  items: LibraryPrompt[]
  tags: string[]
  categories: string[]
  total: number
}

export type PromptSubmission = {
  id: number
  user_id: number
  username: string
  title: string
  prompt: string
  description: string
  cover_url: string
  tags: string[]
  status: string
  review_note: string
  created_time: number
  reviewed_at: number
}

export type SubmissionPage = {
  items: PromptSubmission[]
  total: number
  page: number
  page_size: number
}

export async function listPromptLibrary(params: {
  page: number
  pageSize: number
  keyword?: string
  category?: string
}): Promise<LibraryPage> {
  const query = new URLSearchParams()
  query.set('p', String(params.page))
  query.set('page_size', String(params.pageSize))
  if (params.keyword) query.set('keyword', params.keyword)
  if (params.category) query.set('category', params.category)
  const res = await api.get<ApiEnvelope<LibraryPage>>(
    `/api/prompts/?${query.toString()}`
  )
  const data = unwrap(res, 'failed to load prompt library')
  return {
    items: data.items || [],
    tags: data.tags || [],
    categories: data.categories || [],
    total: data.total || 0,
  }
}

export async function submitPrompt(input: {
  title: string
  prompt: string
  description?: string
  cover_url?: string
  tags?: string[]
}): Promise<PromptSubmission> {
  const res = await api.post<ApiEnvelope<PromptSubmission>>(
    '/api/prompts/submissions',
    input
  )
  return unwrap(res, 'failed to submit prompt')
}

export async function listMyPromptSubmissions(
  page: number,
  pageSize: number
): Promise<SubmissionPage> {
  const query = new URLSearchParams()
  query.set('p', String(page))
  query.set('page_size', String(pageSize))
  const res = await api.get<ApiEnvelope<SubmissionPage>>(
    `/api/prompts/submissions/self?${query.toString()}`
  )
  return unwrap(res, 'failed to load submissions')
}

export async function listReviewSubmissions(params: {
  page: number
  pageSize: number
  status?: string
}): Promise<SubmissionPage> {
  const query = new URLSearchParams()
  query.set('p', String(params.page))
  query.set('page_size', String(params.pageSize))
  if (params.status) query.set('status', params.status)
  const res = await api.get<ApiEnvelope<SubmissionPage>>(
    `/api/prompts/submissions?${query.toString()}`
  )
  return unwrap(res, 'failed to load submissions')
}

export async function reviewPromptSubmission(
  id: number,
  action: 'approve' | 'reject',
  note: string
): Promise<PromptSubmission> {
  const res = await api.post<ApiEnvelope<PromptSubmission>>(
    `/api/prompts/submissions/${id}/review`,
    { action, note }
  )
  return unwrap(res, 'failed to review submission')
}
