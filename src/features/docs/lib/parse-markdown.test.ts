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
import { describe, expect, test } from 'vitest'

import { prepareDocsMarkdown } from './parse-markdown'

describe('prepareDocsMarkdown', () => {
  test('strips the page title, extracts endpoints, and builds heading ids', () => {
    const raw = [
      '# Chat Completions',
      '',
      '**Endpoint:** `POST {baseUrl}/chat/completions`',
      '',
      'Intro text.',
      '',
      '## Request body',
      '',
      '## Streaming example',
    ].join('\n')

    const result = prepareDocsMarkdown(raw, 'https://api.example.com/v1')

    expect(result.body).not.toContain('# Chat Completions')
    expect(result.body).not.toContain('**Endpoint:**')
    expect(result.endpoints).toEqual([
      {
        method: 'POST',
        path: 'https://api.example.com/v1/chat/completions',
      },
    ])
    expect(result.headings.map((item) => item.id)).toEqual([
      'request-body',
      'streaming-example',
    ])
  })

  test('prefixes site-root paths with the origin, not /v1', () => {
    const raw = '**Endpoint:** `GET {origin}/api/usage/token`'
    const result = prepareDocsMarkdown(raw, 'https://api.example.com/v1')

    expect(result.endpoints).toEqual([
      {
        method: 'GET',
        path: 'https://api.example.com/api/usage/token',
      },
    ])
  })
})
