import { createContext, useContext, type ReactNode } from 'react'

import {
  DEFAULT_LOGO,
  DEFAULT_SYSTEM_NAME,
  DEFAULT_SYSTEM_TAGLINE,
} from '@/lib/constants'

export type CanvasHostContextValue = {
  embedded: boolean
  homeHref: string
  logo: string
  brandName: string
  brandTagline: string
}

const defaultValue: CanvasHostContextValue = {
  embedded: false,
  homeHref: '/',
  logo: '/logo.png',
  brandName: '至简画布',
  brandTagline: 'MINIMALIST CANVAS',
}

const CanvasHostContext = createContext<CanvasHostContextValue>(defaultValue)

export function CanvasHostProvider({
  value = {},
  children,
}: {
  value?: Partial<CanvasHostContextValue>
  children: ReactNode
}) {
  const merged: CanvasHostContextValue = {
    ...defaultValue,
    ...value,
    logo: value.logo ?? (value.embedded ? DEFAULT_LOGO : defaultValue.logo),
    brandName: value.brandName ?? (value.embedded ? DEFAULT_SYSTEM_NAME : defaultValue.brandName),
    brandTagline:
      value.brandTagline ?? (value.embedded ? DEFAULT_SYSTEM_TAGLINE : defaultValue.brandTagline),
    homeHref: value.homeHref ?? (value.embedded ? '/dashboard' : defaultValue.homeHref),
  }
  return <CanvasHostContext.Provider value={merged}>{children}</CanvasHostContext.Provider>
}

export function useCanvasHost() {
  return useContext(CanvasHostContext)
}
