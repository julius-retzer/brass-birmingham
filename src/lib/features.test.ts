import { describe, expect, it } from 'vitest'
import {
  aiOpponentsAvailable,
  aiOpponentsAvailableFromEnv,
  aiOpponentsEnabled,
} from './features'

describe('aiOpponentsEnabled', () => {
  it('is disabled in production', () => {
    expect(aiOpponentsEnabled('production')).toBe(false)
  })

  it('is enabled in preview', () => {
    expect(aiOpponentsEnabled('preview')).toBe(true)
  })

  it('is enabled in development', () => {
    expect(aiOpponentsEnabled('development')).toBe(true)
  })

  it('is enabled when unset (local dev, CI)', () => {
    expect(aiOpponentsEnabled(undefined)).toBe(true)
  })
})

describe('aiOpponentsAvailable', () => {
  it('is available when the feature is enabled and a key is present', () => {
    expect(
      aiOpponentsAvailable({ vercelEnv: undefined, hasKey: true, mock: false }),
    ).toBe(true)
  })

  it('is available in mock mode without a key', () => {
    expect(
      aiOpponentsAvailable({ vercelEnv: undefined, hasKey: false, mock: true }),
    ).toBe(true)
  })

  it('is unavailable when neither a key nor mock mode is present', () => {
    expect(
      aiOpponentsAvailable({
        vercelEnv: undefined,
        hasKey: false,
        mock: false,
      }),
    ).toBe(false)
  })

  it('is unavailable in production even with a key', () => {
    expect(
      aiOpponentsAvailable({
        vercelEnv: 'production',
        hasKey: true,
        mock: true,
      }),
    ).toBe(false)
  })
})

describe('aiOpponentsAvailableFromEnv', () => {
  it('reads a key from the environment', () => {
    expect(aiOpponentsAvailableFromEnv({ ANTHROPIC_API_KEY: 'sk-test' })).toBe(
      true,
    )
  })

  it('accepts the offline mock instead of a key', () => {
    expect(aiOpponentsAvailableFromEnv({ BB_AI_MOCK: '1' })).toBe(true)
  })

  it('is unavailable with neither', () => {
    expect(aiOpponentsAvailableFromEnv({})).toBe(false)
  })

  it('is unavailable in production even with a key and the mock', () => {
    expect(
      aiOpponentsAvailableFromEnv({
        VERCEL_ENV: 'production',
        ANTHROPIC_API_KEY: 'sk-test',
        BB_AI_MOCK: '1',
      }),
    ).toBe(false)
  })

  it('treats any other BB_AI_MOCK value as off', () => {
    expect(aiOpponentsAvailableFromEnv({ BB_AI_MOCK: 'true' })).toBe(false)
  })
})
