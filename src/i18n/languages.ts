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
export const INTERFACE_LANGUAGE_OPTIONS = [
  { code: 'zhCN', label: '简体中文' },
  { code: 'en', label: 'English' },
] as const

export type InterfaceLanguageCode =
  (typeof INTERFACE_LANGUAGE_OPTIONS)[number]['code']

export function normalizeInterfaceLanguage(value?: string | null): string {
  if (!value) return 'en'

  const trimmed = value.trim().replaceAll('_', '-')
  const lower = trimmed.toLowerCase()
  if (
    trimmed === 'zh-CN' ||
    trimmed === 'zh-Hans' ||
    trimmed === 'zhCN' ||
    lower === 'zh' ||
    lower.startsWith('zh-hans') ||
    lower.startsWith('zh-cn')
  ) {
    return 'zhCN'
  }
  // Treat traditional Chinese tags as zhCN for the slim two-locale desktop app.
  if (
    trimmed === 'zh-TW' ||
    trimmed === 'zh-HK' ||
    trimmed === 'zh-MO' ||
    trimmed === 'zhTW' ||
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-tw')
  ) {
    return 'zhCN'
  }

  return INTERFACE_LANGUAGE_OPTIONS.some((lang) => lang.code === lower)
    ? lower
    : 'en'
}

/**
 * Map a browser-detected locale onto the interface language codes this project
 * uses with i18next (`zhCN` / `en`).
 */
export function convertDetectedLanguage(value: string): string {
  const lower = value.trim().replaceAll('_', '-').toLowerCase()
  if (!lower.startsWith('zh')) return value
  return 'zhCN'
}

/**
 * Convert an interface language code into a valid BCP-47 locale tag.
 */
export function toIntlLocale(value?: string | null): string | undefined {
  if (!value) return undefined
  if (value === 'zhCN' || value === 'zhTW') return 'zh-CN'
  try {
    return Intl.getCanonicalLocales(value)[0]
  } catch {
    return undefined
  }
}
