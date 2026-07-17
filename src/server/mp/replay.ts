// Reconstruct a multiplayer/AI game from its durable intent log.
//
// The `game_intents` table (see ../db/schema.ts) records, per game, the
// initial engine snapshot ('setup' — setup shuffles are random, so replay must
// start from the captured state) followed by every ACCEPTED state-mutating
// event exactly as executed ('intent', human and AI seats alike). This module
// replays that sequence through the REAL accepted-intent seam (`applyIntent`)
// and hands back the final snapshot, so a bug-report game can be rebuilt
// deterministically without relying on the human-readable in-game journal.
//
// Pure on purpose: no DB import, so it works offline on exported JSON rows
// (fetch them with `loadIntentLog` in store.ts, or plain SQL — see the PR /
// README note). The DB-backed round-trip proof lives in intentlog.test.ts.
import { applyIntent } from './intent'

/** The DB-independent shape of one log row — `IntentLogRow` from store.ts
 * minus the fields replay doesn't need, so exported JSON qualifies. */
export interface ReplayRow {
  seq: number
  kind: 'setup' | 'intent'
  seatId: number | null
  payload: unknown
  /** replay checkpoint captured when this intent crossed a nondeterministic
   * boundary (the canal→rail deck reshuffle) — replay re-bases on it */
  snapshotAfter?: unknown | null
  /** the engine `games.version` the original write produced */
  version: number
}

export interface ReplayResult {
  /** persisted snapshot after the last replayed intent */
  snapshot: unknown
  /** the `games.version` recorded by the last replayed row */
  version: number
  /** number of 'intent' rows replayed (the 'setup' row not counted) */
  steps: number
}

/**
 * Replay an intent log from its captured setup snapshot through every logged
 * event, in seq order, via the same seam that accepted them originally.
 * Throws (naming the failing seq/event) if any logged event no longer
 * applies — that is the interesting bug-report signal, not a case to paper
 * over.
 */
export function replayIntentLog(rows: ReplayRow[]): ReplayResult {
  const ordered = [...rows].sort((a, b) => a.seq - b.seq)
  const setup = ordered[0]
  if (!setup || setup.kind !== 'setup') {
    throw new Error(
      'Intent log has no leading setup record — cannot replay without the captured initial snapshot.',
    )
  }
  let snapshot: unknown = setup.payload
  let version = setup.version
  let steps = 0
  for (const row of ordered.slice(1)) {
    if (row.kind !== 'intent') {
      throw new Error(`Unexpected extra '${row.kind}' record at seq ${row.seq}`)
    }
    if (row.seatId === null) {
      throw new Error(`Intent row at seq ${row.seq} has no seat`)
    }
    const event = row.payload as { type: string } & Record<string, unknown>
    const outcome = applyIntent(snapshot, row.seatId, event)
    if (!outcome.ok) {
      throw new Error(
        `Replay diverged at seq ${row.seq} (seat ${row.seatId}, ${event.type}): ${outcome.error}`,
      )
    }
    // An era-boundary intent recorded the resulting snapshot (the rail deck
    // reshuffle is nondeterministic, so re-applying the event cannot
    // reproduce it) — continue from the captured state, not the replayed one.
    snapshot = row.snapshotAfter != null ? row.snapshotAfter : outcome.next
    version = row.version
    steps += 1
  }
  return { snapshot, version, steps }
}

/**
 * Make two persisted snapshots comparable: a JSON round-trip (jsonb storage
 * already turned `Infinity` into `null` and `Date` into ISO strings — apply
 * the same transform to the live side) and drop the one wall-clock field,
 * `logs[].timestamp`, which necessarily differs between the original run and
 * a replay. Everything else — board, hands, markets, money, log MESSAGES and
 * their order — must match exactly.
 */
export function normalizeSnapshotForComparison(persisted: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(persisted)) as {
    context?: { logs?: Array<{ timestamp?: unknown }> }
  }
  for (const entry of clone.context?.logs ?? []) {
    delete entry.timestamp
  }
  return clone
}
