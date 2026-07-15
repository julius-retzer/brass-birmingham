// The OpenAI-wire provider (gateway-only models like the Clerk/minimax):
// request shape, JSON parsing incl. fenced answers, gateway cost, and the
// no-gateway refusal that feeds the driver's retry loop.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { openAiCompatProvider } from './provider'
import { AI_TIERS } from './types'

const tier = AI_TIERS.clerk

function stubFetch(body: unknown, ok = true) {
  const impl = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', impl)
  return impl
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ANTHROPIC_BASE_URL
})

describe('openAiCompatProvider', () => {
  test('refuses clearly when no gateway is configured', async () => {
    const result = await openAiCompatProvider.decide({
      tier,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.choice).toBeNull()
    expect(result.error).toMatch(/ANTHROPIC_BASE_URL/)
  })

  test('posts chat/completions to the gateway and parses the choice + cost', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example/zen/'
    const impl = stubFetch({
      choices: [
        {
          message: {
            content: '{"moveIndex": 2, "rationale": "Loan keeps me liquid."}',
            reasoning_content: 'thinking noise that must be ignored',
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 40 },
      cost: '0.00033036',
    })
    const result = await openAiCompatProvider.decide({
      tier,
      system: 'sys',
      messages: [{ role: 'user', content: 'choose' }],
    })
    expect(result.choice).toEqual({
      moveIndex: 2,
      rationale: 'Loan keeps me liquid.',
    })
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 })
    expect(result.costUsd).toBeCloseTo(0.00033036, 10)

    const [url, init] = impl.mock.calls[0] as unknown as [
      string,
      { body: string },
    ]
    expect(url).toBe('https://gateway.example/zen/v1/chat/completions')
    const sent = JSON.parse(init.body) as {
      model: string
      messages: Array<{ role: string }>
    }
    expect(sent.model).toBe('minimax-m3')
    expect(sent.messages[0]!.role).toBe('system')
  })

  test('strips markdown fences before parsing', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example'
    stubFetch({
      choices: [
        {
          message: { content: '```json\n{"moveIndex":0,"rationale":"r"}\n```' },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })
    const result = await openAiCompatProvider.decide({
      tier,
      system: 's',
      messages: [{ role: 'user', content: 'c' }],
    })
    expect(result.choice?.moveIndex).toBe(0)
  })

  test('a non-JSON answer becomes a retryable parse error', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example'
    stubFetch({
      choices: [{ message: { content: 'I will take the loan!' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })
    const result = await openAiCompatProvider.decide({
      tier,
      system: 's',
      messages: [{ role: 'user', content: 'c' }],
    })
    expect(result.choice).toBeNull()
    expect(result.error).toMatch(/JSON/)
    expect(result.raw).toBe('I will take the loan!')
  })

  test('a gateway HTTP error becomes a retryable error', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example'
    stubFetch({}, false)
    const result = await openAiCompatProvider.decide({
      tier,
      system: 's',
      messages: [{ role: 'user', content: 'c' }],
    })
    expect(result.choice).toBeNull()
    expect(result.error).toMatch(/500/)
  })
})
