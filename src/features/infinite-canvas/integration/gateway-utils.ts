import { type AiConfig, type ModelChannel } from '@canvas/stores/use-config-store'

export const GATEWAY_CHANNEL_ID = 'default'
export const PRODUCT_DEFAULT_BASE_URL = 'https://canvas.lingecho.com'
const LEGACY_PRODUCT_DEFAULT_BASE_URLS = [
  'https://canvas.lingecho.com',
  'https://ai.lingecho.com',
]

const LEGACY_OPENAI_BASE_URL = 'https://api.openai.com'

export function gatewayBaseUrl() {
  return `${window.location.origin.replace(/\/$/, '')}/v1`
}

export function isGatewayBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  const gateway = gatewayBaseUrl()
  return normalized === gateway || normalized === gateway.replace(/\/v1$/, '')
}

/** Relay API keys for /v1 must be sk-... (dashboard access_token is not valid). */
export function isRelayApiKey(apiKey: string) {
  return apiKey.trim().startsWith('sk-')
}

export function isProductDefaultBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  return LEGACY_PRODUCT_DEFAULT_BASE_URLS.includes(normalized)
}

/** Empty or legacy api.openai.com — not an intentional product default host. */
function isPlaceholderBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return !normalized || normalized === LEGACY_OPENAI_BASE_URL
}

export function getDefaultChannel(config: AiConfig): ModelChannel | undefined {
  return (
    config.channels.find((channel) => channel.id === GATEWAY_CHANNEL_ID) ??
    config.channels[0]
  )
}

/** User configured a non-site gateway endpoint with their own API key. */
export function hasCustomRemoteCredentials(config: AiConfig) {
  const channel = getDefaultChannel(config)
  if (!channel) return false
  const hasKey = Boolean(channel.apiKey.trim())
  const hasCustomBase =
    Boolean(channel.baseUrl.trim()) && !isGatewayBaseUrl(channel.baseUrl)
  return hasKey && hasCustomBase
}

/**
 * Whether embedded gateway auto-bridge may set baseUrl/apiKey on the default channel.
 * Replaces empty keys and legacy non-sk tokens (e.g. dashboard access_token), but never
 * overwrites canvas.lingecho.com / ai.lingecho.com or another intentional remote Base URL.
 */
export function shouldAutoApplyGateway(config: AiConfig) {
  if (hasCustomRemoteCredentials(config)) return false

  const channel = getDefaultChannel(config)
  if (!channel) return true

  const baseUrl = channel.baseUrl.trim()
  // Keep the product default (and any other non-gateway remote) intact.
  if (baseUrl && !isPlaceholderBaseUrl(baseUrl) && !isGatewayBaseUrl(baseUrl)) {
    return false
  }

  const apiKey = channel.apiKey.trim()
  if (!apiKey || !isRelayApiKey(apiKey)) return true

  return false
}

/**
 * Fill the first user sk- onto the product default / gateway / placeholder channel
 * without rewriting Base URL (keeps https://canvas.lingecho.com).
 */
export function shouldFillDefaultChannelApiKey(config: AiConfig) {
  if (hasCustomRemoteCredentials(config)) return false

  const channel = getDefaultChannel(config)
  if (!channel) return true

  const apiKey = channel.apiKey.trim()
  if (apiKey && isRelayApiKey(apiKey)) return false

  const baseUrl = channel.baseUrl.trim()
  return (
    !baseUrl ||
    isPlaceholderBaseUrl(baseUrl) ||
    isGatewayBaseUrl(baseUrl) ||
    isProductDefaultBaseUrl(baseUrl)
  )
}

/** Drop persisted non-relay keys on the gateway channel so requests stop using them. */
export function clearInvalidGatewayApiKey(config: AiConfig): AiConfig {
  if (hasCustomRemoteCredentials(config)) return config

  const channel = getDefaultChannel(config)
  if (!channel) return config
  if (isRelayApiKey(channel.apiKey)) return config

  const baseUrl = channel.baseUrl.trim()
  if (
    baseUrl &&
    !isPlaceholderBaseUrl(baseUrl) &&
    !isGatewayBaseUrl(baseUrl) &&
    !isProductDefaultBaseUrl(baseUrl)
  ) {
    return config
  }

  const channels = config.channels.map((item) =>
    item.id === channel.id ? { ...item, apiKey: '' } : item
  )

  return {
    ...config,
    apiKey: config.apiKey === channel.apiKey ? '' : config.apiKey,
    channels,
  }
}
