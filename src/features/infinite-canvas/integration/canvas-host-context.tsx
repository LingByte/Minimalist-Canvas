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
  logo: DEFAULT_LOGO,
  brandName: DEFAULT_SYSTEM_NAME,
  brandTagline: DEFAULT_SYSTEM_TAGLINE,
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
    logo: value.logo ?? DEFAULT_LOGO,
    brandName: value.brandName ?? DEFAULT_SYSTEM_NAME,
    brandTagline: value.brandTagline ?? DEFAULT_SYSTEM_TAGLINE,
    homeHref: value.homeHref ?? (value.embedded ? '/dashboard' : defaultValue.homeHref),
  }
  return <CanvasHostContext.Provider value={merged}>{children}</CanvasHostContext.Provider>
}

export function useCanvasHost() {
  return useContext(CanvasHostContext)
}
