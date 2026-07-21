import { afterEach, describe, expect, it } from 'vitest'
import { GET } from './route'

const saved = {
  key: process.env.ANTHROPIC_API_KEY,
  mock: process.env.BB_AI_MOCK,
  vercel: process.env.VERCEL_ENV,
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  restore('ANTHROPIC_API_KEY', saved.key)
  restore('BB_AI_MOCK', saved.mock)
  restore('VERCEL_ENV', saved.vercel)
})

async function available(): Promise<boolean> {
  const body = (await GET().json()) as { available: boolean }
  return body.available
}

describe('GET /api/mp/ai-available', () => {
  it('reports available when a key is present (non-prod)', async () => {
    delete process.env.VERCEL_ENV
    delete process.env.BB_AI_MOCK
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    expect(await available()).toBe(true)
  })

  it('reports available in mock mode without a key', async () => {
    delete process.env.VERCEL_ENV
    delete process.env.ANTHROPIC_API_KEY
    process.env.BB_AI_MOCK = '1'
    expect(await available()).toBe(true)
  })

  it('reports unavailable with no key and no mock', async () => {
    delete process.env.VERCEL_ENV
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.BB_AI_MOCK
    expect(await available()).toBe(false)
  })

  it('reports unavailable in production even with a key', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    process.env.BB_AI_MOCK = '1'
    expect(await available()).toBe(false)
  })

  it('never leaks the key value in the response', async () => {
    delete process.env.VERCEL_ENV
    process.env.ANTHROPIC_API_KEY = 'sk-super-secret'
    const text = await GET().text()
    expect(text).not.toContain('sk-super-secret')
  })
})
