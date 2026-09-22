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

export type DocsHeading = {
  id: string
  text: string
  level: 2 | 3
}

export type DocsEndpoint = {
  method: string
  path: string
}

const ENDPOINT_RE = /^\*\*Endpoint:\*\*\s*`([A-Z]+)\s+([^`]+)`/gm
const HEADING_RE = /^(#{2,3})\s+(.+)$/

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replaceAll(/[`*_]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^\w\u4e00-\u9fff-]/g, '')
}

export function stripLeadingTitle(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]+\n+/, '')
}

export function extractEndpoints(markdown: string): DocsEndpoint[] {
  const endpoints: DocsEndpoint[] = []
  const seen = new Set<string>()

  for (const match of markdown.matchAll(ENDPOINT_RE)) {
    const method = match[1]
    const path = match[2].trim()
    const key = `${method} ${path}`
    if (seen.has(key)) continue
    seen.add(key)
    endpoints.push({ method, path })
  }

  return endpoints
}

export function extractHeadings(markdown: string): DocsHeading[] {
  const headings: DocsHeading[] = []
  const seen = new Map<string, number>()

  markdown.split('\n').forEach((line) => {
    const match = HEADING_RE.exec(line)
    if (!match) return

    const level = match[1].length === 3 ? 3 : 2
    const text = match[2].replaceAll(/[`*_]/g, '').trim()
    let id = slugifyHeading(text) || 'section'
    const count = seen.get(id) ?? 0
    seen.set(id, count + 1)
    if (count > 0) id = `${id}-${count}`

    headings.push({ id, text, level })
  })

  return headings
}

export function prepareDocsMarkdown(
  raw: string,
  baseUrl: string
): {
  body: string
  endpoints: DocsEndpoint[]
  headings: DocsHeading[]
  rawMarkdown: string
} {
  const origin = baseUrl.replace(/\/v1\/?$/, '')
  const withBase = raw
    .replaceAll('{baseUrl}', baseUrl)
    .replaceAll('{origin}', origin)
  const endpoints = extractEndpoints(withBase)
  const withoutTitle = stripLeadingTitle(withBase)
  const body = withoutTitle.replaceAll(
    /^\*\*Endpoint:\*\*\s*`[^`]+`\s*\n+/gm,
    ''
  )

  return {
    body,
    endpoints,
    headings: extractHeadings(body),
    rawMarkdown: withBase,
  }
}
