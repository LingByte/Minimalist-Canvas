import { useEffect, useMemo } from 'react'
import { RouterProvider } from 'react-router-dom'

import 'antd/dist/reset.css'
import 'streamdown/styles.css'
import '@canvas/styles/globals.css'
import { restoreHostI18n } from '@canvas/i18n'

import { AppProviders } from '@canvas/components/layout/app-providers'
import { initAnalytics } from '@canvas/lib/analytics'
import { createCanvasRouter } from '@canvas/router'
import { useConfigOnboardingStore } from '@canvas/stores/use-config-onboarding-store'

import { CanvasHostProvider } from './canvas-host-context'
import { CANVAS_BASENAME, CANVAS_ROOT_ID } from './constants'
import { useHostLocaleSync } from './use-host-locale-sync'
import { restoreHostThemeClass, useHostThemeSync } from './use-host-theme-sync'

let analyticsInitialized = false

/** Clear host-document side effects left by Ant Design portals / scroll lock. */
function cleanupHostDocumentLocks() {
  if (typeof document === 'undefined') return
  const body = document.body
  body.style.removeProperty('overflow')
  body.style.removeProperty('overflow-x')
  body.style.removeProperty('overflow-y')
  body.style.removeProperty('width')
  body.style.removeProperty('position')
  body.style.removeProperty('padding-right')
  body.classList.remove('ant-scrolling-effect')
  document.documentElement.style.removeProperty('overflow')
}

function InfiniteCanvasRuntime() {
  useHostThemeSync(true)
  useHostLocaleSync(true)

  useEffect(() => {
    // Ensure host remains the default i18n while canvas uses I18nextProvider.
    restoreHostI18n()
    return () => {
      useConfigOnboardingStore.getState().stop(false)
      cleanupHostDocumentLocks()
      restoreHostThemeClass()
      restoreHostI18n()
    }
  }, [])

  const router = useMemo(() => {
    if (!analyticsInitialized) {
      initAnalytics()
      analyticsInitialized = true
    }
    return createCanvasRouter(CANVAS_BASENAME)
  }, [])

  return (
    <AppProviders embedded rootId={CANVAS_ROOT_ID}>
      <RouterProvider router={router} />
    </AppProviders>
  )
}

export function InfiniteCanvasApp() {
  return (
    <CanvasHostProvider value={{ embedded: true, homeHref: '/dashboard' }}>
      <div
        id={CANVAS_ROOT_ID}
        className='bg-background text-foreground h-full min-h-0 w-full overflow-hidden'
      >
        <InfiniteCanvasRuntime />
      </div>
    </CanvasHostProvider>
  )
}
