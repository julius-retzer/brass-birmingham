// Regression tests for coal "nearest connected mine" consumption.
//
// Rules (ai-docs/brass-birmingham-rules.mdc):
//   L119-121: "The closest (fewest Link tiles distant) connected unflipped Coal
//     Mine (owned by any player). If multiple Coal Mines are equally close,
//     choose one. If a Coal Mine runs out of coal, and you need more, choose the
//     next closest Coal Mine. Consuming coal in this way is free."
//   L116/L308: a rail Link or Industry tile "must be connected to a source of
//     coal (after it is placed)."
//
// Two bugs these tests pin (both previously shipped):
//   A) A shortfall in the nearest mine's cubes must roll to the next-closest
//      mine (still free) BEFORE the coal market is ever charged — the engine
//      used to drain only the closest tier then fall to the market.
//   B) A rail link's coal is judged AFTER the link is placed, over both of its
//      endpoints — the engine used to judge it before placement, anchored only
//      at the link's `from`, so a mine reachable only through the new link (or
//      only from the `to` end) was invisible and the pick flipped with the
//      from/to orientation the UI happened to send.
import { afterEach, describe, expect, it, test } from 'vitest'
import { createActor } from 'xstate'
import { type GameState, type Player, gameStore } from './gameStore'
import { consumeCoalFromSources } from './market/marketActions'
import { findConnectedCoalMines } from './shared/gameUtils'

type Industry = Player['industries'][number]

function coalMine(location: string, cubes: number, flipped = false): Industry {
  return {
    type: 'coal',
    location,
    flipped,
    coalCubesOnTile: cubes,
    ironCubesOnTile: 0,
    beerBarrelsOnTile: 0,
    level: 1,
    tile: { incomeAdvancement: 1 },
  } as unknown as Industry
}

function player(
  id: string,
  industries: Industry[],
  links: Array<{ from: string; to: string }>,
): Player {
  return {
    id,
    name: id,
    money: 30,
    income: 0,
    incomeSpace: 10,
    victoryPoints: 0,
    hand: [],
    industries,
    links: links.map((l) => ({ ...l, type: 'canal' as const })),
  } as unknown as Player
}

function makeContext(players: Player[]): GameState {
  return {
    players,
    currentPlayerIndex: 0,
    era: 'canal',
    coalMarket: [
      { price: 1, cubes: 1, maxCubes: 2 },
      { price: 2, cubes: 2, maxCubes: 2 },
      { price: 3, cubes: 2, maxCubes: 2 },
      { price: 4, cubes: 2, maxCubes: 2 },
      { price: 5, cubes: 2, maxCubes: 2 },
      { price: 6, cubes: 2, maxCubes: 2 },
      { price: 7, cubes: 2, maxCubes: 2 },
      { price: 8, cubes: 0, maxCubes: Infinity },
    ],
    resources: { coal: 30, iron: 10, beer: 15 },
  } as unknown as GameState
}

const findMine = (players: Player[], loc: string) =>
  players
    .flatMap((p) => p.industries)
    .find((i) => i.type === 'coal' && i.location === loc)!

const anchor = (loc: string) => loc as never

describe('coal nearest-mine consumption (Bug A: shortfall rolls to next mine)', () => {
  // Chain: birmingham -(1)- dudley -(1)- wolverhampton ; market via oxford
  const chain = [
    { from: 'birmingham', to: 'dudley' },
    { from: 'dudley', to: 'wolverhampton' },
    { from: 'birmingham', to: 'oxford' }, // merchant connection
  ]

  it('baseline: near mine (d1) drained before the far mine, free', () => {
    const p1 = player('p1', [coalMine('dudley', 2)], chain)
    const p2 = player('p2', [coalMine('wolverhampton', 2)], [])
    const r = consumeCoalFromSources(
      makeContext([p1, p2]),
      anchor('birmingham'),
      1,
    )
    expect(r.success).toBe(true)
    expect(r.coalCost).toBe(0)
    expect(findMine(r.updatedPlayers, 'dudley').coalCubesOnTile).toBe(1)
    expect(findMine(r.updatedPlayers, 'wolverhampton').coalCubesOnTile).toBe(2)
  })

  it('shortfall crosses tiers free: near mine (1 cube) then next-closest, never the market', () => {
    const p1 = player('p1', [coalMine('dudley', 1)], chain)
    const p2 = player('p2', [coalMine('wolverhampton', 3)], [])
    const r = consumeCoalFromSources(
      makeContext([p1, p2]),
      anchor('birmingham'),
      2,
    )
    expect(r.success).toBe(true)
    // Both cubes free — the second comes from the next-closest mine (rules
    // L119-121), NOT the connected coal market.
    expect(r.coalCost).toBe(0)
    expect(findMine(r.updatedPlayers, 'dudley').coalCubesOnTile).toBe(0)
    expect(findMine(r.updatedPlayers, 'wolverhampton').coalCubesOnTile).toBe(2)
    expect(r.logDetails.some((l) => l.toLowerCase().includes('market'))).toBe(
      false,
    )
  })

  it('shortfall with NO market connection still succeeds via the next-closest mine', () => {
    const noMerchant = chain.slice(0, 2) // drop the oxford link
    const p1 = player('p1', [coalMine('dudley', 1)], noMerchant)
    const p2 = player('p2', [coalMine('wolverhampton', 3)], [])
    const r = consumeCoalFromSources(
      makeContext([p1, p2]),
      anchor('birmingham'),
      2,
    )
    // Previously refused ("Insufficient coal available") because the far mine
    // was never consulted — a legal action was blocked.
    expect(r.success).toBe(true)
    expect(r.coalCost).toBe(0)
    expect(findMine(r.updatedPlayers, 'wolverhampton').coalCubesOnTile).toBe(2)
  })

  it('masking: a flipped near mine is skipped and the far stocked mine is used, free', () => {
    const p1 = player('p1', [coalMine('dudley', 0, true)], chain)
    const p2 = player('p2', [coalMine('wolverhampton', 2)], [])
    const r = consumeCoalFromSources(
      makeContext([p1, p2]),
      anchor('birmingham'),
      1,
    )
    expect(r.success).toBe(true)
    expect(r.coalCost).toBe(0)
    expect(findMine(r.updatedPlayers, 'wolverhampton').coalCubesOnTile).toBe(1)
  })

  it('only falls to the market once every connected mine is exhausted', () => {
    // Need 3, both connected mines hold 1 each (total 2); the 3rd is bought.
    const p1 = player('p1', [coalMine('dudley', 1)], chain)
    const p2 = player('p2', [coalMine('wolverhampton', 1)], [])
    const r = consumeCoalFromSources(
      makeContext([p1, p2]),
      anchor('birmingham'),
      3,
    )
    expect(r.success).toBe(true)
    // Two free cubes from the two mines, one paid cube from the £1 market space.
    expect(r.coalCost).toBe(1)
    expect(findMine(r.updatedPlayers, 'dudley').coalCubesOnTile).toBe(0)
    expect(findMine(r.updatedPlayers, 'wolverhampton').coalCubesOnTile).toBe(0)
  })

  it('equidistant mines with NO preference: the engine auto-picks one (discovery order)', () => {
    // Omitting a preference keeps the historic auto-pick, unit for unit — the
    // equal-distance tie CHOICE is opt-in via preferredSources (pinned in
    // gameStore.coaltiechoice.test.ts). Two mines both one link from
    // birmingham; discovery order wins when nobody picks.
    const links = [
      { from: 'birmingham', to: 'dudley' },
      { from: 'birmingham', to: 'walsall' },
    ]
    const p1 = player('p1', [coalMine('walsall', 2)], links)
    const p2 = player('p2', [coalMine('dudley', 2)], [])
    const ctx = makeContext([p1, p2])
    const mines = findConnectedCoalMines(ctx, anchor('birmingham'), p1)
    expect(mines.length).toBe(2) // both offered at the same distance
    const r = consumeCoalFromSources(ctx, anchor('birmingham'), 1)
    expect(r.success).toBe(true)
    expect(r.coalCost).toBe(0)
  })
})

describe('coal nearest-mine consumption (Bug B: orientation independence)', () => {
  // The new link birmingham-dudley is on the board (both endpoints anchor coal).
  // mine1 at coventry is one link from birmingham; mine2 at wolverhampton is one
  // link from dudley. Over both endpoints each mine is distance 1 — a tie — so
  // the pick no longer depends on which end the UI called `from`.
  const build = () => {
    const links = [
      { from: 'birmingham', to: 'dudley' }, // the placed link
      { from: 'birmingham', to: 'coventry' },
      { from: 'dudley', to: 'wolverhampton' },
    ]
    // coventry first in the industry list, so a tie resolves to it.
    const p = player(
      'p',
      [coalMine('coventry', 2), coalMine('wolverhampton', 2)],
      links,
    )
    return makeContext([p])
  }

  it('anchoring over both endpoints drains the same mine regardless of from/to order', () => {
    const forward = consumeCoalFromSources(
      build(),
      ['birmingham', 'dudley'] as never,
      1,
    )
    const swapped = consumeCoalFromSources(
      build(),
      ['dudley', 'birmingham'] as never,
      1,
    )
    for (const r of [forward, swapped]) {
      expect(r.success).toBe(true)
      expect(r.coalCost).toBe(0)
      // coventry (the tie winner) drained, wolverhampton untouched — both ways.
      expect(findMine(r.updatedPlayers, 'coventry').coalCubesOnTile).toBe(1)
      expect(findMine(r.updatedPlayers, 'wolverhampton').coalCubesOnTile).toBe(
        2,
      )
    }
  })

  it('both endpoints see mines reachable from either end', () => {
    const mines = findConnectedCoalMines(
      build(),
      ['birmingham', 'dudley'] as never,
      {} as Player,
    )
    const locations = mines.map((m) => m.location).sort()
    expect(locations).toEqual(['coventry', 'wolverhampton'])
  })
})

describe('coal for a rail link is judged after placement (Bug B, engine level)', () => {
  let actors: ReturnType<typeof createActor>[] = []
  afterEach(() => {
    actors.forEach((a) => {
      try {
        a.stop()
      } catch {}
    })
    actors = []
  })

  const railGame = () => {
    const actor = createActor(gameStore)
    actors.push(actor)
    actor.subscribe({ error: () => {} })
    actor.start()
    actor.send({
      type: 'START_GAME',
      players: [
        {
          id: '1',
          name: 'Player 1',
          color: 'red' as const,
          character: 'Richard Arkwright' as const,
          money: 100,
          victoryPoints: 0,
          income: 10,
          industryTilesOnMat: {} as never,
        },
        {
          id: '2',
          name: 'Player 2',
          color: 'blue' as const,
          character: 'Eliza Tinsley' as const,
          money: 100,
          victoryPoints: 0,
          income: 10,
          industryTilesOnMat: {} as never,
        },
      ],
    })
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    return actor
  }

  const nonCoalIndustry = (location: string): Industry =>
    ({
      type: 'cotton',
      location,
      flipped: false,
      coalCubesOnTile: 0,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 0,
      level: 1,
      tile: { incomeAdvancement: 1 },
    }) as unknown as Industry

  test('a rail link joins the network to a mine reachable only through it — coal is free', () => {
    const actor = railGame()
    const seat = actor.getSnapshot().context.currentPlayerIndex

    // Network before the build: an industry at birmingham (so the build is
    // legal) plus a link dudley-wolverhampton with a coal mine at wolverhampton.
    // birmingham cannot reach wolverhampton UNTIL the new birmingham-dudley
    // link is placed — and there is no merchant connection, so pre-placement
    // sourcing would refuse a legal action.
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seat,
      money: 100,
      industries: [nonCoalIndustry('birmingham'), coalMine('wolverhampton', 2)],
      links: [{ from: 'dudley', to: 'wolverhampton', type: 'rail' }] as never,
    })

    let snap = actor.getSnapshot()
    const startMoney = snap.context.players[seat]!.money
    const cardId = snap.context.players[seat]!.hand[0]!.id

    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'dudley' })
    actor.send({ type: 'CONFIRM' })

    snap = actor.getSnapshot()
    const me = snap.context.players[seat]!
    // The link was actually placed (the action was not refused).
    expect(
      me.links.some(
        (l) =>
          (l.from === 'birmingham' && l.to === 'dudley') ||
          (l.from === 'dudley' && l.to === 'birmingham'),
      ),
    ).toBe(true)
    // Coal came free from the now-reachable mine — only the £5 link cost.
    expect(me.money).toBe(startMoney - 5)
    expect(
      findMine(snap.context.players, 'wolverhampton').coalCubesOnTile,
    ).toBe(1)
  })
})
