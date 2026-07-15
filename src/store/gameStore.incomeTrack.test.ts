// Engine pins for the income track audit (2026-07-15). Source of truth:
// the retail board's Progress Track (ai-docs/reference/, pinned in
// src/data/incomeTrack.test.ts). These tests pin the ENGINE's use of it:
// setup position, space-based flip advancement, the loan level-drop rule,
// per-round collection, and negative-income handling.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

const PLAYERS = [
  { id: '1', name: 'P1', color: 'red', character: 'A' },
  { id: '2', name: 'P2', color: 'blue', character: 'B' },
].map((p) => ({
  ...p,
  money: 30,
  victoryPoints: 0,
  income: 0,
  industryTilesOnMat: {},
}))

type Snap = {
  can: (e: unknown) => boolean
  context: {
    lastError: string | null
    round: number
    players: Array<{
      name: string
      money: number
      income: number
      incomeSpace: number
      victoryPoints: number
    }>
  }
}

const start = () => {
  const a = createActor(gameStore)
  a.start()
  a.send({ type: 'START_GAME', players: PLAYERS } as never)
  return a
}
const ctx = (a: ReturnType<typeof createActor>) =>
  (a.getSnapshot() as unknown as Snap).context

describe('income track — engine behaviour', () => {
  it('setup: every player starts on space 10, income level 0', () => {
    const a = start()
    for (const p of ctx(a).players) {
      expect(p.incomeSpace).toBe(10)
      expect(p.income).toBe(0)
    }
    a.stop()
  })

  it('a loan drops 3 LEVELS and lands on the highest space of the new level', () => {
    const a = start()
    a.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [
        { id: 'c1', type: 'location', location: 'dudley', color: 'other' },
      ],
    } as never)
    a.send({ type: 'TAKE_LOAN' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'c1' } as never)
    a.send({ type: 'CONFIRM' } as never)
    const p = ctx(a).players[0]!
    expect(p.money).toBe(47) // £17 starting money + £30 loan
    expect(p.income).toBe(-3) // level 0 − 3 levels
    expect(p.incomeSpace).toBe(7) // highest space of level −3
    a.stop()
  })

  it('loans cannot drop the level below −10 (guard refuses)', () => {
    const a = start()
    a.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      income: -9,
    } as never)
    a.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [
        { id: 'c1', type: 'location', location: 'dudley', color: 'other' },
      ],
    } as never)
    a.send({ type: 'TAKE_LOAN' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'c1' } as never)
    expect((a.getSnapshot() as unknown as Snap).can({ type: 'CONFIRM' })).toBe(
      false,
    )
    a.stop()
  })

  it('a flip advances the marker by SPACES, not levels', () => {
    // Iron works L1 auto-sells its 4 cubes when connected to a merchant?
    // Simpler: TEST-inject a flippable brewery (0 barrels flips at round
    // end) with incomeAdvancement 4 and watch the marker: space 10 + 4
    // spaces = space 14 = level 2 (NOT level 4).
    const a = start()
    a.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        {
          location: 'burton',
          type: 'brewery',
          level: 1,
          flipped: false,
          tile: {
            id: 'brewery_1',
            type: 'brewery',
            level: 1,
            cost: 5,
            victoryPoints: 4,
            incomeSpaces: 4,
            linkScoringIcons: 2,
            coalRequired: 0,
            ironRequired: 1,
            beerRequired: 0,
            beerProduced: 1,
            coalProduced: 0,
            ironProduced: 0,
            canBuildInCanalEra: true,
            canBuildInRailEra: false,
            hasLightbulbIcon: false,
            incomeAdvancement: 4,
            quantity: 2,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0, // empty barrels → flips at the next check
        },
      ],
    } as never)
    // flip checks run when an action completes — pass the turn
    a.send({ type: 'PASS' } as never)
    const p = ctx(a).players[0]!
    expect(p.incomeSpace).toBe(14) // 10 + 4 spaces
    expect(p.income).toBe(2) // level printed beside space 14
    a.stop()
  })

  it('round income pays the LEVEL, and negative levels pay the bank', () => {
    const a = start()
    a.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      income: 7,
      money: 10,
    } as never)
    a.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1,
      income: -2,
      money: 10,
    } as never)
    // complete round 1 (both players pass their single action)
    a.send({ type: 'PASS' } as never)
    a.send({ type: 'PASS' } as never)
    const c = ctx(a)
    expect(c.round).toBe(2)
    expect(c.players.find((p) => p.name === 'P1')!.money).toBe(17) // +7
    expect(c.players.find((p) => p.name === 'P2')!.money).toBe(8) // −2
    a.stop()
  })
})
