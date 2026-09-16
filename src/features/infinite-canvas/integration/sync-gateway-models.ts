import { api } from '@/lib/api'

import {
  encodeChannelModel,
  modelMatchesCapability,
  modelOptionsFromChannels,
  normalizeChannelModels,
  normalizeModelOptionValue,
  useConfigStore,
  type AiConfig,
  type ChannelModel,
  type ModelCapability,
  type ModelChannel,
} from '@canvas/stores/use-config-store'

import {
  GATEWAY_CHANNEL_ID,
  getDefaultChannel,
  gatewayBaseUrl,
  hasCustomRemoteCredentials,
  isProductDefaultBaseUrl,
  shouldAutoApplyGateway,
} from './gateway-utils'

export type CanvasCatalogModel = {
  id: string
  capability: ModelCapability
  description?: string
  supported_endpoint_types?: string[]
}

type CanvasModelsResponse = {
  success?: boolean
  message?: string
  data?: CanvasCatalogModel[]
}

/** Fetch gateway models with capability labels (no /v1/models round-trip). */
export async function fetchGatewayModelCatalog(_apiKey: string): Promise<ChannelModel[]> {
  const res = await api.get<CanvasModelsResponse>('/api/canvas/models')
  const payload = res.data
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'Failed to load canvas models')
  }

  const seen = new Set<string>()
  const models: ChannelModel[] = []
  for (const item of payload.data) {
    const name = item.id?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const capability = normalizeCapability(item.capability)
    const description = item.description?.trim() || undefined
    models.push({ name, capability, description })
  }
  return normalizeChannelModels(models)
}

function normalizeCapability(value: string | undefined): ModelCapability {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text') {
    return value
  }
  return 'text'
}

function pickDefaultModel(
  channels: ModelChannel[],
  capability: ModelCapability,
  current: string
) {
  const channel =
    channels.find((item) => item.id === GATEWAY_CHANNEL_ID) ?? channels[0]
  if (!channel) return ''

  const pseudoConfig = {
    channels,
    models: modelOptionsFromChannels(channels),
  } as AiConfig
  const encodedCurrent = normalizeModelOptionValue(current, channels)
  if (
    encodedCurrent &&
    modelMatchesCapability(pseudoConfig, encodedCurrent, capability)
  ) {
    return encodedCurrent
  }

  const match = channel.models.find((model) => model.capability === capability)
  return match ? encodeChannelModel(channel.id, match.name) : ''
}

function mergeGatewayModels(existingChannels: ModelChannel[], incoming: ChannelModel[]) {
  const channels = existingChannels.map((channel) => ({
    ...channel,
    models: [...channel.models],
  }))
  const defaultChannel =
    channels.find((channel) => channel.id === GATEWAY_CHANNEL_ID) ?? channels[0]
  if (!defaultChannel || !incoming.length) return channels

  // Live gateway catalog is the source of truth. Keep only scripts for
  // models that still exist — never re-append stale demo defaults (e.g. grok).
  const existingByName = new Map(defaultChannel.models.map((model) => [model.name, model]))
  const merged = incoming.map((model) => {
    const previous = existingByName.get(model.name)
    if (!previous) return model
    return {
      ...model,
      script: previous.script,
      // Prefer live catalog description; keep previous only if catalog omitted it.
      description: model.description || previous.description,
    }
  })

  defaultChannel.models = normalizeChannelModels(merged)
  return channels
}

export async function syncGatewayModels(apiKey: string, force = false) {
  const state = useConfigStore.getState()
  if (!force && hasCustomRemoteCredentials(state.config)) return false

  // Always refetch the live catalog so channel/model changes show up without
  // waiting for a sessionStorage cache expiry or a hard reload.
  const incoming = await fetchGatewayModelCatalog(apiKey)
  if (!incoming.length) return false

  const channels = mergeGatewayModels(state.config.channels, incoming)
  const models = modelOptionsFromChannels(channels)
  const rewriteToGateway = shouldAutoApplyGateway(state.config)
  const gatewayBase = gatewayBaseUrl()
  const defaultChannel = getDefaultChannel({ ...state.config, channels })
  const preservedBase =
    defaultChannel?.baseUrl?.trim() ||
    state.config.baseUrl.trim() ||
    gatewayBase

  useConfigStore.setState((current) => ({
    config: {
      ...current.config,
      channelMode: 'remote',
      baseUrl: rewriteToGateway ? gatewayBase : preservedBase,
      apiKey,
      channels: rewriteToGateway
        ? channels.map((channel) =>
            channel.id === (defaultChannel?.id ?? GATEWAY_CHANNEL_ID)
              ? { ...channel, baseUrl: gatewayBase, apiKey }
              : channel
          )
        : channels.map((channel) =>
            channel.id === (defaultChannel?.id ?? GATEWAY_CHANNEL_ID)
              ? {
                  ...channel,
                  apiKey,
                  baseUrl: isProductDefaultBaseUrl(channel.baseUrl)
                    ? channel.baseUrl
                    : channel.baseUrl || preservedBase,
                }
              : channel
          ),
      models,
      imageModel: pickDefaultModel(channels, 'image', current.config.imageModel),
      videoModel: pickDefaultModel(channels, 'video', current.config.videoModel),
      textModel: pickDefaultModel(
        channels,
        'text',
        current.config.textModel || current.config.model
      ),
      audioModel: pickDefaultModel(channels, 'audio', current.config.audioModel),
      model: pickDefaultModel(channels, 'image', current.config.model),
    },
  }))

  return true
}
