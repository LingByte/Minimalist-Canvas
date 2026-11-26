import { type AiConfig, type ModelChannel } from '@canvas/stores/use-config-store'

export const GATEWAY_CHANNEL_ID = 'default'

export function getDefaultChannel(config: AiConfig): ModelChannel | undefined {
  return (
    config.channels.find((channel) => channel.id === GATEWAY_CHANNEL_ID) ??
    config.channels[0]
  )
}

/** True when the user has filled a channel Base URL + API key. */
export function hasCustomRemoteCredentials(config: AiConfig) {
  const channel = getDefaultChannel(config)
  if (!channel) return false
  return Boolean(channel.baseUrl.trim() && channel.apiKey.trim())
}
