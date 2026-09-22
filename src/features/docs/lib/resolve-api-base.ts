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

/** Production fallback when the current origin cannot be resolved. */
export const DEFAULT_DOCS_API_ORIGIN = 'https://ai.lingecho.com'

function withV1(origin: string): string {
  const normalized = origin.trim().replace(/\/+$/, '')
  if (!normalized) return `${DEFAULT_DOCS_API_ORIGIN}/v1`
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
}

/**
 * Resolve the OpenAI-compatible API base URL for docs / code samples.
 * Prefer the current site origin so examples match where the user is browsing;
 * fall back to the production host when origin is unavailable.
 */
export function resolveApiBase(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin?.trim()
    if (origin && origin !== 'null') {
      return withV1(origin)
    }
  }

  return withV1(DEFAULT_DOCS_API_ORIGIN)
}

/** Site origin without `/v1` (for clients that append paths themselves). */
export function resolveApiOrigin(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin?.trim()
    if (origin && origin !== 'null') {
      return origin.replace(/\/+$/, '')
    }
  }
  return DEFAULT_DOCS_API_ORIGIN
}
