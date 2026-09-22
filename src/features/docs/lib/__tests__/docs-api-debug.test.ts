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

import {
  buildCurlCommand,
  buildDefaultHeaders,
  detectAuthStyle,
  extractCurlJsonBody,
  formatJsonMaybe,
  methodAllowsBody,
  statusTone,
} from '../docs-api-debug'

describe('docs api debug helpers', () => {
  test('detects Claude Messages auth as x-api-key', () => {
    expect(
      detectAuthStyle('https://ai.lingecho.com/v1/messages')
    ).toBe('x-api-key')
  })

  test('detects OpenAI-compatible routes as bearer', () => {
    expect(
      detectAuthStyle('https://ai.lingecho.com/v1/chat/completions')
    ).toBe('bearer')
  })

  test('extracts pretty JSON from curl -d payload', () => {
    const markdown = `
curl https://example.com/v1/messages \\
  -H "x-api-key: KEY" \\
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024
  }'
`
    expect(extractCurlJsonBody(markdown)).toBe(
      JSON.stringify(
        { model: 'claude-sonnet-4-20250514', max_tokens: 1024 },
        null,
        2
      )
    )
  })

  test('builds Claude default headers with anthropic-version', () => {
    const headers = buildDefaultHeaders({
      path: 'https://ai.lingecho.com/v1/messages',
      method: 'POST',
      apiKey: 'sk-test',
    })
    expect(headers.map((item) => item.key)).toEqual([
      'x-api-key',
      'anthropic-version',
      'Content-Type',
    ])
    expect(headers[0].value).toBe('sk-test')
  })

  test('omits body for GET methods', () => {
    expect(methodAllowsBody('GET')).toBe(false)
    expect(methodAllowsBody('POST')).toBe(true)
  })

  test('formats JSON responses and leaves plain text alone', () => {
    expect(formatJsonMaybe('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(formatJsonMaybe('not-json')).toBe('not-json')
  })

  test('extracts curl -d body and ignores response json fences', () => {
    const markdown = `
### Example

\`\`\`bash
curl https://example.com/v1/images/generations \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "dall-e-3",
    "prompt": "A lake"
  }'
\`\`\`

### Sample response

\`\`\`json
{
  "created": 1710000000,
  "data": [{"url": "https://..."}]
}
\`\`\`
`
    expect(extractCurlJsonBody(markdown)).toBe(
      JSON.stringify({ model: 'dall-e-3', prompt: 'A lake' }, null, 2)
    )
  })

  test('builds a copyable curl command with readable single-quoted JSON', () => {
    const curl = buildCurlCommand({
      method: 'POST',
      url: 'https://ai.lingecho.com/v1/images/generations',
      headers: [
        {
          id: '1',
          key: 'Authorization',
          value: 'Bearer YOUR_API_KEY',
          enabled: true,
        },
        {
          id: '2',
          key: 'Content-Type',
          value: 'application/json',
          enabled: true,
        },
        {
          id: '3',
          key: 'X-Skip',
          value: '1',
          enabled: false,
        },
      ],
      body: '{\n  "model": "dall-e-3",\n  "prompt": "A lake"\n}',
    })
    expect(curl).toContain('-X POST')
    expect(curl).toContain('Authorization: Bearer YOUR_API_KEY')
    expect(curl).not.toContain('X-Skip')
    expect(curl).toContain(`-d '{\n  "model": "dall-e-3",\n  "prompt": "A lake"\n}'`)
    expect(curl).not.toContain('\\n')
  })
  test('maps status codes to visual tones', () => {
    expect(statusTone(200)).toBe('success')
    expect(statusTone(302)).toBe('warning')
    expect(statusTone(500)).toBe('error')
  })
})
