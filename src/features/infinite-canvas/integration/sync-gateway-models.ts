import { startTransition } from 'react'

import { api } from '@/lib/api'

import {
  encodeChannelModel,
  guessCapability,
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

type OpenAIModelsResponse = {
  data?: Array<{ id?: string }>
}

/** Fetch gateway models with capability labels (no /v1/models round-trip). */
export async function fetchGatewayModelCatalog(apiKey: string): Promise<ChannelModel[]> {
  try {
    const res = await api.get<CanvasModelsResponse>('/api/canvas/models', {
      skipErrorHandler: true,
    })
    const payload = res.data
    if (payload?.success && Array.isArray(payload.data)) {
      return normalizeCatalog(payload.data)
    }
  } catch {
    // Fall through to /v1/models with the relay key (works signed-out on desktop).
  }

  return fetchRelayModelCatalog(apiKey)
}

function normalizeCatalog(items: CanvasCatalogModel[]): ChannelModel[] {
  const seen = new Set<string>()
  const models: ChannelModel[] = []
  for (const item of items) {
    const name = item.id?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const capability = capabilityFromCatalog(name, item.capability)
    const description = item.description?.trim() || undefined
    models.push({ name, capability, description })
  }
  return normalizeChannelModels(models)
}

/** Fallback: list models via OpenAI-compatible /v1/models using the relay sk-. */
async function fetchRelayModelCatalog(apiKey: string): Promise<ChannelModel[]> {
  const key = apiKey.trim()
  if (!key) throw new Error('Failed to load canvas models')

  const res = await api.get<OpenAIModelsResponse>('/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    skipErrorHandler: true,
  })

  const items = Array.isArray(res.data?.data) ? res.data.data : []
  const seen = new Set<string>()
  const models: ChannelModel[] = []
  for (const item of items) {
    const name = item.id?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    models.push({ name, capability: guessCapability(name) })
  }
  if (!models.length) throw new Error('Failed to load canvas models')
  return normalizeChannelModels(models)
}

function normalizeCapability(value: string | undefined): ModelCapability {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text') {
    return value
  }
  return 'text'
}

function capabilityFromCatalog(name: string, remote: string | undefined): ModelCapability {
  const guessed = guessCapability(name)
  // The gateway still tags every MiniMax name as video. Chat M-series stay text.
  if (guessed === 'text' && /minimax-m\d/i.test(name)) return 'text'
  const tagged = normalizeCapability(remote)
  return tagged === 'text' ? guessed : tagged
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

  startTransition(() => {
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
  })

  return true
}
