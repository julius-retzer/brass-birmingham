// Starting-player randomization (bucket B item 1). Brass deals a random
// first-player marker; the mp service supplies a random `startingPlayerIndex`
// to START_GAME so the host (seat 0) is not always first. The engine bakes the
// choice into the persisted snapshot — deterministic per game, identical for
// every client — and must keep `currentPlayerIndex` and `turnOrder` in
// lockstep so the round engine still cycles through every seat.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

const PLAYERS = [
  { id: '1', name: 'P1', color: 'red', character: 'A' },
  { id: '2', name: 'P2', color: 'blue', character: 'B' },
  { id: '3', name: 'P3', color: 'green', character: 'C' },
  { id: '4', name: 'P4', color: 'yellow', character: 'D' },
].map((p) => ({
  ...p,
  money: 17,
  victoryPoints: 0,
  income: 0,
  industryTilesOnMat: {},
}))

type Snap = {
  context: { currentPlayerIndex: number; turnOrder: string[] }
}

const startWith = (startingPlayerIndex?: number) => {
  const a = createActor(gameStore)
  a.start()
  a.send({
    type: 'START_GAME',
    players: PLAYERS,
    ...(startingPlayerIndex !== undefined ? { startingPlayerIndex } : {}),
  } as never)
  return a.getSnapshot() as unknown as Snap
}

describe('starting player', () => {
  it('defaults to seat 0 when no index is given (hotseat + existing behaviour)', () => {
    const snap = startWith()
    expect(snap.context.currentPlayerIndex).toBe(0)
    expect(snap.context.turnOrder).toEqual(['1', '2', '3', '4'])
  })

  it('starts at the supplied index and rotates the turn order to match', () => {
    const snap = startWith(2)
    expect(snap.context.currentPlayerIndex).toBe(2)
    // Rotated so turnOrder[0] is the starting player; every seat still appears
    // exactly once, so the round engine cycles through all four.
    expect(snap.context.turnOrder).toEqual(['3', '4', '1', '2'])
  })

  it('clamps an out-of-range index to seat 0', () => {
    expect(startWith(9).context.currentPlayerIndex).toBe(0)
    expect(startWith(-1).context.currentPlayerIndex).toBe(0)
  })

  it('the rotated order is a permutation of all seats (no seat dropped)', () => {
    const { turnOrder } = startWith(3).context
    expect([...turnOrder].sort()).toEqual(['1', '2', '3', '4'])
  })

  it('every seat leads the round for some index; the round still cycles all seats', () => {
    for (let s = 0; s < PLAYERS.length; s++) {
      const snap = startWith(s)
      expect(snap.context.currentPlayerIndex).toBe(s)
      expect(snap.context.turnOrder[0]).toBe(PLAYERS[s]!.id)
      expect(snap.context.turnOrder).toHaveLength(PLAYERS.length)
    }
  })
})
