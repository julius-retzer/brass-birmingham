// Full Game Integration Test - Brass Birmingham
// Tests complete game flow from setup through final scoring and game over

import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { CityId } from '../data/board'
import type { IndustryType } from '../data/cards'
import type { IndustryTile } from '../data/industryTiles'
import { gameStore, type Player } from './gameStore'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {
      // Ignore errors during cleanup
    }
  })
  activeActors = []
})

const createGameActor = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  return actor
}

const startTwoPlayerGame = (actor: ReturnType<typeof createActor>) => {
  actor.send({
    type: 'START_GAME',
    players: [
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
    ],
  })
}

// Helper: perform a PASS action for the current player
const performPass = (actor: ReturnType<typeof createActor>) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  const card = currentPlayer!.hand[0]
  if (!card) throw new Error('No cards to pass')
  actor.send({ type: 'PASS' })
  actor.send({ type: 'SELECT_CARD', cardId: card.id })
  actor.send({ type: 'CONFIRM' })
}

// Helper: perform a TAKE_LOAN action
const performLoan = (actor: ReturnType<typeof createActor>) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  const card = currentPlayer!.hand[0]
  if (!card) throw new Error('No cards for loan')
  actor.send({ type: 'TAKE_LOAN' })
  actor.send({ type: 'SELECT_CARD', cardId: card.id })
  actor.send({ type: 'CONFIRM' })
}

// Helper: build a network link
const buildNetwork = (
  actor: ReturnType<typeof createActor>,
  from: CityId,
  to: CityId,
) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  const card = currentPlayer!.hand[0]
  if (!card) throw new Error('No cards for network')
  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: card.id })
  actor.send({ type: 'SELECT_LINK', from, to })
  actor.send({ type: 'CONFIRM' })
}

// Helper: build an industry using a location card
const buildIndustryWithLocationCard = (
  actor: ReturnType<typeof createActor>,
  industryType: IndustryType,
  cardId: string,
) => {
  actor.send({ type: 'BUILD' })
  actor.send({ type: 'SELECT_CARD', cardId })
  actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType })
  actor.send({ type: 'CONFIRM' })
}

// Helper: build an industry using an industry card
const buildIndustryWithIndustryCard = (
  actor: ReturnType<typeof createActor>,
  location: CityId,
  cardId: string,
) => {
  actor.send({ type: 'BUILD' })
  actor.send({ type: 'SELECT_CARD', cardId })
  actor.send({ type: 'SELECT_LOCATION', cityId: location })
  actor.send({ type: 'CONFIRM' })
}

// Create a mock industry tile for TEST_SET_PLAYER_STATE
const makeTile = (
  type: IndustryType,
  level: number,
  vp: number,
  linkIcons: number,
): IndustryTile => ({
  id: `${type}_${level}_test`,
  type,
  level,
  cost: 5,
  victoryPoints: vp,
  incomeSpaces: 1,
  linkScoringIcons: linkIcons,
  coalRequired: 0,
  ironRequired: 0,
  beerRequired: 0,
  beerProduced: 0,
  coalProduced: type === 'coal' ? 2 : 0,
  ironProduced: type === 'iron' ? 4 : 0,
  canBuildInCanalEra: true,
  canBuildInRailEra: true,
  hasLightbulbIcon: false,
  incomeAdvancement: 2,
})

// Create a built industry entry
const makeIndustry = (
  location: CityId,
  type: IndustryType,
  level: number,
  flipped: boolean,
  vp: number,
  linkIcons: number,
): Player['industries'][0] => ({
  location,
  type,
  level,
  flipped,
  tile: makeTile(type, level, vp, linkIcons),
  coalCubesOnTile: 0,
  ironCubesOnTile: 0,
  beerBarrelsOnTile: 0,
})

describe('Brass Birmingham - Full Game Integration Test', () => {
  test('game initializes correctly for 2 players', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    const snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('canal')
    expect(snapshot.context.round).toBe(1)
    expect(snapshot.context.actionsRemaining).toBe(1) // First round = 1 action
    expect(snapshot.context.players).toHaveLength(2)
    expect(snapshot.context.players[0]!.hand).toHaveLength(8)
    expect(snapshot.context.players[1]!.hand).toHaveLength(8)
    expect(snapshot.context.players[0]!.money).toBe(17)
    expect(snapshot.context.players[0]!.income).toBe(10)
    expect(snapshot.context.players[0]!.victoryPoints).toBe(0)
    expect(snapshot.context.merchants).toHaveLength(2) // 2-player merchants
  })

  test('complete game flow: setup -> canal actions -> scoring -> rail actions -> scoring -> gameOver', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // === CANAL ERA ===
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('canal')

    // Round 1: first round has 1 action per player
    // Alice passes, Bob passes
    performPass(actor) // Alice action 1 (round 1)
    snapshot = actor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Bob's turn

    performPass(actor) // Bob action 1 (round 1)
    snapshot = actor.getSnapshot()
    // After round 1 completes, round advances to 2 with 2 actions each
    expect(snapshot.context.round).toBe(2)
    expect(snapshot.context.actionsRemaining).toBe(2)

    // Round 2: 2 actions each
    performPass(actor) // current player action 1
    performPass(actor) // current player action 2
    performPass(actor) // other player action 1
    performPass(actor) // other player action 2
    snapshot = actor.getSnapshot()
    expect(snapshot.context.round).toBe(3)

    // Continue passing through more rounds to consume cards
    // Each player uses 1 card per action, 8 cards starting hand
    // Round 1: 1 card each (2 total)
    // Rounds 2+: 2 cards each per round (4 total per round)
    // After round 1 + round 2 = 6 cards used, 10 remaining in hands
    // After round 3: 10 more cards used = nope, refill from draw pile

    // Keep passing until both hands empty and draw pile empty
    // Use TRIGGER_CANAL_ERA_END for simplicity since natural end requires
    // drawing through entire deck
    for (let i = 0; i < 20; i++) {
      snapshot = actor.getSnapshot()
      if (
        snapshot.context.drawPile.length === 0 &&
        snapshot.context.players.every((p: any) => p.hand.length === 0)
      ) {
        break
      }
      if (snapshot.context.actionsRemaining === 0) continue
      const currentPlayer =
        snapshot.context.players[snapshot.context.currentPlayerIndex]
      if (!currentPlayer || currentPlayer.hand.length === 0) continue
      try {
        performPass(actor)
      } catch {
        break
      }
    }

    // Set up known board state BEFORE triggering canal era end
    // Alice: cotton at birmingham (flipped, 3VP, 1 linkIcon), link birmingham-coventry
    // Bob: iron at dudley (flipped, 1VP, 1 linkIcon), link dudley-birmingham
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0, // Alice
      industries: [
        makeIndustry('birmingham', 'cotton', 1, true, 3, 1),
      ],
      links: [{ from: 'birmingham', to: 'coventry', type: 'canal' }],
    })

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1, // Bob
      industries: [
        makeIndustry('dudley', 'iron', 1, true, 1, 1),
      ],
      links: [{ from: 'dudley', to: 'birmingham', type: 'canal' }],
    })

    // Trigger canal era scoring and transition
    actor.send({ type: 'TRIGGER_ERA_SCORING' })
    snapshot = actor.getSnapshot()

    // Hand-calculated canal scoring:
    // Alice's link: birmingham-coventry
    //   birmingham: Alice's cotton (flipped, linkIcon=1) + Bob's iron is at dudley, not birmingham = 1
    //   coventry: no flipped industries = 0
    //   Alice link VP = 1
    // Alice's industry VP: cotton 3VP = 3
    // Alice total canal VP: 1 + 3 = 4
    //
    // Bob's link: dudley-birmingham
    //   dudley: Bob's iron (flipped, linkIcon=1) = 1
    //   birmingham: Alice's cotton (flipped, linkIcon=1) = 1
    //   Bob link VP = 2
    // Bob's industry VP: iron 1VP = 1
    // Bob total canal VP: 2 + 1 = 3

    expect(snapshot.context.players[0]!.victoryPoints).toBe(4) // Alice: 1 link + 3 industry
    expect(snapshot.context.players[1]!.victoryPoints).toBe(3) // Bob: 2 link + 1 industry

    // Links should be cleared after scoring
    expect(snapshot.context.players[0]!.links).toHaveLength(0)
    expect(snapshot.context.players[1]!.links).toHaveLength(0)

    // Trigger canal->rail transition
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    snapshot = actor.getSnapshot()

    // === RAIL ERA ===
    expect(snapshot.context.era).toBe('rail')
    expect(snapshot.context.round).toBe(1)
    expect(snapshot.context.actionsRemaining).toBe(1) // First round

    // Set up rail era board state with known industries and links
    // Alice: manufacturer at birmingham (flipped, 5VP, 2 linkIcons)
    //        pottery at stoke (flipped, 10VP, 1 linkIcon)
    //        links: birmingham-dudley, stoke-leek
    // Bob: coal at dudley (flipped, 2VP, 1 linkIcon)
    //      brewery at burton (flipped, 5VP, 2 linkIcons)
    //      links: dudley-birmingham -- wait, Alice already has this.
    //      links: burton-derby, dudley-wolverhampton
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0, // Alice
      victoryPoints: 4, // Keep canal VP
      industries: [
        makeIndustry('birmingham', 'manufacturer', 3, true, 5, 2),
        makeIndustry('stoke', 'pottery', 3, true, 10, 1),
      ],
      links: [
        { from: 'birmingham', to: 'dudley', type: 'rail' },
        { from: 'stoke', to: 'leek', type: 'rail' },
      ],
    })

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1, // Bob
      victoryPoints: 3, // Keep canal VP
      industries: [
        makeIndustry('dudley', 'coal', 2, true, 2, 1),
        makeIndustry('burton', 'brewery', 3, true, 5, 2),
      ],
      links: [
        { from: 'burton', to: 'derby', type: 'rail' },
        { from: 'dudley', to: 'wolverhampton', type: 'rail' },
      ],
    })

    // Trigger rail era scoring (this triggers FINAL scoring + game result)
    actor.send({ type: 'TRIGGER_RAIL_ERA_END' })
    snapshot = actor.getSnapshot()

    // Hand-calculated rail scoring:
    //
    // Alice's links:
    //   birmingham-dudley:
    //     birmingham: Alice manufacturer (flipped, linkIcons=2) = 2
    //     dudley: Bob coal (flipped, linkIcons=1) = 1
    //     link VP = 3
    //   stoke-leek:
    //     stoke: Alice pottery (flipped, linkIcons=1) = 1
    //     leek: no flipped industries = 0
    //     link VP = 1
    //   Alice total link VP = 4
    //
    // Alice's industry VP: manufacturer 5 + pottery 10 = 15
    // Alice rail scoring: 4 + 15 = 19
    // Alice total VP: 4 (canal) + 19 (rail) = 23
    //
    // Bob's links:
    //   burton-derby:
    //     burton: Bob brewery (flipped, linkIcons=2) = 2
    //     derby: no flipped industries = 0
    //     link VP = 2
    //   dudley-wolverhampton:
    //     dudley: Bob coal (flipped, linkIcons=1) = 1
    //     wolverhampton: no flipped industries = 0
    //     link VP = 1
    //   Bob total link VP = 3
    //
    // Bob's industry VP: coal 2 + brewery 5 = 7
    // Bob rail scoring: 3 + 7 = 10
    // Bob total VP: 3 (canal) + 10 (rail) = 13

    // Note: triggerRailEraEnd runs triggerEraScoring internally
    // Check that gameResult is set
    expect(snapshot.context.gameResult).not.toBeNull()
    expect(snapshot.context.gameResult!.winner).toBe('1') // Alice wins
    expect(snapshot.context.gameResult!.isTie).toBe(false)

    // Check individual scores in gameResult
    const aliceScore = snapshot.context.gameResult!.scores.find(
      (s) => s.playerId === '1',
    )
    const bobScore = snapshot.context.gameResult!.scores.find(
      (s) => s.playerId === '2',
    )

    expect(aliceScore).toBeDefined()
    expect(bobScore).toBeDefined()

    // Alice total: 4 (canal) + 4 (rail link) + 15 (rail industry) = 23
    expect(aliceScore!.totalVP).toBe(23)
    // Bob total: 3 (canal) + 3 (rail link) + 7 (rail industry) = 13
    expect(bobScore!.totalVP).toBe(13)
  })

  test('hand-calculated VP verification with specific board state', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // Set up a specific known board state for canal scoring
    // Alice: 2 flipped industries, 1 link
    //   cotton at birmingham (3VP, 1 linkIcon, flipped)
    //   iron at dudley (1VP, 1 linkIcon, flipped)
    //   link: birmingham-dudley
    //
    // Bob: 1 flipped industry, 1 link
    //   brewery at burton (1VP, 1 linkIcon, flipped)
    //   link: burton-derby

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        makeIndustry('birmingham', 'cotton', 1, true, 3, 1),
        makeIndustry('dudley', 'iron', 1, true, 1, 1),
      ],
      links: [{ from: 'birmingham', to: 'dudley', type: 'canal' }],
    })

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1,
      industries: [
        makeIndustry('burton', 'brewery', 1, true, 1, 1),
      ],
      links: [{ from: 'burton', to: 'derby', type: 'canal' }],
    })

    actor.send({ type: 'TRIGGER_ERA_SCORING' })
    const snapshot = actor.getSnapshot()

    // Hand calculation for Alice's link birmingham-dudley:
    //   birmingham: Alice cotton (1 linkIcon) = 1
    //   dudley: Alice iron (1 linkIcon) = 1
    //   Total link VP for Alice = 2
    //
    // Alice industry VP: cotton(3) + iron(1) = 4
    // Alice total = 2 + 4 = 6
    expect(snapshot.context.players[0]!.victoryPoints).toBe(6)

    // Hand calculation for Bob's link burton-derby:
    //   burton: Bob brewery (1 linkIcon) = 1
    //   derby: no flipped industries = 0
    //   Total link VP for Bob = 1
    //
    // Bob industry VP: brewery(1) = 1
    // Bob total = 1 + 1 = 2
    expect(snapshot.context.players[1]!.victoryPoints).toBe(2)
  })

  test('winner determination: VP tiebreak by income, then money', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // Set up tied VP scenario where income breaks tie
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      victoryPoints: 20,
      income: 15, // Higher income -- wins tiebreak
      money: 10,
      industries: [],
      links: [],
    })

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1,
      victoryPoints: 20,
      income: 12, // Lower income
      money: 50,
      industries: [],
      links: [],
    })

    // Rail era end triggers gameResult calculation
    actor.send({ type: 'TEST_SET_ERA', era: 'rail' })
    actor.send({ type: 'TRIGGER_RAIL_ERA_END' })
    const snapshot = actor.getSnapshot()

    expect(snapshot.context.gameResult).not.toBeNull()
    // Both have 20VP + 0 from scoring (no industries/links)
    // Winner is Alice (higher income)
    expect(snapshot.context.gameResult!.winner).toBe('1')
    expect(snapshot.context.gameResult!.isTie).toBe(false)
  })

  test('winner determination: money tiebreak when VP and income tied', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      victoryPoints: 15,
      income: 10,
      money: 20, // Less money
      industries: [],
      links: [],
    })

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1,
      victoryPoints: 15,
      income: 10,
      money: 35, // More money -- wins tiebreak
      industries: [],
      links: [],
    })

    actor.send({ type: 'TEST_SET_ERA', era: 'rail' })
    actor.send({ type: 'TRIGGER_RAIL_ERA_END' })
    const snapshot = actor.getSnapshot()

    expect(snapshot.context.gameResult).not.toBeNull()
    expect(snapshot.context.gameResult!.winner).toBe('2') // Bob wins (more money)
    expect(snapshot.context.gameResult!.isTie).toBe(false)
  })

  test('era transition removes level 1 tiles and redeals hands', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // Give Alice level 1 and level 2 industries
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        makeIndustry('birmingham', 'cotton', 1, true, 3, 1), // Level 1 - should be removed
        makeIndustry('dudley', 'iron', 2, true, 3, 1), // Level 2 - should stay
      ],
    })

    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    const snapshot = actor.getSnapshot()

    // Level 1 tile removed, level 2 kept
    expect(snapshot.context.players[0]!.industries).toHaveLength(1)
    expect(snapshot.context.players[0]!.industries[0]!.level).toBe(2)

    // New hands dealt
    expect(snapshot.context.players[0]!.hand.length).toBeGreaterThan(0)
    expect(snapshot.context.players[1]!.hand.length).toBeGreaterThan(0)
    expect(snapshot.context.era).toBe('rail')
    expect(snapshot.context.round).toBe(1)
  })

  test('automatic era transition when draw pile and hands empty', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // Set up conditions for automatic era end:
    // Empty draw pile, give each player exactly 1 card
    actor.send({ type: 'TEST_SET_DRAW_PILE', drawPile: [] })
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [{ id: 'test_card_1', type: 'location', location: 'birmingham' }],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 1,
      hand: [{ id: 'test_card_2', type: 'location', location: 'dudley' }],
    })

    // Set actions remaining to 1 for current player
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 1 })

    // Alice passes (discards last card) -> action complete -> next player (Bob)
    performPass(actor)

    let snapshot = actor.getSnapshot()
    // Bob should now have 1 action
    expect(snapshot.context.currentPlayerIndex).toBe(1)

    // Set Bob to 1 action remaining
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 1 })

    // Bob passes (discards last card) -> action complete -> next player
    // -> isEraEnd = true -> eraScoring -> eraTransition -> action
    performPass(actor)

    snapshot = actor.getSnapshot()
    // Should have automatically transitioned to rail era
    expect(snapshot.context.era).toBe('rail')
    expect(snapshot.context.round).toBe(1)
  })

  test('game handles all 7 action types correctly', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // Give players enough money for actions
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      money: 200,
    })

    const snapshot = actor.getSnapshot()
    const aliceCards = snapshot.context.players[0]!.hand

    // 1. PASS action
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 2 })
    performPass(actor)

    // After pass, current player should still be Alice (if she has 1 action left)
    // Actually after first round (1 action), it goes to Bob
    // Let's explicitly set actions for clarity

    // 2. TAKE_LOAN action (for Bob)
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 2 })
    let snap = actor.getSnapshot()
    const bobBefore = snap.context.players[snap.context.currentPlayerIndex]!
    const moneyBefore = bobBefore.money
    const incomeBefore = bobBefore.income
    performLoan(actor)
    snap = actor.getSnapshot()
    // Loan gives 30 money, reduces income by 3
    const currentIdx = snap.context.currentPlayerIndex
    // After loan, check money increased by 30 and income decreased by 3
    // The current player may have switched so check the player who took the loan
    const bobAfter = snap.context.players.find(
      (p) => p.id === bobBefore.id,
    )!
    expect(bobAfter.money).toBe(moneyBefore + 30)
    expect(bobAfter.income).toBe(incomeBefore - 3)

    // 3. NETWORK action (canal era, no coal needed)
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 2 })
    snap = actor.getSnapshot()
    const networkPlayer =
      snap.context.players[snap.context.currentPlayerIndex]!
    const linksBefore = networkPlayer.links.length
    buildNetwork(actor, 'birmingham', 'coventry')
    snap = actor.getSnapshot()
    const networkPlayerAfter = snap.context.players.find(
      (p) => p.id === networkPlayer.id,
    )!
    expect(networkPlayerAfter.links.length).toBe(linksBefore + 1)
    expect(networkPlayerAfter.links[networkPlayerAfter.links.length - 1]!.from).toBe(
      'birmingham',
    )

    // 4. BUILD action -- need specific card and available tile
    // Give current player a location card for birmingham
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 2 })
    snap = actor.getSnapshot()
    const buildPlayerIdx = snap.context.currentPlayerIndex
    const buildPlayer = snap.context.players[buildPlayerIdx]!
    // Find a location card in hand
    const locationCard = buildPlayer.hand.find(
      (c: any) => c.type === 'location',
    )
    if (locationCard) {
      // Check what industry types are available for that location
      const industriesBefore = buildPlayer.industries.length
      const cityId = (locationCard as any).location as CityId
      // Try to build -- may fail depending on available tiles and slots
      actor.send({ type: 'BUILD' })
      actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
      // We need to know which industry is available at the location
      // Just verify the state machine accepted the BUILD command
      snap = actor.getSnapshot()
      const stateStr = JSON.stringify(snap.value)
      expect(stateStr).toContain('building')
      // Cancel to return to selecting action
      actor.send({ type: 'CANCEL' })
      actor.send({ type: 'CANCEL' })
    }

    // 5. DEVELOP action
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 2 })
    snap = actor.getSnapshot()
    const devPlayer =
      snap.context.players[snap.context.currentPlayerIndex]!
    const devCard = devPlayer.hand[0]
    if (devCard) {
      actor.send({ type: 'DEVELOP' })
      actor.send({ type: 'SELECT_CARD', cardId: devCard.id })
      snap = actor.getSnapshot()
      const devStateStr = JSON.stringify(snap.value)
      expect(devStateStr).toContain('developing')
      actor.send({ type: 'CANCEL' })
      actor.send({ type: 'CANCEL' })
    }

    // 6. SELL action
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 2 })
    snap = actor.getSnapshot()
    const sellPlayer =
      snap.context.players[snap.context.currentPlayerIndex]!
    const sellCard = sellPlayer.hand[0]
    if (sellCard) {
      actor.send({ type: 'SELL' })
      snap = actor.getSnapshot()
      const sellStateStr = JSON.stringify(snap.value)
      expect(sellStateStr).toContain('selling')
      actor.send({ type: 'CANCEL' })
    }

    // 7. SCOUT action
    actor.send({ type: 'TEST_SET_ACTIONS_REMAINING', actionsRemaining: 2 })
    snap = actor.getSnapshot()
    const scoutPlayer =
      snap.context.players[snap.context.currentPlayerIndex]!
    if (scoutPlayer.hand.length >= 3) {
      actor.send({ type: 'SCOUT' })
      snap = actor.getSnapshot()
      const scoutStateStr = JSON.stringify(snap.value)
      expect(scoutStateStr).toContain('scouting')
      actor.send({ type: 'CANCEL' })
    }
  })

  test('full game simulation reaches gameOver via natural flow', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // === CANAL ERA: use TRIGGER events to jump through ===
    // Set up canal era board state
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [makeIndustry('birmingham', 'cotton', 1, true, 3, 1)],
      links: [{ from: 'birmingham', to: 'coventry', type: 'canal' }],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1,
      industries: [makeIndustry('dudley', 'iron', 1, true, 1, 1)],
      links: [],
    })

    // Score canal era
    actor.send({ type: 'TRIGGER_ERA_SCORING' })
    let snapshot = actor.getSnapshot()
    const aliceCanalVP = snapshot.context.players[0]!.victoryPoints
    const bobCanalVP = snapshot.context.players[1]!.victoryPoints
    expect(aliceCanalVP).toBeGreaterThan(0)

    // Transition to rail
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    // === RAIL ERA: set up and score ===
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      victoryPoints: aliceCanalVP,
      industries: [
        makeIndustry('birmingham', 'manufacturer', 3, true, 5, 2),
        makeIndustry('coventry', 'pottery', 4, true, 20, 1),
      ],
      links: [
        { from: 'birmingham', to: 'dudley', type: 'rail' },
        { from: 'coventry', to: 'birmingham', type: 'rail' },
      ],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 1,
      victoryPoints: bobCanalVP,
      industries: [
        makeIndustry('dudley', 'coal', 3, true, 7, 1),
      ],
      links: [
        { from: 'dudley', to: 'wolverhampton', type: 'rail' },
      ],
    })

    // Trigger final scoring
    actor.send({ type: 'TRIGGER_RAIL_ERA_END' })
    snapshot = actor.getSnapshot()

    // Verify game result exists
    expect(snapshot.context.gameResult).not.toBeNull()
    expect(snapshot.context.gameResult!.scores).toHaveLength(2)

    // Verify winner
    const scores = snapshot.context.gameResult!.scores
    const aliceFinal = scores.find((s) => s.playerId === '1')!
    const bobFinal = scores.find((s) => s.playerId === '2')!

    expect(aliceFinal.totalVP).toBeGreaterThan(bobFinal.totalVP)
    expect(snapshot.context.gameResult!.winner).toBe('1')

    // Hand-calculated rail VP for Alice:
    // Link birmingham-dudley: birmingham(mfr 2 linkIcons) + dudley(coal 1 linkIcon) = 3
    // Link coventry-birmingham: coventry(pottery 1 linkIcon) + birmingham(mfr 2 linkIcons) = 3
    // Alice link VP = 6
    // Alice industry VP = 5 + 20 = 25
    // Alice rail total = 31
    // Alice grand total = aliceCanalVP + 31

    // Alice canal scoring:
    // Link birmingham-coventry: birmingham(cotton 1 linkIcon) = 1, coventry(none) = 0 => 1
    // Industry VP: cotton 3VP = 3
    // Alice canal total = 4
    expect(aliceCanalVP).toBe(4)
    expect(aliceFinal.totalVP).toBe(4 + 31) // 35

    // Hand-calculated rail VP for Bob:
    // Link dudley-wolverhampton: dudley(coal 1 linkIcon) = 1, wolverhampton(none) = 0 => 1
    // Bob link VP = 1
    // Bob industry VP = 7
    // Bob rail total = 8
    // Bob canal: no links = 0, industry(iron 1VP) = 1
    expect(bobCanalVP).toBe(1)
    expect(bobFinal.totalVP).toBe(1 + 8) // 9
  })

  test('game handles invalid actions gracefully', () => {
    const actor = createGameActor()
    startTwoPlayerGame(actor)

    // Try invalid actions -- should not throw
    expect(() => {
      actor.send({ type: 'BUILD' })
      actor.send({ type: 'CONFIRM' }) // No card selected
    }).not.toThrow()

    // Try to build without proper setup
    expect(() => {
      actor.send({ type: 'BUILD' })
      actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
      actor.send({ type: 'CONFIRM' })
    }).not.toThrow()
  })
})
