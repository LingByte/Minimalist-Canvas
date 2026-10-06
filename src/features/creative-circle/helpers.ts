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
import type { CirclePost } from './api'

export function circleAuthorLabel(post: Pick<CirclePost, 'author'>) {
  return (
    post.author.display_name?.trim() ||
    post.author.username?.trim() ||
    `User #${post.author.id}`
  )
}

export function circleStatusLabel(
  status: string | undefined,
  t: (k: string) => string
) {
  switch (status) {
    case 'pending':
      return t('Pending review')
    case 'published':
      return t('Published')
    case 'unpublished':
      return t('Unpublished')
    case 'rejected':
      return t('Rejected')
    default:
      return status || ''
  }
}

export function circleStatusColor(status: string | undefined) {
  switch (status) {
    case 'pending':
      return 'gold'
    case 'published':
      return 'green'
    case 'unpublished':
      return 'default'
    case 'rejected':
      return 'red'
    default:
      return 'default'
  }
}

export function circleConfigUrls(
  config: Record<string, unknown> | undefined,
  keys: string[]
) {
  const out: string[] = []
  const seen = new Set<string>()
  if (!config) return out
  for (const key of keys) {
    const value = config[key]
    let list: unknown[] = []
    if (Array.isArray(value)) list = value
    else if (typeof value === 'string') list = [value]
    for (const item of list) {
      if (typeof item !== 'string') continue
      const url = item.trim()
      if (!/^https?:\/\//i.test(url)) continue
      const id = url.toLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      out.push(url)
    }
  }
  return out
}
