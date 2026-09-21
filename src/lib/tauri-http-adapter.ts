import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios'

import { SITE_BASE_URL, SITE_ORIGIN } from '@/lib/open-external'

// Check if running inside Tauri (desktop app)
export const isTauriRuntime =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function buildFullURL(config: AxiosRequestConfig): string {
  const url = config.url || ''
  if (/^https?:\/\//.test(url)) return url
  const path = `${(config.baseURL || '').replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
  if (/^https?:\/\//.test(path)) return path
  // Desktop build: relative API paths target the fixed backend site, not the
  // webview origin — plugin-http rejects out-of-scope origins entirely.
  return `${SITE_BASE_URL}${path}`
}

function serializeParams(params: unknown): string {
  if (!params) return ''
  if (params instanceof URLSearchParams) return params.toString()
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)))
    else search.append(key, String(value))
  }
  return search.toString()
}

function flattenAxiosHeaders(configHeaders: AxiosRequestConfig['headers']): Record<string, string> {
  const headers: Record<string, string> = {}
  if (!configHeaders) return headers

  const axiosHeaders = configHeaders as {
    toJSON?: () => Record<string, unknown>
    get?: (name: string) => unknown
    Authorization?: unknown
    authorization?: unknown
  }

  const raw =
    typeof axiosHeaders.toJSON === 'function'
      ? axiosHeaders.toJSON()
      : (configHeaders as Record<string, unknown>)

  for (const [key, value] of Object.entries(raw)) {
    if (value == null || typeof value === 'object') continue
    headers[key] = String(value)
  }

  const authorization =
    (typeof axiosHeaders.get === 'function' ? axiosHeaders.get('Authorization') : undefined) ??
    axiosHeaders.Authorization ??
    axiosHeaders.authorization
  if (authorization != null && authorization !== '') {
    headers.Authorization = String(authorization)
  }

  return headers
}

// Custom axios adapter using Tauri HTTP plugin (bypasses CORS)
export function createTauriAdapter(): AxiosAdapter | null {
  if (!isTauriRuntime) return null
  return async (config) => {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    let url = buildFullURL(config)
    const query = serializeParams(config.params)
    if (query) url += `${url.includes('?') ? '&' : '?'}${query}`
    const method = (config.method || 'get').toUpperCase()
    const headers = flattenAxiosHeaders(config.headers)
    // Backend auth endpoints enforce an Origin allowlist (its server_address).
    // plugin-http sends no webview origin, so provide the accepted one or
    // refresh/logout are rejected as AUTH_ORIGIN_FORBIDDEN.
    if (url.startsWith(SITE_BASE_URL)) {
      if (!headers.Origin) headers.Origin = SITE_ORIGIN
      if (!headers.Referer) headers.Referer = `${SITE_ORIGIN}/`
    }
    const init: RequestInit = {
      method,
      headers,
      // Persist / send new_api_refresh so access-token expiry can be renewed.
      // Without this, desktop looks "logged in" (user in memory) while APIs
      // return auth.not_logged_in after the short-lived Bearer expires.
      credentials: 'include',
    }
    if (config.data && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data)
      if (!headers['Content-Type'] && typeof config.data === 'object') {
        headers['Content-Type'] = 'application/json'
      }
    }
    const res = await tauriFetch(url, init)
    const responseHeaders: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
    const responseData = await res.text()
    let parsed: unknown = responseData
    const contentType = responseHeaders['content-type'] || ''
    if (
      contentType.includes('application/json') ||
      responseData.startsWith('{') ||
      responseData.startsWith('[')
    ) {
      try {
        parsed = JSON.parse(responseData)
      } catch {
        /* keep text */
      }
    }
    return {
      data: parsed,
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      config,
      request: {},
    } as AxiosResponse
  }
}
