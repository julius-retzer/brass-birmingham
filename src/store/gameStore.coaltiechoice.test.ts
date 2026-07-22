// Regression tests for the equal-distance coal-mine CHOICE.
//
// Rules (ai-docs/brass-birmingham-rules.mdc L119-121): coal comes from the
// closest connected unflipped mine, and "If multiple Coal Mines are equally
// close, choose one." Distinct distances are NOT a choice (the nearest wins
// automatically); only a tie within the nearest reachable tier is — including a
// tier reached after a nearer single mine runs short.
//
// Two layers are pinned here:
//   * the pure allocator / consumption honours (and validates) a pick;
//   * the machine pauses on a genuine tie and drains exactly the chosen mine,
//     across builds, single rail links and both coals of a double link, while a
//     single nearest source never prompts.
import { afterEach, describe, expect, it, test } from 'vitest'
import { createActor } from 'xstate'
import { type GameState, type Player, gameStore } from './gameStore'
import { consumeCoalFromSources } from './market/marketActions'
import {
  type CoalSource,
  pendingCoalChoice,
  runCoalAllocation,
} from './shared/resourceSources'

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
      { price: 8, cubes: 0, maxCubes: Number.POSITIVE_INFINITY },
    ],
    resources: { coal: 30, iron: 10, beer: 15 },
  } as unknown as GameState
}

const findMine = (players: Player[], loc: string) =>
  players
    .flatMap((p) => p.industries)
    .find((i) => i.type === 'coal' && i.location === loc)!

const mineSource = (ownerId: string, location: string): CoalSource => ({
  kind: 'mine',
  ownerId,
  location: location as never,
})

describe('coal tie choice — pure allocator and consumption', () => {
  // Two mines both one link from birmingham (a genuine tie); one mine two links
  // away (never part of the tie).
  const tieContext = () => {
    const links = [
      { from: 'birmingham', to: 'dudley' },
      { from: 'birmingham', to: 'walsall' },
      { from: 'dudley', to: 'wolverhampton' },
    ]
    const p1 = player(
      'p1',
      [coalMine('dudley', 2), coalMine('wolverhampton', 2)],
      links,
    )
    const p2 = player('p2', [coalMine('walsall', 2)], [])
    return makeContext([p1, p2])
  }

  it('stops at the tied nearest tier, listing every tied mine but not the far one', () => {
    const alloc = runCoalAllocation(
      [{ context: tieContext(), anchor: 'birmingham' as never, required: 1 }],
      [],
      { stopAtChoice: true },
    )
    expect(alloc.pendingChoiceTier).not.toBeNull()
    const offered = alloc
      .pendingChoiceTier!.map((o) => o.source.location)
      .sort()
    // dudley (p1) and walsall (p2) tie at distance 1; wolverhampton is distance
    // 2 and must not be offered.
    expect(offered).toEqual(['dudley', 'walsall'])
  })

  it('a pick drains exactly the chosen mine — not the discovery-order default', () => {
    const ctx = tieContext()
    // Default (no preference) drains dudley (discovery order).
    const auto = consumeCoalFromSources(ctx, 'birmingham' as never, 1)
    expect(findMine(auto.updatedPlayers, 'dudley').coalCubesOnTile).toBe(1)
    expect(findMine(auto.updatedPlayers, 'walsall').coalCubesOnTile).toBe(2)

    // Choosing the opponent's walsall mine drains that one instead, still free.
    const chosen = consumeCoalFromSources(ctx, 'birmingham' as never, 1, [
      mineSource('p2', 'walsall'),
    ])
    expect(chosen.success).toBe(true)
    expect(chosen.coalCost).toBe(0)
    expect(findMine(chosen.updatedPlayers, 'walsall').coalCubesOnTile).toBe(1)
    expect(findMine(chosen.updatedPlayers, 'dudley').coalCubesOnTile).toBe(2)
  })

  it('refuses a pick that is not among the closest mines', () => {
    const r = consumeCoalFromSources(tieContext(), 'birmingham' as never, 1, [
      // wolverhampton is a link farther than the tied tier.
      mineSource('p1', 'wolverhampton'),
    ])
    expect(r.success).toBe(false)
    expect(r.errorMessage).toMatch(/closest connected coal mine/i)
  })

  it('a shortfall crossing into a farther TIED tier still asks for that tier', () => {
    // Nearest: a single mine at dudley with 1 cube. Farther tier: two mines
    // that tie (wolverhampton via dudley, walsall via birmingham are both 1
    // link... so give dudley d1 alone and the tie one link beyond it).
    const links = [
      { from: 'birmingham', to: 'dudley' },
      { from: 'dudley', to: 'wolverhampton' },
      { from: 'dudley', to: 'walsall' },
    ]
    const p1 = player(
      'p1',
      [
        coalMine('dudley', 1), // nearest (d1), only 1 cube
        coalMine('wolverhampton', 2), // d2
        coalMine('walsall', 2), // d2 — ties with wolverhampton
      ],
      links,
    )
    const ctx = makeContext([p1])

    const alloc = runCoalAllocation(
      [{ context: ctx, anchor: 'birmingham' as never, required: 2 }],
      [],
      { stopAtChoice: true },
    )
    // First cube auto-drains the single nearest mine; the SECOND cube is the
    // tie between the two d2 mines.
    expect(alloc.pendingChoiceTier).not.toBeNull()
    const offered = alloc
      .pendingChoiceTier!.map((o) => o.source.location)
      .sort()
    expect(offered).toEqual(['walsall', 'wolverhampton'])

    // Resolving that tie in favour of walsall drains dudley then walsall, free.
    const r = consumeCoalFromSources(ctx, 'birmingham' as never, 2, [
      mineSource('p1', 'walsall'),
    ])
    expect(r.success).toBe(true)
    expect(r.coalCost).toBe(0)
    expect(findMine(r.updatedPlayers, 'dudley').coalCubesOnTile).toBe(0)
    expect(findMine(r.updatedPlayers, 'walsall').coalCubesOnTile).toBe(1)
    expect(findMine(r.updatedPlayers, 'wolverhampton').coalCubesOnTile).toBe(2)
  })

  it('a single nearest mine is never a choice', () => {
    const links = [{ from: 'birmingham', to: 'dudley' }]
    const p1 = player('p1', [coalMine('dudley', 2)], links)
    const alloc = runCoalAllocation(
      [
        {
          context: makeContext([p1]),
          anchor: 'birmingham' as never,
          required: 1,
        },
      ],
      [],
      { stopAtChoice: true },
    )
    expect(alloc.pendingChoiceTier).toBeNull()
  })
})

describe('coal tie choice — driven through the machine', () => {
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

  test('a single rail link with tied nearest mines pauses and drains only the chosen one', () => {
    const actor = railGame()
    const seat = actor.getSnapshot().context.currentPlayerIndex
    const meId = actor.getSnapshot().context.players[seat]!.id

    // Two coal mines equidistant from the birmingham-dudley link: birmingham
    // (endpoint) and dudley (endpoint, after placement) are both distance 0.
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seat,
      money: 100,
      industries: [
        nonCoalIndustry('birmingham'),
        coalMine('birmingham', 2),
        coalMine('dudley', 2),
      ],
      links: [] as never,
    })

    let snap = actor.getSnapshot()
    const startMoney = snap.context.players[seat]!.money
    const cardId = snap.context.players[seat]!.hand[0]!.id

    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'dudley' })
    actor.send({ type: 'CONFIRM' })

    // The tie stops the machine at the coal-choosing step.
    snap = actor.getSnapshot()
    expect(
      snap.matches({
        playing: { action: { networking: 'choosingLinkCoal' } },
      }),
    ).toBe(true)
    const choice = pendingCoalChoice(snap.context)
    expect(choice?.hasChoice).toBe(true)
    expect(choice?.options.map((o) => o.source.location).sort()).toEqual([
      'birmingham',
      'dudley',
    ])

    // Pick the dudley mine.
    actor.send({
      type: 'SELECT_COAL_SOURCE',
      source: mineSource(meId, 'dudley'),
    })

    snap = actor.getSnapshot()
    const me = snap.context.players[seat]!
    // Link placed, coal free (only the £5 link cost), dudley drained, birmingham
    // mine untouched.
    expect(
      me.links.some(
        (l) =>
          (l.from === 'birmingham' && l.to === 'dudley') ||
          (l.from === 'dudley' && l.to === 'birmingham'),
      ),
    ).toBe(true)
    expect(me.money).toBe(startMoney - 5)
    expect(findMine(snap.context.players, 'dudley').coalCubesOnTile).toBe(1)
    expect(findMine(snap.context.players, 'birmingham').coalCubesOnTile).toBe(2)
  })

  test('a single rail link with one nearest mine never prompts', () => {
    const actor = railGame()
    const seat = actor.getSnapshot().context.currentPlayerIndex

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seat,
      money: 100,
      industries: [nonCoalIndustry('birmingham'), coalMine('dudley', 2)],
      links: [] as never,
    })

    let snap = actor.getSnapshot()
    const cardId = snap.context.players[seat]!.hand[0]!.id
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'dudley' })
    actor.send({ type: 'CONFIRM' })

    // No pause — it flowed straight through to the completed action.
    snap = actor.getSnapshot()
    expect(
      snap.matches({ playing: { action: { networking: 'choosingLinkCoal' } } }),
    ).toBe(false)
    expect(findMine(snap.context.players, 'dudley').coalCubesOnTile).toBe(1)
  })
})
