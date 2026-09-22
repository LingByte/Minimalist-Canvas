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

export type DocsDebugHeader = {
  id: string
  key: string
  value: string
  enabled: boolean
}

export type DocsDebugAuthStyle = 'bearer' | 'x-api-key' | 'none'

const API_KEY_STORAGE = 'docs.apiDebug.apiKey'

export function readStoredApiKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(API_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

export function writeStoredApiKey(value: string) {
  if (typeof window === 'undefined') return
  try {
    if (!value) sessionStorage.removeItem(API_KEY_STORAGE)
    else sessionStorage.setItem(API_KEY_STORAGE, value)
  } catch {
    // ignore quota / private mode
  }
}

export function detectAuthStyle(path: string): DocsDebugAuthStyle {
  const normalized = path.toLowerCase()
  if (normalized.includes('/messages') && !normalized.includes('/chat/')) {
    return 'x-api-key'
  }
  if (
    normalized.includes('/chat/') ||
    normalized.includes('/embeddings') ||
    normalized.includes('/images') ||
    normalized.includes('/audio') ||
    normalized.includes('/models') ||
    normalized.includes('/responses') ||
    normalized.includes('/rerank') ||
    normalized.includes('/videos') ||
    normalized.includes('/v1/')
  ) {
    return 'bearer'
  }
  return 'bearer'
}

export function methodAllowsBody(method: string) {
  const upper = method.toUpperCase()
  return upper !== 'GET' && upper !== 'HEAD'
}

/** Escape a value for a POSIX shell single-quoted string. */
export function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * Pull JSON from the first curl `-d '…'` / `-d "…"` payload.
 * Do not fall back to ```json fences — docs often put response samples there.
 */
export function extractCurlJsonBody(markdown: string): string | null {
  const patterns = [
    /-d\s+'([\s\S]*?)'/,
    /-d\s+"([\s\S]*?)"/,
    /-d\s+\$'([\s\S]*?)'/,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(markdown)
    if (!match?.[1]) continue
    const candidate = match[1].trim()
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue
    try {
      return JSON.stringify(JSON.parse(candidate), null, 2)
    } catch {
      return candidate
    }
  }

  return null
}

export function defaultBodyForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.includes('/messages') && !lower.includes('/chat/')) {
    return JSON.stringify(
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: 'Explain API gateways briefly.' },
        ],
      },
      null,
      2
    )
  }
  if (lower.includes('/chat/completions')) {
    return JSON.stringify(
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Explain API gateways briefly.' },
        ],
      },
      null,
      2
    )
  }
  if (lower.includes('/responses')) {
    return JSON.stringify(
      {
        model: 'gpt-4.1-mini',
        input: 'Explain API gateways briefly.',
      },
      null,
      2
    )
  }
  if (lower.includes('/embeddings')) {
    return JSON.stringify(
      { model: 'text-embedding-3-small', input: 'API gateway' },
      null,
      2
    )
  }
  if (lower.includes('/images')) {
    return JSON.stringify(
      {
        model: 'dall-e-3',
        prompt: 'A minimalist API gateway diagram',
        n: 1,
        size: '1024x1024',
      },
      null,
      2
    )
  }
  return '{\n  \n}'
}

export function buildDefaultHeaders(options: {
  path: string
  method: string
  apiKey: string
}): DocsDebugHeader[] {
  const auth = detectAuthStyle(options.path)
  const headers: DocsDebugHeader[] = []
  let seq = 0
  const push = (key: string, value: string, enabled = true) => {
    seq += 1
    headers.push({ id: `h-${seq}`, key, value, enabled })
  }

  if (auth === 'x-api-key') {
    push('x-api-key', options.apiKey || 'YOUR_API_KEY')
    push('anthropic-version', '2023-06-01')
  } else if (auth === 'bearer') {
    push(
      'Authorization',
      options.apiKey ? `Bearer ${options.apiKey}` : 'Bearer YOUR_API_KEY'
    )
  }

  if (methodAllowsBody(options.method)) {
    push('Content-Type', 'application/json')
  }

  return headers
}

export function formatJsonMaybe(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return text
  }
}

export function buildCurlCommand(options: {
  method: string
  url: string
  headers: DocsDebugHeader[]
  body: string
}): string {
  const preamble: string[] = [
    `curl -X ${options.method.toUpperCase()} ${JSON.stringify(options.url)}`,
  ]

  for (const header of options.headers) {
    if (!header.enabled || !header.key.trim()) continue
    preamble.push(
      `  -H ${JSON.stringify(`${header.key.trim()}: ${header.value}`)}`
    )
  }

  const body = methodAllowsBody(options.method)
    ? options.body.trim()
    : ''
  if (!body) {
    return preamble.join(' \\\n')
  }

  // Single-quoted -d keeps real newlines readable (avoid "{\n  ...}").
  return `${preamble.join(' \\\n')} \\\n  -d ${shellSingleQuote(body)}`
}

export function statusTone(status: number): 'success' | 'warning' | 'error' | 'neutral' {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'warning'
  if (status >= 400) return 'error'
  return 'neutral'
}
