// The intent-log replay contract, proven OFFLINE on a full real game: two
// mock-driven AI seats play from setup to gameOver through the same
// one-event-per-decision seam the server logs (`aiDecideAndApply`, exactly
// what `runAiTurns` records), producing the row stream `game_intents` would
// hold — then `replayIntentLog` reconstructs the identical final state from
// the captured setup snapshot + events alone. The DB-backed half (rows
// actually written/read through the store) lives in intentlog.test.ts.
import { describe, expect, test, vi } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
import { STEP_SAFETY_BUDGET, aiDecideAndApply } from '../ai/driver'
import { mockProvider } from '../ai/provider'
import { AI_TIERS } from '../ai/types'
import { eraCheckpoint } from './intent'
import {
  type ReplayRow,
  normalizeSnapshotForComparison,
  replayIntentLog,
} from './replay'

// A full two-era game is hundreds of engine decisions, each enumerating and
// probing moves on scratch actors — well past the 5s engine-suite default.
vi.setConfig({ testTimeout: 120_000 })

const startPlayers = [
  {
    id: '1',
    name: 'Ada',
    color: 'red' as const,
    character: 'Eliza Tinsley' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
  {
    id: '2',
    name: 'Brunel',
    color: 'blue' as const,
    character: 'Isambard Kingdom Brunel' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
]

type Persisted = {
  status?: string
  context: { currentPlayerIndex: number; era: string; round: number }
}

/** Simulate jsonb storage: what was written is what a bug report exports. */
const throughJson = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value))

function setupGame(): unknown {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({ type: 'START_GAME', players: startPlayers })
  const persisted = actor.getPersistedSnapshot()
  actor.stop()
  return persisted
}

describe('replayIntentLog', () => {
  test('a full mock-AI game replays from the logged rows to the identical final state', async () => {
    let persisted = setupGame()
    const rows: ReplayRow[] = [
      // seq 1 = the setup record, exactly as createGame/joinGame log it
      {
        seq: 1,
        kind: 'setup',
        seatId: null,
        payload: throughJson(persisted),
        version: 1,
      },
    ]

    // Both seats are mock-AI: every decision applies exactly ONE engine
    // event (`outcome.move.event`) — the same thing runAiTurns persists.
    // Mirror the runner's turn-local memory + safety budget too, or the
    // model (mock included) forgets abandoned plans and loops forever —
    // the exact stall the server-side budget exists to break.
    let version = 1
    let lastSeat = -1
    let stepsThisTurn = 0
    let turnNotes: string[] = []
    for (let step = 0; step < 5000; step++) {
      const snap = persisted as Persisted
      if (snap.status === 'done') break
      const seatIndex = snap.context.currentPlayerIndex
      if (seatIndex !== lastSeat) {
        lastSeat = seatIndex
        stepsThisTurn = 0
        turnNotes = []
      }
      stepsThisTurn += 1
      const outcome = await aiDecideAndApply({
        persisted,
        seatIndex,
        provider: mockProvider,
        tier: AI_TIERS.apprentice,
        turnNotes,
        forceSafe: stepsThisTurn > STEP_SAFETY_BUDGET,
      })
      turnNotes.push(outcome.move.label)
      version += 1
      // Same checkpoint rule as the server: the intent that crosses the era
      // boundary carries the resulting snapshot (rail deck reshuffle is
      // nondeterministic — Math.random — so replay must re-base there).
      const checkpoint = eraCheckpoint(persisted, outcome.snapshot)
      rows.push({
        seq: rows.length + 1,
        kind: 'intent',
        seatId: seatIndex,
        payload: throughJson(outcome.move.event),
        snapshotAfter: checkpoint === null ? null : throughJson(checkpoint),
        version,
      })
      persisted = outcome.snapshot
    }

    // The game genuinely finished — this is an end-to-end, two-era run, and
    // it crossed the one nondeterministic boundary (canal→rail reshuffle).
    expect((persisted as Persisted).status).toBe('done')
    expect((persisted as Persisted).context.era).toBe('rail')
    expect(rows.length).toBeGreaterThan(100)
    expect(rows.filter((r) => r.snapshotAfter != null)).toHaveLength(1)

    const replayed = replayIntentLog(rows)
    expect(replayed.steps).toBe(rows.length - 1)
    expect(replayed.version).toBe(version)
    expect(normalizeSnapshotForComparison(replayed.snapshot)).toEqual(
      normalizeSnapshotForComparison(persisted),
    )
  })

  test('refuses a log without its setup record', () => {
    expect(() =>
      replayIntentLog([
        {
          seq: 1,
          kind: 'intent',
          seatId: 0,
          payload: { type: 'PASS' },
          version: 2,
        },
      ]),
    ).toThrow(/no leading setup record/)
  })

  test('a diverging event fails loudly, naming the seq and event', () => {
    const persisted = setupGame()
    expect(() =>
      replayIntentLog([
        {
          seq: 1,
          kind: 'setup',
          seatId: null,
          payload: throughJson(persisted),
          version: 1,
        },
        // CONFIRM is never legal straight out of setup
        {
          seq: 2,
          kind: 'intent',
          seatId: (persisted as Persisted).context.currentPlayerIndex,
          payload: { type: 'CONFIRM' },
          version: 2,
        },
      ]),
    ).toThrow(/seq 2/)
  })

  test('normalizeSnapshotForComparison drops only the log wall-clock', () => {
    const persisted = setupGame() as {
      context: { logs: Array<{ message: string; timestamp: unknown }> }
    }
    const normalized = normalizeSnapshotForComparison(persisted) as {
      context: { logs: Array<{ message?: string; timestamp?: unknown }> }
    }
    expect(normalized.context.logs.length).toBeGreaterThan(0)
    for (const entry of normalized.context.logs) {
      expect(entry.timestamp).toBeUndefined()
      expect(entry.message).toBeTruthy()
    }
  })
})
