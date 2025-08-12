// Build Validation Integration Tests
import { describe, expect, test } from 'vitest'
import { 
  validateIndustrySlotAvailability,
  validateNetworkRequirement,
  validateBuildActionSelections 
} from './buildActions'
import type { GameState } from '../gameStore'
import type { IndustryType } from '../../data/cards'
import type { CityId } from '../../data/board'

// Helper to create test game state
const createTestContext = (overrides: Partial<GameState> = {}): GameState => {
  const baseContext: GameState = {
    players: [
      {
        id: '1',
        name: 'Player 1',
        color: 'red',
        character: 'Richard Arkwright',
        money: 17,
        victoryPoints: 0,
        income: 10,
        hand: [],
        industryTilesOnMat: {} as any,
        links: [],
        industries: []
      }
    ],
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 2,
    resources: { coal: 24, iron: 10, beer: 24 },
    coalMarket: [],
    ironMarket: [],
    logs: [],
    drawPile: [],
    discardPile: [],
    wildLocationPile: [],
    wildIndustryPile: [],
    selectedCard: null,
    selectedCardsForScout: [],
    spentMoney: 0,
    playerSpending: {},
    turnOrder: [],
    isFinalRound: false,
    selectedLink: null,
    selectedSecondLink: null,
    selectedLocation: null,
    selectedIndustryTile: null,
    selectedTilesForDevelop: [],
    merchants: []
  } as GameState

  return { ...baseContext, ...overrides }
}

describe('validateBuildActionSelections', () => {
  test('throws error when no card is selected', () => {
    const context = createTestContext({
      selectedCard: null,
      selectedLocation: 'birmingham'
    })

    expect(() => validateBuildActionSelections(context)).toThrow('No card selected for build action')
  })

  test('throws error when no location is selected', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: null
    })

    expect(() => validateBuildActionSelections(context)).toThrow('No location selected for build action')
  })

  test('passes when both card and location are selected', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham'
    })

    expect(() => validateBuildActionSelections(context)).not.toThrow()
  })
})

describe('validateNetworkRequirement', () => {
  test('allows location cards to build anywhere', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'location', location: 'birmingham' } as any,
      selectedLocation: 'birmingham',
      players: [{
        ...createTestContext().players[0]!,
        links: [],
        industries: [] // Player has no network
      }]
    })

    expect(() => validateNetworkRequirement(context)).not.toThrow()
  })

  test('allows wild location cards to build anywhere', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'wild_location' } as any,
      selectedLocation: 'birmingham',
      players: [{
        ...createTestContext().players[0]!,
        links: [],
        industries: [] // Player has no network
      }]
    })

    expect(() => validateNetworkRequirement(context)).not.toThrow()
  })

  test('allows industry cards when player has no tiles (first build exception)', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham',
      players: [{
        ...createTestContext().players[0]!,
        links: [],
        industries: [] // Player has no network - first build exception
      }]
    })

    expect(() => validateNetworkRequirement(context)).not.toThrow()
  })

  test('allows industry cards in player network (via industry)', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham',
      players: [{
        ...createTestContext().players[0]!,
        links: [],
        industries: [{
          location: 'birmingham',
          type: 'cotton',
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    expect(() => validateNetworkRequirement(context)).not.toThrow()
  })

  test('allows industry cards in player network (via link)', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham',
      players: [{
        ...createTestContext().players[0]!,
        links: [{
          from: 'birmingham',
          to: 'coventry',
          type: 'canal'
        }],
        industries: []
      }]
    })

    expect(() => validateNetworkRequirement(context)).not.toThrow()
  })

  test('rejects industry cards outside player network', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham',
      players: [{
        ...createTestContext().players[0]!,
        links: [{
          from: 'stoke',
          to: 'stafford',
          type: 'canal'
        }],
        industries: [{
          location: 'stoke',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    expect(() => validateNetworkRequirement(context)).toThrow(/Industry cards must be built in your network/)
  })

  test('rejects wild industry cards outside player network', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'wild_industry' } as any,
      selectedLocation: 'birmingham',
      players: [{
        ...createTestContext().players[0]!,
        links: [],
        industries: [{
          location: 'stoke', // Different location
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    expect(() => validateNetworkRequirement(context)).toThrow(/Industry cards must be built in your network/)
  })
})

describe('validateIndustrySlotAvailability', () => {
  test('throws error when no industry tile is selected', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham',
      selectedIndustryTile: null
    })

    expect(() => validateIndustrySlotAvailability(context)).toThrow('No industry tile selected')
  })

  test('allows building compatible industry in empty city', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham',
      selectedIndustryTile: {
        type: 'cotton',
        level: 1,
        cost: 12,
        coalCost: 0,
        ironCost: 0,
        vpValue: 5,
        incomeIncrease: 2,
        beerOutput: 0,
        era: 'canal'
      }
    })

    expect(() => validateIndustrySlotAvailability(context)).not.toThrow()
  })

  test('rejects building incompatible industry', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham',
      selectedIndustryTile: {
        type: 'coal', // Birmingham doesn't have coal slots
        level: 1,
        cost: 10,
        coalCost: 0,
        ironCost: 0,
        vpValue: 3,
        incomeIncrease: 1,
        beerOutput: 0,
        era: 'canal'
      }
    })

    expect(() => validateIndustrySlotAvailability(context)).toThrow(/No available slots or slots are occupied/)
  })

  test('rejects building in merchant city (no slots)', () => {
    const context = createTestContext({
      selectedLocation: 'warrington', // Merchant city, no industry slots
      selectedIndustryTile: {
        type: 'cotton',
        level: 1,
        cost: 12,
        coalCost: 0,
        ironCost: 0,
        vpValue: 5,
        incomeIncrease: 2,
        beerOutput: 0,
        era: 'canal'
      }
    })

    expect(() => validateIndustrySlotAvailability(context)).toThrow(/No available slots or slots are occupied/)
  })

  test('rejects building when all compatible slots are occupied', () => {
    const context = createTestContext({
      selectedLocation: 'stoke', // Has ['coal'], ['pottery']
      selectedIndustryTile: {
        type: 'coal',
        level: 1,
        cost: 10,
        coalCost: 0,
        ironCost: 0,
        vpValue: 3,
        incomeIncrease: 1,
        beerOutput: 0,
        era: 'canal'
      },
      players: [{
        ...createTestContext().players[0]!,
        industries: [{
          location: 'stoke',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    expect(() => validateIndustrySlotAvailability(context)).toThrow(/No available slots or slots are occupied/)
  })

  test('allows building when some compatible slots are available', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham', // Has multiple cotton-compatible slots
      selectedIndustryTile: {
        type: 'cotton',
        level: 1,
        cost: 12,
        coalCost: 0,
        ironCost: 0,
        vpValue: 5,
        incomeIncrease: 2,
        beerOutput: 0,
        era: 'canal'
      },
      players: [{
        ...createTestContext().players[0]!,
        industries: [{
          location: 'birmingham',
          type: 'cotton', // Occupies first cotton slot
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    // Should allow because Birmingham has 2 cotton-compatible slots
    expect(() => validateIndustrySlotAvailability(context)).not.toThrow()
  })

  test('handles multi-option slots correctly', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham', // Slot 1: ['cotton', 'iron']
      selectedIndustryTile: {
        type: 'iron',
        level: 1,
        cost: 12,
        coalCost: 0,
        ironCost: 0,
        vpValue: 3,
        incomeIncrease: 1,
        beerOutput: 0,
        era: 'canal'
      },
      players: [{
        ...createTestContext().players[0]!,
        industries: [{
          location: 'birmingham',
          type: 'cotton', // Occupies the shared slot 1
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    // Should reject because iron can only use slot 1, which is occupied by cotton
    expect(() => validateIndustrySlotAvailability(context)).toThrow(/No available slots or slots are occupied/)
  })
})