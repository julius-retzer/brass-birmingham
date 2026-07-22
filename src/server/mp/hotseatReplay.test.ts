import { describe, expect, it } from 'vitest'
// Offline unit test for `buildHotseatReplaySnapshot` — no DB. We synthesize an
// intent log exactly as `saveGame` would (a 'setup' snapshot + accepted
// 'intent' rows produced by the real `applyIntent` seam), then assert the
// reconstructed snapshot is the prefix replay AND that it boots cleanly in the
// hotseat store (createActor on the rehydrated snapshot), i.e. a past moment
// loads into a fully-local, all-hands-visible game.
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
import { buildHotseatReplaySnapshot } from './hotseatReplay'
import { applyIntent } from './intent'
import { type ReplayRow, normalizeSnapshotForComparison } from './replay'

interface SeatDef {
  seatId: number
  name: string
  color: string
  character: string
}

const SEATS: SeatDef[] = [
  { seatId: 0, name: 'Ada', color: 'red', character: 'Eliza Tinsley' },
  { seatId: 1, name: 'Bea', color: 'blue', character: 'George Stephenson' },
]

/** A minimal, real intent log: START_GAME setup + one accepted loan by seat 0
 * (TAKE_LOAN → SELECT_CARD → CONFIRM), each event a separate 'intent' row —
 * mirroring what the durable log stores. */
function makeLog(): { rows: ReplayRow[]; afterSetup: unknown } {
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
  const afterSetup: unknown = actor.getPersistedSnapshot()
  actor.stop()

  const cardId = (
    afterSetup as {
      context: { players: Array<{ hand: Array<{ id: string }> }> }
    }
  ).context.players[0]!.hand[0]!.id
  const events: Array<{ type: string } & Record<string, unknown>> = [
    { type: 'TAKE_LOAN' },
    { type: 'SELECT_CARD', cardId },
    { type: 'CONFIRM' },
  ]

  let snapshot = afterSetup
  const rows: ReplayRow[] = [
    { seq: 1, kind: 'setup', seatId: null, payload: afterSetup, version: 1 },
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
  return { rows, afterSetup }
}

/** Rebuild Infinity market caps the same way the hotseat boot's
 * `rehydrateSnapshot` does — a JSON round-trip turned them into null. */
function rehydrate(snapshot: unknown): unknown {
  const clone = structuredClone(snapshot) as {
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

describe('buildHotseatReplaySnapshot', () => {
  it('reconstructs the state BEFORE the cutoff seq (exclusive)', () => {
    const { rows } = makeLog()
    // Cutoff at the CONFIRM (seq 4): reconstruct the moment just before it —
    // TAKE_LOAN + SELECT_CARD applied, loan not yet committed.
    const beforeConfirm = buildHotseatReplaySnapshot(rows, 4)
    expect(beforeConfirm.steps).toBe(2)

    // Cutoff at the first move (seq 2): only the setup — a fresh board.
    const beforeFirstMove = buildHotseatReplaySnapshot(rows, 2)
    expect(beforeFirstMove.steps).toBe(0)
    expect(normalizeSnapshotForComparison(beforeFirstMove.snapshot)).toEqual(
      normalizeSnapshotForComparison(rows[0]!.payload),
    )
  })

  it('committing the loan is only visible past the cutoff', () => {
    const { rows } = makeLog()
    const moneyAt = (snap: unknown) =>
      (snap as { context: { players: Array<{ money: number }> } }).context
        .players[0]!.money

    const before = buildHotseatReplaySnapshot(rows, 4) // before CONFIRM
    const after = buildHotseatReplaySnapshot(rows, 5) // after CONFIRM
    // A loan pays £30 and drops income — money strictly grows across the CONFIRM.
    expect(moneyAt(after.snapshot)).toBeGreaterThan(moneyAt(before.snapshot))
  })

  it('the reconstructed snapshot boots into the hotseat store', () => {
    const { rows } = makeLog()
    const { snapshot } = buildHotseatReplaySnapshot(rows, 4)
    // The exact hotseat boot path: rehydrate, then createActor from it.
    const actor = createActor(gameStore, {
      snapshot: rehydrate(snapshot) as never,
    })
    actor.start()
    const state = actor.getSnapshot()
    // A live, playable game — not setup, not over — with all seats present so
    // every hand is controllable in one browser.
    expect(state.matches('setup')).toBe(false)
    expect(state.matches('gameOver')).toBe(false)
    expect(state.context.players).toHaveLength(SEATS.length)
    actor.stop()
  })

  it('throws when the prefix has no setup (cutoff at/below the setup seq)', () => {
    const { rows } = makeLog()
    expect(() => buildHotseatReplaySnapshot(rows, 1)).toThrow(/setup/i)
  })
})
