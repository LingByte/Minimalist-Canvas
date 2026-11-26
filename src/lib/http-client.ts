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

import { createTauriAdapter } from '@/lib/tauri-http-adapter'
import { getServerErrorMessageKey } from '@/lib/server-error-message'

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipBusinessError?: boolean
    skipErrorHandler?: boolean
    disableDuplicate?: boolean
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
  const key = `anonymous:${url}?${params}`
  const existingRequest = inFlightGet.get(key)
  if (existingRequest) return existingRequest

  const request = originalGet(url, config).finally(() => {
    inFlightGet.delete(key)
  })
  inFlightGet.set(key, request)
  return request
}) as typeof api.get

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
  return typeof raw === 'string' && raw ? raw : fallback || t('Request failed')
}

api.interceptors.response.use(
  (response) => {
    if (
      !response.config.skipBusinessError &&
      typeof response.data?.success === 'boolean' &&
      !response.data.success
    ) {
      toast.error(resolveErrorMessage(response.data))
    }
    return response
  },
  (error) => {
    const config = error?.config as ApiRequestConfig | undefined
    if (!config?.skipErrorHandler) {
      toast.error(resolveErrorMessage(error, error?.message))
    }
    throw error
  }
)
