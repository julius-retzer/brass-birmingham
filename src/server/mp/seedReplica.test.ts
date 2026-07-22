import { describe, expect, it } from 'vitest'
// Offline unit test for `buildSeededReplica` — no DB. We synthesize an intent
// log the same way `saveGame` would (a 'setup' snapshot + accepted 'intent'
// rows produced by the real `applyIntent` seam), then assert the replica the
// tool would insert is a well-formed, claimable, playing-phase game whose
// snapshot is exactly the prefix replay.
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
import { applyIntent } from './intent'
import {
  type ReplayRow,
  normalizeSnapshotForComparison,
  replayIntentLog,
} from './replay'
import { type SeatTemplate, buildSeededReplica } from './seedReplica'

const SEATS: SeatTemplate[] = [
  { seatId: 0, name: 'Ada', color: 'red', character: 'Eliza Tinsley' },
  { seatId: 1, name: 'Bea', color: 'blue', character: 'George Stephenson' },
]

/** A minimal, real intent log: START_GAME setup + one accepted loan by seat 0
 * (TAKE_LOAN → SELECT_CARD → CONFIRM), each event a separate 'intent' row. */
function makeLog(): ReplayRow[] {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: SEATS.map((s) => ({
      id: String(s.seatId + 1),
      name: s.name,
      color: s.color,
      character: s.character,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {},
    })),
  } as never)
  let snapshot: unknown = actor.getPersistedSnapshot()
  actor.stop()

  const cardId = (
    snapshot as { context: { players: Array<{ hand: Array<{ id: string }> }> } }
  ).context.players[0]!.hand[0]!.id
  const events: Array<{ type: string } & Record<string, unknown>> = [
    { type: 'TAKE_LOAN' },
    { type: 'SELECT_CARD', cardId },
    { type: 'CONFIRM' },
  ]

  const rows: ReplayRow[] = [
    { seq: 1, kind: 'setup', seatId: null, payload: snapshot, version: 1 },
  ]
  events.forEach((event, i) => {
    const outcome = applyIntent(snapshot, 0, event)
    if (!outcome.ok)
      throw new Error(`setup step ${event.type} refused: ${outcome.error}`)
    snapshot = outcome.next
    rows.push({
      seq: i + 2,
      kind: 'intent',
      seatId: 0,
      payload: event,
      version: i + 2,
    })
  })
  return rows
}

describe('buildSeededReplica', () => {
  const now = '2026-07-22T00:00:00.000Z'

  it('seeds a claimable, playing-phase game at the reconstructed prefix state', () => {
    const rows = makeLog()
    const cutoff = 3 // setup + TAKE_LOAN + SELECT_CARD (drop the CONFIRM)
    const { record, setupLog } = buildSeededReplica(rows, cutoff, {
      token: 'seedreplica_test_token_abcdef',
      seats: SEATS,
      now,
    })

    expect(record.phase).toBe('playing')
    expect(record.version).toBe(1)
    // Every seat is claimable (no accounts: claimed by taking it from the link).
    for (const s of record.seats) {
      expect(s.claimed).toBe(false)
      expect(s.secretHash).toBeNull()
      expect(s.kind).toBe('human')
    }
    // Seat identity (color/character/name) is copied from the template.
    expect(record.seats.map((s) => s.color)).toEqual(['red', 'blue'])

    // The snapshot is EXACTLY the prefix replay (≤ cutoff), not the full log.
    const prefix = replayIntentLog(rows.filter((r) => r.seq <= cutoff))
    expect(normalizeSnapshotForComparison(record.snapshot)).toEqual(
      normalizeSnapshotForComparison(prefix.snapshot),
    )
    // …and NOT the state after the dropped CONFIRM (the loan is not yet taken).
    const full = replayIntentLog(rows)
    expect(normalizeSnapshotForComparison(record.snapshot)).not.toEqual(
      normalizeSnapshotForComparison(full.snapshot),
    )

    // The setup log seeds a replayable-from-seq-1 replica.
    expect(setupLog.kind).toBe('setup')
    expect(setupLog.seatId).toBeNull()
    expect(setupLog.payload).toBe(record.snapshot)
  })

  it('cutoff at the setup row reproduces the freshly-started game', () => {
    const rows = makeLog()
    const { record } = buildSeededReplica(rows, 1, {
      token: 'seedreplica_test_token_ghijkl',
      seats: SEATS,
      now,
    })
    const setupOnly = replayIntentLog([rows[0]!])
    expect(normalizeSnapshotForComparison(record.snapshot)).toEqual(
      normalizeSnapshotForComparison(setupOnly.snapshot),
    )
  })
})
