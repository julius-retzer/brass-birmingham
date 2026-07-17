// The multiplayer intent decision — pure, and deliberately free of any DB
// import so it can be tested offline (the rest of `game.ts` needs Neon).
//
// `actInGame` owns the I/O (load the row, authenticate the seat, persist);
// everything that decides whether a move is ACCEPTED or REFUSED, and with what
// reason, lives here.
//
// Refusal reasons (captain's requirement, 2026-07-16): a refusal must say
// exactly what is missing. Two distinct refusal paths exist and both must
// carry a reason:
//   1. the guard rejects up front (`can()` false) — money-short, no
//      connection, no beer. The guard is a boolean, so `explainRefusal`
//      re-derives the cause from the engine's own validators.
//   2. the guard accepts but EXECUTION fails — the engine's actions never
//      throw; they set `lastError` and refuse to consume the action. We then
//      throw the mutated snapshot away and report `lastError` verbatim.
//
// Because a refusal never persists, `lastError` never reaches the shared
// snapshot, so one player's refusal can't leak to another seat.
import { createActor } from 'xstate'
import {
  type GameEvent,
  type GameState,
  type GameStoreSnapshot,
  gameStore,
} from '../../store/gameStore'
import { explainRefusal } from '../../store/refusal'
import { refreshEmbeddedTileStats } from '../../store/saveMigration'

// Events a client may send. Never the TEST_ / TRIGGER_ families — those bypass
// the rules and must never be reachable from the wire.
export const ALLOWED_EVENTS = new Set([
  'BUILD',
  'DEVELOP',
  'SELL',
  'TAKE_LOAN',
  'SCOUT',
  'NETWORK',
  'PASS',
  'SELECT_CARD',
  'SELECT_LOCATION',
  'SELECT_INDUSTRY_TYPE',
  'SELECT_TILES_FOR_DEVELOP',
  'SELECT_SALE',
  'SELECT_BEER_SOURCE',
  'SELECT_IRON_SOURCE',
  'SELECT_LINK',
  'SELECT_SECOND_LINK',
  'CHOOSE_DOUBLE_LINK_BUILD',
  'EXECUTE_DOUBLE_NETWORK_ACTION',
  'CONFIRM',
  'CANCEL',
  'CLEAR_ERROR',
])

// JSON round-trips turn the markets' `maxCubes: Infinity` into null, so undo
// it before the engine sees the snapshot (same fix as the client shell).
// ALSO run the save migration here: the SERVER is the authority, and a
// pre-audit game record would otherwise keep playing with stale tile stats
// and no incomeSpace (whose NaN arithmetic reads as income level 30).
export function rehydrate(snapshot: unknown): unknown {
  const clone = structuredClone(snapshot) as {
    context?: {
      coalMarket?: Array<{ maxCubes: number | null }>
      ironMarket?: Array<{ maxCubes: number | null }>
    }
  }
  for (const market of [clone.context?.coalMarket, clone.context?.ironMarket]) {
    if (!Array.isArray(market)) continue
    for (const row of market) {
      if (row && row.maxCubes === null) row.maxCubes = Number.POSITIVE_INFINITY
    }
  }
  try {
    refreshEmbeddedTileStats(clone)
  } catch {
    // a malformed record fails at actor creation, with better context
  }
  return clone
}

/**
 * Does the intent log need a replay CHECKPOINT for this accepted transition?
 *
 * The engine is deterministic given the setup snapshot and the event stream,
 * with ONE exception: the canal→rail era transition reshuffles the discard +
 * draw piles into a fresh deck and deals new hands (`Math.random`, see
 * `eraTransitionToRail` in gameStore.ts). An event-sourced replay cannot
 * reproduce that shuffle, so the log row for the intent that crossed the
 * boundary must carry the full resulting snapshot; replay re-bases on it
 * (`replayIntentLog` in replay.ts). Returns the checkpoint payload (the
 * `after` snapshot) or null when none is needed.
 */
export function eraCheckpoint(before: unknown, after: unknown): unknown | null {
  const eraOf = (s: unknown) =>
    (s as { context?: { era?: string } } | null)?.context?.era
  return eraOf(before) !== eraOf(after) ? after : null
}

export type IntentOutcome =
  | { ok: true; next: unknown; gameOver: boolean }
  | { ok: false; error: string }

const GENERIC_REFUSAL = 'That action is not legal right now.'

/**
 * Decide one intent against a persisted snapshot. Never mutates its input.
 *
 * Seat AUTHENTICATION is the caller's job; the turn check lives here because
 * "not your turn" is a refusal reason like any other.
 */
export function applyIntent(
  persisted: unknown,
  seatId: number,
  event: { type: string } & Record<string, unknown>,
): IntentOutcome {
  if (!ALLOWED_EVENTS.has(event.type)) {
    return { ok: false, error: `Event ${event.type} is not allowed.` }
  }

  const actor = createActor(gameStore, {
    snapshot: rehydrate(persisted) as never,
  })
  actor.start()
  try {
    const before = actor.getSnapshot() as GameStoreSnapshot
    const context = before.context as GameState

    if (context.currentPlayerIndex !== seatId) {
      const active = context.players[context.currentPlayerIndex]
      return {
        ok: false,
        error: active
          ? `Not your turn — waiting on ${active.name}.`
          : 'Not your turn.',
      }
    }

    if (!before.can(event as never)) {
      const reason = explainRefusal(before, event as unknown as GameEvent)
      return { ok: false, error: reason ?? GENERIC_REFUSAL }
    }

    // A record written by the PRE-FIX server may already carry a lastError
    // (that server persisted execution failures — the bug this closes). Only a
    // reason this event NEWLY set may refuse it, or the next legal move would
    // be rejected with a stale, wrong reason.
    const errorBefore = before.context.lastError

    actor.send(event as never)
    const after = actor.getSnapshot() as GameStoreSnapshot

    // The guard accepted but execution refused: report the engine's own reason
    // and DISCARD the snapshot, so the action is not consumed and the error
    // never becomes shared state.
    const errorAfter = after.context.lastError
    if (errorAfter !== null && errorAfter !== errorBefore) {
      return { ok: false, error: errorAfter }
    }

    return {
      ok: true,
      next: actor.getPersistedSnapshot(),
      gameOver: after.matches('gameOver' as never),
    }
  } finally {
    actor.stop()
  }
}
