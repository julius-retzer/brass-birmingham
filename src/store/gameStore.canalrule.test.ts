// Canal-era one-tile rule (captain playtest bug, 2026-07-15): "During the
// Canal Era, each player may place a maximum of 1 of their Industry tiles
// in each location" (ai-docs/brass-brno-rules.mdc p.7, restated on
// p.4). The Rail Era allows multiple tiles per location. Before the fix,
// coal L1 + iron L1 both landed at ostrava in the Canal Era.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

const PLAYERS = [
  { id: '1', name: 'P1', color: 'red', character: 'A' },
  { id: '2', name: 'P2', color: 'blue', character: 'B' },
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
    era: string
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
const tilesAt = (a: AnyActor, loc: string) =>
  snap(a)
    .context.players[0]!.industries.filter((i) => i.location === loc)
    .map((i) => `${i.type}L${i.level}`)
    .sort()

/** Burn other players' turns until P1 is on the clock. */
const untilP1 = (a: AnyActor) => {
  for (let i = 0; i < 12 && snap(a).context.currentPlayerIndex !== 0; i++) {
    a.send({ type: 'PASS' } as never)
  }
  expect(snap(a).context.currentPlayerIndex).toBe(0)
}

const start = () => {
  const a = createActor(gameStore)
  a.start()
  a.send({ type: 'START_GAME', players: PLAYERS } as never)
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 300 } as never)
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, money: 300 } as never)
  return a
}

const giveCard = (a: AnyActor, id: string, location: string) =>
  a.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 0,
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

describe('canal era: max ONE of your tiles per location', () => {
  it("the captain's repro is dead: coal then iron at ostrava — second build refused", () => {
    const a = start()
    untilP1(a)
    giveCard(a, 'cb1', 'ostrava')
    expect(buildAs(a, 'cb1', 'coal')).toBeNull()
    expect(tilesAt(a, 'ostrava')).toStrictEqual(['coalL1'])

    untilP1(a)
    giveCard(a, 'cb2', 'ostrava')
    // the guard refuses at the industry step…
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'cb2' } as never)
    expect(
      snap(a).can({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'iron' }),
    ).toBe(false)
    // …and forcing on anyway builds nothing
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'iron' } as never)
    a.send({ type: 'CONFIRM' } as never)
    expect(tilesAt(a, 'ostrava')).toStrictEqual(['coalL1'])
    a.stop()
  })

  it('a DIFFERENT location is of course still open', () => {
    const a = start()
    untilP1(a)
    giveCard(a, 'cb1', 'ostrava')
    expect(buildAs(a, 'cb1', 'coal')).toBeNull()
    untilP1(a)
    giveCard(a, 'du1', 'karvina')
    // (coal again — the mat's next coal is L2, canal-legal, needs nothing)
    expect(buildAs(a, 'du1', 'coal')).toBeNull()
    expect(tilesAt(a, 'karvina')).toStrictEqual(['coalL2'])
    a.stop()
  })

  it('replacing your OWN tile (overbuild) stays legal — the count stays at one', () => {
    const a = start()
    untilP1(a)
    giveCard(a, 'cb1', 'ostrava')
    expect(buildAs(a, 'cb1', 'coal')).toBeNull()
    untilP1(a)
    giveCard(a, 'cb2', 'ostrava')
    // coal L2 replaces the own L1 in place — even though the city has a
    // second coal-capable slot free, the canal rule forces the overbuild
    expect(buildAs(a, 'cb2', 'coal')).toBeNull()
    expect(tilesAt(a, 'ostrava')).toStrictEqual(['coalL2'])
    a.stop()
  })
})

describe('rail era: multiple tiles per location are allowed', () => {
  it('a second tile by the same player at the same location builds fine', () => {
    const a = start()
    // Consume the single-copy canal-only L1s first (coal at karvina, iron
    // at brno via a link for coal reach) — otherwise the mat's
    // lowest tiles are unbuildable in the Rail Era.
    untilP1(a)
    giveCard(a, 'du1', 'karvina')
    expect(buildAs(a, 'du1', 'coal')).toBeNull()
    untilP1(a)
    giveCard(a, 'lk1', 'karvina')
    a.send({ type: 'NETWORK' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'lk1' } as never)
    a.send({ type: 'SELECT_LINK', from: 'brno', to: 'karvina' } as never)
    a.send({ type: 'CONFIRM' } as never)
    expect(snap(a).context.lastError).toBeNull()
    untilP1(a)
    giveCard(a, 'bh1', 'brno')
    expect(buildAs(a, 'bh1', 'iron')).toBeNull()

    a.send({ type: 'TRIGGER_CANAL_ERA_END' } as never)
    expect(snap(a).context.era).toBe('rail')
    a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 300 } as never)

    // Rail turns have TWO actions: build coal L2 then iron L2 at the SAME
    // location within one turn — both land (the iron's coal comes from
    // the own mine right there).
    untilP1(a)
    a.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [
        {
          id: 'cb1',
          type: 'location',
          location: 'ostrava',
          color: 'other',
        },
        {
          id: 'cb2',
          type: 'location',
          location: 'ostrava',
          color: 'other',
        },
      ],
    } as never)
    expect(buildAs(a, 'cb1', 'coal')).toBeNull()
    expect(buildAs(a, 'cb2', 'iron')).toBeNull()
    expect(tilesAt(a, 'ostrava')).toStrictEqual(['coalL2', 'ironL2'])
    a.stop()
  })
})
