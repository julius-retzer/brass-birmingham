// The AI player driver: one call = one machine event decided and applied.
//
// Contract (design doc): feed the model the serialized state + enumerated
// legal moves, validate its pick BY EXECUTING it on the engine, retry with
// the validation error appended (max 3 model calls per decision), then fall
// back to a deterministic heuristic so the game NEVER stalls. Every step
// reports usage so the per-game cost counter stays honest.
import { createActor } from 'xstate'
import {
  type GameEvent,
  type GameStoreSnapshot,
  gameStore,
} from '../../store/gameStore'
import { type LegalMove, enumerateLegalMoves } from './legal-moves'
import { buildDecisionMessage, buildSystemPrompt } from './prompts'
import { serializeGameState } from './serialize'
import {
  type AiChatMessage,
  type AiProvider,
  type AiTier,
  type AiUsageTotals,
  costOf,
  emptyUsageTotals,
} from './types'

export const MAX_MODEL_CALLS_PER_DECISION = 3
/** Machine events per AI turn before the driver goes safety-first. */
export const STEP_SAFETY_BUDGET = 60

/* ---------------- snapshot plumbing ---------------- */

// JSON round-trips turn the markets' `maxCubes: Infinity` into null — the
// same fix every other snapshot consumer applies.
export function rehydrateSnapshot(persisted: unknown): unknown {
  const clone = structuredClone(persisted) as {
    context?: {
      coalMarket?: Array<{ maxCubes: number | null }>
      ironMarket?: Array<{ maxCubes: number | null }>
    }
  }
  for (const market of [clone.context?.coalMarket, clone.context?.ironMarket]) {
    if (!Array.isArray(market)) continue
    for (const row of market) {
      if (row && row.maxCubes === null) row.maxCubes = Infinity
    }
  }
  return clone
}

function snapshotOf(persisted: unknown): GameStoreSnapshot {
  const actor = createActor(gameStore, {
    snapshot: rehydrateSnapshot(persisted) as never,
  })
  actor.start()
  const snap = actor.getSnapshot()
  actor.stop()
  return snap as GameStoreSnapshot
}

interface ApplyResult {
  ok: boolean
  /** persisted snapshot after the event (when ok) */
  next?: unknown
  after?: GameStoreSnapshot
  error?: string
}

/**
 * Execute one event on a scratch actor. "Legal" means the guard accepted it
 * AND execution did not set lastError (the engine's actions never throw —
 * a failed execution leaves an error and refuses to consume the action).
 */
export function tryApplyEvent(
  persisted: unknown,
  event: GameEvent,
): ApplyResult {
  const actor = createActor(gameStore, {
    snapshot: rehydrateSnapshot(persisted) as never,
  })
  actor.start()
  const before = actor.getSnapshot() as GameStoreSnapshot
  if (!before.can(event as never)) {
    actor.stop()
    return { ok: false, error: 'That event is not accepted right now.' }
  }
  actor.send(event as never)
  const after = actor.getSnapshot() as GameStoreSnapshot
  if (after.context.lastError !== null) {
    const error = after.context.lastError
    actor.stop()
    return { ok: false, error }
  }
  const next = actor.getPersistedSnapshot()
  actor.stop()
  return { ok: true, next, after }
}

/**
 * A SELECT that lands on the build-confirm step can still be a dead end
 * (no coal reach / can't pay — validated only at CONFIRM execution). Probe
 * the confirm so the model gets the real refusal for THIS pick instead of
 * walking into it a step later.
 */
function confirmDeadEnd(applied: ApplyResult): string | null {
  const after = applied.after
  if (!after) return null
  const inConfirm =
    after.matches({
      playing: { action: { building: 'confirmingBuild' } },
    } as never) ||
    after.matches({
      playing: { action: { networking: 'confirmingLink' } },
    } as never)
  if (!inConfirm) return null
  if (!after.can({ type: 'CONFIRM' } as never)) return null
  const probe = tryApplyEvent(applied.next, { type: 'CONFIRM' })
  return probe.ok ? null : (probe.error ?? 'The confirm would fail.')
}

/* ---------------- deterministic fallback ---------------- */

// "First sensible legal action": complete what is in flight, otherwise the
// safest turn-consuming action, and only then unwind with CANCEL.
const FALLBACK_PRIORITY: GameEvent['type'][] = [
  'CONFIRM',
  'EXECUTE_DOUBLE_NETWORK_ACTION',
  'SELECT_SALE',
  'SELECT_CARD',
  'SELECT_INDUSTRY_TYPE',
  'SELECT_LOCATION',
  'SELECT_LINK',
  'SELECT_SECOND_LINK',
  'SELECT_TILES_FOR_DEVELOP',
  'TAKE_LOAN',
  'PASS',
  'BUILD',
  'NETWORK',
  'DEVELOP',
  'SELL',
  'SCOUT',
  'BUILD_SECOND_LINK',
  'CHOOSE_DOUBLE_LINK_BUILD',
  'CANCEL',
]

function fallbackApply(
  persisted: unknown,
  moves: LegalMove[],
): { move: LegalMove; result: ApplyResult } | null {
  const ranked = [...moves].sort(
    (a, b) =>
      FALLBACK_PRIORITY.indexOf(a.event.type) -
      FALLBACK_PRIORITY.indexOf(b.event.type),
  )
  for (const move of ranked) {
    const result = tryApplyEvent(persisted, move.event)
    if (result.ok && !confirmDeadEnd(result)) return { move, result }
  }
  // even a dead-end confirm target is progress if nothing else applies
  for (const move of ranked) {
    const result = tryApplyEvent(persisted, move.event)
    if (result.ok) return { move, result }
  }
  return null
}

/** PASS out of the turn (CANCEL first if mid-flow) — the stall breaker. */
function safeApply(
  persisted: unknown,
  moves: LegalMove[],
): { move: LegalMove; result: ApplyResult } | null {
  for (const type of ['PASS', 'CANCEL', 'CONFIRM'] as const) {
    const move = moves.find((m) => m.event.type === type)
    if (!move) continue
    const result = tryApplyEvent(persisted, move.event)
    if (result.ok) return { move, result }
  }
  return fallbackApply(persisted, moves)
}

/* ---------------- one decision ---------------- */

export interface AiStepOutcome {
  /** persisted snapshot after the applied event */
  snapshot: unknown
  move: LegalMove
  /** null when the step was applied without consulting the model */
  rationale: string | null
  fallback: boolean
  auto: boolean
  usage: AiUsageTotals
  /** model calls made for this one decision (0 for auto steps) */
  attempts: number
}

export interface AiStepOptions {
  persisted: unknown
  seatIndex: number
  provider: AiProvider
  tier: AiTier
  /** true once the turn's step budget is spent — stop consulting the model */
  forceSafe?: boolean
}

export async function aiDecideAndApply(
  opts: AiStepOptions,
): Promise<AiStepOutcome> {
  const { persisted, seatIndex, provider, tier } = opts
  const snapshot = snapshotOf(persisted)
  if (snapshot.context.currentPlayerIndex !== seatIndex) {
    throw new Error('It is not this AI seat’s turn.')
  }
  const moves = enumerateLegalMoves(snapshot)
  if (moves.length === 0) {
    throw new Error(
      'The AI has no legal moves — the engine should not allow this.',
    )
  }
  const usage = emptyUsageTotals()

  const finish = (
    picked: { move: LegalMove; result: ApplyResult },
    extras: {
      rationale: string | null
      fallback: boolean
      auto: boolean
      attempts: number
    },
  ): AiStepOutcome => {
    if (extras.fallback) usage.fallbacks += 1
    return {
      snapshot: picked.result.next,
      move: picked.move,
      usage,
      ...extras,
    }
  }

  if (opts.forceSafe) {
    const picked = safeApply(persisted, moves)
    if (!picked) throw new Error('No move could be applied.')
    return finish(picked, {
      rationale: null,
      fallback: true,
      auto: true,
      attempts: 0,
    })
  }

  // Auto-steps that never need a model call:
  //  - a single legal move
  //  - the pure CONFIRM/CANCEL checkpoint (the model already chose the
  //    pieces; confirm when it works, cancel when it cannot)
  if (moves.length === 1) {
    const only = moves[0]!
    const result = tryApplyEvent(persisted, only.event)
    if (result.ok) {
      return finish(
        { move: only, result },
        { rationale: null, fallback: false, auto: true, attempts: 0 },
      )
    }
    const picked = safeApply(persisted, moves)
    if (!picked) throw new Error('No move could be applied.')
    return finish(picked, {
      rationale: null,
      fallback: true,
      auto: true,
      attempts: 0,
    })
  }
  const types = new Set(moves.map((m) => m.event.type))
  if (moves.length === 2 && types.has('CONFIRM') && types.has('CANCEL')) {
    const confirm = moves.find((m) => m.event.type === 'CONFIRM')!
    const result = tryApplyEvent(persisted, confirm.event)
    if (result.ok) {
      return finish(
        { move: confirm, result },
        { rationale: null, fallback: false, auto: true, attempts: 0 },
      )
    }
    const cancel = moves.find((m) => m.event.type === 'CANCEL')!
    const cancelled = tryApplyEvent(persisted, cancel.event)
    if (cancelled.ok) {
      return finish(
        { move: cancel, result: cancelled },
        { rationale: null, fallback: true, auto: true, attempts: 0 },
      )
    }
  }

  // Consult the model: validate by execution, retry with the error, then
  // fall back deterministically.
  const system = buildSystemPrompt(tier)
  const messages: AiChatMessage[] = [
    {
      role: 'user',
      content: buildDecisionMessage(
        serializeGameState(snapshot, seatIndex),
        moves,
      ),
    },
  ]
  let attempts = 0
  while (attempts < MAX_MODEL_CALLS_PER_DECISION) {
    attempts += 1
    const result = await provider.decide({ tier, system, messages })
    usage.calls += 1
    usage.inputTokens += result.usage.inputTokens
    usage.outputTokens += result.usage.outputTokens
    // prefer the gateway's exact per-call cost over the static tier table
    usage.costUsd += result.costUsd ?? costOf(tier, result.usage)

    const reject = (why: string) => {
      messages.push(
        { role: 'assistant', content: result.raw || '(no answer)' },
        {
          role: 'user',
          content: `${why} Answer again with JSON {"moveIndex": <number>, "rationale": "<one sentence>"} choosing a move from the same list.`,
        },
      )
    }

    if (!result.choice) {
      reject(result.error ?? 'The answer could not be parsed.')
      continue
    }
    const idx = result.choice.moveIndex
    const move = moves[idx]
    if (!move) {
      reject(
        `moveIndex ${idx} is not a legal choice — it must be between 0 and ${moves.length - 1}.`,
      )
      continue
    }
    const applied = tryApplyEvent(persisted, move.event)
    if (!applied.ok) {
      reject(
        `Move ${idx} ("${move.label}") failed the rules check: ${applied.error}.`,
      )
      continue
    }
    const deadEnd = confirmDeadEnd(applied)
    if (deadEnd) {
      reject(
        `Move ${idx} ("${move.label}") leads to a build that cannot be completed: ${deadEnd}. Choose a different move.`,
      )
      continue
    }
    return finish(
      { move, result: applied },
      {
        rationale: result.choice.rationale.slice(0, 300),
        fallback: false,
        auto: false,
        attempts,
      },
    )
  }

  // Model failed 3 times — deterministic heuristic keeps the game moving.
  const picked = fallbackApply(persisted, moves)
  if (!picked) throw new Error('No move could be applied.')
  return finish(picked, {
    rationale: null,
    fallback: true,
    auto: false,
    attempts,
  })
}
