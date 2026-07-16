import { describe, expect, it } from 'vitest'
import { aiOpponentsEnabled } from './features'

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
