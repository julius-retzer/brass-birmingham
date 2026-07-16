// The AI player driver: one call = one machine event decided and applied.
//
// Contract (design doc): feed the model the serialized state + enumerated
// legal moves, validate its pick BY EXECUTING it on the engine, retry with
// the validation error appended (max 3 model calls per decision), then fall
// back to a deterministic heuristic so the game NEVER stalls. Every step
// reports usage so the per-game cost counter stays honest.
import { createActor, transition } from 'xstate'
import { type CityId, cities, connections } from '../../data/board'
import {
  type GameEvent,
  type GameStoreSnapshot,
  gameStore,
} from '../../store/gameStore'
import {
  INDUSTRY_TYPES,
  type LegalMove,
  enumerateLegalMoves,
} from './legal-moves'
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
      pendingSale?: unknown
      chosenBeerSources?: unknown
      chosenIronSources?: unknown
      pendingIronStep?: unknown
    }
  }
  for (const market of [clone.context?.coalMarket, clone.context?.ironMarket]) {
    if (!Array.isArray(market)) continue
    for (const row of market) {
      if (row && row.maxCubes === null) row.maxCubes = Infinity
    }
  }
  // Source-choice fields were added after some snapshots were frozen (demo
  // fixtures, and any game persisted before this shipped). Backfill their
  // empty defaults so a rehydrated old snapshot has the shape the machine
  // expects; the engine reads them defensively too, as belt and braces.
  const ctx = clone.context
  if (ctx) {
    if (ctx.pendingSale === undefined) ctx.pendingSale = null
    if (!Array.isArray(ctx.chosenBeerSources)) ctx.chosenBeerSources = []
    if (!Array.isArray(ctx.chosenIronSources)) ctx.chosenIronSources = []
    if (ctx.pendingIronStep === undefined) ctx.pendingIronStep = null
  }
  return clone
}

/**
 * The one impure step: persisted JSON → a live snapshot the pure API accepts.
 * `transition()` rejects raw persisted JSON (it has no resolved state nodes),
 * so a restore is unavoidable — but only once per entry point, after which
 * probe chains are pure.
 */
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

interface PureResult {
  ok: boolean
  after?: GameStoreSnapshot
  error?: string
}

/**
 * Apply one event to a live snapshot with no actor and no side effects.
 * "Legal" means the guard accepted it AND execution did not set lastError
 * (the engine's actions never throw — a failed execution leaves an error and
 * refuses to consume the action).
 *
 * `transition()` returns the unexecuted actions alongside the next snapshot;
 * this machine is assign-only, so that list is always empty and dropping it
 * loses nothing. It resolves `always` chains in full, exactly like send().
 */
function applyPure(before: GameStoreSnapshot, event: GameEvent): PureResult {
  if (!before.can(event as never)) {
    return { ok: false, error: 'That event is not accepted right now.' }
  }
  const [after] = transition(gameStore, before as never, event as never)
  const next = after as GameStoreSnapshot
  if (next.context.lastError !== null) {
    return { ok: false, error: next.context.lastError }
  }
  return { ok: true, after: next }
}

/**
 * Apply one event to a persisted snapshot, reporting the persisted result.
 * Restores once, then defers to the pure path.
 */
export function tryApplyEvent(
  persisted: unknown,
  event: GameEvent,
): ApplyResult {
  const result = applyPure(snapshotOf(persisted), event)
  if (!result.ok || !result.after) return result
  return {
    ok: true,
    after: result.after,
    next: gameStore.getPersistedSnapshot(result.after as never),
  }
}

/**
 * One-step-lookahead viability: does the flow the applied event leads into
 * still have SOME way to complete? The engine validates costs, coal reach
 * and payment only at confirm execution, so a pick can be guard-legal yet
 * doomed — without this probe the model walks into the dead end, cancels,
 * forgets (each decision is a fresh conversation) and loops. Rejecting the
 * doomed pick WITH the engine's real refusal keeps the model on live
 * branches. (Captain playtest finding, 2026-07-15.)
 */
function flowDeadEnd(
  after: GameStoreSnapshot | undefined,
  depth = 0,
): string | null {
  if (!after || depth > 3) return null
  const m = (path: unknown) => after.matches(path as never)
  const probeConfirm = (event: GameEvent): string | null => {
    const probe = applyPure(after, event)
    return probe.ok ? null : (probe.error ?? 'The confirm would fail.')
  }

  // Confirm checkpoints — dry-run the confirm itself.
  if (
    m({ playing: { action: { building: 'confirmingBuild' } } }) ||
    m({ playing: { action: { networking: 'confirmingLink' } } })
  ) {
    if (!after.can({ type: 'CONFIRM' } as never)) return null
    return probeConfirm({ type: 'CONFIRM' })
  }
  if (m({ playing: { action: { networking: 'confirmingDoubleLink' } } })) {
    if (!after.can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' } as never)) {
      return null
    }
    return probeConfirm({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
  }

  // Site scan: is there ANY city where this build completes?
  if (m({ playing: { action: { building: 'selectingLocation' } } })) {
    for (const cityId of Object.keys(cities) as CityId[]) {
      const event: GameEvent = { type: 'SELECT_LOCATION', cityId }
      if (!after.can(event as never)) continue
      const next = applyPure(after, event)
      if (next.ok && flowDeadEnd(next.after, depth + 1) === null) return null
    }
    return 'there is NO city where this build can be completed (slot, tile cost, coal reach or payment fails everywhere)'
  }

  // Industry scan (location / wild cards).
  if (m({ playing: { action: { building: 'selectingIndustryType' } } })) {
    for (const industryType of INDUSTRY_TYPES) {
      const event: GameEvent = { type: 'SELECT_INDUSTRY_TYPE', industryType }
      if (!after.can(event as never)) continue
      const next = applyPure(after, event)
      if (next.ok && flowDeadEnd(next.after, depth + 1) === null) return null
    }
    return 'NO industry playable from this card leads to a completable build'
  }

  // Link scan: any link that can actually be built and paid for?
  if (
    m({ playing: { action: { networking: 'selectingLink' } } }) ||
    m({ playing: { action: { networking: 'selectingSecondLink' } } })
  ) {
    const second = m({
      playing: { action: { networking: 'selectingSecondLink' } },
    })
    for (const conn of connections) {
      if (!(conn.types as readonly string[]).includes(after.context.era)) {
        continue
      }
      const event: GameEvent = second
        ? { type: 'SELECT_SECOND_LINK', from: conn.from, to: conn.to }
        : { type: 'SELECT_LINK', from: conn.from, to: conn.to }
      if (!after.can(event as never)) continue
      const next = applyPure(after, event)
      if (next.ok && flowDeadEnd(next.after, depth + 1) === null) return null
    }
    return 'NO link in your network can actually be built right now (cost or connection fails everywhere)'
  }

  // Sale scan: with this card, can anything be sold at all?
  if (m({ playing: { action: { selling: 'selectingSale' } } })) {
    if (after.can({ type: 'CONFIRM' } as never)) return null // ≥1 sale done
    const ctx = after.context
    const me = ctx.players[ctx.currentPlayerIndex]
    const merchantLocations = [
      ...new Set(ctx.merchants.map((mm) => mm.location)),
    ]
    for (const ind of me?.industries ?? []) {
      if (ind.flipped) continue
      for (const merchant of merchantLocations) {
        const event: GameEvent = {
          type: 'SELECT_SALE',
          location: ind.location,
          industryType: ind.type,
          merchant,
        }
        if (after.can(event as never)) return null
      }
    }
    return 'NOTHING you own can be sold to any merchant right now (no connected merchant buys it, or the beer is missing)'
  }

  return null
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
    if (result.ok && !flowDeadEnd(result.after)) return { move, result }
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
  /**
   * What the AI already did THIS turn (one line per step, cancels
   * included). Each decision is a fresh conversation — without these notes
   * the model has no memory of a plan it just abandoned and will loop.
   */
  turnNotes?: string[]
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
        opts.turnNotes ?? [],
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
    const deadEnd = flowDeadEnd(applied.after)
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
