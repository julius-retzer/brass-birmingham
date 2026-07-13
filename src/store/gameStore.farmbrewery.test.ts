// Farm Breweries (rules p.5): the two unnamed brewery-only locations.
// - build only via Brewery Industry or Wild Industry cards
// - Cannock connects to the northern one via its own (buildable) link
// - the kidderminster–worcester link ALSO connects the southern one
//   (no second tile), which must count for network, beer reach and link VP
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'
import { calculateLinkVictoryPoints } from './shared/gameUtils'

type AnyActor = ReturnType<typeof createActor>
const ctx = (a: AnyActor) => (a.getSnapshot() as any).context
const cur = (a: AnyActor) => ctx(a).players[ctx(a).currentPlayerIndex]
const val = (a: AnyActor) => JSON.stringify((a.getSnapshot() as any).value)
const selecting = (a: AnyActor) =>
  (a.getSnapshot() as any).matches({ playing: { action: 'selectingAction' } })
const unwind = (a: AnyActor) => {
  for (let i = 0; i < 6 && !selecting(a); i++) a.send({ type: 'CANCEL' } as any)
}

const locCard = (city: string, i: number) => ({
  id: `${city}_fb${i}`,
  type: 'location',
  location: city,
  color: 'other',
})
const indCard = (t: string, i: number) => ({
  id: `${t}_fb${i}`,
  type: 'industry',
  industries: [t],
})

const start = (): AnyActor => {
  const a = createActor(gameStore)
  a.start()
  a.send({
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
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 400 } as any)
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, money: 400 } as any)
  return a
}

const setHand = (a: AnyActor, playerId: number, hand: unknown[]) =>
  a.send({ type: 'TEST_SET_PLAYER_HAND', playerId, hand } as any)

const passTurn = (a: AnyActor) => {
  unwind(a)
  a.send({ type: 'PASS' } as any)
  unwind(a)
}

/** Current player runs a build; returns { err, landed }. */
const build = (
  a: AnyActor,
  cardIdx: number,
  industryType: string,
  city: string,
) => {
  unwind(a)
  const p = cur(a)
  a.send({ type: 'BUILD' } as any)
  a.send({ type: 'SELECT_CARD', cardId: p.hand[cardIdx].id } as any)
  a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as any)
  a.send({ type: 'SELECT_LOCATION', cityId: city } as any)
  const atConfirm = (a.getSnapshot() as any).matches({
    playing: { action: { building: 'confirmingBuild' } },
  })
  a.send({ type: 'CONFIRM' } as any)
  const err = ctx(a).lastError
  a.send({ type: 'CLEAR_ERROR' } as any)
  unwind(a)
  return { err, atConfirm }
}

const buildLink = (a: AnyActor, from: string, to: string) => {
  unwind(a)
  a.send({ type: 'NETWORK' } as any)
  a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
  a.send({ type: 'SELECT_LINK', from, to } as any)
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

describe('farm breweries: building', () => {
  test('brewery lands at the northern farm via a wild industry card (empty board)', () => {
    const a = start()
    setHand(a, 0, [{ id: 'wi_fb1', type: 'wild_industry' }])
    const { err } = build(a, 0, 'brewery', 'farmBrewery1')
    expect(err).toBeNull()
    expect(industriesAt(a, 'farmBrewery1')).toEqual([
      { who: 'P1', type: 'brewery', level: 1 },
    ])
    a.stop()
  })

  test('non-brewery industries cannot use the farm slot', () => {
    const a = start()
    setHand(a, 0, [indCard('cotton', 1)])
    const { err, atConfirm } = build(a, 0, 'cotton', 'farmBrewery1')
    expect(atConfirm && err === null).toBe(false)
    expect(industriesAt(a, 'farmBrewery1')).toEqual([])
    a.stop()
  })

  test('wild LOCATION cards may not reach a farm brewery (rules p.5)', () => {
    const a = start()
    setHand(a, 0, [{ id: 'wl_fb1', type: 'wild_location' }])
    unwind(a)
    a.send({ type: 'BUILD' } as any)
    a.send({ type: 'SELECT_CARD', cardId: 'wl_fb1' } as any)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' } as any)
    // guard must refuse the farm as a location for a wild location card
    a.send({ type: 'SELECT_LOCATION', cityId: 'farmBrewery1' } as any)
    expect(
      (a.getSnapshot() as any).matches({
        playing: { action: { building: 'selectingLocation' } },
      }),
    ).toBe(true) // did NOT advance
    // …while an ordinary city still works with the same card
    a.send({ type: 'SELECT_LOCATION', cityId: 'burton' } as any)
    expect(
      (a.getSnapshot() as any).matches({
        playing: { action: { building: 'confirmingBuild' } },
      }),
    ).toBe(true)
    a.stop()
  })
})

describe('farm breweries: network adjacency', () => {
  test('the cannock link brings the northern farm into the network', () => {
    const a = start()
    // P1 anchors at cannock, P2 passes throughout
    let step = 0
    while (step < 3) {
      if (cur(a).name === 'P1') {
        if (step === 0) {
          setHand(a, 0, [locCard('cannock', 1)])
          expect(build(a, 0, 'coal', 'cannock').err).toBeNull()
        } else if (step === 1) {
          setHand(a, 0, [locCard('cannock', 2)])
          expect(buildLink(a, 'cannock', 'farmBrewery1')).toBeNull()
        } else {
          // board is NOT empty now → industry card needs the network;
          // the farm is reachable only through the new link
          setHand(a, 0, [indCard('brewery', 2)])
          expect(build(a, 0, 'brewery', 'farmBrewery1').err).toBeNull()
        }
        step++
      } else passTurn(a)
    }
    expect(industriesAt(a, 'farmBrewery1')).toEqual([
      { who: 'P1', type: 'brewery', level: 1 },
    ])
    a.stop()
  })

  test('the kidderminster–worcester link connects the southern farm (3-way)', () => {
    const a = start()
    let step = 0
    while (step < 3) {
      if (cur(a).name === 'P1') {
        if (step === 0) {
          setHand(a, 0, [locCard('worcester', 1)])
          expect(build(a, 0, 'cotton', 'worcester').err).toBeNull()
        } else if (step === 1) {
          // control: with tiles on the board and NO qualifying link, the
          // farm is out of network for an industry card
          setHand(a, 0, [indCard('brewery', 3)])
          const attempt = build(a, 0, 'brewery', 'farmBrewery2')
          expect(attempt.atConfirm && attempt.err === null).toBe(false)
          // then claim kidderminster–worcester
          setHand(a, 0, [locCard('worcester', 2)])
          expect(buildLink(a, 'kidderminster', 'worcester')).toBeNull()
        } else {
          setHand(a, 0, [indCard('brewery', 4)])
          expect(build(a, 0, 'brewery', 'farmBrewery2').err).toBeNull()
        }
        step++
      } else passTurn(a)
    }
    expect(industriesAt(a, 'farmBrewery2')).toEqual([
      { who: 'P1', type: 'brewery', level: 1 },
    ])
    a.stop()
  })
})

describe('farm breweries: beer reach and link scoring', () => {
  test("an opponent's farm-brewery beer is reachable through the kidd–worc link", () => {
    const a = start()
    // gloucester buys cotton but holds NO beer: the sale must drink from
    // P2's farm brewery, reachable only via the kidd–worc link's third
    // connection. Hands are scripted ONCE (hand[0] is always the next
    // planned card) — resetting hands each turn burns the deck via refills
    // and ends the era mid-test.
    a.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [
        {
          location: 'gloucester',
          industryIcons: ['cotton'],
          bonusType: 'develop',
          bonusValue: 1,
          hasBeer: false,
        },
      ],
    } as any)
    setHand(a, 0, [
      locCard('worcester', 1), // r1: build cotton at worcester
      locCard('worcester', 2), // r2: discard for the worc–gloucester link
      locCard('worcester', 3), // r2: discard for the sale
      locCard('stone', 4),
    ])
    setHand(a, 1, [
      locCard('worcester', 5), // r1: discard for the kidd–worc link
      indCard('brewery', 6), // r2: build the farm brewery
      locCard('stone', 7), // r2: loan filler
      locCard('stone', 8),
    ])

    // round 1 (one action each): P1 cotton, P2 kidd–worc link
    expect(build(a, 0, 'cotton', 'worcester').err).toBeNull()
    expect(buildLink(a, 'kidderminster', 'worcester')).toBeNull()

    // round 2: P2 first (least spender): farm brewery + loan filler
    expect(cur(a).name).toBe('P2')
    expect(build(a, 0, 'brewery', 'farmBrewery2').err).toBeNull()
    unwind(a)
    a.send({ type: 'TAKE_LOAN' } as any)
    a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
    a.send({ type: 'CONFIRM' } as any)
    unwind(a)

    // P1: link to gloucester, then the sale
    expect(cur(a).name).toBe('P1')
    expect(buildLink(a, 'worcester', 'gloucester')).toBeNull()
    unwind(a)
    a.send({ type: 'SELL' } as any)
    a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
    const can = (a.getSnapshot() as any).can({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    // beer comes from P2's farm brewery through the 3-way link connection
    expect(can).toBe(true)
    a.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    } as any)
    const fb2 = ctx(a).players[1].industries.find(
      (i: any) => i.location === 'farmBrewery2',
    )
    expect(fb2.beerBarrelsOnTile).toBe(0) // the barrel was drunk
    a.stop()
  })

  test('the kidd–worc link scores the farm brewery tile too', () => {
    const a = start()
    let step = 0
    while (step < 2) {
      if (cur(a).name === 'P1') {
        if (step === 0) {
          setHand(a, 0, [locCard('worcester', 20)])
          expect(buildLink(a, 'kidderminster', 'worcester')).toBeNull()
        } else {
          setHand(a, 0, [indCard('brewery', 21)])
          expect(build(a, 0, 'brewery', 'farmBrewery2').err).toBeNull()
        }
        step++
      } else passTurn(a)
    }
    const vp = calculateLinkVictoryPoints(ctx(a), {
      from: 'kidderminster',
      to: 'worcester',
      type: 'canal',
    } as any)
    // only tile adjacent to the link is the farm brewery (1 link icon)
    expect(vp).toBe(1)
    a.stop()
  })
})
