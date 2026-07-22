// Full-game integration tests: drive complete games from START_GAME to
// gameOver purely through the machine's event surface. The driver plays a
// simple but legal policy (sell > build > network > loan > pass) and relies
// on the machine's guards to reject illegal moves - it never uses TRIGGER_*
// or TEST_* events, so era transitions and game end must fire automatically.
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { cities, cityIndustrySlots, connections } from '../data/board'
import type { CityId } from '../data/board'
import { gameStore } from './gameStore'
import {
  beerChoiceForSale,
  pendingBeerChoice,
  pendingIronChoice,
} from './shared/resourceSources'

let activeActors: ReturnType<typeof createActor>[] = []
let moneyInvariantViolations: string[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
  const violations = moneyInvariantViolations
  moneyInvariantViolations = []
  expect(violations).toEqual([])
})

const PLAYER_TEMPLATES = [
  {
    id: '1',
    name: 'Alice',
    color: 'red' as const,
    character: 'Richard Arkwright' as const,
  },
  {
    id: '2',
    name: 'Bob',
    color: 'blue' as const,
    character: 'Eliza Tinsley' as const,
  },
  {
    id: '3',
    name: 'Carol',
    color: 'green' as const,
    character: 'Robert Owen' as const,
  },
  {
    id: '4',
    name: 'Dave',
    color: 'yellow' as const,
    character: 'George Stephenson' as const,
  },
]

const startGame = (playerCount: number) => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  // Global invariant: Brass has no debt, so no event may ever leave a player
  // with a negative treasury (see gameStore.money.test.ts). Violations are
  // collected rather than thrown - a throw inside a subscriber does not
  // propagate out of send() - and asserted in afterEach.
  actor.subscribe((snapshot) => {
    for (const player of (snapshot as any).context.players) {
      if (player.money < 0) {
        moneyInvariantViolations.push(`${player.name} has £${player.money}`)
      }
    }
  })
  actor.start()
  const players = PLAYER_TEMPLATES.slice(0, playerCount).map((p) => ({
    ...p,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as any,
  }))
  actor.send({ type: 'START_GAME', players } as any)
  return actor
}

type AnyActor = ReturnType<typeof createActor>

const ctx = (actor: AnyActor) => (actor.getSnapshot() as any).context
const currentPlayer = (actor: AnyActor) => {
  const c = ctx(actor)
  return c.players[c.currentPlayerIndex]
}
const isSelectingAction = (actor: AnyActor) =>
  (actor.getSnapshot() as any).matches({
    playing: { action: 'selectingAction' },
  })

// Returns true if an action was consumed (actionsRemaining dropped, the
// turn/round advanced, or the game ended)
const actionConsumed = (
  actor: AnyActor,
  before: {
    actionsRemaining: number
    playerIndex: number
    round: number
    era: string
  },
) => {
  const snap = actor.getSnapshot() as any
  if (snap.matches('gameOver')) return true
  const c = snap.context
  return (
    c.currentPlayerIndex !== before.playerIndex ||
    c.round !== before.round ||
    c.era !== before.era ||
    c.actionsRemaining < before.actionsRemaining
  )
}

const turnState = (actor: AnyActor) => {
  const c = ctx(actor)
  return {
    actionsRemaining: c.actionsRemaining,
    playerIndex: c.currentPlayerIndex,
    round: c.round,
    era: c.era,
  }
}

/**
 * Answer any source question the machine is asking (beer for a sale, iron for
 * a build/develop) by taking the first source offered, until every unit is
 * assigned.
 *
 * The driver would otherwise stall on a material choice: SELECT_SALE parks it
 * in choosingBeerSource, its CONFIRM is ignored, and unwind() abandons the
 * sale. The plain policies happen almost never to produce a 2-source
 * situation, so `sourcePicks` counts every pick actually accepted by the
 * machine — the steered full-game test below asserts the choosing states
 * really were exercised rather than silently auto-skipped.
 */
const sourcePicks = { beer: 0, iron: 0 }
const resetSourcePicks = () => {
  sourcePicks.beer = 0
  sourcePicks.iron = 0
}

const answerSourceSteps = (actor: AnyActor) => {
  // One pick per unit; bounded so a bug can never spin here.
  for (let i = 0; i < 8; i++) {
    const c = ctx(actor)
    const beer = pendingBeerChoice(c)
    if (beer?.hasChoice && beer.options[0]) {
      const event = {
        type: 'SELECT_BEER_SOURCE',
        source: beer.options[0].source,
      } as any
      // The first option is always a legal pick; count only accepted sends
      // so the counter can never inflate on a guard refusal.
      if (!(actor.getSnapshot() as any).can(event)) return
      actor.send(event)
      sourcePicks.beer++
      continue
    }
    const iron = pendingIronChoice(c)
    if (iron?.hasChoice && iron.options[0]) {
      const event = {
        type: 'SELECT_IRON_SOURCE',
        source: iron.options[0].source,
      } as any
      if (!(actor.getSnapshot() as any).can(event)) return
      actor.send(event)
      sourcePicks.iron++
      continue
    }
    return
  }
}

// Back out of any half-finished action flow (guards can leave us in a
// confirming sub-state whose only exit is CANCEL)
const unwind = (actor: AnyActor) => {
  for (let i = 0; i < 5 && !isSelectingAction(actor); i++) {
    actor.send({ type: 'CANCEL' } as any)
  }
}

// --- Policy steps -----------------------------------------------------------

// With `onlyChoiceSales`, a sale is only attempted when its beer question is
// a material choice (2+ distinct sources) - probed via the same
// `beerChoiceForSale` the machine's guard reads, never re-derived by hand.
const trySell = (actor: AnyActor, onlyChoiceSales = false): boolean => {
  const c = ctx(actor)
  const player = currentPlayer(actor)

  const sellable = player.industries.filter(
    (i: any) =>
      !i.flipped && ['cotton', 'manufacturer', 'pottery'].includes(i.type),
  )
  if (sellable.length === 0 || player.hand.length === 0) return false

  const before = turnState(actor)
  actor.send({ type: 'SELL' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)

  // Attempt every industry x merchant combination; guards reject bad ones
  for (const industry of sellable) {
    for (const merchant of c.merchants) {
      if (!merchant.industryIcons.includes(industry.type)) continue
      if (onlyChoiceSales) {
        const probe = beerChoiceForSale(ctx(actor), currentPlayer(actor), {
          location: industry.location,
          industryType: industry.type,
          merchant: merchant.location,
        } as any)
        if (!probe?.hasChoice) continue
      }
      actor.send({
        type: 'SELECT_SALE',
        location: industry.location,
        industryType: industry.type,
        merchant: merchant.location,
      } as any)
      answerSourceSteps(actor)
    }
  }

  if (ctx(actor).salesMadeThisAction > 0) {
    actor.send({ type: 'CONFIRM' } as any)
    return actionConsumed(actor, before)
  }

  // Nothing sellable was accepted - back out
  unwind(actor)
  return false
}

// `preferredTypes` steers which industries get built first (both which hand
// card is tried and which slot type a location card attempts) without making
// anything legal that wasn't - guards still filter every attempt. With
// `onlyPreferred`, cards and slots outside the preferred types are not
// attempted at all (the caller wants exactly this industry or nothing).
const tryBuild = (
  actor: AnyActor,
  preferredTypes: string[] = [],
  onlyPreferred = false,
): boolean => {
  const player = currentPlayer(actor)
  if (player.money < 8 || player.hand.length === 0) return false

  const cityIds = Object.keys(cities).filter(
    (id) => (cities as any)[id].type === 'city',
  ) as CityId[]

  const prefersCard = (card: any) =>
    card.type === 'industry' &&
    card.industries.some((t: string) => preferredTypes.includes(t))
  const orderedHand = [
    ...player.hand.filter(prefersCard),
    ...player.hand.filter((card: any) => !prefersCard(card)),
  ]

  for (const card of orderedHand) {
    if (card.type !== 'location' && card.type !== 'industry') continue
    if (onlyPreferred && card.type === 'industry' && !prefersCard(card)) {
      continue
    }

    // Which slot types this card may attempt, preferred first
    const slots =
      card.type === 'location'
        ? (cityIndustrySlots[card.location as CityId] ?? [])
        : []
    const types = [...new Set(slots.flat())]
      .filter((t) => !onlyPreferred || preferredTypes.includes(t))
      .sort(
        (a, b) =>
          (preferredTypes.includes(b) ? 1 : 0) -
          (preferredTypes.includes(a) ? 1 : 0),
      )
    if (card.type === 'location' && types.length === 0) continue

    const before = turnState(actor)
    actor.send({ type: 'BUILD' } as any)
    actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)

    if (card.type === 'location') {
      for (const industryType of types) {
        actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as any)
        answerSourceSteps(actor)
        const snap = actor.getSnapshot() as any
        if (
          snap.matches({ playing: { action: { building: 'confirmingBuild' } } })
        ) {
          actor.send({ type: 'CONFIRM' } as any)
          if (actionConsumed(actor, before)) return true
          // Build failed or was guard-blocked - restart the flow cleanly
          unwind(actor)
          actor.send({ type: 'BUILD' } as any)
          actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)
        }
      }
    } else {
      // Industry card: try candidate locations; guards filter invalid ones
      for (const cityId of cityIds) {
        actor.send({ type: 'SELECT_LOCATION', cityId } as any)
        answerSourceSteps(actor)
        const snap = actor.getSnapshot() as any
        if (
          snap.matches({ playing: { action: { building: 'confirmingBuild' } } })
        ) {
          actor.send({ type: 'CONFIRM' } as any)
          if (actionConsumed(actor, before)) return true
          unwind(actor)
          actor.send({ type: 'BUILD' } as any)
          actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)
        }
      }
    }

    // Back out of this card's build flow
    unwind(actor)
  }
  return false
}

// `order` optionally re-sorts the era-legal candidate links (e.g. toward
// merchants); guards still decide what is actually buildable.
const tryNetwork = (
  actor: AnyActor,
  order?: (
    a: (typeof connections)[number],
    b: (typeof connections)[number],
  ) => number,
): boolean => {
  const c = ctx(actor)
  const player = currentPlayer(actor)
  if (player.money < 10 || player.hand.length === 0) return false

  const candidates = connections.filter((conn) =>
    (conn.types as readonly string[]).includes(c.era),
  )
  if (order) candidates.sort(order)

  const before = turnState(actor)
  actor.send({ type: 'NETWORK' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)

  for (const conn of candidates) {
    actor.send({
      type: 'SELECT_LINK',
      from: conn.from,
      to: conn.to,
    } as any)
    const snap = actor.getSnapshot() as any
    if (
      snap.matches({ playing: { action: { networking: 'confirmingLink' } } })
    ) {
      actor.send({ type: 'CONFIRM' } as any)
      if (actionConsumed(actor, before)) return true
      // Rejected or guard-blocked - restart the flow with a fresh hand read
      unwind(actor)
      actor.send({ type: 'NETWORK' } as any)
      actor.send({
        type: 'SELECT_CARD',
        cardId: currentPlayer(actor).hand[0].id,
      } as any)
    }
  }

  unwind(actor)
  return false
}

const tryLoan = (actor: AnyActor): boolean => {
  const player = currentPlayer(actor)
  if (player.hand.length === 0) return false
  const before = turnState(actor)
  actor.send({ type: 'TAKE_LOAN' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)
  actor.send({ type: 'CONFIRM' } as any)
  if (actionConsumed(actor, before)) return true
  unwind(actor)
  return false
}

const tryDevelop = (actor: AnyActor): boolean => {
  const player = currentPlayer(actor)
  if (player.money < 12 || player.hand.length === 0) return false

  // Pick an industry type with a developable tile (skip pottery - lightbulb
  // tiles may not be developed)
  const developableType = Object.entries(player.industryTilesOnMat).find(
    ([type, tiles]: [string, any]) =>
      type !== 'pottery' && tiles.some((t: any) => t.quantityAvailable > 0),
  )?.[0]
  if (!developableType) return false

  const before = turnState(actor)
  actor.send({ type: 'DEVELOP' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)
  actor.send({
    type: 'SELECT_TILES_FOR_DEVELOP',
    industryTypes: [developableType],
  } as any)
  answerSourceSteps(actor)
  actor.send({ type: 'CONFIRM' } as any)
  if (actionConsumed(actor, before)) return true
  unwind(actor)
  return false
}

const tryScout = (actor: AnyActor): boolean => {
  const c = ctx(actor)
  const player = currentPlayer(actor)
  // Scout burns 3 cards for one action - only when the hand can afford it,
  // no wild is already held, and the wild piles have cards
  if (player.hand.length < 4) return false
  if (
    player.hand.some(
      (card: any) =>
        card.type === 'wild_location' || card.type === 'wild_industry',
    )
  ) {
    return false
  }
  if (c.wildLocationPile.length === 0 || c.wildIndustryPile.length === 0) {
    return false
  }

  const before = turnState(actor)
  actor.send({ type: 'SCOUT' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[1].id } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[2].id } as any)
  actor.send({ type: 'CONFIRM' } as any)
  if (actionConsumed(actor, before)) return true
  unwind(actor)
  return false
}

const pass = (actor: AnyActor): boolean => {
  const before = turnState(actor)
  actor.send({ type: 'PASS' } as any)
  return actionConsumed(actor, before)
}

type Policy = (actor: AnyActor) => boolean

const greedyPolicy: Policy = (actor) => {
  const player = currentPlayer(actor)
  if (trySell(actor)) return true
  if (tryBuild(actor)) return true
  if (tryNetwork(actor)) return true
  if (player.money < 10 && tryLoan(actor)) return true
  return pass(actor)
}

const passOnlyPolicy: Policy = (actor) => pass(actor)

// Scout/develop-heavy mix: scouting burns 3 cards per action, so hands
// desynchronize across players - stresses the skip-empty-hand and era-end
// logic on a very different action distribution than greedyPolicy
const scoutDevelopPolicy: Policy = (actor) => {
  const player = currentPlayer(actor)
  if (trySell(actor)) return true
  if (player.hand.length >= 6 && tryScout(actor)) return true
  if (tryDevelop(actor)) return true
  if (tryBuild(actor)) return true
  if (player.money < 12 && tryLoan(actor)) return true
  return pass(actor)
}

// Distinct iron sources (owner+location of unflipped works with cubes) - a
// develop/iron-build asks the iron question only when there are 2+ of these
const distinctIronSources = (c: any): number => {
  const keys = new Set<string>()
  for (const p of c.players) {
    for (const i of p.industries) {
      if (i.type === 'iron' && !i.flipped && i.ironCubesOnTile > 0) {
        keys.add(`${p.id}:${i.location}`)
      }
    }
  }
  return keys.size
}

// Distinct own beer sources (unflipped breweries with barrels, per location).
// With 2+ of these, EVERY legal sale offers a material beer choice - own
// breweries supply sale beer from anywhere, no connection needed.
const ownBeerSources = (player: any): number => {
  const keys = new Set<string>()
  for (const i of player.industries) {
    if (i.type === 'brewery' && !i.flipped && i.beerBarrelsOnTile > 0) {
      keys.add(i.location)
    }
  }
  return keys.size
}

const hasUnflippedSellable = (player: any): boolean =>
  player.industries.some(
    (i: any) =>
      !i.flipped && ['cotton', 'manufacturer', 'pottery'].includes(i.type),
  )

// Static BFS hops from every location to the nearest merchant, over the full
// board graph - used only to ORDER link attempts, never to judge legality
const merchantDistances = (c: any): Map<string, number> => {
  const dist = new Map<string, number>()
  const queue: Array<[string, number]> = []
  for (const m of c.merchants) {
    if (!dist.has(m.location)) {
      dist.set(m.location, 0)
      queue.push([m.location, 0])
    }
  }
  while (queue.length > 0) {
    const [loc, d] = queue.shift()!
    for (const conn of connections) {
      const next =
        conn.from === loc ? conn.to : conn.to === loc ? conn.from : null
      if (next && !dist.has(next)) {
        dist.set(next, d + 1)
        queue.push([next, d + 1])
      }
    }
  }
  return dist
}

// Steered to manufacture source choices, which the plain policies never hit
// (measured 0 picks - they build merchant links so rarely that no goods are
// ever sold, and iron works flip on build while the market has room):
//   iron - build iron works and breweries first; while 2+ unflipped works
//          hold cubes, a develop (and any iron-consuming build) must ask
//          which works pays
//   beer - hoard goods, grow links toward merchants, and only sell while
//          holding 2 own beer sources, so the sale must ask which brewery
const sourceChoicePolicy: Policy = (actor) => {
  const c = ctx(actor)
  const player = currentPlayer(actor)
  const ironSources = distinctIronSources(c)
  if (ironSources >= 2 && tryDevelop(actor)) return true
  // Spam iron works until two hold cubes: each build sells cubes into the
  // market until it is full, after which a new works keeps its cubes - and
  // while an unflipped works exists all iron consumption drains IT (the
  // market is off limits, rules p.5), so the market stays full and the
  // second works survives long enough to make the question real.
  if (ironSources < 2 && tryBuild(actor, ['iron'], true)) return true
  // Sell only when the sale must ask where its beer comes from - one own
  // brewery plus the merchant's barrel (or a second brewery) is already a
  // material choice
  if (ownBeerSources(player) >= 1 && trySell(actor, true)) return true
  if (hasUnflippedSellable(player)) {
    const dist = merchantDistances(c)
    const score = (conn: any) =>
      Math.min(dist.get(conn.from) ?? 99, dist.get(conn.to) ?? 99)
    if (tryNetwork(actor, (a, b) => score(a) - score(b))) return true
  }
  if (tryBuild(actor, ['iron', 'brewery', 'cotton'])) return true
  if (player.money < 12 && tryLoan(actor)) return true
  return pass(actor)
}

// Shared post-game assertions for any completed full game
const expectCompletedGame = (
  actor: AnyActor,
  actions: number,
  playerCount: number,
) => {
  const snap = actor.getSnapshot() as any
  expect(snap.matches('gameOver')).toBe(true)
  expect(actions).toBeLessThan(1500)

  const c = snap.context
  expect(c.players).toHaveLength(playerCount)

  // The VP ledger must reconcile to the score the scoreboard shows — the
  // end screen renders the breakdown from these awards, so any drift is a
  // scoring bug surfacing as a wrong explanation.
  c.players.forEach((p: any) => {
    const summed = p.vpAwards.reduce((t: number, a: any) => t + a.vp, 0)
    expect(summed).toBe(p.victoryPoints)
  })

  // Both era transitions fired automatically (no TRIGGER_* events sent)
  expect(c.logs.some((l: any) => l.message === 'Canal Era ended')).toBe(true)
  expect(c.logs.some((l: any) => l.message === 'Rail Era started')).toBe(true)
  expect(c.logs.some((l: any) => l.message === 'Rail Era ended')).toBe(true)
  expect(c.logs.some((l: any) => l.message.includes('Game Over'))).toBe(true)
  expect(c.era).toBe('rail')

  // Deck and hands fully exhausted
  expect(c.drawPile).toHaveLength(0)
  c.players.forEach((p: any) => expect(p.hand).toHaveLength(0))

  // A winner is declared and it is the player with the most VPs
  // (ties broken by income, then money)
  expect(c.winners).not.toBeNull()
  expect(c.winners.length).toBeGreaterThanOrEqual(1)
  const ranked = [...c.players].sort(
    (a: any, b: any) =>
      b.victoryPoints - a.victoryPoints ||
      b.income - a.income ||
      b.money - a.money,
  ) as any[]
  expect(c.winners).toContain(ranked[0].id)

  // Sanity on final player state
  c.players.forEach((p: any) => {
    expect(p.victoryPoints).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(p.money)).toBe(true)
    expect(p.income).toBeGreaterThanOrEqual(-10)
    // Links were scored and removed in final era scoring
    expect(p.links).toHaveLength(0)
  })

  // Wild cards all returned to their draw areas (2 of each in the game)
  expect(c.wildLocationPile).toHaveLength(2)
  expect(c.wildIndustryPile).toHaveLength(2)

  return c
}

// Drive a game to completion with the given per-turn policy
const playFullGame = (actor: AnyActor, policy: Policy, maxActions = 1500) => {
  let actions = 0
  let stuckCount = 0

  while (!actor.getSnapshot().matches('gameOver') && actions < maxActions) {
    expect((actor.getSnapshot() as any).status).toBe('active')
    if (!isSelectingAction(actor)) {
      throw new Error(
        `Not in selectingAction after ${actions} actions: ${JSON.stringify((actor.getSnapshot() as any).value)} era=${ctx(actor).era} round=${ctx(actor).round} lastError=${ctx(actor).lastError}`,
      )
    }

    const acted = policy(actor)
    actions++

    if (!acted) {
      stuckCount++
      expect(stuckCount).toBeLessThan(3)
    } else {
      stuckCount = 0
    }
  }

  return actions
}

// --- Tests ------------------------------------------------------------------

describe('Brass Birmingham - Full Game Integration', () => {
  test('complete 2-player game runs from START_GAME to gameOver with a winner (mixed actions)', () => {
    const actor = startGame(2)

    const snap = actor.getSnapshot() as any
    expect(snap.context.era).toBe('canal')
    expect(snap.context.round).toBe(1)
    expect(snap.context.actionsRemaining).toBe(1)
    expect(snap.context.players[0].hand).toHaveLength(8)
    expect(snap.context.players[0].money).toBe(17)
    expect(snap.context.players[0].income).toBe(0) // marker on space 10 = level 0

    const actions = playFullGame(actor, greedyPolicy)
    expectCompletedGame(actor, actions, 2)
  }, 30000)

  test('complete 2-player game with a scout/develop-heavy action mix', () => {
    const actor = startGame(2)

    const actions = playFullGame(actor, scoutDevelopPolicy)
    const c = expectCompletedGame(actor, actions, 2)

    // The policy scouts whenever legal, so wild cards actually cycled
    // through hands and back to their draw areas during the game
    expect(c.logs.some((l: any) => l.message.includes('scouted'))).toBe(true)
  }, 30000)

  test('complete 3-player game with mixed actions', () => {
    const actor = startGame(3)

    // 3-player deck is 54 cards and includes cotton/manufacturer cards
    const snap = actor.getSnapshot() as any
    expect(snap.context.players).toHaveLength(3)
    expect(snap.context.players.every((p: any) => p.hand.length === 8)).toBe(
      true,
    )

    const actions = playFullGame(actor, greedyPolicy)
    const c = expectCompletedGame(actor, actions, 3)

    // 3p merchant setup includes Warrington
    expect(
      c.merchants.filter((m: any) => m.location === 'warrington'),
    ).toHaveLength(2)
  }, 30000)

  test('complete 4-player game with mixed actions', () => {
    const actor = startGame(4)

    const snap = actor.getSnapshot() as any
    expect(snap.context.players).toHaveLength(4)
    // 4-player deck: 64 cards − 32 dealt into hands − 4 into the starting
    // discard piles (rules l.402) leaves 28 to draw
    expect(snap.context.drawPile).toHaveLength(64 - 4 * 8 - 4)

    const actions = playFullGame(actor, greedyPolicy)
    const c = expectCompletedGame(actor, actions, 4)

    // 4p merchant setup includes Nottingham (9 merchant slots total)
    expect(
      c.merchants.filter((m: any) => m.location === 'nottingham'),
    ).toHaveLength(2)
    expect(c.merchants).toHaveLength(9)
  }, 30000)

  test('complete 3-player game reaches gameOver (pass-only variant)', () => {
    const actor = startGame(3)

    const actions = playFullGame(actor, passOnlyPolicy)
    const c = expectCompletedGame(actor, actions, 3)

    // A pass-only game builds nothing: everyone ends on 0 VP and the game
    // is a draw between all players (equal VP, income, money)
    expect(c.winners).toHaveLength(3)
    c.players.forEach((p: any) => expect(p.victoryPoints).toBe(0))
  }, 30000)

  test('full game exercises the resource-source choosing states (beer + iron)', () => {
    // The deck and merchants shuffle per game, so a single run is not
    // guaranteed to produce both questions - retry over fresh games (each one
    // still a complete, invariant-checked full game) and assert the choosing
    // states were genuinely entered. If they stopped being reachable (e.g.
    // the auto-skip guard went wrong), every attempt counts zero picks and
    // this fails loudly.
    const MAX_ATTEMPTS = 10
    resetSourcePicks()
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const actor = startGame(2)
      const actions = playFullGame(actor, sourceChoicePolicy)
      expectCompletedGame(actor, actions, 2)
      if (sourcePicks.beer > 0 && sourcePicks.iron > 0) break
    }
    expect(sourcePicks.iron).toBeGreaterThan(0)
    expect(sourcePicks.beer).toBeGreaterThan(0)
  }, 60000)

  test('game handles invalid actions gracefully during integration', () => {
    const actor = startGame(2)

    expect(() => {
      actor.send({ type: 'BUILD' } as any)
      actor.send({ type: 'CONFIRM' } as any) // No card selected
    }).not.toThrow()

    expect(() => {
      actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' } as any)
      actor.send({ type: 'CONFIRM' } as any)
    }).not.toThrow()

    expect((actor.getSnapshot() as any).status).toBe('active')
  })
})
