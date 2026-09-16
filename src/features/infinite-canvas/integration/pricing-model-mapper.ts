import type { PricingModel } from '@/features/pricing/types'

import {
  guessCapability,
  type ChannelModel,
  type ModelCapability,
} from '@canvas/stores/use-config-store'

const IMAGE_ENDPOINTS = new Set(['image-generation'])
const VIDEO_ENDPOINTS = new Set(['openai-video'])

/** Map pricing catalog metadata to canvas model capabilities. */
export function inferCapabilityFromPricing(model: PricingModel): ModelCapability {
  const endpoints = model.supported_endpoint_types ?? []

  if (endpoints.some((entry) => IMAGE_ENDPOINTS.has(entry))) return 'image'
  if (endpoints.some((entry) => VIDEO_ENDPOINTS.has(entry))) return 'video'
  if (
    model.audio_ratio != null ||
    model.output_modalities?.includes('audio') ||
    endpoints.some((entry) => entry.includes('audio') || entry.includes('tts'))
  ) {
    return 'audio'
  }
  if (model.output_modalities?.includes('video')) return 'video'
  if (
    model.output_modalities?.includes('image') &&
    model.image_ratio != null &&
    !endpoints.some((entry) => entry.includes('chat') || entry.includes('completion'))
  ) {
    return 'image'
  }

  return guessCapability(model.model_name)
}

export function pricingModelsToChannelModels(models: PricingModel[]): ChannelModel[] {
  const seen = new Set<string>()
  const result: ChannelModel[] = []

  for (const model of models) {
    const name = model.model_name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push({
      name,
      capability: inferCapabilityFromPricing(model),
    })
  }

  return result
}

export const DEFAULT_CANVAS_MODEL_NAMES = new Set([
  'gpt-image-2',
  'grok-imagine-video',
  'gpt-5.5',
  'gpt-4o-mini-tts',
])

export function isPlaceholderModelCatalog(models: ChannelModel[]) {
  if (!models.length) return true
  if (models.length > DEFAULT_CANVAS_MODEL_NAMES.size) return false
  return models.every((model) => DEFAULT_CANVAS_MODEL_NAMES.has(model.name))
}
