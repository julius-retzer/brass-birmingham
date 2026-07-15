// Model backends behind the pluggable AiProvider interface:
//  - anthropicProvider: the Anthropic SDK (api.anthropic.com, or an
//    Anthropic-compatible gateway via ANTHROPIC_BASE_URL)
//  - openAiCompatProvider: chat/completions on the SAME gateway, for
//    gateway-only models (DeepSeek) that don't speak the Anthropic wire
//  - mockProvider: deterministic, offline (BB_AI_MOCK=1; tests/e2e)
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { CHOICE_SCHEMA } from './prompts'
import {
  type AiProvider,
  type AiProviderResult,
  type AiTier,
  type AiUsage,
} from './types'

const choiceSchema = z.object({
  moveIndex: z.number().int(),
  rationale: z.string(),
})

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export function gatewayBaseUrl(): string | null {
  return process.env.ANTHROPIC_BASE_URL?.replace(/\/+$/, '') ?? null
}

export function isMockMode(): boolean {
  return process.env.BB_AI_MOCK === '1'
}

/** Strip markdown fences and parse the {"moveIndex","rationale"} answer. */
function parseChoice(text: string): AiProviderResult['choice'] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return choiceSchema.parse(JSON.parse(cleaned))
  } catch {
    return null
  }
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
    // Gateways (opencode zen) report the exact per-call cost as an extra
    // top-level field; the first-party API simply omits it.
    const reported = (response as unknown as { cost?: string }).cost
    const costUsd = reported ? Number.parseFloat(reported) : undefined
    const choice = parseChoice(text)
    return choice
      ? { choice, usage, costUsd, raw: text }
      : {
          choice: null,
          error: 'The response was not valid {"moveIndex", "rationale"} JSON.',
          usage,
          costUsd,
          raw: text,
        }
  },
}

/* ---------------- OpenAI-compatible gateway wire ---------------- */

// For gateway-only models (tier.wire === 'openai'): POST chat/completions
// to the configured ANTHROPIC_BASE_URL with the same key. No SDK — the
// call shape is tiny and the driver's retry loop handles the rough edges.
export const openAiCompatProvider: AiProvider = {
  async decide({ tier, system, messages }): Promise<AiProviderResult> {
    const base = gatewayBaseUrl()
    if (!base) {
      return {
        choice: null,
        error: `Model ${tier.model} needs an Anthropic-compatible gateway (set ANTHROPIC_BASE_URL).`,
        usage: { inputTokens: 0, outputTokens: 0 },
        raw: '',
      }
    }
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.ANTHROPIC_API_KEY ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: tier.model,
        max_tokens: tier.maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    })
    if (!res.ok) {
      return {
        choice: null,
        error: `The model gateway answered ${res.status}.`,
        usage: { inputTokens: 0, outputTokens: 0 },
        raw: '',
      }
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
      cost?: string
    }
    const usage: AiUsage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    }
    const costUsd = data.cost ? Number.parseFloat(data.cost) : undefined
    const text = data.choices?.[0]?.message?.content ?? ''
    const choice = parseChoice(text)
    return choice
      ? { choice, usage, costUsd, raw: text }
      : {
          choice: null,
          error: 'The response was not valid {"moveIndex", "rationale"} JSON.',
          usage,
          costUsd,
          raw: text,
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

/** Provider for a tier: mock in BB_AI_MOCK, else picked by wire format. */
export function providerFor(tier: AiTier): AiProvider {
  if (isMockMode()) return mockProvider
  return tier.wire === 'openai' ? openAiCompatProvider : anthropicProvider
}
