import { useLayoutEffect } from 'react'

import { getCookie } from '@/lib/cookies'

import { useThemeStore } from '@canvas/stores/use-theme-store'

const HOST_THEME_COOKIE = 'vite-ui-theme'

/** Resolve the host app's light/dark appearance (same rules as ThemeProvider). */
export function resolveHostTheme(): 'light' | 'dark' {
  const stored = getCookie(HOST_THEME_COOKIE)
  if (stored === 'dark' || stored === 'light') return stored
  // Cookie unset or "system" → follow OS preference
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

/** Re-apply host ThemeProvider classes after canvas unmounts. */
export function restoreHostThemeClass() {
  if (typeof document === 'undefined') return
  const resolved = resolveHostTheme()
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

/** Keep canvas theme aligned with the host app when embedded. */
export function useHostThemeSync(enabled: boolean) {
  const setTheme = useThemeStore((state) => state.setTheme)

  useLayoutEffect(() => {
    if (!enabled) return

    const sync = () => setTheme(resolveHostTheme())
    sync()

    // Zustand persist may rehydrate a stale "dark" after mount — re-sync then.
    const unsubHydration = useThemeStore.persist.onFinishHydration(() => sync())
    if (useThemeStore.persist.hasHydrated()) sync()

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', sync)

    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      unsubHydration()
      media.removeEventListener('change', sync)
      observer.disconnect()
    }
  }, [enabled, setTheme])
}
