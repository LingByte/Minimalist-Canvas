import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuthStore } from '@/stores/auth-store'

import { useConfigStore } from '@canvas/stores/use-config-store'

import { fetchUserApiToken } from './fetch-user-api-token'
import {
  getDefaultChannel,
  hasCustomRemoteCredentials,
  isRelayApiKey,
  shouldAutoApplyGateway,
  shouldFillDefaultChannelApiKey,
} from './gateway-utils'
import { syncGatewayModels } from './sync-gateway-models'

/** Avoid refetching the catalog on every route hop (video page enter felt janky). */
const MODEL_SYNC_TTL_MS = 60_000
let lastModelSyncAt = 0
let modelSyncInFlight: Promise<void> | null = null

function shouldSyncModelsForPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return (
    path.includes('/image') ||
    path.includes('/video') ||
    path.includes('/canvas') ||
    path.includes('/config')
  )
}

function scheduleIdle(task: () => void) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => task(), { timeout: 2500 })
    return
  }
  window.setTimeout(task, 120)
}

/** Sync canvas default channel models from GET /api/canvas/models (with capability). */
export function useGatewayModelsBridge() {
  const accessToken = useAuthStore((s) => s.auth.accessToken)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!shouldSyncModelsForPath(pathname)) return

    const config = useConfigStore.getState().config
    if (hasCustomRemoteCredentials(config)) return

    // Refresh when auto-bridge should run, or when gateway already has a valid sk- key.
    const channel = getDefaultChannel(config)
    const hasValidRelayKey = Boolean(channel && isRelayApiKey(channel.apiKey))
    if (!accessToken && !hasValidRelayKey) return
    if (
      !shouldAutoApplyGateway(config) &&
      !shouldFillDefaultChannelApiKey(config) &&
      !hasValidRelayKey
    ) {
      return
    }

    if (Date.now() - lastModelSyncAt < MODEL_SYNC_TTL_MS) return

    let cancelled = false

    scheduleIdle(() => {
      if (cancelled) return
      if (modelSyncInFlight) return

      modelSyncInFlight = (async () => {
        const apiKey =
          (hasValidRelayKey ? channel?.apiKey.trim() : null) ||
          (accessToken ? await fetchUserApiToken() : null)
        if (cancelled || !apiKey) return

        try {
          await syncGatewayModels(apiKey, true)
          lastModelSyncAt = Date.now()
        } catch {
          // Ignore transient gateway errors; next page enter retries after TTL.
        }
      })().finally(() => {
        modelSyncInFlight = null
      })
    })

    return () => {
      cancelled = true
    }
  }, [accessToken, pathname])
}
