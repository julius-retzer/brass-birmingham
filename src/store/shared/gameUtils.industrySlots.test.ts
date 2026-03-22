// Industry Slot and Game Utility Functions Tests
import { describe, expect, test } from 'vitest'
import {
  canCityAccommodateIndustryType,
  getCurrentPlayer,
  getCardDescription,
  findAvailableBreweries,
  checkAndFlipIndustryTilesLogic,
  validateIndustryBuildLocation,
  canOverbuildIndustry,
  performOverbuild,
} from './gameUtils'
import type { GameState, Player } from '../gameStore'
import type { IndustryType } from '../../data/cards'
import type { CityId } from '../../data/board'

// Helper to create minimal game state for testing
const createTestGameState = (
  industries: Array<{
    location: CityId
    type: IndustryType
    level: number
    playerId: string
    flipped?: boolean
    coalCubesOnTile?: number
    ironCubesOnTile?: number
    beerBarrelsOnTile?: number
  }> = [],
  overrides: Partial<GameState> = {},
): GameState => {
  const players = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      hand: [],
      industryTilesOnMat: {} as any,
      links: [],
      industries: industries
        .filter((i) => i.playerId === '1')
        .map((i) => ({
          location: i.location,
          type: i.type,
          level: i.level,
          flipped: i.flipped ?? false,
          tile: { incomeAdvancement: 3, incomeSpaces: 3 } as any,
          coalCubesOnTile: i.coalCubesOnTile ?? 0,
          ironCubesOnTile: i.ironCubesOnTile ?? 0,
          beerBarrelsOnTile: i.beerBarrelsOnTile ?? 0,
        })),
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      hand: [],
      industryTilesOnMat: {} as any,
      links: [],
      industries: industries
        .filter((i) => i.playerId === '2')
        .map((i) => ({
          location: i.location,
          type: i.type,
          level: i.level,
          flipped: i.flipped ?? false,
          tile: { incomeAdvancement: 3, incomeSpaces: 3 } as any,
          coalCubesOnTile: i.coalCubesOnTile ?? 0,
          ironCubesOnTile: i.ironCubesOnTile ?? 0,
          beerBarrelsOnTile: i.beerBarrelsOnTile ?? 0,
        })),
    },
  ]

  return {
    players,
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
    errorContext: null,
    ...overrides,
  } as GameState
}

// ============================================
// canCityAccommodateIndustryType tests
// ============================================
// Actual slot configs (from board.ts):
// birmingham: ['cotton','manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
// dudley: ['coal'], ['iron']
// stoke: ['cotton','manufacturer'], ['pottery','iron'], ['manufacturer']
// burton: ['manufacturer','coal'], ['brewery']
// wolverhampton: ['manufacturer'], ['manufacturer','coal']
// coventry: ['pottery'], ['manufacturer','coal'], ['iron','manufacturer']

describe('canCityAccommodateIndustryType', () => {
  test('returns true for compatible industry in empty city', () => {
    const gameState = createTestGameState()
    // Birmingham: ['cotton','manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(true)
  })

  test('returns false for incompatible industry in empty city', () => {
    const gameState = createTestGameState()
    // Birmingham doesn't have coal, pottery, or brewery slots
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'coal')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'pottery')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'brewery')).toBe(false)
  })

  test('returns false for city with no defined slots', () => {
    const gameState = createTestGameState()
    // Merchant cities have no industry slots
    expect(canCityAccommodateIndustryType(gameState, 'warrington', 'cotton')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'gloucester', 'brewery')).toBe(false)
  })

  test('handles single-option slots correctly', () => {
    const gameState = createTestGameState()
    // Dudley: ['coal'], ['iron']
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'coal')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'iron')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'cotton')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'manufacturer')).toBe(false)
  })

  test('handles multi-option slots correctly', () => {
    const gameState = createTestGameState()
    // Stoke: ['cotton','manufacturer'], ['pottery','iron'], ['manufacturer']
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'cotton')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'manufacturer')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'pottery')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'iron')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'coal')).toBe(false)
  })

  test('correctly handles occupied single-option slots', () => {
    const gameState = createTestGameState([
      { location: 'dudley', type: 'coal', level: 1, playerId: '1' },
    ])
    // Dudley: ['coal'], ['iron'] - coal occupied
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'coal')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'iron')).toBe(true)
  })

  test('correctly handles occupied multi-option slots', () => {
    const gameState = createTestGameState([
      { location: 'stoke', type: 'cotton', level: 1, playerId: '1' },
    ])
    // Stoke: ['cotton','manufacturer'], ['pottery','iron'], ['manufacturer']
    // Cotton occupies slot 1, so:
    // manufacturer can still use slot 2 or 3
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'manufacturer')).toBe(true)
    // pottery can use slot 2
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'pottery')).toBe(true)
    // iron can use slot 2
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'iron')).toBe(true)
    // cotton: slot 1 occupied, no other cotton-compatible slot
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'cotton')).toBe(false)
  })

  test('handles multiple occupied slots correctly', () => {
    const gameState = createTestGameState([
      { location: 'stoke', type: 'cotton', level: 1, playerId: '1' },
      { location: 'stoke', type: 'pottery', level: 1, playerId: '2' },
      { location: 'stoke', type: 'manufacturer', level: 1, playerId: '1' },
    ])
    // Stoke: ['cotton','manufacturer'], ['pottery','iron'], ['manufacturer']
    // All 3 slots occupied
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'cotton')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'manufacturer')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'pottery')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'iron')).toBe(false)
  })

  test('handles industries from different players', () => {
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'manufacturer', level: 2, playerId: '2' },
    ])
    // Birmingham: ['cotton','manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
    // cotton occupies slot 1, manufacturer occupies slot 2
    // manufacturer can still use slot 4
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(true)
    // iron can use slot 3
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(true)
    // cotton: slot 1 occupied, no other cotton slot
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(false)
  })

  test('handles all slots filled scenario', () => {
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'manufacturer', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'iron', level: 1, playerId: '2' },
      { location: 'birmingham', type: 'manufacturer', level: 1, playerId: '2' },
    ])
    // All 4 slots occupied
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(false)
  })

  test('handles complex slot assignment scenarios', () => {
    // Stoke: ['cotton','manufacturer'], ['pottery','iron'], ['manufacturer']
    const gameState = createTestGameState([
      { location: 'stoke', type: 'cotton', level: 1, playerId: '1' },
      { location: 'stoke', type: 'iron', level: 1, playerId: '1' },
    ])
    // cotton uses slot 1, iron uses slot 2
    // manufacturer: slot 3 still available
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'manufacturer')).toBe(true)
    // pottery: slot 2 occupied by iron
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'pottery')).toBe(false)
  })

  test('works with different city configurations', () => {
    const gameState = createTestGameState()

    // Dudley: ['coal'], ['iron']
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'coal')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'iron')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'manufacturer')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'cotton')).toBe(false)

    // Wolverhampton: ['manufacturer'], ['manufacturer','coal']
    expect(canCityAccommodateIndustryType(gameState, 'wolverhampton', 'manufacturer')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'wolverhampton', 'coal')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'wolverhampton', 'brewery')).toBe(false)

    // Burton: ['manufacturer','coal'], ['brewery']
    expect(canCityAccommodateIndustryType(gameState, 'burton', 'brewery')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'burton', 'manufacturer')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'burton', 'cotton')).toBe(false)
  })

  test('handles edge case with empty slot arrays', () => {
    const gameState = createTestGameState()
    // Non-existent city should return false
    expect(
      canCityAccommodateIndustryType(gameState, 'nonexistent' as CityId, 'cotton'),
    ).toBe(false)
  })
})

// ============================================
// getCurrentPlayer tests
// ============================================
describe('getCurrentPlayer', () => {
  test('returns the current player', () => {
    const gameState = createTestGameState()
    const player = getCurrentPlayer(gameState)
    expect(player.id).toBe('1')
    expect(player.name).toBe('Player 1')
  })

  test('throws when player not found at currentPlayerIndex', () => {
    const gameState = createTestGameState([], { currentPlayerIndex: 5 })
    expect(() => getCurrentPlayer(gameState)).toThrow('Current player not found')
  })

  test('throws with empty players array', () => {
    const gameState = createTestGameState([], {
      players: [],
      currentPlayerIndex: 0,
    })
    expect(() => getCurrentPlayer(gameState)).toThrow('Current player not found')
  })
})

// ============================================
// getCardDescription tests
// ============================================
describe('getCardDescription', () => {
  test('returns description for wild_industry card', () => {
    const card = { type: 'wild_industry', id: 'test' } as any
    expect(getCardDescription(card)).toBe('wild industry')
  })

  test('returns description for wild_location card', () => {
    const card = { type: 'wild_location', id: 'test' } as any
    expect(getCardDescription(card)).toBe('wild location')
  })

  test('returns description for location card', () => {
    const card = { type: 'location', id: 'test', location: 'birmingham', color: 'red' } as any
    expect(getCardDescription(card)).toBe('birmingham (red)')
  })

  test('returns description for industry card', () => {
    const card = { type: 'industry', id: 'test', industries: ['cotton', 'manufacturer'] } as any
    expect(getCardDescription(card)).toBe('cotton/manufacturer industry')
  })
})

// ============================================
// findAvailableBreweries (connected opponent breweries) tests
// ============================================
describe('findAvailableBreweries', () => {
  test('finds connected opponent brewery with beer', () => {
    const gameState = createTestGameState([
      {
        location: 'birmingham',
        type: 'brewery',
        level: 1,
        playerId: '2',
        beerBarrelsOnTile: 2,
      },
    ])
    // Need players with links to connect locations
    gameState.players[0] = {
      ...gameState.players[0]!,
      links: [{ from: 'dudley', to: 'birmingham', type: 'canal' }],
      industries: [],
    }

    const result = findAvailableBreweries(gameState, 'dudley', gameState.players[0]!)
    expect(result.connectedBreweries.length).toBe(1)
    expect(result.connectedBreweries[0]!.location).toBe('birmingham')
  })

  test('does not include disconnected opponent breweries', () => {
    const gameState = createTestGameState()
    gameState.players = [
      {
        ...gameState.players[0]!,
        links: [],
        industries: [],
      },
      {
        ...gameState.players[1]!,
        industries: [
          {
            location: 'stoke',
            type: 'brewery',
            level: 1,
            flipped: false,
            tile: { incomeAdvancement: 3 } as any,
            coalCubesOnTile: 0,
            ironCubesOnTile: 0,
            beerBarrelsOnTile: 2,
          },
        ],
      },
    ]

    const result = findAvailableBreweries(gameState, 'dudley', gameState.players[0]!)
    expect(result.connectedBreweries.length).toBe(0)
  })

  test('does not include flipped opponent breweries', () => {
    const gameState = createTestGameState()
    gameState.players = [
      {
        ...gameState.players[0]!,
        links: [{ from: 'dudley', to: 'birmingham', type: 'canal' }],
        industries: [],
      },
      {
        ...gameState.players[1]!,
        industries: [
          {
            location: 'birmingham',
            type: 'brewery',
            level: 1,
            flipped: true,
            tile: { incomeAdvancement: 3 } as any,
            coalCubesOnTile: 0,
            ironCubesOnTile: 0,
            beerBarrelsOnTile: 0,
          },
        ],
      },
    ]

    const result = findAvailableBreweries(gameState, 'dudley', gameState.players[0]!)
    expect(result.connectedBreweries.length).toBe(0)
  })
})

// ============================================
// checkAndFlipIndustryTilesLogic tests
// ============================================
describe('checkAndFlipIndustryTilesLogic', () => {
  test('flips brewery with beerBarrelsOnTile=0', () => {
    const gameState = createTestGameState()
    gameState.players[0]!.industries = [
      {
        location: 'burton',
        type: 'brewery',
        level: 1,
        flipped: false,
        tile: { incomeAdvancement: 4, incomeSpaces: 4 } as any,
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ]
    const result = checkAndFlipIndustryTilesLogic(gameState)
    expect(result.players).toBeDefined()
    expect(result.players![0]!.industries[0]!.flipped).toBe(true)
    expect(result.logs).toBeDefined()
    expect(result.logs!.length).toBeGreaterThan(0)
  })

  test('flips coal mine with coalCubesOnTile=0', () => {
    const gameState = createTestGameState()
    gameState.players[0]!.industries = [
      {
        location: 'dudley',
        type: 'coal',
        level: 1,
        flipped: false,
        tile: { incomeAdvancement: 4 } as any,
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ]
    const result = checkAndFlipIndustryTilesLogic(gameState)
    expect(result.players![0]!.industries[0]!.flipped).toBe(true)
  })

  test('flips iron works with ironCubesOnTile=0', () => {
    const gameState = createTestGameState()
    gameState.players[0]!.industries = [
      {
        location: 'dudley',
        type: 'iron',
        level: 1,
        flipped: false,
        tile: { incomeAdvancement: 3 } as any,
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ]
    const result = checkAndFlipIndustryTilesLogic(gameState)
    expect(result.players![0]!.industries[0]!.flipped).toBe(true)
  })

  test('does not flip tiles with remaining resources', () => {
    const gameState = createTestGameState()
    gameState.players[0]!.industries = [
      {
        location: 'dudley',
        type: 'coal',
        level: 1,
        flipped: false,
        tile: { incomeAdvancement: 4 } as any,
        coalCubesOnTile: 2,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ]
    const result = checkAndFlipIndustryTilesLogic(gameState)
    expect(result.players).toBeUndefined()
  })

  test('does not flip already flipped tiles', () => {
    const gameState = createTestGameState()
    gameState.players[0]!.industries = [
      {
        location: 'dudley',
        type: 'coal',
        level: 1,
        flipped: true,
        tile: { incomeAdvancement: 4 } as any,
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ]
    const result = checkAndFlipIndustryTilesLogic(gameState)
    expect(result.players).toBeUndefined()
  })
})

// ============================================
// validateIndustryBuildLocation tests
// ============================================
describe('validateIndustryBuildLocation', () => {
  test('returns true for location card type', () => {
    const gameState = createTestGameState()
    const player = gameState.players[0]!
    const card = { type: 'location', id: 'test', location: 'birmingham' } as any
    expect(validateIndustryBuildLocation(gameState, player, card, 'birmingham')).toBe(true)
  })

  test('returns true for wild_location card type', () => {
    const gameState = createTestGameState()
    const player = gameState.players[0]!
    const card = { type: 'wild_location', id: 'test' } as any
    expect(validateIndustryBuildLocation(gameState, player, card, 'birmingham')).toBe(true)
  })

  test('returns result of isLocationInPlayerNetwork for industry card type', () => {
    // Player has industry at birmingham - so birmingham is in network
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' },
    ])
    const player = gameState.players[0]!
    const card = { type: 'industry', id: 'test', industries: ['cotton'] } as any
    expect(validateIndustryBuildLocation(gameState, player, card, 'birmingham')).toBe(true)
    // Location NOT in network
    expect(validateIndustryBuildLocation(gameState, player, card, 'stoke')).toBe(false)
  })

  test('returns result of isLocationInPlayerNetwork for wild_industry card type', () => {
    const gameState = createTestGameState([
      { location: 'dudley', type: 'iron', level: 1, playerId: '1' },
    ])
    const player = gameState.players[0]!
    const card = { type: 'wild_industry', id: 'test' } as any
    expect(validateIndustryBuildLocation(gameState, player, card, 'dudley')).toBe(true)
    expect(validateIndustryBuildLocation(gameState, player, card, 'stoke')).toBe(false)
  })

  test('returns false for unknown card type', () => {
    const gameState = createTestGameState()
    const player = gameState.players[0]!
    const card = { type: 'unknown', id: 'test' } as any
    expect(validateIndustryBuildLocation(gameState, player, card, 'birmingham')).toBe(false)
  })
})

// ============================================
// canOverbuildIndustry tests
// ============================================
describe('canOverbuildIndustry', () => {
  test('returns canOverbuild true when no existing industry at location', () => {
    const gameState = createTestGameState()
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'coal', 1)
    expect(result.canOverbuild).toBe(true)
    expect(result.existingIndustry).toBeUndefined()
  })

  test('returns canOverbuild false when new tile level <= existing level', () => {
    const gameState = createTestGameState([
      { location: 'dudley', type: 'coal', level: 3, playerId: '1' },
    ])
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'coal', 2)
    expect(result.canOverbuild).toBe(false)
    expect(result.reason).toMatch(/Cannot overbuild level 3 with level 2/)
    expect(result.existingIndustry).toBeDefined()
  })

  test('returns canOverbuild false when same level', () => {
    const gameState = createTestGameState([
      { location: 'dudley', type: 'coal', level: 2, playerId: '1' },
    ])
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'coal', 2)
    expect(result.canOverbuild).toBe(false)
  })

  test('returns canOverbuild true when overbuilding own tile with higher level', () => {
    const gameState = createTestGameState([
      { location: 'dudley', type: 'coal', level: 1, playerId: '1' },
    ])
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'coal', 2)
    expect(result.canOverbuild).toBe(true)
    expect(result.existingIndustry).toBeDefined()
    expect(result.existingIndustry!.playerIndex).toBe(0)
  })

  test('returns canOverbuild false when overbuilding opponent non-coal/non-iron', () => {
    const gameState = createTestGameState([
      { location: 'stoke', type: 'cotton', level: 1, playerId: '2' },
    ])
    const result = canOverbuildIndustry(gameState, 0, 'stoke', 'cotton', 2)
    expect(result.canOverbuild).toBe(false)
    expect(result.reason).toMatch(/only coal mines and iron works allowed/)
  })

  test('returns canOverbuild false when overbuilding opponent coal with coal cubes on board', () => {
    const gameState = createTestGameState([
      { location: 'dudley', type: 'coal', level: 1, playerId: '2', coalCubesOnTile: 2 },
    ])
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'coal', 2)
    expect(result.canOverbuild).toBe(false)
    expect(result.reason).toMatch(/coal cubes exist on board/)
  })

  test('returns canOverbuild false when overbuilding opponent coal with coal in market', () => {
    const gameState = createTestGameState(
      [{ location: 'dudley', type: 'coal', level: 1, playerId: '2' }],
      {
        coalMarket: [{ price: 1, cubes: 2, maxCubes: 4 }],
      },
    )
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'coal', 2)
    expect(result.canOverbuild).toBe(false)
    expect(result.reason).toMatch(/coal cubes exist/)
  })

  test('returns canOverbuild true when overbuilding opponent coal with zero coal anywhere', () => {
    const gameState = createTestGameState(
      [{ location: 'dudley', type: 'coal', level: 1, playerId: '2' }],
      {
        coalMarket: [{ price: 1, cubes: 0, maxCubes: 4 }],
      },
    )
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'coal', 2)
    expect(result.canOverbuild).toBe(true)
    expect(result.existingIndustry).toBeDefined()
  })

  test('returns canOverbuild false when overbuilding opponent iron with iron cubes on board', () => {
    const gameState = createTestGameState([
      { location: 'dudley', type: 'iron', level: 1, playerId: '2', ironCubesOnTile: 3 },
    ])
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'iron', 2)
    expect(result.canOverbuild).toBe(false)
    expect(result.reason).toMatch(/iron cubes exist on board/)
  })

  test('returns canOverbuild false when overbuilding opponent iron with iron in market', () => {
    const gameState = createTestGameState(
      [{ location: 'dudley', type: 'iron', level: 1, playerId: '2' }],
      {
        ironMarket: [{ price: 1, cubes: 1, maxCubes: 2 }],
      },
    )
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'iron', 2)
    expect(result.canOverbuild).toBe(false)
    expect(result.reason).toMatch(/iron cubes exist/)
  })

  test('returns canOverbuild true when overbuilding opponent iron with zero iron anywhere', () => {
    const gameState = createTestGameState(
      [{ location: 'dudley', type: 'iron', level: 1, playerId: '2' }],
      {
        ironMarket: [{ price: 1, cubes: 0, maxCubes: 2 }],
      },
    )
    const result = canOverbuildIndustry(gameState, 0, 'dudley', 'iron', 2)
    expect(result.canOverbuild).toBe(true)
    expect(result.existingIndustry).toBeDefined()
  })
})

// ============================================
// performOverbuild tests
// ============================================
describe('performOverbuild', () => {
  test('removes existing industry from target player', () => {
    const existingIndustry = {
      location: 'dudley' as CityId,
      type: 'coal' as IndustryType,
      level: 1,
      flipped: false,
      tile: {} as any,
      coalCubesOnTile: 2,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 0,
    }
    const gameState = createTestGameState()
    gameState.players[1]!.industries = [existingIndustry]

    const newIndustry = {
      location: 'dudley' as CityId,
      type: 'coal' as IndustryType,
      level: 2,
      flipped: false,
      tile: {} as any,
      coalCubesOnTile: 3,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 0,
    }

    const result = performOverbuild(
      gameState,
      { industry: existingIndustry, playerIndex: 1 },
      newIndustry,
    )
    // Target player's industry should be removed
    expect(result[1]!.industries.length).toBe(0)
  })

  test('does not affect other player industries', () => {
    const existingIndustry = {
      location: 'dudley' as CityId,
      type: 'coal' as IndustryType,
      level: 1,
      flipped: false,
      tile: {} as any,
      coalCubesOnTile: 2,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 0,
    }
    const otherIndustry = {
      location: 'birmingham' as CityId,
      type: 'cotton' as IndustryType,
      level: 1,
      flipped: false,
      tile: {} as any,
      coalCubesOnTile: 0,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 0,
    }
    const gameState = createTestGameState()
    gameState.players[0]!.industries = [otherIndustry]
    gameState.players[1]!.industries = [existingIndustry]

    const newIndustry = {
      location: 'dudley' as CityId,
      type: 'coal' as IndustryType,
      level: 2,
      flipped: false,
      tile: {} as any,
      coalCubesOnTile: 3,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 0,
    }

    const result = performOverbuild(
      gameState,
      { industry: existingIndustry, playerIndex: 1 },
      newIndustry,
    )
    // Player 1's (index 0) industries should be untouched
    expect(result[0]!.industries.length).toBe(1)
    expect(result[0]!.industries[0]!.location).toBe('birmingham')
  })
})
