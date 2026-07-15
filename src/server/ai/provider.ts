// Model backends. Anthropic is the MVP provider (server-side API key);
// the interface in types.ts keeps other providers pluggable. BB_AI_MOCK=1
// swaps in a deterministic mock for tests/e2e — no network, no key.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { CHOICE_SCHEMA } from './prompts'
import { type AiProvider, type AiProviderResult, type AiUsage } from './types'

const choiceSchema = z.object({
  moveIndex: z.number().int(),
  rationale: z.string(),
})

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export function isMockMode(): boolean {
  return process.env.BB_AI_MOCK === '1'
}

/* ---------------- Anthropic ---------------- */

let client: Anthropic | null = null
const getClient = (): Anthropic => {
  client ??= new Anthropic()
  return client
}

export const anthropicProvider: AiProvider = {
  async decide({ tier, system, messages }): Promise<AiProviderResult> {
    const response = await getClient().messages.create({
      model: tier.model,
      max_tokens: tier.maxTokens,
      system,
      messages,
      output_config: {
        format: {
          type: 'json_schema',
          schema: CHOICE_SCHEMA,
        },
      },
    })

    const usage: AiUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    if (response.stop_reason === 'refusal') {
      return {
        choice: null,
        error: 'The model declined to answer.',
        usage,
        raw: text,
      }
    }
    if (response.stop_reason === 'max_tokens') {
      return {
        choice: null,
        error: 'The response was cut off before a choice was made.',
        usage,
        raw: text,
      }
    }
    try {
      const parsed = choiceSchema.parse(JSON.parse(text))
      return { choice: parsed, usage, raw: text }
    } catch {
      return {
        choice: null,
        error: 'The response was not valid {"moveIndex", "rationale"} JSON.',
        usage,
        raw: text,
      }
    }
  },
}

/* ---------------- deterministic mock (tests / e2e) ---------------- */

// Mirrors a sensible player just enough for a happy-path turn: prefers a
// loan (visible, deterministic effect), completes flows via card/confirm,
// falls back to the first listed move. Zero cost, zero network.
const MOCK_PREFERENCES = ['TAKE_LOAN', 'CONFIRM', 'SELECT_CARD', 'PASS']

export const mockProvider: AiProvider = {
  async decide({ messages }): Promise<AiProviderResult> {
    const last = messages[messages.length - 1]?.content ?? ''
    const listStart = last.indexOf('== LEGAL MOVES ==')
    const lines = last
      .slice(listStart)
      .split('\n')
      .filter((l) => /^\d+\. /.test(l))
    const pick = (() => {
      for (const pref of MOCK_PREFERENCES) {
        const needle =
          pref === 'TAKE_LOAN'
            ? 'Take a loan'
            : pref === 'CONFIRM'
              ? 'Confirm this action'
              : pref === 'SELECT_CARD'
                ? 'Play card:'
                : 'Pass —'
        const hit = lines.find((l) => l.includes(needle))
        if (hit) return Number(hit.split('.')[0])
      }
      return 0
    })()
    return {
      choice: { moveIndex: pick, rationale: 'Mock rationale.' },
      usage: { inputTokens: 0, outputTokens: 0 },
      raw: '',
    }
  },
}

/** Provider used by the live server: mock in BB_AI_MOCK, else Anthropic. */
export function defaultProvider(): AiProvider {
  return isMockMode() ? mockProvider : anthropicProvider
}
