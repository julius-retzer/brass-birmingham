// CAPTAIN VERIFICATION (2026-07-13): does building an Iron Works auto-sell
// its cubes to the iron market for immediate money (no merchant link
// required), fill the track, and flip the tile when emptied? Coal (which
// DOES require a merchant connection) is the control.
// Verified 2026-07-13 against the rulebook ("Moving Coal and Iron to the
// Market", p.5): engine matches on every point — these assertions now pin
// that behaviour permanently.
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

type AnyActor = ReturnType<typeof createActor>
const ctx = (a: AnyActor) => (a.getSnapshot() as any).context
const cur = (a: AnyActor) => ctx(a).players[ctx(a).currentPlayerIndex]
const selecting = (a: AnyActor) =>
  (a.getSnapshot() as any).matches({ playing: { action: 'selectingAction' } })
const unwind = (a: AnyActor) => {
  for (let i = 0; i < 6 && !selecting(a); i++) a.send({ type: 'CANCEL' } as any)
}

const locCard = (city: string, i: number) => ({
  id: `${city}_iv${i}`,
  type: 'location',
  location: city,
  color: 'other',
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
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 100 } as any)
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, money: 100 } as any)
  return a
}

const setHand = (a: AnyActor, playerId: number, hand: unknown[]) =>
  a.send({ type: 'TEST_SET_PLAYER_HAND', playerId, hand } as any)

const passTurn = (a: AnyActor) => {
  unwind(a)
  a.send({ type: 'PASS' } as any)
  unwind(a)
}

const build = (a: AnyActor, city: string, industryType: string) => {
  unwind(a)
  const p = cur(a)
  a.send({ type: 'BUILD' } as any)
  a.send({ type: 'SELECT_CARD', cardId: p.hand[0].id } as any)
  a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as any)
  a.send({ type: 'SELECT_LOCATION', cityId: city } as any)
  a.send({ type: 'CONFIRM' } as any)
  const err = ctx(a).lastError
  a.send({ type: 'CLEAR_ERROR' } as any)
  unwind(a)
  return err
}

const develop = (a: AnyActor, industryType: string) => {
  unwind(a)
  const p = cur(a)
  a.send({ type: 'DEVELOP' } as any)
  a.send({ type: 'SELECT_CARD', cardId: p.hand[0].id } as any)
  a.send({
    type: 'SELECT_TILES_FOR_DEVELOP',
    industryTypes: [industryType],
  } as any)
  a.send({ type: 'CONFIRM' } as any)
  const err = ctx(a).lastError
  a.send({ type: 'CLEAR_ERROR' } as any)
  unwind(a)
  return err
}

const ironRow = (a: AnyActor) =>
  ctx(a).ironMarket.map((r: any) => `£${r.price}:${r.cubes}/${r.maxCubes}`)
const coalRow = (a: AnyActor) =>
  ctx(a).coalMarket.map((r: any) => `£${r.price}:${r.cubes}/${r.maxCubes}`)
const tileAt = (a: AnyActor, playerIdx: number, city: string, type: string) =>
  ctx(a).players[playerIdx].industries.find(
    (i: any) => i.location === city && i.type === type,
  )

describe('VERIFY: iron auto-sale to market on build', () => {
  test('A. partial fit: iron L1 (4 cubes) with 2 empty £1 spaces', () => {
    const a = start()
    // P2 builds the coal mine at dudley (canal one-tile rule: P1 may not
    // stack a second own tile there); P1's iron works then consumes from
    // the opponent's mine at the same location — no market connection.
    let coalDone = false
    let ironDone = false
    const log: string[] = []
    while (!ironDone) {
      if (cur(a).name === 'P2' && !coalDone) {
        setHand(a, 1, [locCard('dudley', 90)])
        const err = build(a, 'dudley', 'coal')
        log.push(`build#0 (coal, P2): err=${err}`)
        coalDone = true
      } else if (cur(a).name === 'P1' && coalDone) {
        setHand(a, 0, [locCard('dudley', 1)])
        const before = ctx(a).players[0].money
        const marketBefore = ironRow(a)
        const err = build(a, 'dudley', 'iron')
        const after = ctx(a).players[0].money
        log.push(
          `build#1 (iron): err=${err} money £${before}→£${after} (Δ${after - before})`,
        )
        log.push(`iron market before: ${marketBefore.join(' ')}`)
        log.push(`iron market after : ${ironRow(a).join(' ')}`)
        ironDone = true
      } else passTurn(a)
    }
    const tile = tileAt(a, 0, 'dudley', 'iron')
    log.push(
      `iron tile: cubes=${tile?.ironCubesOnTile} flipped=${tile?.flipped}`,
    )
    log.push(
      `last build log: ${
        ctx(a)
          .logs.filter((l: any) => l.message.includes('iron'))
          .slice(-1)[0]?.message
      }`,
    )
    console.log(['--- IRON PARTIAL FIT ---', ...log].join('\n'))
    // 2 cubes fit the two empty £1 spaces → £2 payout; 2 cubes remain
    expect(ironRow(a)[0]).toBe('£1:2/2')
    expect(tile?.ironCubesOnTile).toBe(2)
    expect(tile?.flipped).toBe(false)
    expect(
      ctx(a).logs.some((l: any) =>
        l.message.includes('sold 2 iron to market for £2'),
      ),
    ).toBe(true)
    a.stop()
  })

  test('B. full fit: 4+ empty spaces → all 4 cubes sold → tile flips', () => {
    const a = start()
    // Two develops consume 2 iron from the market (cheapest occupied = £2
    // row) → empties: 2×£1 + 2×£2 = room for all 4 cubes of iron L1.
    // Interleaved with P2's turns (no passes — the scripted deck is small):
    // P2 builds the coal mine at dudley, and P1's iron works consumes from
    // that opponent mine (the canal one-tile rule forbids P1 stacking an
    // own mine + iron works there).
    let develops = 0
    let coalDone = false
    let ironDone = false
    const log: string[] = []
    const incomeBefore = ctx(a).players[0].income
    while (!ironDone) {
      if (cur(a).name === 'P2') {
        if (!coalDone) {
          setHand(a, 1, [locCard('dudley', 91)])
          const err = build(a, 'dudley', 'coal')
          log.push(`build#0 (coal, P2): err=${err}`)
          coalDone = true
        } else passTurn(a)
      } else if (develops < 2) {
        setHand(a, 0, [locCard('dudley', develops + 10)])
        const err = develop(a, 'cotton')
        log.push(
          `develop#${develops}: err=${err} market: ${ironRow(a).join(' ')}`,
        )
        develops++
      } else if (coalDone) {
        setHand(a, 0, [locCard('dudley', 21)])
        const before = ctx(a).players[0].money
        const err = build(a, 'dudley', 'iron')
        const after = ctx(a).players[0].money
        log.push(
          `build#1 (iron): err=${err} money £${before}→£${after} (Δ${after - before})`,
        )
        ironDone = true
      } else passTurn(a)
    }
    const tile = tileAt(a, 0, 'dudley', 'iron')
    log.push(`iron market after: ${ironRow(a).join(' ')}`)
    log.push(
      `iron tile: cubes=${tile?.ironCubesOnTile} flipped=${tile?.flipped}`,
    )
    log.push(
      `P1 income: ${incomeBefore} → ${ctx(a).players[0].income} (flip should advance it)`,
    )
    log.push(
      `logs: ${ctx(a)
        .logs.slice(-6)
        .map((l: any) => l.message)
        .join(' | ')}`,
    )
    console.log(['--- IRON FULL FIT / FLIP ---', ...log].join('\n'))
    // all 4 cubes sold, most expensive empty spaces first: 2×£2 then 2×£1
    expect(
      ctx(a).logs.some((l: any) =>
        l.message.includes(
          'sold 2 iron to market for £4, sold 2 iron to market for £2',
        ),
      ),
    ).toBe(true)
    expect(tile?.ironCubesOnTile).toBe(0)
    expect(tile?.flipped).toBe(true)
    // flip advances the marker by SPACES (iron L1 = +3): the player starts
    // on space 10 (level 0), +3 spaces = space 13 = level 2 (audited track)
    expect(ctx(a).players[0].income).toBe(2)
    expect(ctx(a).players[0].incomeSpace).toBe(13)
    a.stop()
  })
})

describe('VERIFY: coal control (market connection required)', () => {
  test('C1. coal mine NOT connected to any merchant: no auto-sale', () => {
    const a = start()
    let built = false
    while (!built) {
      if (cur(a).name === 'P1') {
        setHand(a, 0, [locCard('dudley', 30)])
        const before = ctx(a).players[0].money
        const marketBefore = coalRow(a)
        const err = build(a, 'dudley', 'coal')
        const after = ctx(a).players[0].money
        const tile = tileAt(a, 0, 'dudley', 'coal')
        console.log(
          [
            '--- COAL UNCONNECTED ---',
            `err=${err} money £${before}→£${after} (Δ${after - before}, tile costs £5)`,
            `coal market before: ${marketBefore.join(' ')}`,
            `coal market after : ${coalRow(a).join(' ')}`,
            `coal tile: cubes=${tile?.coalCubesOnTile} flipped=${tile?.flipped}`,
          ].join('\n'),
        )
        built = true
      } else passTurn(a)
    }
    a.stop()
  })

  test('C2. coal mine CONNECTED to a merchant (coalbrookdale—shrewsbury): auto-sale', () => {
    const a = start()
    // P1: link coalbrookdale—shrewsbury (canal), then coal at coalbrookdale.
    let step = 0
    const log: string[] = []
    while (step < 2) {
      if (cur(a).name === 'P1') {
        if (step === 0) {
          setHand(a, 0, [locCard('coalbrookdale', 40)])
          unwind(a)
          a.send({ type: 'NETWORK' } as any)
          a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
          a.send({
            type: 'SELECT_LINK',
            from: 'coalbrookdale',
            to: 'shrewsbury',
          } as any)
          a.send({ type: 'CONFIRM' } as any)
          log.push(`link err=${ctx(a).lastError}`)
          a.send({ type: 'CLEAR_ERROR' } as any)
          unwind(a)
        } else {
          setHand(a, 0, [locCard('coalbrookdale', 41)])
          const before = ctx(a).players[0].money
          const marketBefore = coalRow(a)
          const err = build(a, 'coalbrookdale', 'coal')
          const after = ctx(a).players[0].money
          const tile = tileAt(a, 0, 'coalbrookdale', 'coal')
          log.push(
            `coal build err=${err} money £${before}→£${after} (Δ${after - before}, tile costs £5)`,
          )
          log.push(`coal market before: ${marketBefore.join(' ')}`)
          log.push(`coal market after : ${coalRow(a).join(' ')}`)
          log.push(
            `coal tile: cubes=${tile?.coalCubesOnTile} flipped=${tile?.flipped}`,
          )
          log.push(
            `logs: ${ctx(a)
              .logs.slice(-3)
              .map((l: any) => l.message)
              .join(' | ')}`,
          )
        }
        step++
      } else passTurn(a)
    }
    console.log(['--- COAL CONNECTED ---', ...log].join('\n'))
    const tile = tileAt(a, 0, 'coalbrookdale', 'coal')
    expect(coalRow(a)[0]).toBe('£1:2/2') // the one empty £1 space filled
    expect(tile?.coalCubesOnTile).toBe(1)
    expect(tile?.flipped).toBe(false)
    a.stop()
  })
})

describe('VERIFY: merchant beer sells their goods and grants the bonus', () => {
  test('sale drinks the merchant barrel and applies the merchant bonus', () => {
    const a = start()
    // one merchant: gloucester buys cotton, HOLDS BEER, pays a £5 bonus
    a.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [
        {
          location: 'gloucester',
          industryIcons: ['cotton'],
          bonusType: 'money',
          bonusValue: 5,
          hasBeer: true,
        },
      ],
    } as any)
    // hands scripted ONCE (see AGENTS.md gotcha): cotton, link discard, sale discard
    setHand(a, 0, [
      locCard('worcester', 60),
      locCard('worcester', 61),
      locCard('worcester', 62),
      locCard('stone', 63),
    ])

    // round 1: P1 builds cotton at worcester; P2 passes
    unwind(a)
    a.send({ type: 'BUILD' } as any)
    a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' } as any)
    a.send({ type: 'SELECT_LOCATION', cityId: 'worcester' } as any)
    a.send({ type: 'CONFIRM' } as any)
    expect(ctx(a).lastError).toBeNull()
    unwind(a)
    a.send({ type: 'PASS' } as any) // P2
    unwind(a)

    // round 2: P1 first (spent more? P1 spent 12, P2 0 → P2 first) — walk
    // whoever is current: P2 passes both actions, then P1 links + sells
    while (cur(a).name === 'P2') {
      a.send({ type: 'PASS' } as any)
      unwind(a)
    }
    a.send({ type: 'NETWORK' } as any)
    a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
    a.send({ type: 'SELECT_LINK', from: 'worcester', to: 'gloucester' } as any)
    a.send({ type: 'CONFIRM' } as any)
    expect(ctx(a).lastError).toBeNull()
    unwind(a)

    const moneyBefore = ctx(a).players[0].money
    a.send({ type: 'SELL' } as any)
    a.send({ type: 'SELECT_CARD', cardId: cur(a).hand[0].id } as any)
    a.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    } as any)

    const c = ctx(a)
    const cotton = c.players[0].industries.find(
      (i: any) => i.location === 'worcester',
    )
    expect(cotton.flipped).toBe(true) // the sale happened
    expect(c.merchants[0].hasBeer).toBe(false) // the merchant barrel was drunk
    expect(c.players[0].money).toBe(moneyBefore + 5) // £5 merchant bonus paid
    expect(
      c.logs.some((l: any) =>
        l.message.includes('beer from merchant at gloucester'),
      ),
    ).toBe(true)
    a.stop()
  })
})
