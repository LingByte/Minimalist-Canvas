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

import { buildDocsCodeSamples } from '../docs-code-samples'

describe('docs code samples', () => {
  test('builds curl python javascript go and java for chat completions', () => {
    const samples = buildDocsCodeSamples({
      endpoint: {
        method: 'POST',
        path: 'https://example.com/v1/chat/completions',
      },
      markdown: `\`\`\`bash
curl https://example.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-test" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "gpt-4o-mini",
  "messages": [{"role":"user","content":"hi"}]
}'
\`\`\``,
    })

    expect(samples.map((sample) => sample.id)).toEqual([
      'curl',
      'python',
      'javascript',
      'go',
      'java',
    ])

    const byId = Object.fromEntries(
      samples.map((sample) => [sample.id, sample.code])
    )
    expect(byId.curl).toContain("curl 'https://example.com/v1/chat/completions'")
    expect(byId.curl).toContain('-X POST')
    expect(byId.curl).toContain('Authorization: Bearer YOUR_API_KEY')
    expect(byId.python).toContain('import requests')
    expect(byId.python).toContain('json.loads')
    expect(byId.javascript).toContain('await fetch(')
    expect(byId.go).toContain('http.NewRequest("POST"')
    expect(byId.java).toContain('HttpClient.newHttpClient()')
    expect(byId.java).toContain('gpt-4o-mini')
  })

  test('uses x-api-key auth for Claude messages path', () => {
    const [curl] = buildDocsCodeSamples({
      endpoint: {
        method: 'POST',
        path: 'https://example.com/v1/messages',
      },
      markdown: '',
    })
    expect(curl.code).toContain('x-api-key: YOUR_API_KEY')
    expect(curl.code).toContain('anthropic-version: 2023-06-01')
  })
})
