// Shared types for the LLM opponent: difficulty tiers, the pluggable
// provider interface, and usage/cost accounting.
import { type GameEvent } from '../../store/gameStore'

/** Difficulty ladder — each tier is an Anthropic model + prompt flavour. */
export type AiTierId = 'apprentice' | 'foreman' | 'magnate' | 'ironmaster'

export interface AiTier {
  id: AiTierId
  /** Display name shown on the seat and in the setup charter. */
  label: string
  /** Short difficulty word for the UI. */
  difficulty: 'easy' | 'medium' | 'hard' | 'expert'
  model: string
  /** USD per million tokens — used by the per-game cost counter. */
  inputPerMTok: number
  outputPerMTok: number
  /** Output cap per decision (thinking models need headroom). */
  maxTokens: number
  /** Tier-specific strategy guidance appended to the system prompt. */
  strategy: string
}

export const AI_TIERS: Record<AiTierId, AiTier> = {
  apprentice: {
    id: 'apprentice',
    label: 'The Apprentice',
    difficulty: 'easy',
    model: 'claude-haiku-4-5',
    inputPerMTok: 1,
    outputPerMTok: 5,
    maxTokens: 1024,
    strategy:
      'You are a novice industrialist. Pick reasonable-looking moves without deep calculation.',
  },
  foreman: {
    id: 'foreman',
    label: 'The Foreman',
    difficulty: 'medium',
    model: 'claude-sonnet-5',
    inputPerMTok: 3,
    outputPerMTok: 15,
    maxTokens: 4096,
    strategy:
      'You are a competent industrialist. Balance income, victory points and network growth; avoid obviously wasteful moves.',
  },
  magnate: {
    id: 'magnate',
    label: 'The Magnate',
    difficulty: 'hard',
    model: 'claude-opus-4-8',
    inputPerMTok: 5,
    outputPerMTok: 25,
    maxTokens: 4096,
    strategy:
      'You are a strong industrialist. Plan a coherent engine: build income early, position industries where they can flip, take link VP late in each era, and deny opponents key locations when cheap to do so.',
  },
  ironmaster: {
    id: 'ironmaster',
    label: 'The Ironmaster',
    difficulty: 'expert',
    model: 'claude-fable-5',
    inputPerMTok: 10,
    outputPerMTok: 50,
    maxTokens: 8192,
    strategy:
      'You are a world-class Brass: Birmingham player. Reason carefully about tempo, resource markets, turn order (least spender goes first), era transitions (level-1 industries and all canals are removed at the end of the Canal Era), beer logistics for selling, and denying opponents their key sites. Maximise final victory points.',
  },
}

export const AI_TIER_IDS = Object.keys(AI_TIERS) as AiTierId[]

export const isAiTierId = (v: unknown): v is AiTierId =>
  typeof v === 'string' && v in AI_TIERS

/* ---------------- provider ---------------- */

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** The model's parsed answer for one decision. */
export interface AiChoice {
  moveIndex: number
  rationale: string
}

export interface AiUsage {
  inputTokens: number
  outputTokens: number
}

export interface AiProviderResult {
  /** null when the response could not be parsed into a choice */
  choice: AiChoice | null
  /** why choice is null (parse failure, refusal, …) — fed into the retry */
  error?: string
  usage: AiUsage
  /** raw assistant text, echoed back into the retry conversation */
  raw: string
}

/** Pluggable model backend (Anthropic for MVP; mock for tests/e2e). */
export interface AiProvider {
  decide(req: {
    tier: AiTier
    system: string
    messages: AiChatMessage[]
  }): Promise<AiProviderResult>
}

/* ---------------- accounting & logging ---------------- */

export interface AiUsageTotals {
  calls: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  fallbacks: number
}

export const emptyUsageTotals = (): AiUsageTotals => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  fallbacks: 0,
})

export const costOf = (tier: AiTier, usage: AiUsage): number =>
  (usage.inputTokens * tier.inputPerMTok +
    usage.outputTokens * tier.outputPerMTok) /
  1_000_000

/** One executed AI machine event, with the story the model told about it. */
export interface AiLogEntry {
  seatId: number
  era: string
  round: number
  eventType: GameEvent['type']
  label: string
  /** null for auto-applied steps (single legal move / auto-confirm) */
  rationale: string | null
  fallback: boolean
  at: string
}
