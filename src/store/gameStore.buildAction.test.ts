import { assert, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { type IndustryCard, type LocationCard } from '~/data/cards'
import { getInitialPlayerIndustryTiles } from '../data/industryTiles'
import { gameStore } from './gameStore'

// Test utilities
type TestPlayer = {
  id: string
  name: string
  color: 'red' | 'blue'
  character: 'Richard Arkwright' | 'Eliza Tinsley'
  money: number
  victoryPoints: number
  income: number
  industryTilesOnMat: ReturnType<typeof getInitialPlayerIndustryTiles>
}

const createTestPlayers = (): TestPlayer[] => [
  {
    id: '1',
    name: 'Player 1',
    color: 'red',
    character: 'Richard Arkwright',
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: getInitialPlayerIndustryTiles(),
  },
  {
    id: '2',
    name: 'Player 2',
    color: 'blue',
    character: 'Eliza Tinsley',
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: getInitialPlayerIndustryTiles(),
  },
]

const setupTestGame = () => {
  const actor = createActor(gameStore)
  actor.start()
  // Start a game with test players
  actor.send({ type: 'START_GAME', players: createTestPlayers() })
  return { actor }
}

describe('Building Action - Location Selection Flow', () => {
  test('should transition from selectingCard to selectingLocation when card is selected', () => {
    const { actor } = setupTestGame()
    let snapshot = actor.getSnapshot()

    // Start build action
    actor.send({ type: 'BUILD' })
    snapshot = actor.getSnapshot()

    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingCard' } },
    })

    // Select a location card
    const player = snapshot.context.players[0]
    const locationCard = player?.hand.find((card) => card.type === 'location')
    assert(locationCard, 'Expected at least one location card in hand')

    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    snapshot = actor.getSnapshot()

    // Should now be in selectingLocation state
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })
    expect(snapshot.context.selectedCard?.id).toBe(locationCard.id)
  })

  test('should transition from selectingLocation to confirmingBuild when location is selected', () => {
    const { actor } = setupTestGame()

    // Navigate to selectingLocation state
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const locationCard = player?.hand.find((card) => card.type === 'location')
    assert(locationCard, 'Expected at least one location card in hand')
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })

    let snapshot = actor.getSnapshot()
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })

    // Select a location on the board
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    snapshot = actor.getSnapshot()

    // Should now be in confirmingBuild state
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'confirmingBuild' } },
    })
    expect(snapshot.context.selectedLocation).toBe('birmingham')
  })

  test('should handle cancel action in selectingLocation state', () => {
    const { actor } = setupTestGame()

    // Navigate to selectingLocation state
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const locationCard = player?.hand.find((card) => card.type === 'location')
    assert(locationCard, 'Expected at least one location card in hand')
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })

    let snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard).toBeTruthy()

    // Cancel from selectingLocation
    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()

    // Should go back to selectingCard and clear the selected card
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingCard' } },
    })
    expect(snapshot.context.selectedCard).toBeNull()
  })

  test('should handle cancel action in confirmingBuild state', () => {
    const { actor } = setupTestGame()

    // Navigate to confirmingBuild state
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const locationCard = player?.hand.find((card) => card.type === 'location')
    assert(locationCard, 'Expected at least one location card in hand')
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })

    let snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedLocation).toBe('birmingham')

    // Cancel from confirmingBuild
    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()

    // Should go back to selectingLocation and clear the selected location
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })
    expect(snapshot.context.selectedLocation).toBeNull()
    expect(snapshot.context.selectedCard).toBeTruthy() // Card should still be selected
  })

  test('should complete build action and clear all selections', () => {
    const { actor } = setupTestGame()

    // Navigate through the full flow
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const locationCard = player?.hand.find((card) => card.type === 'location')
    assert(locationCard, 'Expected at least one location card in hand')

    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })

    let snapshot = actor.getSnapshot()
    const initialHandSize = snapshot.context.players[0]?.hand.length || 0

    // Confirm the build
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Should be back at action selection or next player's turn
    expect(snapshot.value).toMatchObject({
      playing: { action: expect.any(String) },
    })

    // All selections should be cleared
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedLocation).toBeNull()

    // Card should be discarded
    expect(snapshot.context.discardPile).toContainEqual(
      expect.objectContaining({ id: locationCard.id }),
    )

    // Player's hand should have one less card
    const finalHandSize = snapshot.context.players[0]?.hand.length || 0
    expect(finalHandSize).toBe(initialHandSize - 1)
  })

  test('should work with industry cards requiring tile selection', () => {
    const { actor } = setupTestGame()

    // Start build action
    actor.send({ type: 'BUILD' })
    let snapshot = actor.getSnapshot()

    // Select an industry card
    const player = snapshot.context.players[0]
    const industryCard = player?.hand.find((card) => card.type === 'industry')
    assert(industryCard, 'Expected at least one industry card in hand')

    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })
    snapshot = actor.getSnapshot()

    // Should be in selectingTile state for industry cards
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingTile' } },
    })

    // Select an industry tile
    const industryTiles = player?.industryTilesOnMat
    const cottonTiles = industryTiles?.cotton || []
    const tileToSelect = cottonTiles[0]
    assert(tileToSelect, 'Expected at least one cotton tile')

    actor.send({ type: 'SELECT_INDUSTRY_TILE', tile: tileToSelect })
    snapshot = actor.getSnapshot()

    // Should now be in selectingLocation state
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })
    expect(snapshot.context.selectedIndustryTile).toEqual(tileToSelect)

    // Select a location
    actor.send({ type: 'SELECT_LOCATION', cityId: 'wolverhampton' })
    snapshot = actor.getSnapshot()

    // Should now be in confirmingBuild state
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'confirmingBuild' } },
    })
    expect(snapshot.context.selectedLocation).toBe('wolverhampton')
  })

  test('should handle location cards correctly', () => {
    const { actor } = setupTestGame()

    // Start build action
    actor.send({ type: 'BUILD' })
    let snapshot = actor.getSnapshot()

    // Find a specific location card (e.g., Birmingham)
    const player = snapshot.context.players[0]
    const birminghamCard = player?.hand.find(
      (card) =>
        card.type === 'location' &&
        (card as LocationCard).location === 'birmingham',
    )

    if (birminghamCard) {
      actor.send({ type: 'SELECT_CARD', cardId: birminghamCard.id })
      snapshot = actor.getSnapshot()

      // With location cards, player still needs to select the city on board
      expect(snapshot.value).toMatchObject({
        playing: { action: { building: 'selectingLocation' } },
      })

      // Select the matching city
      actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
      snapshot = actor.getSnapshot()

      expect(snapshot.value).toMatchObject({
        playing: { action: { building: 'confirmingBuild' } },
      })
      expect(snapshot.context.selectedLocation).toBe('birmingham')
    }
  })

  test('should maintain selectedCard through location selection', () => {
    const { actor } = setupTestGame()

    // Start build action and select a card
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const card = player?.hand[0]
    assert(card, 'Expected at least one card in hand')

    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    let snapshot = actor.getSnapshot()

    const selectedCard = snapshot.context.selectedCard
    expect(selectedCard).toBeTruthy()

    // Select location
    actor.send({ type: 'SELECT_LOCATION', cityId: 'coventry' })
    snapshot = actor.getSnapshot()

    // Card should still be selected
    expect(snapshot.context.selectedCard).toEqual(selectedCard)
    expect(snapshot.context.selectedLocation).toBe('coventry')
  })

  test('should clear selectedLocation when transitioning to next player', () => {
    const { actor } = setupTestGame()

    // Complete a build action
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const card = player?.hand.find((card) => card.type === 'location')
    assert(card, 'Expected at least one location card in hand')

    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'dudley' })
    actor.send({ type: 'CONFIRM' })

    let snapshot = actor.getSnapshot()

    // Pass turn
    actor.send({ type: 'PASS' })
    snapshot = actor.getSnapshot()

    // selectedLocation should be cleared for next player
    expect(snapshot.context.selectedLocation).toBeNull()
  })

  test('should handle wild location cards', () => {
    const { actor } = setupTestGame()

    // This test would require wild cards in hand
    // For now, we'll just verify the flow works with any card type
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const wildCard = player?.hand.find((card) => card.type === 'wild_location')

    if (wildCard) {
      actor.send({ type: 'SELECT_CARD', cardId: wildCard.id })
      let snapshot = actor.getSnapshot()

      expect(snapshot.value).toMatchObject({
        playing: { action: { building: 'selectingLocation' } },
      })

      // Wild location cards can build anywhere
      actor.send({ type: 'SELECT_LOCATION', cityId: 'worcester' })
      snapshot = actor.getSnapshot()

      expect(snapshot.value).toMatchObject({
        playing: { action: { building: 'confirmingBuild' } },
      })
    }
  })
})

describe('Building Action - Tile Selection', () => {
  test('should handle cancel in selectingTile state', () => {
    const { actor } = setupTestGame()

    // Navigate to selectingTile state
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const industryCard = player?.hand.find((card) => card.type === 'industry')
    assert(industryCard, 'Expected at least one industry card')

    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })
    let snapshot = actor.getSnapshot()

    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingTile' } },
    })
    expect(snapshot.context.selectedCard).toBeTruthy()

    // Cancel from selectingTile
    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()

    // Should go back to selectingCard and clear the selected card
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingCard' } },
    })
    expect(snapshot.context.selectedCard).toBeNull()
  })

  test('should maintain selected tile through location selection', () => {
    const { actor } = setupTestGame()

    // Navigate through tile selection
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const industryCard = player?.hand.find((card) => card.type === 'industry')
    assert(industryCard, 'Expected at least one industry card')

    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })

    // Select a tile
    const tile = player?.industryTilesOnMat.cotton?.[0]
    assert(tile, 'Expected at least one cotton tile')

    actor.send({ type: 'SELECT_INDUSTRY_TILE', tile })
    let snapshot = actor.getSnapshot()

    expect(snapshot.context.selectedIndustryTile).toEqual(tile)

    // Select location
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    snapshot = actor.getSnapshot()

    // Tile should still be selected
    expect(snapshot.context.selectedIndustryTile).toEqual(tile)
    expect(snapshot.context.selectedLocation).toBe('birmingham')
  })

  test('should require tile selection for industry cards', () => {
    const { actor } = setupTestGame()

    // Try to complete build without selecting tile
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const industryCard = player?.hand.find((card) => card.type === 'industry')
    assert(industryCard, 'Expected at least one industry card')

    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })

    // Should be in selectingTile, not selectingLocation
    let snapshot = actor.getSnapshot()
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingTile' } },
    })

    // Try to skip tile selection (this should not work)
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    snapshot = actor.getSnapshot()

    // Should still be in selectingTile
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingTile' } },
    })
  })

  test('should clear all selections when build is complete', () => {
    const { actor } = setupTestGame()

    // Complete full industry card build flow
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const industryCard = player?.hand.find((card) => card.type === 'industry')
    assert(industryCard, 'Expected at least one industry card')

    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })

    const tile = player?.industryTilesOnMat.coal?.[0]
    assert(tile, 'Expected at least one coal tile')

    actor.send({ type: 'SELECT_INDUSTRY_TILE', tile })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'dudley' })
    actor.send({ type: 'CONFIRM' })

    const snapshot = actor.getSnapshot()

    // All selections should be cleared
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
    expect(snapshot.context.selectedLocation).toBeNull()
  })
})

describe('Building Action - State Management', () => {
  test('selectedLocation should be part of game context', () => {
    const { actor } = setupTestGame()
    const snapshot = actor.getSnapshot()

    // Verify selectedLocation exists in context
    expect(snapshot.context).toHaveProperty('selectedLocation')
    expect(snapshot.context.selectedLocation).toBeNull()
  })

  test('selectedIndustryTile should be part of game context', () => {
    const { actor } = setupTestGame()
    const snapshot = actor.getSnapshot()

    // Verify selectedIndustryTile exists in context
    expect(snapshot.context).toHaveProperty('selectedIndustryTile')
    expect(snapshot.context.selectedIndustryTile).toBeNull()
  })

  test('clearSelections should clear all build-related selections', () => {
    const { actor } = setupTestGame()

    // Set up industry card build with all selections
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const industryCard = player?.hand.find((card) => card.type === 'industry')
    assert(industryCard, 'Expected at least one industry card')

    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })

    const tile = player?.industryTilesOnMat.pottery?.[0]
    assert(tile, 'Expected at least one pottery tile')

    actor.send({ type: 'SELECT_INDUSTRY_TILE', tile })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })

    let snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard).toBeTruthy()
    expect(snapshot.context.selectedIndustryTile).toBeTruthy()
    expect(snapshot.context.selectedLocation).toBe('birmingham')

    // Cancel back to action selection
    actor.send({ type: 'CANCEL' }) // from confirmingBuild to selectingLocation
    actor.send({ type: 'CANCEL' }) // from selectingLocation to selectingTile (or selectingCard)
    actor.send({ type: 'CANCEL' }) // from selectingTile to selectingCard
    actor.send({ type: 'CANCEL' }) // from selectingCard to action selection
    snapshot = actor.getSnapshot()

    // Everything should be cleared
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
    expect(snapshot.context.selectedLocation).toBeNull()
  })
})

describe('Building Action - Complete Flow', () => {
  test('location card flow: card → location → confirm', () => {
    const { actor } = setupTestGame()

    // Start build action
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const locationCard = player?.hand.find((card) => card.type === 'location')
    assert(locationCard, 'Expected at least one location card')

    // Step 1: Select location card
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    let snapshot = actor.getSnapshot()
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })

    // Step 2: Select city on board
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    snapshot = actor.getSnapshot()
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'confirmingBuild' } },
    })

    // Step 3: Confirm
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Should complete the action
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedLocation).toBeNull()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
  })

  test('industry card flow: card → tile → location → confirm', () => {
    const { actor } = setupTestGame()

    // Start build action
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const industryCard = player?.hand.find((card) => card.type === 'industry')
    assert(industryCard, 'Expected at least one industry card')

    // Step 1: Select industry card
    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })
    let snapshot = actor.getSnapshot()
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingTile' } },
    })

    // Step 2: Select industry tile
    const tile = player?.industryTilesOnMat.brewery?.[0]
    assert(tile, 'Expected at least one brewery tile')

    actor.send({ type: 'SELECT_INDUSTRY_TILE', tile })
    snapshot = actor.getSnapshot()
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })
    expect(snapshot.context.selectedIndustryTile).toEqual(tile)

    // Step 3: Select city on board
    actor.send({ type: 'SELECT_LOCATION', cityId: 'wolverhampton' })
    snapshot = actor.getSnapshot()
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'confirmingBuild' } },
    })

    // Step 4: Confirm
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Should complete the action
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedLocation).toBeNull()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
  })
})

describe('Building Action - Error Handling', () => {
  test('should not allow CONFIRM without selecting location', () => {
    const { actor } = setupTestGame()

    // Try to skip location selection
    actor.send({ type: 'BUILD' })
    const player = actor.getSnapshot().context.players[0]
    const card = player?.hand[0]
    assert(card, 'Expected at least one card in hand')

    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    let snapshot = actor.getSnapshot()

    // We're in selectingLocation, CONFIRM should not work here
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })

    // Try to confirm without selecting location
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Should still be in selectingLocation
    expect(snapshot.value).toMatchObject({
      playing: { action: { building: 'selectingLocation' } },
    })
  })

  test('should validate card types for build action', () => {
    const { actor } = setupTestGame()
    let snapshot = actor.getSnapshot()

    actor.send({ type: 'BUILD' })
    snapshot = actor.getSnapshot()

    const player = snapshot.context.players[0]
    assert(player, 'Expected player to exist')

    // All these card types should work for building
    const validTypes = [
      'location',
      'industry',
      'wild_location',
      'wild_industry',
    ]

    for (const card of player.hand) {
      if (validTypes.includes(card.type)) {
        actor.send({ type: 'SELECT_CARD', cardId: card.id })
        snapshot = actor.getSnapshot()

        // Should transition to selectingLocation
        expect(snapshot.value).toMatchObject({
          playing: { action: { building: 'selectingLocation' } },
        })

        // Cancel to test next card
        actor.send({ type: 'CANCEL' })
      }
    }
  })
})
