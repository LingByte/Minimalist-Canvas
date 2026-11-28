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
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import canvasEn from '@canvas/i18n/locales/en-US'
import canvasZh from '@canvas/i18n/locales/zh-CN'

import { convertDetectedLanguage } from './languages'
import en from './locales/en.json'
import zhCN from './locales/zh.json'

function mergeTranslation(
  host: Record<string, unknown>,
  canvas: Record<string, unknown>
): Record<string, unknown> {
  return { ...host, ...canvas }
}

export const resources = {
  en: {
    translation: mergeTranslation(
      en.translation as Record<string, unknown>,
      canvasEn as Record<string, unknown>
    ),
  },
  zhCN: {
    translation: mergeTranslation(
      zhCN.translation as Record<string, unknown>,
      canvasZh as Record<string, unknown>
    ),
  },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN'],
    load: 'currentOnly',
    nsSeparator: false,
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      convertDetectedLanguage,
    },
  })

export default i18n
