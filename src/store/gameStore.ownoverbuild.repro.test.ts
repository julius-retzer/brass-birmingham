// REPRO (live game y9KEazF6ldi9sQu4FXufhQ, round 10 Canal): a player may
// overbuild their OWN coal mine even when an OPPONENT with a LOWER player
// index also has a coal mine in the same two-coal-slot city (Cannock).
// Rules p.7: "If the tile you are replacing is your own: You may Overbuild
// any Industry tile." — no exhaustion condition, no level comparison
// against the opponent's tile.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

const PLAYERS = [
  { id: '1', name: 'Jules', color: 'red', character: 'A' },
  { id: '2', name: 'Fusky', color: 'blue', character: 'B' },
].map((p) => ({
  ...p,
  money: 17,
  victoryPoints: 0,
  income: 0,
  industryTilesOnMat: {},
}))

type Snap = {
  can: (e: unknown) => boolean
  context: {
    lastError: string | null
    currentPlayerIndex: number
    players: Array<{
      name: string
      industries: Array<{ type: string; location: string; level: number }>
    }>
  }
}

type AnyActor = ReturnType<typeof createActor>
const snap = (a: AnyActor) => a.getSnapshot() as unknown as Snap
const tilesAt = (a: AnyActor, playerIndex: number, loc: string) =>
  snap(a)
    .context.players[playerIndex]!.industries.filter((i) => i.location === loc)
    .map((i) => `${i.type}L${i.level}`)
    .sort()

const untilPlayer = (a: AnyActor, playerIndex: number) => {
  for (
    let i = 0;
    i < 12 && snap(a).context.currentPlayerIndex !== playerIndex;
    i++
  ) {
    a.send({ type: 'PASS' } as never)
  }
  expect(snap(a).context.currentPlayerIndex).toBe(playerIndex)
}

const giveLocationCard = (
  a: AnyActor,
  playerId: number,
  id: string,
  location: string,
) =>
  a.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId,
    hand: [{ id, type: 'location', location, color: 'other' }],
  } as never)

const buildAs = (a: AnyActor, cardId: string, industryType: string) => {
  a.send({ type: 'BUILD' } as never)
  a.send({ type: 'SELECT_CARD', cardId } as never)
  a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as never)
  a.send({ type: 'CONFIRM' } as never)
  const err = snap(a).context.lastError
  a.send({ type: 'CLEAR_ERROR' } as never)
  for (let i = 0; i < 5; i++) a.send({ type: 'CANCEL' } as never)
  return err
}

describe('own-tile overbuild when an earlier-indexed opponent shares the industry type at the location', () => {
  it('P2 overbuilds their OWN coal L1 at cannock although P1 (lower index) also has coal there', () => {
    const a = createActor(gameStore)
    a.start()
    a.send({ type: 'START_GAME', players: PLAYERS } as never)
    a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 300 } as never)
    a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, money: 300 } as never)

    // P1 (index 0) puts coal L1 into one of cannock's two coal-capable slots
    untilPlayer(a, 0)
    giveLocationCard(a, 0, 'cn0', 'cannock')
    expect(buildAs(a, 'cn0', 'coal')).toBeNull()
    expect(tilesAt(a, 0, 'cannock')).toStrictEqual(['coalL1'])

    // P2 (index 1) puts their coal L1 into the other coal slot
    untilPlayer(a, 1)
    giveLocationCard(a, 1, 'cn1', 'cannock')
    expect(buildAs(a, 'cn1', 'coal')).toBeNull()
    expect(tilesAt(a, 1, 'cannock')).toStrictEqual(['coalL1'])

    // P2 again: mat's next coal is L2 — overbuilding the OWN L1 is legal
    // (rules p.7 "You may Overbuild any of your Industry tiles without
    // restriction"), regardless of P1's tile sitting in the other slot.
    untilPlayer(a, 1)
    giveLocationCard(a, 1, 'cn2', 'cannock')
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'cn2' } as never)
    expect(
      snap(a).can({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' }),
    ).toBe(true)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' } as never)
    a.send({ type: 'CONFIRM' } as never)
    expect(snap(a).context.lastError).toBeNull()
    // own tile replaced in place; P1's tile untouched
    expect(tilesAt(a, 1, 'cannock')).toStrictEqual(['coalL2'])
    expect(tilesAt(a, 0, 'cannock')).toStrictEqual(['coalL1'])
    a.stop()
  })

  it('the live-game shape: INDUSTRY card build offers cannock as a location', () => {
    const a = createActor(gameStore)
    a.start()
    a.send({ type: 'START_GAME', players: PLAYERS } as never)
    a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 300 } as never)
    a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, money: 300 } as never)

    untilPlayer(a, 0)
    giveLocationCard(a, 0, 'cn0', 'cannock')
    expect(buildAs(a, 'cn0', 'coal')).toBeNull()

    untilPlayer(a, 1)
    giveLocationCard(a, 1, 'cn1', 'cannock')
    expect(buildAs(a, 'cn1', 'coal')).toBeNull()

    // P2 holds a coal INDUSTRY card (cannock is in their network via the
    // own tile there) — the location step must offer cannock
    untilPlayer(a, 1)
    a.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 1,
      hand: [
        { id: 'ci1', type: 'industry', industries: ['coal'], color: 'other' },
      ],
    } as never)
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'ci1' } as never)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' } as never)
    expect(snap(a).can({ type: 'SELECT_LOCATION', cityId: 'cannock' })).toBe(
      true,
    )
    a.stop()
  })
})
