// Build Validation Integration Tests
import { describe, expect, test } from 'vitest'
import {
  validateIndustrySlotAvailability,
  validateNetworkRequirement,
  validateBuildActionSelections,
  validateIndustrySlotAvailabilityResult,
  validateNetworkRequirementResult,
  validateBuildActionSelectionsResult,
  validateCardType,
  validateCardLocationMatching,
  validateCardIndustryMatching,
  validateTileEraCompatibility,
  buildIndustryTile,
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
    merchants: [],
    lastError: null,
    errorContext: null
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
        id: 'cotton_1',
        type: 'cotton',
        level: 1,
        cost: 12,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 5,
        incomeAdvancement: 2,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        incomeSpaces: 2,
        linkScoringIcons: 1,
        hasLightbulbIcon: false,
        quantity: 1
      }
    })

    expect(() => validateIndustrySlotAvailability(context)).not.toThrow()
  })

  test('rejects building incompatible industry', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham',
      selectedIndustryTile: {
        id: 'coal_1',
        type: 'coal', // Birmingham doesn't have coal slots
        level: 1,
        cost: 10,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 3,
        incomeAdvancement: 1,
        beerProduced: 0,
        coalProduced: 2,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        hasLightbulbIcon: false,
        quantity: 1
      }
    })

    expect(() => validateIndustrySlotAvailability(context)).toThrow(/No available slots or slots are occupied/)
  })

  test('rejects building in merchant city (no slots)', () => {
    const context = createTestContext({
      selectedLocation: 'warrington', // Merchant city, no industry slots
      selectedIndustryTile: {
        id: 'cotton_1',
        type: 'cotton',
        level: 1,
        cost: 12,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 5,
        incomeAdvancement: 2,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        incomeSpaces: 2,
        linkScoringIcons: 1,
        hasLightbulbIcon: false,
        quantity: 1
      }
    })

    expect(() => validateIndustrySlotAvailability(context)).toThrow(/No available slots or slots are occupied/)
  })

  test('rejects building when all compatible slots are occupied', () => {
    const context = createTestContext({
      selectedLocation: 'stoke', // Has ['coal'], ['pottery']
      selectedIndustryTile: {
        id: 'coal_1',
        type: 'coal',
        level: 1,
        cost: 10,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 3,
        incomeAdvancement: 1,
        beerProduced: 0,
        coalProduced: 2,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        hasLightbulbIcon: false,
        quantity: 1
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
    // Birmingham: ['cotton', 'manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
    // Occupy slot 1 with manufacturer, cotton can still use slot 1 alternative (manufacturer)
    // Actually, use a city with 2 manufacturer slots
    const context = createTestContext({
      selectedLocation: 'birmingham', // Has ['cotton','manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
      selectedIndustryTile: {
        id: 'manufacturer_1',
        type: 'manufacturer',
        level: 1,
        cost: 12,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 5,
        incomeAdvancement: 2,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        incomeSpaces: 2,
        linkScoringIcons: 1,
        hasLightbulbIcon: false,
        quantity: 1
      },
      players: [{
        ...createTestContext().players[0]!,
        industries: [{
          location: 'birmingham',
          type: 'manufacturer', // Occupies slot 1 (first compatible for manufacturer)
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    // Should allow because Birmingham has 3 manufacturer-compatible slots (1, 2, 4)
    expect(() => validateIndustrySlotAvailability(context)).not.toThrow()
  })

  test('handles multi-option slots correctly', () => {
    // Birmingham: ['cotton', 'manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
    // If cotton occupies slot 1, iron still has slot 3 available
    // Use dudley which has ['coal'], ['iron'] - occupy iron slot, then try to build iron
    const context = createTestContext({
      selectedLocation: 'dudley', // Slots: ['coal'], ['iron']
      selectedIndustryTile: {
        id: 'iron_1',
        type: 'iron',
        level: 1,
        cost: 12,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 3,
        incomeAdvancement: 1,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 4,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        hasLightbulbIcon: false,
        quantity: 1
      },
      players: [{
        ...createTestContext().players[0]!,
        industries: [{
          location: 'dudley',
          type: 'iron', // Occupies the only iron slot
          level: 1,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0
        }]
      }]
    })

    // Should reject because dudley's iron slot is occupied
    expect(() => validateIndustrySlotAvailability(context)).toThrow(/No available slots or slots are occupied/)
  })
})

// Non-throwing validation functions
describe('validateIndustrySlotAvailabilityResult', () => {
  test('returns isValid false when no industry tile selected', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham',
      selectedIndustryTile: null,
    })
    const result = validateIndustrySlotAvailabilityResult(context)
    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toBe('No industry tile selected')
    expect(result.errorContext).toBe('build')
  })

  test('returns isValid false when slot not available', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham',
      selectedIndustryTile: {
        id: 'coal_1',
        type: 'coal',
        level: 1,
        cost: 5,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 1,
        incomeAdvancement: 4,
        beerProduced: 0,
        coalProduced: 2,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        incomeSpaces: 4,
        linkScoringIcons: 2,
        hasLightbulbIcon: false,
        quantity: 1,
      },
    })
    const result = validateIndustrySlotAvailabilityResult(context)
    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toMatch(/No available slots/)
    expect(result.errorContext).toBe('build')
  })

  test('returns isValid true when slot is available', () => {
    const context = createTestContext({
      selectedLocation: 'birmingham',
      selectedIndustryTile: {
        id: 'cotton_1',
        type: 'cotton',
        level: 1,
        cost: 12,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        victoryPoints: 5,
        incomeAdvancement: 5,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        incomeSpaces: 5,
        linkScoringIcons: 1,
        hasLightbulbIcon: false,
        quantity: 1,
      },
    })
    const result = validateIndustrySlotAvailabilityResult(context)
    expect(result.isValid).toBe(true)
  })
})

describe('validateNetworkRequirementResult', () => {
  test('returns isValid true for location cards', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'location', location: 'birmingham' } as any,
      selectedLocation: 'birmingham',
    })
    const result = validateNetworkRequirementResult(context)
    expect(result.isValid).toBe(true)
  })

  test('returns isValid true for wild_location cards', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'wild_location' } as any,
      selectedLocation: 'birmingham',
    })
    const result = validateNetworkRequirementResult(context)
    expect(result.isValid).toBe(true)
  })

  test('returns isValid false for industry card not in network', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham',
      players: [
        {
          ...createTestContext().players[0]!,
          links: [],
          industries: [
            {
              location: 'stoke',
              type: 'coal',
              level: 1,
              flipped: false,
              tile: {} as any,
              coalCubesOnTile: 0,
              ironCubesOnTile: 0,
              beerBarrelsOnTile: 0,
            },
          ],
        },
      ],
    })
    const result = validateNetworkRequirementResult(context)
    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toMatch(/Industry cards must be built in your network/)
    expect(result.errorContext).toBe('build')
  })

  test('returns isValid true for industry card in network', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham',
      players: [
        {
          ...createTestContext().players[0]!,
          links: [],
          industries: [
            {
              location: 'birmingham',
              type: 'coal',
              level: 1,
              flipped: false,
              tile: {} as any,
              coalCubesOnTile: 0,
              ironCubesOnTile: 0,
              beerBarrelsOnTile: 0,
            },
          ],
        },
      ],
    })
    const result = validateNetworkRequirementResult(context)
    expect(result.isValid).toBe(true)
  })
})

describe('validateBuildActionSelectionsResult', () => {
  test('returns isValid false when no card selected', () => {
    const context = createTestContext({
      selectedCard: null,
      selectedLocation: 'birmingham',
    })
    const result = validateBuildActionSelectionsResult(context)
    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toBe('No card selected for build action')
    expect(result.errorContext).toBe('build')
  })

  test('returns isValid false when no location selected', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: null,
    })
    const result = validateBuildActionSelectionsResult(context)
    expect(result.isValid).toBe(false)
    expect(result.errorMessage).toBe('No location selected for build action')
    expect(result.errorContext).toBe('build')
  })

  test('returns isValid true when both selected', () => {
    const context = createTestContext({
      selectedCard: { id: 'card1', type: 'industry' } as any,
      selectedLocation: 'birmingham',
    })
    const result = validateBuildActionSelectionsResult(context)
    expect(result.isValid).toBe(true)
  })
})

describe('validateCardType', () => {
  test('does not throw for valid card types', () => {
    expect(() => validateCardType({ id: '1', type: 'location', location: 'birmingham', color: 'red' } as any)).not.toThrow()
    expect(() => validateCardType({ id: '2', type: 'industry', industries: ['cotton'] } as any)).not.toThrow()
    expect(() => validateCardType({ id: '3', type: 'wild_location' } as any)).not.toThrow()
    expect(() => validateCardType({ id: '4', type: 'wild_industry' } as any)).not.toThrow()
  })

  test('throws for invalid card type', () => {
    expect(() => validateCardType({ id: '5', type: 'unknown' } as any)).toThrow(
      /Invalid card type for build action/
    )
  })
})

describe('validateCardLocationMatching', () => {
  test('throws when location card does not match selected location', () => {
    const card = { id: '1', type: 'location', location: 'birmingham' } as any
    expect(() => validateCardLocationMatching(card, 'coventry')).toThrow(
      /Location card mismatch/
    )
  })

  test('does not throw when location card matches', () => {
    const card = { id: '1', type: 'location', location: 'birmingham' } as any
    expect(() => validateCardLocationMatching(card, 'birmingham')).not.toThrow()
  })

  test('does not throw for non-location cards', () => {
    const card = { id: '1', type: 'industry', industries: ['cotton'] } as any
    expect(() => validateCardLocationMatching(card, 'birmingham')).not.toThrow()
  })
})

describe('validateCardIndustryMatching', () => {
  test('throws when industry card does not include tile type', () => {
    const card = { id: '1', type: 'industry', industries: ['cotton', 'manufacturer'] } as any
    const tile = { id: 'coal_1', type: 'coal' } as any
    expect(() => validateCardIndustryMatching(card, tile)).toThrow(
      /Industry card mismatch/
    )
  })

  test('does not throw when industry card includes tile type', () => {
    const card = { id: '1', type: 'industry', industries: ['cotton', 'manufacturer'] } as any
    const tile = { id: 'cotton_1', type: 'cotton' } as any
    expect(() => validateCardIndustryMatching(card, tile)).not.toThrow()
  })

  test('throws when industry card has no tile selected', () => {
    const card = { id: '1', type: 'industry', industries: ['cotton'] } as any
    expect(() => validateCardIndustryMatching(card, null)).toThrow(
      'Industry card requires industry tile selection'
    )
  })

  test('does not throw for non-industry cards', () => {
    const card = { id: '1', type: 'location', location: 'birmingham' } as any
    expect(() => validateCardIndustryMatching(card, null)).not.toThrow()
  })
})

describe('validateTileEraCompatibility', () => {
  test('throws for canal-only tile in rail era', () => {
    const context = createTestContext({ era: 'rail' })
    const tile = {
      id: 'coal_1',
      type: 'coal',
      level: 1,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
    } as any
    expect(() => validateTileEraCompatibility(context, tile)).toThrow(
      /Cannot build coal Level 1 in Rail Era/
    )
  })

  test('throws for rail-only tile in canal era', () => {
    const context = createTestContext({ era: 'canal' })
    const tile = {
      id: 'cotton_5',
      type: 'cotton',
      level: 5,
      canBuildInCanalEra: false,
      canBuildInRailEra: true,
    } as any
    expect(() => validateTileEraCompatibility(context, tile)).toThrow(
      /Cannot build cotton Level 5 in Canal Era/
    )
  })

  test('does not throw for tile compatible with current era', () => {
    const context = createTestContext({ era: 'canal' })
    const tile = {
      id: 'cotton_1',
      type: 'cotton',
      level: 1,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
    } as any
    expect(() => validateTileEraCompatibility(context, tile)).not.toThrow()
  })
})

describe('buildIndustryTile', () => {
  const createBuildContext = (overrides: Partial<GameState> = {}): GameState => {
    return createTestContext({
      selectedLocation: 'dudley',
      selectedCard: { id: 'loc1', type: 'location', location: 'dudley' } as any,
      players: [
        {
          id: '1',
          name: 'Player 1',
          color: 'red',
          character: 'Richard Arkwright',
          money: 50,
          victoryPoints: 0,
          income: 10,
          hand: [{ id: 'loc1', type: 'location', location: 'dudley' } as any],
          industryTilesOnMat: {
            coal: [],
            iron: [],
            cotton: [],
            manufacturer: [],
            pottery: [],
            brewery: [],
          } as any,
          links: [],
          industries: [],
        },
      ],
      coalMarket: [
        { price: 1, cubes: 2, maxCubes: 4 },
        { price: 2, cubes: 2, maxCubes: 4 },
        { price: 3, cubes: 0, maxCubes: 4 },
        { price: 4, cubes: 0, maxCubes: 4 },
        { price: 5, cubes: 0, maxCubes: 4 },
        { price: 8, cubes: 0, maxCubes: Infinity },
      ],
      ironMarket: [
        { price: 1, cubes: 2, maxCubes: 2 },
        { price: 2, cubes: 2, maxCubes: 2 },
        { price: 3, cubes: 0, maxCubes: 2 },
        { price: 4, cubes: 0, maxCubes: 2 },
        { price: 5, cubes: 0, maxCubes: 2 },
        { price: 6, cubes: 0, maxCubes: Infinity },
      ],
      merchants: [],
      ...overrides,
    })
  }

  const simpleTile = {
    id: 'cotton_1',
    type: 'cotton' as IndustryType,
    level: 1,
    cost: 12,
    coalRequired: 0,
    ironRequired: 0,
    beerRequired: 0,
    victoryPoints: 5,
    incomeSpaces: 5,
    linkScoringIcons: 1,
    beerProduced: 0,
    coalProduced: 0,
    ironProduced: 0,
    canBuildInCanalEra: true,
    canBuildInRailEra: true,
    hasLightbulbIcon: false,
    incomeAdvancement: 5,
    quantity: 3,
  }

  test('throws when overbuild check fails', () => {
    // Place existing higher-level industry at location
    const context = createBuildContext({
      selectedLocation: 'dudley',
      players: [
        {
          id: '1',
          name: 'Player 1',
          color: 'red',
          character: 'Richard Arkwright',
          money: 50,
          victoryPoints: 0,
          income: 10,
          hand: [],
          industryTilesOnMat: { cotton: [], coal: [], iron: [], manufacturer: [], pottery: [], brewery: [] } as any,
          links: [],
          industries: [
            {
              location: 'dudley',
              type: 'cotton',
              level: 3,
              flipped: false,
              tile: {} as any,
              coalCubesOnTile: 0,
              ironCubesOnTile: 0,
              beerBarrelsOnTile: 0,
            },
          ],
        },
      ],
    })
    const tile = { ...simpleTile, level: 1 } // Trying to build level 1 over level 3
    expect(() => buildIndustryTile(context, context.players[0]!, tile, [])).toThrow(
      /Cannot overbuild level 3 with level 1/
    )
  })

  test('throws when player cannot afford total cost', () => {
    const context = createBuildContext({
      players: [
        {
          ...createBuildContext().players[0]!,
          money: 5, // Not enough for cost=12
        },
      ],
    })
    expect(() => buildIndustryTile(context, context.players[0]!, simpleTile, [])).toThrow(
      /Insufficient funds/
    )
  })

  test('builds simple industry successfully', () => {
    const context = createBuildContext()
    const result = buildIndustryTile(context, context.players[0]!, simpleTile, [])
    expect(result.updatedPlayer.money).toBe(50 - 12) // cost = 12
    expect(result.totalCost).toBe(12)
    expect(result.logMessage).toContain('built cotton Level 1')
  })

  test('coal mine auto-sells to market when connected to merchant', () => {
    const coalTile = {
      id: 'coal_1',
      type: 'coal' as IndustryType,
      level: 1,
      cost: 5,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 0,
      victoryPoints: 1,
      incomeSpaces: 4,
      linkScoringIcons: 2,
      beerProduced: 0,
      coalProduced: 2,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      incomeAdvancement: 4,
      quantity: 1,
    }
    // Connect dudley to shrewsbury via links so isLocationConnectedToMerchant returns true
    const context = createBuildContext({
      selectedLocation: 'dudley',
      players: [
        {
          ...createBuildContext().players[0]!,
          money: 50,
          links: [
            { from: 'dudley', to: 'kidderminster', type: 'canal' },
            { from: 'kidderminster', to: 'worcester', type: 'canal' },
          ],
        },
        {
          id: '2',
          name: 'Player 2',
          color: 'blue',
          character: 'Eliza Tinsley',
          money: 17,
          victoryPoints: 0,
          income: 10,
          hand: [],
          industryTilesOnMat: {} as any,
          links: [
            { from: 'coalbrookdale', to: 'shrewsbury', type: 'canal' },
            { from: 'dudley', to: 'coalbrookdale', type: 'canal' },
          ],
          industries: [],
        },
      ],
      coalMarket: [
        { price: 1, cubes: 0, maxCubes: 4 },
        { price: 2, cubes: 0, maxCubes: 4 },
        { price: 3, cubes: 0, maxCubes: 4 },
        { price: 4, cubes: 0, maxCubes: 4 },
        { price: 5, cubes: 0, maxCubes: 4 },
        { price: 8, cubes: 0, maxCubes: Infinity },
      ],
    })
    const result = buildIndustryTile(context, context.players[0]!, coalTile, [])
    // Coal cubes should be sold to market -- 2 cubes produced, sold at highest available prices
    expect(result.logMessage).toContain('coal Level 1')
    // Since the coal market had empty spaces, cubes were sold
    const totalMarketCubes = result.updatedCoalMarket.reduce((sum, l) => sum + l.cubes, 0)
    expect(totalMarketCubes).toBeGreaterThan(0)
  })

  test('iron works auto-sells to market', () => {
    const ironTile = {
      id: 'iron_1',
      type: 'iron' as IndustryType,
      level: 1,
      cost: 12,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      victoryPoints: 3,
      incomeSpaces: 3,
      linkScoringIcons: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 4,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 3,
      quantity: 1,
    }

    // Need coal for building iron works (coalRequired=1)
    // Place a coal mine at same location for free coal
    const context = createBuildContext({
      selectedLocation: 'dudley',
      players: [
        {
          ...createBuildContext().players[0]!,
          money: 50,
          industries: [
            {
              location: 'dudley',
              type: 'coal',
              level: 1,
              flipped: false,
              tile: {} as any,
              coalCubesOnTile: 2,
              ironCubesOnTile: 0,
              beerBarrelsOnTile: 0,
            },
          ],
        },
      ],
      ironMarket: [
        { price: 1, cubes: 0, maxCubes: 2 },
        { price: 2, cubes: 0, maxCubes: 2 },
        { price: 3, cubes: 0, maxCubes: 2 },
        { price: 4, cubes: 0, maxCubes: 2 },
        { price: 5, cubes: 0, maxCubes: 2 },
        { price: 6, cubes: 0, maxCubes: Infinity },
      ],
    })
    const result = buildIndustryTile(context, context.players[0]!, ironTile, [])
    // Iron cubes should be sold to market -- 4 cubes produced
    const totalIronCubes = result.updatedIronMarket.reduce((sum, l) => sum + l.cubes, 0)
    expect(totalIronCubes).toBeGreaterThan(0)
    expect(result.logMessage).toContain('iron Level 1')
  })

  test('calls performOverbuild when overbuilding existing industry', () => {
    const context = createBuildContext({
      selectedLocation: 'dudley',
      players: [
        {
          ...createBuildContext().players[0]!,
          money: 50,
          industries: [
            {
              location: 'dudley',
              type: 'cotton',
              level: 1,
              flipped: false,
              tile: simpleTile as any,
              coalCubesOnTile: 0,
              ironCubesOnTile: 0,
              beerBarrelsOnTile: 0,
            },
          ],
        },
      ],
    })
    const higherTile = { ...simpleTile, level: 2, id: 'cotton_2' }
    const result = buildIndustryTile(context, context.players[0]!, higherTile, [])
    expect(result.logMessage).toContain('overbuilt own level 1')
    // The new industry should be level 2
    const newIndustry = result.updatedPlayer.industries.find(
      (i) => i.level === 2 && i.type === 'cotton'
    )
    expect(newIndustry).toBeDefined()
  })

  test('advances income when tile auto-flips on build (iron auto-sell empties cubes)', () => {
    const ironTile = {
      id: 'iron_1',
      type: 'iron' as IndustryType,
      level: 1,
      cost: 12,
      coalRequired: 0, // No coal for simplicity
      ironRequired: 0,
      beerRequired: 0,
      victoryPoints: 3,
      incomeSpaces: 3,
      linkScoringIcons: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 2, // 2 iron cubes produced
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 3,
      quantity: 1,
    }

    const context = createBuildContext({
      selectedLocation: 'dudley',
      ironMarket: [
        { price: 1, cubes: 0, maxCubes: 2 },
        { price: 2, cubes: 0, maxCubes: 2 },
        { price: 3, cubes: 0, maxCubes: 2 },
        { price: 4, cubes: 0, maxCubes: 2 },
        { price: 5, cubes: 0, maxCubes: 2 },
        { price: 6, cubes: 0, maxCubes: Infinity },
      ],
    })
    const result = buildIndustryTile(context, context.players[0]!, ironTile, [])
    // Iron cubes all sold to market -> tile flips -> income advances by incomeSpaces
    expect(result.logMessage).toContain('tile flipped')
    expect(result.updatedPlayer.income).toBe(10 + 3) // base income 10 + incomeSpaces 3
  })

  test('throws when coal consumption fails (no coal available)', () => {
    const coalRequiringTile = {
      ...simpleTile,
      coalRequired: 2,
      ironRequired: 0,
    }
    // No coal mines, no market connection
    const context = createBuildContext({
      selectedLocation: 'dudley',
      coalMarket: [
        { price: 1, cubes: 0, maxCubes: 4 },
        { price: 2, cubes: 0, maxCubes: 4 },
        { price: 3, cubes: 0, maxCubes: 4 },
        { price: 4, cubes: 0, maxCubes: 4 },
        { price: 5, cubes: 0, maxCubes: 4 },
        { price: 8, cubes: 0, maxCubes: Infinity },
      ],
    })
    expect(() =>
      buildIndustryTile(context, context.players[0]!, coalRequiringTile, [])
    ).toThrow(/coal/i)
  })
})