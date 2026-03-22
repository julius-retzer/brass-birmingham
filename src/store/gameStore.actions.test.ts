// Game Actions Tests - Loan, Pass, and basic actions + selection actions
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'
import type { Card } from '../data/cards'

// Track actors for cleanup
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
  actor.start()

  const players = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
  ]

  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const takeLoanAction = (actor: ReturnType<typeof createActor>) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  const cardToDiscard = currentPlayer!.hand[0]

  actor.send({ type: 'TAKE_LOAN' })
  actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard!.id })
  actor.send({ type: 'CONFIRM' })

  return { cardToDiscard }
}

describe('Game Store - Actions', () => {
  test('loan action - basic mechanics', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = initialPlayer.money
    const initialIncome = initialPlayer.income
    const initialHandSize = initialPlayer.hand.length

    const { cardToDiscard } = takeLoanAction(actor)
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!

    // Verify loan effects
    expect(updatedPlayer.money).toBe(initialMoney + 30) // +£30
    expect(updatedPlayer.income).toBe(Math.max(-10, initialIncome - 3)) // -3 income, min -10
    expect(updatedPlayer.hand.length).toBe(initialHandSize) // Hand refilled
    expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)
  })

  test('loan action - income cannot go below -10', () => {
    const { actor } = setupGame()

    // Take multiple loans to test minimum income
    for (let i = 0; i < 8; i++) {
      takeLoanAction(actor)
      if (i < 7) takeLoanAction(actor) // Player 2 also takes loans
    }

    const snapshot = actor.getSnapshot()
    const player = snapshot.context.players[0]!

    // After multiple loans: income should be capped at -10
    expect(player.income).toBe(-10)
  })

  test('pass action - basic mechanics', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const currentPlayer =
      snapshot.context.players[snapshot.context.currentPlayerIndex]
    const cardToDiscard = currentPlayer!.hand[0]

    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard!.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Advanced to next player
  })

  test('turn progression - round 1 has 1 action each', () => {
    const { actor } = setupGame()

    // Player 1 takes loan
    takeLoanAction(actor)
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Now Player 2's turn

    // Player 2 takes loan
    takeLoanAction(actor)
    snapshot = actor.getSnapshot()

    // Should advance to round 2 with Player 1 going first
    expect(snapshot.context.currentPlayerIndex).toBe(0)
    expect(snapshot.context.round).toBe(2)
    expect(snapshot.context.actionsRemaining).toBe(2) // Round 2+ = 2 actions
  })

  test('turn progression - round 2+ has 2 actions each', () => {
    const { actor } = setupGame()

    // Get to round 2
    takeLoanAction(actor) // Player 1
    takeLoanAction(actor) // Player 2

    let snapshot = actor.getSnapshot()
    expect(snapshot.context.round).toBe(2)
    expect(snapshot.context.actionsRemaining).toBe(2)

    // Player 1 takes 2 actions
    takeLoanAction(actor)
    snapshot = actor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(0) // Still Player 1
    expect(snapshot.context.actionsRemaining).toBe(1)

    takeLoanAction(actor)
    snapshot = actor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Now Player 2
    expect(snapshot.context.actionsRemaining).toBe(2)
  })

  test('hand refilling after actions', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const initialHandSize = snapshot.context.players[0]!.hand.length

    takeLoanAction(actor)
    snapshot = actor.getSnapshot()

    // Hand should be refilled to original size after action
    expect(snapshot.context.players[0]!.hand.length).toBe(initialHandSize)
  })
})

describe('Game Store - selectIndustryType', () => {
  test('selectIndustryType sets selectedIndustryTile to lowest available tile', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const pid = snapshot.context.currentPlayerIndex

    // Give player industry tiles on mat
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industryTilesOnMat: {
        cotton: [
          {
            tile: {
              id: 'cotton_2', type: 'cotton', level: 2,
              canBuildInCanalEra: true, canBuildInRailEra: true,
              incomeAdvancement: 3, victoryPoints: 5, beerRequired: 1, cost: 14,
              incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0,
              beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: false, quantity: 3,
            },
            quantityAvailable: 2,
          },
          {
            tile: {
              id: 'cotton_1', type: 'cotton', level: 1,
              canBuildInCanalEra: true, canBuildInRailEra: true,
              incomeAdvancement: 2, victoryPoints: 3, beerRequired: 1, cost: 10,
              incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0,
              beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: false, quantity: 3,
            },
            quantityAvailable: 1,
          },
        ],
        coal: [],
        iron: [],
        manufacturer: [],
        pottery: [],
        brewery: [],
      } as any,
    })

    // Use a location card (e.g. wild_location) which routes to selectingIndustryType via isLocationCard guard
    const wildLocationCard: Card = { id: 'wild-loc-industry-test', type: 'wild_location' }
    snapshot = actor.getSnapshot()
    const hand = [...snapshot.context.players[pid]!.hand, wildLocationCard]
    actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: pid, hand })

    // Enter build flow with wild_location card -> goes to selectingIndustryType
    actor.send({ type: 'BUILD' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: wildLocationCard.id })
    snapshot = actor.getSnapshot()

    // Should be in selectingIndustryType (location cards go here)
    expect(snapshot.matches({ playing: { action: { building: 'selectingIndustryType' } } })).toBe(true)

    // Select cotton industry type - with location card, isLocationCardSelected guard fires -> confirmingBuild
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' })
    snapshot = actor.getSnapshot()

    // Should have selected the lowest available tile (level 1)
    expect(snapshot.context.selectedIndustryTile).toBeDefined()
    expect(snapshot.context.selectedIndustryTile!.level).toBe(1)
    expect(snapshot.context.selectedIndustryTile!.type).toBe('cotton')
  })

  test('selectIndustryType with location card auto-sets selectedLocation', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const pid = snapshot.context.currentPlayerIndex

    // Give player industry tiles on mat
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industryTilesOnMat: {
        cotton: [
          {
            tile: {
              id: 'cotton_1', type: 'cotton', level: 1,
              canBuildInCanalEra: true, canBuildInRailEra: true,
              incomeAdvancement: 2, victoryPoints: 3, beerRequired: 1, cost: 10,
              incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0,
              beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: false, quantity: 3,
            },
            quantityAvailable: 2,
          },
        ],
        coal: [],
        iron: [],
        manufacturer: [],
        pottery: [],
        brewery: [],
      } as any,
    })

    // Give player a real location card (has .location field which triggers auto-location-select)
    const locationCard: Card = { id: 'loc-birmingham-test', type: 'location', location: 'birmingham', color: 'blue' } as any
    snapshot = actor.getSnapshot()
    const hand = [...snapshot.context.players[pid]!.hand, locationCard]
    actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: pid, hand })

    // Enter build flow with location card -> isLocationCard guard -> selectingIndustryType
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    snapshot = actor.getSnapshot()

    // isLocationCard guard fires -> goes to selectingIndustryType
    expect(snapshot.matches({ playing: { action: { building: 'selectingIndustryType' } } })).toBe(true)

    // Select cotton - with location card, isLocationCardSelected guard fires -> confirmingBuild directly
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' })
    snapshot = actor.getSnapshot()

    // With isLocationCardSelected guard, should go to confirmingBuild directly
    expect(snapshot.matches({ playing: { action: { building: 'confirmingBuild' } } })).toBe(true)
    expect(snapshot.context.selectedIndustryTile).toBeDefined()
    // Location should be auto-set from the location card
    expect(snapshot.context.selectedLocation).toBe('birmingham')
  })
})

describe('Game Store - selectTilesForDevelop', () => {
  test('selectTilesForDevelop validates and sets selected tiles', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const pid = snapshot.context.currentPlayerIndex

    // Give player developable tiles on mat
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industryTilesOnMat: {
        cotton: [
          {
            tile: {
              id: 'cotton_1', type: 'cotton', level: 1,
              canBuildInCanalEra: true, canBuildInRailEra: true,
              incomeAdvancement: 2, victoryPoints: 3, beerRequired: 1, cost: 10,
              incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0,
              beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: false, quantity: 3,
            },
            quantityAvailable: 2,
          },
        ],
        coal: [
          {
            tile: {
              id: 'coal_1', type: 'coal', level: 1,
              canBuildInCanalEra: true, canBuildInRailEra: true,
              incomeAdvancement: 4, victoryPoints: 1, beerRequired: 0, cost: 5,
              incomeSpaces: 4, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0,
              beerProduced: 0, coalProduced: 2, ironProduced: 0, hasLightbulbIcon: false, quantity: 2,
            },
            quantityAvailable: 1,
          },
        ],
        iron: [],
        manufacturer: [],
        pottery: [],
        brewery: [],
      } as any,
    })

    // Enter develop flow
    actor.send({ type: 'DEVELOP' })
    snapshot = actor.getSnapshot()

    // Select a card for develop
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[pid]!.hand[0]!.id })
    snapshot = actor.getSnapshot()

    // Should be in selectingTiles
    expect(snapshot.matches({ playing: { action: { developing: 'selectingTiles' } } })).toBe(true)

    // Select tiles for develop
    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['cotton', 'coal'] })
    snapshot = actor.getSnapshot()

    // Should be in confirmingDevelop with tiles selected
    expect(snapshot.matches({ playing: { action: { developing: 'confirmingDevelop' } } })).toBe(true)
    expect(snapshot.context.selectedTilesForDevelop).toHaveLength(2)
    expect(snapshot.context.selectedTilesForDevelop).toContain('cotton')
    expect(snapshot.context.selectedTilesForDevelop).toContain('coal')
  })

  test('selectTilesForDevelop limits to max 2 tiles', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const pid = snapshot.context.currentPlayerIndex

    // Give player 3 types of developable tiles
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industryTilesOnMat: {
        cotton: [{ tile: { id: 'c1', type: 'cotton', level: 1, canBuildInCanalEra: true, canBuildInRailEra: true, incomeAdvancement: 2, victoryPoints: 3, beerRequired: 1, cost: 10, incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0, beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: false, quantity: 3 }, quantityAvailable: 2 }],
        coal: [{ tile: { id: 'co1', type: 'coal', level: 1, canBuildInCanalEra: true, canBuildInRailEra: true, incomeAdvancement: 4, victoryPoints: 1, beerRequired: 0, cost: 5, incomeSpaces: 4, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0, beerProduced: 0, coalProduced: 2, ironProduced: 0, hasLightbulbIcon: false, quantity: 2 }, quantityAvailable: 1 }],
        iron: [{ tile: { id: 'i1', type: 'iron', level: 1, canBuildInCanalEra: true, canBuildInRailEra: true, incomeAdvancement: 3, victoryPoints: 3, beerRequired: 0, cost: 8, incomeSpaces: 3, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0, beerProduced: 0, coalProduced: 0, ironProduced: 2, hasLightbulbIcon: false, quantity: 2 }, quantityAvailable: 1 }],
        manufacturer: [],
        pottery: [],
        brewery: [],
      } as any,
    })

    // Enter develop flow
    actor.send({ type: 'DEVELOP' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[pid]!.hand[0]!.id })
    snapshot = actor.getSnapshot()

    // Try to select 3 tiles (should be limited to 2)
    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['cotton', 'coal', 'iron'] })
    snapshot = actor.getSnapshot()

    // Should only have 2 tiles selected (max limit)
    expect(snapshot.context.selectedTilesForDevelop).toHaveLength(2)
  })

  test('selectTilesForDevelop filters out pottery with lightbulb icon', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const pid = snapshot.context.currentPlayerIndex

    // Give player pottery with lightbulb (undevelopable) and cotton (developable)
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industryTilesOnMat: {
        cotton: [{ tile: { id: 'c1', type: 'cotton', level: 1, canBuildInCanalEra: true, canBuildInRailEra: true, incomeAdvancement: 2, victoryPoints: 3, beerRequired: 1, cost: 10, incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0, beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: false, quantity: 3 }, quantityAvailable: 2 }],
        coal: [],
        iron: [],
        manufacturer: [],
        pottery: [{ tile: { id: 'p5', type: 'pottery', level: 5, canBuildInCanalEra: false, canBuildInRailEra: true, incomeAdvancement: 1, victoryPoints: 20, beerRequired: 2, cost: 24, incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 1, ironRequired: 0, beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: true, quantity: 1 }, quantityAvailable: 1 }],
        brewery: [],
      } as any,
    })

    // Enter develop flow
    actor.send({ type: 'DEVELOP' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[pid]!.hand[0]!.id })

    // Try to select pottery (should be filtered out) and cotton (should remain)
    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['pottery', 'cotton'] })
    snapshot = actor.getSnapshot()

    // Only cotton should be selected (pottery with lightbulb is filtered)
    expect(snapshot.context.selectedTilesForDevelop).toHaveLength(1)
    expect(snapshot.context.selectedTilesForDevelop).toContain('cotton')
    expect(snapshot.context.selectedTilesForDevelop).not.toContain('pottery')
  })
})

describe('Game Store - Pass with wild cards', () => {
  test('pass with wild_industry card returns it to wildIndustryPile', () => {
    const { actor } = setupGame()

    const wildIndustryCard: Card = { id: 'wild-ind-pass', type: 'wild_industry' }
    let snapshot = actor.getSnapshot()
    const currentHand = snapshot.context.players[0]!.hand
    const newHand = [...currentHand, wildIndustryCard]

    actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: newHand })
    snapshot = actor.getSnapshot()

    const initialWildIndustryPileSize = snapshot.context.wildIndustryPile.length

    // Pass with wild industry card
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: wildIndustryCard.id })
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Wild industry card should go back to wild industry pile, not discard pile
    expect(snapshot.context.wildIndustryPile.length).toBe(initialWildIndustryPileSize + 1)
    expect(snapshot.context.discardPile.find(c => c.id === wildIndustryCard.id)).toBeUndefined()
    expect(snapshot.context.wildIndustryPile.find(c => c.id === wildIndustryCard.id)).toBeDefined()
  })
})
