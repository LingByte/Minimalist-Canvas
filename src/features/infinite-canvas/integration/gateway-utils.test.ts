import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GATEWAY_CHANNEL_ID,
  hasCustomRemoteCredentials,
  shouldAutoApplyGateway,
  shouldFillDefaultChannelApiKey,
} from './gateway-utils'
import type { AiConfig, ModelChannel } from '@canvas/stores/use-config-store'

function configWithChannel(channel: Partial<ModelChannel>): AiConfig {
  return {
    channels: [
      {
        id: GATEWAY_CHANNEL_ID,
        name: 'Default',
        baseUrl: '',
        apiKey: '',
        apiFormat: 'openai',
        models: [],
        ...channel,
      },
    ],
  } as AiConfig
}

describe('gateway utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('migrates retired product hosts to the site gateway', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } })
    const config = configWithChannel({
      baseUrl: 'https://canvas.soulmy.top',
      apiKey: 'sk-test',
    })
    expect(hasCustomRemoteCredentials(config)).toBe(false)
    expect(shouldAutoApplyGateway(config)).toBe(true)
  })

  it('leaves intentional third-party credentials alone', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } })
    const config = configWithChannel({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
    })
    expect(hasCustomRemoteCredentials(config)).toBe(true)
    expect(shouldAutoApplyGateway(config)).toBe(false)
    expect(shouldFillDefaultChannelApiKey(config)).toBe(false)
  })

  it('fills missing relay keys on the gateway channel', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } })
    const config = configWithChannel({
      baseUrl: 'http://localhost:3000/v1',
      apiKey: '',
    })
    expect(shouldFillDefaultChannelApiKey(config)).toBe(true)
    expect(shouldAutoApplyGateway(config)).toBe(true)
  })
})
