import { useEffect } from 'react'
import i18next from 'i18next'

import canvasI18n, { hostToCanvasLocale } from '@canvas/i18n'

/** Keep canvas i18n locale aligned with the host app when embedded. */
export function useHostLocaleSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const syncFromHost = (lng?: string) => {
      const locale = hostToCanvasLocale(lng || i18next.language)
      if (canvasI18n.language !== locale) {
        localStorage.setItem('infinite-canvas:locale', locale)
        void canvasI18n.changeLanguage(locale)
      }
    }

    syncFromHost()
    i18next.on('languageChanged', syncFromHost)
    return () => {
      i18next.off('languageChanged', syncFromHost)
    }
  }, [enabled])
}
