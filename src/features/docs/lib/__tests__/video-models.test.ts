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
import { describe, expect, test, vi } from 'vitest'

import { renderDocsVideoModels } from '../video-models'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))

const labels = {
  loading: 'Loading',
  unavailable: 'Unavailable',
  empty: 'None',
  separator: ', ',
}

const markdown = [
  'Models: {{videoModels:standard}}',
  'Fixed: {{videoModels:fixed_30s}}',
  '"model": "{{videoModel:standard}}"',
  '"model": "{{videoModel:fixed_30s}}"',
].join('\n')

describe('renderDocsVideoModels', () => {
  test('fills live model lists and uses the first model in examples', () => {
    const out = renderDocsVideoModels(
      markdown,
      {
        status: 'ready',
        groups: [
          { profile: 'standard', models: ['model-a', 'model-b'] },
          { profile: 'fixed_30s', models: [] },
        ],
      },
      labels
    )

    expect(out).toBe(
      [
        'Models: `model-a`, `model-b`',
        'Fixed: *None*',
        '"model": "model-a"',
        '"model": "YOUR_VIDEO_MODEL"',
      ].join('\n')
    )
  })

  test('shows loading and error states instead of stale model names', () => {
    expect(
      renderDocsVideoModels(markdown, { status: 'loading' }, labels)
    ).toContain('Models: *Loading*')
    expect(
      renderDocsVideoModels(markdown, { status: 'error' }, labels)
    ).toContain('Fixed: *Unavailable*')
  })
})
