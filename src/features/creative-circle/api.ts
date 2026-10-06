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

import type { GenerationAssetFile } from '@/features/generation-assets/types'

export type CircleAuthor = {
  id: number
  username: string
  display_name: string
}

export type CircleAssetFile = GenerationAssetFile

export type CirclePostStatus =
  | 'pending'
  | 'published'
  | 'unpublished'
  | 'rejected'
  | 'removed'

export function canRemakeCirclePost(post: { status?: CirclePostStatus | string }) {
  return !post.status || post.status === 'published'
}

export type CirclePost = {
  id: number
  kind: string
  title: string
  prompt: string
  model: string
  cover_url: string
  assets: CircleAssetFile[]
  config?: Record<string, unknown>
  status?: CirclePostStatus | string
  like_count: number
  favorite_count: number
  comment_count: number
  remake_count: number
  liked: boolean
  favorited: boolean
  created_at: number
  author: CircleAuthor
  generation_asset_id?: number
}

export type CircleComment = {
  id: number
  parent_id?: number
  body: string
  created_at: number
  author: CircleAuthor
}

export type CircleRemakePayload = {
  kind: string
  prompt: string
  model: string
  config: Record<string, unknown>
  title?: string
  images?: string[]
  videos?: string[]
  audios?: string[]
}

type FeedPage = {
  items: CirclePost[]
  next_cursor: string
  has_more: boolean
}

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

function unwrap<T>(body: ApiEnvelope<T> | undefined, fallback: string): T {
  if (!body?.success || body.data === undefined) {
    throw new Error(body?.message || fallback)
  }
  return body.data
}

export async function listCircleFeed(params: {
  cursor?: string
  limit?: number
  kind?: string
  userId?: number
  sort?: 'latest' | 'hot'
}): Promise<FeedPage> {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit || 24))
  if (params.cursor) query.set('cursor', params.cursor)
  if (params.kind) query.set('kind', params.kind)
  if (params.userId) query.set('user_id', String(params.userId))
  if (params.sort) query.set('sort', params.sort)
  const res = await api.get<ApiEnvelope<FeedPage>>(
    `/api/circle/feed?${query.toString()}`
  )
  const data = unwrap(res.data, 'failed to load creative circle')
  return {
    items: data.items || [],
    next_cursor: data.next_cursor || '',
    has_more: Boolean(data.has_more),
  }
}

export async function listMyCirclePosts(params: {
  cursor?: string
  limit?: number
  status?: string
}): Promise<FeedPage> {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit || 24))
  if (params.cursor) query.set('cursor', params.cursor)
  if (params.status) query.set('status', params.status)
  const res = await api.get<ApiEnvelope<FeedPage>>(
    `/api/circle/me/posts?${query.toString()}`
  )
  const data = unwrap(res.data, 'failed to load my posts')
  return {
    items: data.items || [],
    next_cursor: data.next_cursor || '',
    has_more: Boolean(data.has_more),
  }
}

export async function listCircleReviewQueue(params: {
  cursor?: string
  limit?: number
  status?: string
}): Promise<FeedPage> {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit || 24))
  if (params.cursor) query.set('cursor', params.cursor)
  if (params.status) query.set('status', params.status)
  const res = await api.get<ApiEnvelope<FeedPage>>(
    `/api/circle/review?${query.toString()}`
  )
  const data = unwrap(res.data, 'failed to load review queue')
  return {
    items: data.items || [],
    next_cursor: data.next_cursor || '',
    has_more: Boolean(data.has_more),
  }
}

export async function getCirclePost(id: number): Promise<CirclePost> {
  const res = await api.get<ApiEnvelope<CirclePost>>(`/api/circle/posts/${id}`)
  return unwrap(res.data, 'failed to load post')
}

export async function publishCirclePost(input: {
  generation_asset_id: number
  title?: string
  cover_url?: string
}): Promise<CirclePost> {
  const res = await api.post<ApiEnvelope<CirclePost>>('/api/circle/posts', input)
  return unwrap(res.data, 'failed to publish')
}

export async function updateCirclePost(
  id: number,
  title: string
): Promise<CirclePost> {
  const res = await api.put<ApiEnvelope<CirclePost>>(`/api/circle/posts/${id}`, {
    title,
  })
  return unwrap(res.data, 'failed to update post')
}

export async function setCirclePostStatus(
  id: number,
  status: 'unpublished' | 'pending' | 'removed'
): Promise<CirclePost> {
  const res = await api.post<ApiEnvelope<CirclePost>>(
    `/api/circle/posts/${id}/status`,
    { status }
  )
  return unwrap(res.data, 'failed to update status')
}

export async function reviewCirclePost(
  id: number,
  action: 'approve' | 'reject'
): Promise<CirclePost> {
  const res = await api.post<ApiEnvelope<CirclePost>>(
    `/api/circle/posts/${id}/review`,
    { action }
  )
  return unwrap(res.data, 'failed to review post')
}

export async function adminHideCirclePost(id: number): Promise<void> {
  const res = await api.post<ApiEnvelope<{ id: number }>>(
    `/api/circle/posts/${id}/hide`
  )
  unwrap(res.data, 'failed to hide post')
}

export async function deleteCirclePost(id: number): Promise<void> {
  const res = await api.delete<ApiEnvelope<{ id: number }>>(
    `/api/circle/posts/${id}`
  )
  unwrap(res.data, 'failed to delete post')
}

export async function reportCirclePost(
  id: number,
  reason: string
): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>(
    `/api/circle/posts/${id}/report`,
    { reason }
  )
  unwrap(res.data, 'failed to report post')
}

export async function toggleCircleReaction(
  id: number,
  type: 'like' | 'favorite'
): Promise<{
  liked: boolean
  favorited: boolean
  like_count: number
  favorite_count: number
}> {
  const res = await api.post<
    ApiEnvelope<{
      liked: boolean
      favorited: boolean
      like_count: number
      favorite_count: number
    }>
  >(`/api/circle/posts/${id}/reactions`, { type })
  return unwrap(res.data, 'failed to update reaction')
}

export async function listCircleComments(
  id: number
): Promise<CircleComment[]> {
  const res = await api.get<ApiEnvelope<{ items: CircleComment[] }>>(
    `/api/circle/posts/${id}/comments`
  )
  return unwrap(res.data, 'failed to load comments').items || []
}

export async function createCircleComment(
  id: number,
  body: string,
  parentId?: number
): Promise<CircleComment> {
  const res = await api.post<ApiEnvelope<CircleComment>>(
    `/api/circle/posts/${id}/comments`,
    { body, parent_id: parentId || 0 }
  )
  return unwrap(res.data, 'failed to comment')
}

export async function deleteCircleComment(commentId: number): Promise<void> {
  const res = await api.delete<ApiEnvelope<{ id: number }>>(
    `/api/circle/comments/${commentId}`
  )
  unwrap(res.data, 'failed to delete comment')
}

export async function fetchCircleRemakePayload(
  id: number
): Promise<CircleRemakePayload> {
  const res = await api.post<ApiEnvelope<CircleRemakePayload>>(
    `/api/circle/posts/${id}/remake`
  )
  return unwrap(res.data, 'failed to prepare remake')
}

export async function listMyCircleReactions(params: {
  type: 'like' | 'favorite'
  cursor?: string
  limit?: number
}): Promise<FeedPage> {
  const query = new URLSearchParams()
  query.set('type', params.type)
  query.set('limit', String(params.limit || 24))
  if (params.cursor) query.set('cursor', params.cursor)
  const res = await api.get<ApiEnvelope<FeedPage>>(
    `/api/circle/reactions/self?${query.toString()}`
  )
  const data = unwrap(res.data, 'failed to load reactions')
  return {
    items: data.items || [],
    next_cursor: data.next_cursor || '',
    has_more: Boolean(data.has_more),
  }
}

export const CIRCLE_REMAKE_STORAGE_KEY = 'creative-circle:remake'

export function storeCircleRemake(payload: CircleRemakePayload) {
  try {
    sessionStorage.setItem(CIRCLE_REMAKE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

export function peekCircleRemake(): CircleRemakePayload | null {
  try {
    const raw = sessionStorage.getItem(CIRCLE_REMAKE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CircleRemakePayload
  } catch {
    return null
  }
}

export function clearCircleRemake() {
  try {
    sessionStorage.removeItem(CIRCLE_REMAKE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function consumeCircleRemake(
  expectedKind?: string
): CircleRemakePayload | null {
  const payload = peekCircleRemake()
  if (!payload) return null
  if (expectedKind && payload.kind !== expectedKind) return null
  clearCircleRemake()
  return payload
}

export function circlePostShareUrl(postId: number): string {
  const path = `/creative-circle/${postId}`
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}
