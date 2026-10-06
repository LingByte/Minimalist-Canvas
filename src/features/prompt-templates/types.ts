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
export type PromptSourceItem = {
  id: string
  name: string
  url: string
  homepage: string
  enabled: boolean
  builtIn: boolean
  prompt_count?: number
  last_success_at?: string
  last_error?: string
}

export type PromptTemplateItem = {
  id: string
  title: string
  prompt: string
  description: string
  coverUrl: string
  referenceImageUrls: string[]
  tags: string[]
  preview: string
  createdAt: string
  updatedAt: string
  author?: string
  sourceUrl?: string
  sourceId: string
  category: string
  githubUrl: string
}

export type PromptTemplatePage = {
  items: PromptTemplateItem[]
  nextCursor: string
  total: number
}

export type PromptTemplateInput = {
  title: string
  prompt: string
  description?: string
  coverUrl?: string
  referenceImageUrls?: string[]
  tags?: string[]
  preview?: string
  author?: string
  githubUrl?: string
}

export function canDeleteCatalog(source: PromptSourceItem | null | undefined) {
  return Boolean(source && !source.builtIn)
}

export function canEditCatalogMeta(source: PromptSourceItem | null | undefined) {
  return Boolean(source && !source.builtIn)
}
