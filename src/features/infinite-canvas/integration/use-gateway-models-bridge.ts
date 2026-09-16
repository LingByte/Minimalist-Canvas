import { useEffect } from 'react'

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

/** Sync canvas default channel models from GET /api/canvas/models (with capability). */
export function useGatewayModelsBridge() {
  const accessToken = useAuthStore((s) => s.auth.accessToken)

  useEffect(() => {
    if (!accessToken) return

    const config = useConfigStore.getState().config
    if (hasCustomRemoteCredentials(config)) return

    // Refresh when auto-bridge should run, or when gateway already has a valid sk- key.
    const channel = getDefaultChannel(config)
    const hasValidRelayKey = Boolean(channel && isRelayApiKey(channel.apiKey))
    if (
      !shouldAutoApplyGateway(config) &&
      !shouldFillDefaultChannelApiKey(config) &&
      !hasValidRelayKey
    ) {
      return
    }

    let cancelled = false

    void (async () => {
      const apiKey =
        (hasValidRelayKey ? channel?.apiKey.trim() : null) ||
        (await fetchUserApiToken())
      if (cancelled || !apiKey) return

      try {
        // Force a live fetch on every canvas mount / auth change.
        await syncGatewayModels(apiKey, true)
      } catch {
        // Ignore transient gateway errors; next mount retries.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessToken])
}
