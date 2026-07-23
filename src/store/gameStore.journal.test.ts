// Journal completeness regression suite — the game log is the audit trail for
// rules verification (the coal next-closest-mine investigation reads it), so
// these pin three concrete gaps reported from real games:
//   1. double-link builds must journal the beer consumption AND any brewery flip
//   2. link/industry coal consumption must NAME the source mine (owner + city)
//   3. no journal string may contain the duplicated word "consumed consumed"
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { CityId } from '../data/board'
import { gameStore } from './gameStore'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const setupGame = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.subscribe({ error: () => {} })
  actor.start()

  const players = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 50,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 50,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
  ]

  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const coalMineAt = (location: CityId, cubes: number) => ({
  location,
  type: 'coal' as const,
  level: 1,
  flipped: false,
  tile: {
    id: 'coal_1',
    type: 'coal' as const,
    level: 1,
    canBuildInCanalEra: true,
    canBuildInRailEra: false,
    incomeAdvancement: 4,
    victoryPoints: 1,
    cost: 5,
    incomeSpaces: 4,
    linkScoringIcons: 1,
    coalRequired: 0,
    ironRequired: 0,
    beerRequired: 0,
    beerProduced: 0,
    coalProduced: 2,
    ironProduced: 0,
    hasLightbulbIcon: false,
    quantity: 2,
  },
  coalCubesOnTile: cubes,
  ironCubesOnTile: 0,
  beerBarrelsOnTile: 0,
})

const breweryAt = (location: CityId, barrels: number) => ({
  location,
  type: 'brewery' as const,
  level: 2,
  flipped: false,
  tile: {
    id: 'brewery_2',
    type: 'brewery' as const,
    level: 2,
    canBuildInCanalEra: true,
    canBuildInRailEra: true,
    incomeAdvancement: 5,
    victoryPoints: 5,
    cost: 7,
    incomeSpaces: 5,
    linkScoringIcons: 1,
    coalRequired: 1,
    ironRequired: 0,
    beerRequired: 0,
    beerProduced: 1,
    coalProduced: 0,
    ironProduced: 0,
    hasLightbulbIcon: false,
    quantity: 1,
  },
  coalCubesOnTile: 0,
  ironCubesOnTile: 0,
  beerBarrelsOnTile: barrels,
})

const lastActionLog = (actor: ReturnType<typeof createActor>) => {
  const logs = actor.getSnapshot().context.logs
  return (
    [...logs].reverse().find((l: any) => l.type === 'action')?.message ?? ''
  )
}

describe('journal completeness', () => {
  test('gap 2: link coal consumption names the source mine (owner + city)', () => {
    const { actor } = setupGame()
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    const playerId = actor.getSnapshot().context.currentPlayerIndex

    // The builder owns a coal mine at birmingham and builds a rail link out of
    // it — the coal must be drawn (free) from that specific, named mine.
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId,
      money: 100,
      industries: [coalMineAt('birmingham', 2)],
    })

    const card = actor.getSnapshot().context.players[playerId]!.hand[0]!
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    actor.send({ type: 'CONFIRM' })

    const log = lastActionLog(actor)
    expect(log).toContain('built a rail link between birmingham and coventry')
    // Names the actual mine: owner ("Player 1's") + city ("at birmingham").
    expect(log).toContain("Player 1's coal mine at birmingham (free)")
    // The old anonymous phrasing must be gone.
    expect(log).not.toContain('connected coal mine (free)')
  })

  test('gap 3: build consuming market resource never duplicates "consumed"', () => {
    const { actor } = setupGame()
    const playerId = actor.getSnapshot().context.currentPlayerIndex

    // Brewery L1 needs iron; with no connected iron works it comes from the
    // market. The build log wraps consumption in "(consumed …)" — the market
    // detail must NOT also start with "consumed" or it reads "consumed consumed".
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId,
      hand: [{ id: 'brewery_test', type: 'industry', industries: ['brewery'] }],
    })
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId, money: 50 })

    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'brewery_test' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'burton' })
    actor.send({ type: 'CONFIRM' })

    const log = lastActionLog(actor)
    expect(log).toContain('built brewery')
    expect(log).toContain('consumed 1 iron from market')
    expect(log).not.toContain('consumed consumed')
    // Exactly one "consumed" in the whole entry.
    expect(log.match(/consumed/g)?.length).toBe(1)
  })

  test('gap 1: double-link build journals beer consumption and brewery flip', () => {
    const { actor } = setupGame()
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')
    const playerId = snapshot.context.currentPlayerIndex

    // One brewery with a SINGLE barrel (so the double-link beer drains it and it
    // flips) plus a coal mine to feed both rails.
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId,
      money: 60,
      industries: [breweryAt('birmingham', 1), coalMineAt('birmingham', 4)],
    })

    // Establish network so both rails and the brewery are connected.
    let card = actor.getSnapshot().context.players[playerId]!.hand[0]!
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    actor.send({ type: 'CONFIRM' })

    // Double rail link: consumes 2 coal + 1 beer.
    card = actor.getSnapshot().context.players[playerId]!.hand[0]!
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
    actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    actor.send({
      type: 'SELECT_SECOND_LINK',
      from: 'birmingham',
      to: 'dudley',
    })
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })

    snapshot = actor.getSnapshot()
    const doubleLog = [...snapshot.context.logs]
      .reverse()
      .find(
        (l: any) => l.type === 'action' && l.message.includes('2 rail links'),
      )?.message

    expect(doubleLog).toBeDefined()
    // The beer source is journaled (was previously only a generic "+ beer").
    expect(doubleLog).toContain('beer from own brewery at birmingham (free)')
    // Draining the last barrel flips the brewery — that must be journaled too.
    expect(doubleLog).toContain("Player 1's brewery at birmingham flipped")
    // Sanity: the brewery really did flip.
    const brewery = snapshot.context.players[playerId]!.industries.find(
      (i: any) => i.type === 'brewery',
    )!
    expect(brewery.flipped).toBe(true)
  })
})
