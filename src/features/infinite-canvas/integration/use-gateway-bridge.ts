import { useEffect } from 'react'

import { useAuthStore } from '@/stores/auth-store'

import { useConfigStore } from '@canvas/stores/use-config-store'

import { fetchUserApiToken } from './fetch-user-api-token'
import {
  GATEWAY_CHANNEL_ID,
  clearInvalidGatewayApiKey,
  gatewayBaseUrl,
  shouldAutoApplyGateway,
  shouldFillDefaultChannelApiKey,
} from './gateway-utils'

function applyGatewayConfig(apiKey: string) {
  const gatewayBase = gatewayBaseUrl()

  useConfigStore.setState((state) => {
    if (!shouldAutoApplyGateway(state.config)) return state

    const defaultChannelId =
      state.config.channels.find((channel) => channel.id === GATEWAY_CHANNEL_ID)
        ?.id ?? state.config.channels[0]?.id

    return {
      config: {
        ...state.config,
        channelMode: 'remote',
        baseUrl: gatewayBase,
        apiKey,
        channels: state.config.channels.map((channel) =>
          channel.id === defaultChannelId
            ? {
                ...channel,
                baseUrl: gatewayBase,
                apiKey,
              }
            : channel
        ),
      },
    }
  })
}

/** Keep existing Base URL (e.g. ai.lingecho.com); only fill missing/invalid sk-. */
function applyDefaultChannelApiKey(apiKey: string) {
  useConfigStore.setState((state) => {
    if (!shouldFillDefaultChannelApiKey(state.config)) return state

    const defaultChannelId =
      state.config.channels.find((channel) => channel.id === GATEWAY_CHANNEL_ID)
        ?.id ?? state.config.channels[0]?.id

    return {
      config: {
        ...state.config,
        channelMode: 'remote',
        apiKey,
        channels: state.config.channels.map((channel) =>
          channel.id === defaultChannelId
            ? {
                ...channel,
                apiKey,
              }
            : channel
        ),
      },
    }
  })
}

/**
 * Bridge canvas API calls to the current site gateway when the user has not
 * configured custom Base URL + API Key. Uses relay API tokens from /api/token.
 * For the product default host (canvas.lingecho.com), only fills the first sk-.
 */
export function useGatewayBridge() {
  const accessToken = useAuthStore((s) => s.auth.accessToken)

  useEffect(() => {
    if (!accessToken) return

    const config = useConfigStore.getState().config
    const needsGateway = shouldAutoApplyGateway(config)
    const needsKeyOnly = shouldFillDefaultChannelApiKey(config)
    if (!needsGateway && !needsKeyOnly) return

    // Immediately drop legacy access_token / non-sk keys so /v1 stops 401ing.
    useConfigStore.setState((state) => ({
      config: clearInvalidGatewayApiKey(state.config),
    }))

    let cancelled = false

    void (async () => {
      const relayKey = await fetchUserApiToken()
      if (cancelled || !relayKey) return
      if (shouldAutoApplyGateway(useConfigStore.getState().config)) {
        applyGatewayConfig(relayKey)
        return
      }
      if (shouldFillDefaultChannelApiKey(useConfigStore.getState().config)) {
        applyDefaultChannelApiKey(relayKey)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessToken])
}
