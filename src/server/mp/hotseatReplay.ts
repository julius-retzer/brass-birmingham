// Reconstruct the snapshot for a PAST MOMENT of an existing game so it can be
// dropped into the fully-local hotseat surface — "hand me the board at exactly
// this moment and let me retry it".
//
// Unlike `seedReplica.ts` (which seeds a DB-backed, hand-hiding multiplayer
// game), this produces a plain persisted engine snapshot for the client-side
// hotseat shell (`src/components/game.tsx`): all seats controlled in one
// browser, every hand visible, hotseat undo available, and — once loaded — NO
// multiplayer/DB involvement to play it.
//
// Pure on purpose (no DB import), like `replay.ts`: the caller fetches the
// source game's intent log (`loadIntentLog` in store.ts, DB) and hands the rows
// here; this only replays. That keeps it offline-testable.
import { type ReplayRow, replayIntentLog } from './replay'

export interface HotseatReplayResult {
  /** the persisted engine snapshot at the reconstructed moment — feed it
   * straight into the hotseat boot (after `rehydrateSnapshot`) */
  snapshot: unknown
  /** number of 'intent' rows replayed to reach it (the 'setup' row excluded) */
  steps: number
}

/**
 * Replay `rows` up to — but NOT including — `cutoffSeq`, yielding the snapshot
 * as it stood the instant BEFORE the event logged at that seq was applied. So
 * to retry a disputed move recorded at seq N, pass `cutoffSeq = N`: the board
 * comes back exactly as it was before that move.
 *
 * Throws (via `replayIntentLog`) if the prefix has no leading 'setup' record
 * (e.g. an unknown token, or a cutoff at/below the setup seq) or if any logged
 * event no longer applies — a genuine bug-report signal, not papered over.
 * Does NOT write anything.
 */
export function buildHotseatReplaySnapshot(
  rows: ReplayRow[],
  cutoffSeq: number,
): HotseatReplayResult {
  const prefix = rows.filter((r) => r.seq < cutoffSeq)
  const result = replayIntentLog(prefix)
  return { snapshot: result.snapshot, steps: result.steps }
}
