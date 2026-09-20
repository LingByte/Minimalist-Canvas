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
import axios, { type AxiosRequestConfig } from 'axios'
import { t } from 'i18next'
import { toast } from 'sonner'

import {
  applyAuthRotation,
  clearAuthentication,
  refreshAuthentication,
} from '@/lib/auth-session'
import { createTauriAdapter } from '@/lib/tauri-http-adapter'
import { getServerErrorMessageKey } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipBusinessError?: boolean
    skipErrorHandler?: boolean
    disableDuplicate?: boolean
    skipAuthRefresh?: boolean
    authRetry?: boolean
    acceptAuthRotation?: boolean
  }
}

export type ApiRequestConfig = AxiosRequestConfig

const tauriAdapter = createTauriAdapter()

export const api = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Cache-Control': 'no-store',
  },
  ...(tauriAdapter ? { adapter: tauriAdapter } : {}),
})

const inFlightGet = new Map<string, Promise<unknown>>()
const originalGet = api.get.bind(api)

api.get = ((url: string, config: ApiRequestConfig = {}) => {
  if (config.disableDuplicate) return originalGet(url, config)

  const params = config.params ? JSON.stringify(config.params) : '{}'
  const sessionSID = useAuthStore.getState().auth.session?.sid || 'anonymous'
  const key = `${sessionSID}:${url}?${params}`
  const existingRequest = inFlightGet.get(key)
  if (existingRequest) return existingRequest

  const request = originalGet(url, config).finally(() => {
    inFlightGet.delete(key)
  })
  inFlightGet.set(key, request)
  return request
}) as typeof api.get

function redirectToSignIn(): void {
  if (
    typeof window !== 'undefined' &&
    window.location.pathname !== '/sign-in'
  ) {
    window.location.replace('/sign-in')
  }
}

// Raw backend auth failures (e.g. "Unauthorized, not logged in and no access
// token provided") should never reach the user — swap them for a friendly,
// localized message.
const UNAUTHENTICATED_PATTERNS = [
  /not logged in/i,
  /no access token/i,
  /unauthorized/i,
  /unauthenticated/i,
  /未登录/,
  /未授权/,
]

function isUnauthenticatedMessage(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    UNAUTHENTICATED_PATTERNS.some((pattern) => pattern.test(message))
  )
}

function unauthenticatedMessage(): string {
  return useAuthStore.getState().auth.user
    ? t('Session expired!')
    : t('Please sign in first')
}

function resolveErrorMessage(payload: unknown, fallback?: string): string {
  const messageKey = getServerErrorMessageKey(payload)
  if (messageKey) return t(messageKey)
  const data =
    typeof payload === 'object' && payload !== null
      ? ((payload as { response?: { data?: unknown } }).response?.data ?? payload)
      : payload
  const raw =
    typeof data === 'object' && data !== null
      ? (data as { message?: unknown }).message
      : undefined
  if (isUnauthenticatedMessage(raw)) return unauthenticatedMessage()
  return typeof raw === 'string' && raw ? raw : fallback || t('Request failed')
}

api.interceptors.response.use(
  (response) => {
    if (response.config.acceptAuthRotation && response.data?.success === true) {
      applyAuthRotation(response.data.data)
    }

    if (
      !response.config.skipBusinessError &&
      typeof response.data?.success === 'boolean' &&
      !response.data.success
    ) {
      toast.error(resolveErrorMessage(response.data))
    }
    return response
  },
  async (error) => {
    const config = error?.config as ApiRequestConfig | undefined
    const skipErrorHandler = config?.skipErrorHandler
    const status = error?.response?.status

    if (status === 401) {
      // No session to refresh — anonymous/local-only usage must not be
      // bounced to the sign-in page by incidental API calls.
      const hadSession = Boolean(
        useAuthStore.getState().auth.session || useAuthStore.getState().auth.accessToken
      )
      if (config && !config.skipAuthRefresh && !config.authRetry && hadSession) {
        config.authRetry = true
        const outcome = await refreshAuthentication()
        if (outcome.kind === 'authenticated') {
          const token = useAuthStore.getState().auth.accessToken
          if (token) {
            config.headers = {
              ...config.headers,
              Authorization: `Bearer ${token}`,
            }
          }
          return api.request(config)
        }

        if (outcome.kind === 'anonymous' || outcome.kind === 'out_of_sync') {
          if (!skipErrorHandler) toast.error(unauthenticatedMessage())
          redirectToSignIn()
        }
      } else if (config?.authRetry) {
        clearAuthentication(false)
        if (!skipErrorHandler) toast.error(unauthenticatedMessage())
        redirectToSignIn()
      } else if (!skipErrorHandler) {
        toast.error(unauthenticatedMessage())
      }
    } else if (!skipErrorHandler) {
      toast.error(resolveErrorMessage(error, error?.message))
    }
    throw error
  }
)

api.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().auth.accessToken
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})
