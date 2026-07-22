// Seed a NEW, playable multiplayer game from a PREFIX of an existing game's
// durable intent log — "let me retry the board at exactly this moment".
//
// Given the intent-log rows of a source game (see `loadIntentLog`) and a cutoff
// `seq`, this replays every accepted intent up to AND INCLUDING that seq through
// the real engine seam (`replayIntentLog` → `applyIntent`) and hands back a
// fresh `GameRecord` carrying the reconstructed snapshot. The new game is
// `phase: 'playing'` with every human seat left UNCLAIMED, so a player claims a
// seat from the invite link exactly as they would any online game (no accounts;
// token + per-seat secret is the whole auth model). Seat colors/characters are
// copied from a template (typically the source game's seats) so the board reads
// identically.
//
// Pure on purpose (no DB import), like `replay.ts`: the caller does the one
// write (`saveGame(record, setupLog)`), so this stays offline-testable and the
// prod-write decision lives at the call site. The returned `setupLog` is the
// 'setup' intent-log entry that makes the replica itself replayable from seq 1,
// mirroring what `startGame`/`createGame` persist.
import { type ReplayRow, replayIntentLog } from './replay'
import type { GameRecord, IntentLogEntry, SeatRecord } from './store'

/** The minimum a seat template must carry to seed a legible, claimable seat. */
export interface SeatTemplate {
  seatId: number
  name: string | null
  color: string
  character: string
}

export interface SeededReplica {
  record: GameRecord
  /** persist this atomically with the record so the replica replays from seq 1 */
  setupLog: IntentLogEntry
}

/**
 * Reconstruct a playable game seeded at the state produced by replaying
 * `rows` up to and including `cutoffSeq`. Throws (via `replayIntentLog`) if any
 * logged event no longer applies — a genuine bug-report signal, not papered
 * over. Does NOT write anything.
 */
export function buildSeededReplica(
  rows: ReplayRow[],
  cutoffSeq: number,
  opts: { token: string; seats: SeatTemplate[]; now: string },
): SeededReplica {
  const prefix = rows.filter((r) => r.seq <= cutoffSeq)
  const result = replayIntentLog(prefix)

  // Every human seat starts unclaimed → the invite link's join screen offers
  // them, and a join takes the first open seat. Names are cosmetic until a
  // claim overwrites them, but pre-filling the source names keeps the seat list
  // legible ("that red seat is Jules").
  const seats: SeatRecord[] = opts.seats.map((s) => ({
    seatId: s.seatId,
    name: s.name,
    color: s.color,
    character: s.character,
    claimed: false,
    secretHash: null,
    kind: 'human' as const,
    ready: false,
  }))

  const record: GameRecord = {
    token: opts.token,
    phase: 'playing',
    createdAt: opts.now,
    updatedAt: opts.now,
    version: 1,
    seats,
    snapshot: result.snapshot,
  }

  return {
    record,
    setupLog: { kind: 'setup', seatId: null, payload: result.snapshot },
  }
}
