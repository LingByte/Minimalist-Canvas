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

export type DocsVideoProfile =
  | 'standard'
  | 'media'
  | 'multi_reference'
  | 'fixed_30s'

export type DocsVideoModelGroup = {
  profile: DocsVideoProfile
  models: string[]
}

export type DocsVideoModelsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; groups: DocsVideoModelGroup[] }

export type DocsVideoModelLabels = {
  loading: string
  unavailable: string
  empty: string
  separator: string
}

export async function getDocsVideoModels(): Promise<DocsVideoModelGroup[]> {
  const res = await api.get('/api/docs/video-models', {
    skipErrorHandler: true,
  })
  if (!res.data?.success) {
    throw new Error(res.data?.message || 'Failed to load video models')
  }
  return (res.data.data ?? []) as DocsVideoModelGroup[]
}

const VIDEO_MODEL_LIST_RE = /\{\{videoModels:([a-z_0-9]+)\}\}/g
const VIDEO_MODEL_EXAMPLE_RE = /\{\{videoModel:([a-z_0-9]+)\}\}/g
const EXAMPLE_MODEL_FALLBACK = 'YOUR_VIDEO_MODEL'

/**
 * Fills `{{videoModels:<profile>}}` with the live model list and
 * `{{videoModel:<profile>}}` with a real model name for request examples.
 */
export function renderDocsVideoModels(
  markdown: string,
  state: DocsVideoModelsState,
  labels: DocsVideoModelLabels
): string {
  const modelsByProfile = new Map<string, string[]>()
  if (state.status === 'ready') {
    for (const group of state.groups) {
      modelsByProfile.set(group.profile, group.models)
    }
  }

  return markdown
    .replaceAll(VIDEO_MODEL_LIST_RE, (_, profile: string) => {
      if (state.status === 'loading') return `*${labels.loading}*`
      if (state.status === 'error') return `*${labels.unavailable}*`
      const models = modelsByProfile.get(profile) ?? []
      if (models.length === 0) return `*${labels.empty}*`
      return models.map((name) => `\`${name}\``).join(labels.separator)
    })
    .replaceAll(
      VIDEO_MODEL_EXAMPLE_RE,
      (_, profile: string) =>
        modelsByProfile.get(profile)?.[0] ?? EXAMPLE_MODEL_FALLBACK
    )
}
