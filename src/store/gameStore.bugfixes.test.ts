// Regression tests for bugs found in the 2026-07-13 bug hunt.
// Written TDD-first: each test encodes the RULES-CORRECT behaviour
// (ai-docs/brass-birmingham-rules.mdc), not the pre-fix behaviour.
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

type AnyActor = ReturnType<typeof createActor>
const ctx = (a: AnyActor) => (a.getSnapshot() as any).context
const cur = (a: AnyActor) => ctx(a).players[ctx(a).currentPlayerIndex]
const matches = (a: AnyActor, v: object) => (a.getSnapshot() as any).matches(v)
const selecting = (a: AnyActor) =>
  matches(a, { playing: { action: 'selectingAction' } })
const unwind = (a: AnyActor) => {
  for (let i = 0; i < 6 && !selecting(a); i++) a.send({ type: 'CANCEL' } as any)
}

const locCard = (city: string, i: number) => ({
  id: `${city}_bh${i}`,
  type: 'location',
  location: city,
  color: 'other',
})

const startGame = (): AnyActor => {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      { id: '1', name: 'P1', color: 'red', character: 'Eliza Tinsley' },
      { id: '2', name: 'P2', color: 'blue', character: 'Richard Arkwright' },
    ].map((p) => ({
      ...p,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {},
    })),
  } as any)
  // plenty of funds so cost never interferes with what we're testing
  actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 500 } as any)
  actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, money: 500 } as any)
  return actor
}

const setHand = (a: AnyActor, playerId: number, hand: unknown[]) =>
  a.send({ type: 'TEST_SET_PLAYER_HAND', playerId, hand } as any)

const passTurn = (a: AnyActor) => {
  unwind(a)
  a.send({ type: 'PASS' } as any)
  unwind(a)
}

/** Run a location-card build for the current player. Returns lastError. */
const buildViaLocationCard = (
  a: AnyActor,
  city: string,
  industryType: string,
) => {
  unwind(a)
  a.send({ type: 'BUILD' } as any)
  a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
  // Since the 2026-07-15 slot-guard fix an incompatible industry is refused
  // right here (no transition) — report that as the rejection reason.
  if (
    !(a.getSnapshot() as any).can({
      type: 'SELECT_INDUSTRY_TYPE',
      industryType,
    })
  ) {
    unwind(a)
    return `guard refused ${industryType} at ${city}`
  }
  a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as any)
  a.send({ type: 'SELECT_LOCATION', cityId: city } as any) // no-op for real location cards
  a.send({ type: 'CONFIRM' } as any)
  const err = ctx(a).lastError
  a.send({ type: 'CLEAR_ERROR' } as any)
  unwind(a)
  return err
}

const industriesAt = (a: AnyActor, city: string) =>
  ctx(a).players.flatMap((p: any) =>
    p.industries
      .filter((x: any) => x.location === city)
      .map((x: any) => ({ who: p.name, type: x.type, level: x.level })),
  )

describe('bugfix: wild location card can complete a build', () => {
  test('wild location → pick industry → pick ANY city → build lands', () => {
    const a = startGame()
    setHand(a, 0, [
      { id: 'wl_1', type: 'wild_location' },
      { id: 'wl_2', type: 'wild_location' },
    ])
    unwind(a)
    a.send({ type: 'BUILD' } as any)
    a.send({ type: 'SELECT_CARD', cardId: 'wl_1' } as any)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' } as any)
    // The machine must now ask for a location (wild = any city), NOT skip it.
    expect(
      matches(a, { playing: { action: { building: 'selectingLocation' } } }),
    ).toBe(true)
    a.send({ type: 'SELECT_LOCATION', cityId: 'dudley' } as any)
    expect(
      matches(a, { playing: { action: { building: 'confirmingBuild' } } }),
    ).toBe(true)
    a.send({ type: 'CONFIRM' } as any)
    expect(ctx(a).lastError).toBeNull()
    expect(industriesAt(a, 'dudley')).toEqual([
      { who: 'P1', type: 'coal', level: 1 },
    ])
    a.stop()
  })
})

describe('bugfix: wild industry card can complete a build', () => {
  test('wild industry → pick industry type → network city → build lands', () => {
    const a = startGame()
    // Give P1 a network foothold first (industry cards need the network,
    // except when the player has nothing on the board — which is the case
    // here, so any city is legal).
    setHand(a, 0, [
      { id: 'wi_1', type: 'wild_industry' },
      { id: 'wi_2', type: 'wild_industry' },
    ])
    unwind(a)
    a.send({ type: 'BUILD' } as any)
    a.send({ type: 'SELECT_CARD', cardId: 'wi_1' } as any)
    // Wild industry has no printed industries — the machine must ask.
    expect(
      matches(a, {
        playing: { action: { building: 'selectingIndustryType' } },
      }),
    ).toBe(true)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' } as any)
    expect(
      matches(a, { playing: { action: { building: 'selectingLocation' } } }),
    ).toBe(true)
    a.send({ type: 'SELECT_LOCATION', cityId: 'dudley' } as any)
    a.send({ type: 'CONFIRM' } as any)
    expect(ctx(a).lastError).toBeNull()
    expect(industriesAt(a, 'dudley')).toEqual([
      { who: 'P1', type: 'coal', level: 1 },
    ])
    a.stop()
  })
})

describe('bugfix: free same-type slots are usable (no forced overbuild)', () => {
  test('worcester has two cotton slots — one mill per player coexists', () => {
    // Canal rule (2026-07-15): a single player may hold only ONE tile per
    // location, so the two slots are filled by DIFFERENT players; the
    // point pinned here is that P2's build lands in the FREE slot instead
    // of overbuilding P1's mill.
    const a = startGame()
    let builds = 0
    for (let i = 0; i < 10 && builds < 2; i++) {
      const idx = cur(a).name === 'P1' ? 0 : 1
      setHand(a, idx, [locCard('worcester', i)])
      const err = buildViaLocationCard(a, 'worcester', 'cotton')
      expect(err).toBeNull()
      builds++
    }
    expect(industriesAt(a, 'worcester').sort((x: any, y: any) =>
      x.who.localeCompare(y.who),
    )).toEqual([
      { who: 'P1', type: 'cotton', level: 1 },
      { who: 'P2', type: 'cotton', level: 1 },
    ])
    a.stop()
  })
})

describe('bugfix: own overbuild works when no free slot remains', () => {
  test('dudley has one coal slot — own coal L1 upgrades to L2 in place', () => {
    const a = startGame()
    // P1 owns 1× coal L1 (retail mat): build it at dudley, build the
    // first L2 at cannock, then rebuild at dudley. Its only coal-capable
    // slot is occupied by P1's own L1 → must overbuild (with the second
    // L2 from the mat).
    const plan: Array<[string, string]> = [
      ['dudley', 'coal'],
      ['cannock', 'coal'],
      ['dudley', 'coal'],
    ]
    const errors: (string | null)[] = []
    for (let i = 0; i < 16 && errors.length < plan.length; i++) {
      if (cur(a).name === 'P1') {
        const [city, type] = plan[errors.length]!
        setHand(a, 0, [locCard(city, i)])
        errors.push(buildViaLocationCard(a, city, type))
      } else passTurn(a)
    }
    expect(errors).toEqual([null, null, null])
    // dudley holds exactly ONE coal entry, upgraded in place to level 2
    expect(industriesAt(a, 'dudley')).toEqual([
      { who: 'P1', type: 'coal', level: 2 },
    ])
    expect(industriesAt(a, 'cannock')).toEqual([
      { who: 'P1', type: 'coal', level: 2 },
    ])
    a.stop()
  })
})

describe('unchanged: illegal overbuilds still rejected', () => {
  test("opponent's cotton cannot be overbuilt when the city is full", () => {
    // Under the canal one-tile rule the two worcester slots are filled by
    // P1 and P2; P3 (holding a HIGHER cotton after spending their L1)
    // attacks a full city — refused: only coal/iron may overbuild an
    // opponent.
    const a = createActor(gameStore)
    a.start()
    a.send({
      type: 'START_GAME',
      players: [
        { id: '1', name: 'P1', color: 'red', character: 'Eliza Tinsley' },
        { id: '2', name: 'P2', color: 'blue', character: 'Richard Arkwright' },
        { id: '3', name: 'P3', color: 'green', character: 'George Stephenson' },
      ].map((p) => ({
        ...p,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {},
      })),
    } as any)
    for (let i = 0; i < 3; i++) {
      a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: i, money: 500 } as any)
    }

    const playerIdx = () => ctx(a).currentPlayerIndex
    let filled = 0
    let p3Spent = false
    let p3Err: string | null | undefined
    for (let i = 0; i < 30 && p3Err === undefined; i++) {
      const idx = playerIdx()
      if (idx < 2 && filled < 2) {
        setHand(a, idx, [locCard('worcester', i)])
        expect(buildViaLocationCard(a, 'worcester', 'cotton')).toBeNull()
        filled++
      } else if (idx === 2 && !p3Spent) {
        // burn P3's cotton L1 elsewhere so their next cotton is L2
        setHand(a, 2, [locCard('leek', i)])
        expect(buildViaLocationCard(a, 'leek', 'cotton')).toBeNull()
        p3Spent = true
      } else if (idx === 2 && filled >= 2) {
        setHand(a, 2, [locCard('worcester', i + 40)])
        p3Err = buildViaLocationCard(a, 'worcester', 'cotton')
      } else passTurn(a)
    }
    expect(p3Err).toBeTruthy() // rejected with a reason
    expect(industriesAt(a, 'worcester')).toHaveLength(2) // both mills intact
    expect(
      industriesAt(a, 'worcester').every((x: any) => x.who !== 'P3'),
    ).toBe(true)
    a.stop()
  })
})

describe('pinned: develop removes one or two tiles per action', () => {
  test('two tiles of different industries in one develop action', () => {
    const a = startGame()
    setHand(a, 0, [locCard('stoke', 1), locCard('stoke', 2)])
    const matCount = (t: string) =>
      (ctx(a).players[0].industryTilesOnMat[t] ?? []).reduce(
        (n: number, x: any) => n + x.quantityAvailable,
        0,
      )
    const coalBefore = matCount('coal')
    const ironBefore = matCount('iron')
    unwind(a)
    a.send({ type: 'DEVELOP' } as any)
    a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
    a.send({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['coal', 'iron'],
    } as any)
    a.send({ type: 'CONFIRM' } as any)
    expect(ctx(a).lastError).toBeNull()
    expect(matCount('coal')).toBe(coalBefore - 1)
    expect(matCount('iron')).toBe(ironBefore - 1)
    a.stop()
  })
})
