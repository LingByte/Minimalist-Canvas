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

export type DocsSectionId =
  | 'quick-start'
  | 'authentication'
  | 'chat-completions'
  | 'responses'
  | 'alpha-search'
  | 'claude-messages'
  | 'models'
  | 'openai-models'
  | 'gemini'
  | 'image-generation'
  | 'video'
  | 'embeddings'
  | 'path-embeddings'
  | 'audio'
  | 'rerank'
  | 'billing'
  | 'usage'
  | 'token-usage'
  | 'token-logs'
  | 'errors'

export type DocsHttpMethod = 'GET' | 'POST'

export type DocsGroupId = 'guides' | 'reference'

export type DocsSection = {
  id: DocsSectionId
  titleKey: string
  descriptionKey: string
  group: DocsGroupId
  method?: DocsHttpMethod
  path?: string
}

export const DOCS_DEFAULT_SECTION: DocsSectionId = 'quick-start'

export const DOCS_GROUPS: { id: DocsGroupId; titleKey: string }[] = [
  { id: 'guides', titleKey: 'docs.groups.guides' },
  { id: 'reference', titleKey: 'docs.groups.reference' },
]

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'quick-start',
    titleKey: 'docs.sections.quickStart',
    descriptionKey: 'docs.descriptions.quickStart',
    group: 'guides',
  },
  {
    id: 'authentication',
    titleKey: 'docs.sections.authentication',
    descriptionKey: 'docs.descriptions.authentication',
    group: 'guides',
  },
  {
    id: 'errors',
    titleKey: 'docs.sections.errors',
    descriptionKey: 'docs.descriptions.errors',
    group: 'guides',
  },
  {
    id: 'chat-completions',
    titleKey: 'docs.sections.chatCompletions',
    descriptionKey: 'docs.descriptions.chatCompletions',
    group: 'reference',
    method: 'POST',
    path: '/chat/completions',
  },
  {
    id: 'responses',
    titleKey: 'docs.sections.responses',
    descriptionKey: 'docs.descriptions.responses',
    group: 'reference',
    method: 'POST',
    path: '/responses',
  },
  {
    id: 'alpha-search',
    titleKey: 'docs.sections.alphaSearch',
    descriptionKey: 'docs.descriptions.alphaSearch',
    group: 'reference',
    method: 'POST',
    path: '/alpha/search',
  },
  {
    id: 'claude-messages',
    titleKey: 'docs.sections.claudeMessages',
    descriptionKey: 'docs.descriptions.claudeMessages',
    group: 'reference',
    method: 'POST',
    path: '/messages',
  },
  {
    id: 'models',
    titleKey: 'docs.sections.models',
    descriptionKey: 'docs.descriptions.models',
    group: 'reference',
    method: 'GET',
    path: '/models',
  },
  {
    id: 'openai-models',
    titleKey: 'docs.sections.openaiModels',
    descriptionKey: 'docs.descriptions.openaiModels',
    group: 'reference',
    method: 'GET',
    path: '/v1beta/openai/models',
  },
  {
    id: 'gemini',
    titleKey: 'docs.sections.gemini',
    descriptionKey: 'docs.descriptions.gemini',
    group: 'reference',
    method: 'POST',
    path: '/models/{model}:generateContent',
  },
  {
    id: 'embeddings',
    titleKey: 'docs.sections.embeddings',
    descriptionKey: 'docs.descriptions.embeddings',
    group: 'reference',
    method: 'POST',
    path: '/embeddings',
  },
  {
    id: 'path-embeddings',
    titleKey: 'docs.sections.pathEmbeddings',
    descriptionKey: 'docs.descriptions.pathEmbeddings',
    group: 'reference',
    method: 'POST',
    path: '/engines/{model}/embeddings',
  },
  {
    id: 'image-generation',
    titleKey: 'docs.sections.imageGeneration',
    descriptionKey: 'docs.descriptions.imageGeneration',
    group: 'reference',
    method: 'POST',
    path: '/images/generations',
  },
  {
    id: 'video',
    titleKey: 'docs.sections.video',
    descriptionKey: 'docs.descriptions.video',
    group: 'reference',
    method: 'POST',
    path: '/videos',
  },
  {
    id: 'audio',
    titleKey: 'docs.sections.audio',
    descriptionKey: 'docs.descriptions.audio',
    group: 'reference',
    method: 'POST',
    path: '/audio/speech',
  },
  {
    id: 'rerank',
    titleKey: 'docs.sections.rerank',
    descriptionKey: 'docs.descriptions.rerank',
    group: 'reference',
    method: 'POST',
    path: '/rerank',
  },
  {
    id: 'billing',
    titleKey: 'docs.sections.billing',
    descriptionKey: 'docs.descriptions.billing',
    group: 'reference',
    method: 'GET',
    path: '/dashboard/billing/subscription',
  },
  {
    id: 'usage',
    titleKey: 'docs.sections.usage',
    descriptionKey: 'docs.descriptions.usage',
    group: 'reference',
    method: 'GET',
    path: '/dashboard/billing/usage',
  },
  {
    id: 'token-usage',
    titleKey: 'docs.sections.tokenUsage',
    descriptionKey: 'docs.descriptions.tokenUsage',
    group: 'reference',
    method: 'GET',
    path: '/api/usage/token',
  },
  {
    id: 'token-logs',
    titleKey: 'docs.sections.tokenLogs',
    descriptionKey: 'docs.descriptions.tokenLogs',
    group: 'reference',
    method: 'GET',
    path: '/api/log/token',
  },
]

export const DOCS_SECTION_IDS = DOCS_SECTIONS.map((section) => section.id)

export function isDocsSectionId(value: string): value is DocsSectionId {
  return (DOCS_SECTION_IDS as string[]).includes(value)
}

export function getDocsSection(id: DocsSectionId): DocsSection | undefined {
  return DOCS_SECTIONS.find((section) => section.id === id)
}

export function getAdjacentDocsSections(id: DocsSectionId): {
  prev: DocsSection | null
  next: DocsSection | null
} {
  const index = DOCS_SECTIONS.findIndex((section) => section.id === id)
  return {
    prev: index > 0 ? DOCS_SECTIONS[index - 1] : null,
    next: index >= 0 && index < DOCS_SECTIONS.length - 1
      ? DOCS_SECTIONS[index + 1]
      : null,
  }
}
