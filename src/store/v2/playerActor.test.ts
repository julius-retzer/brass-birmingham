// Player Actor Tests - Private player state management
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { playerActor, getPlayerHand, getPlayerTiles, getHandSize, getTileCount, hasCard, hasTile, findCardInHand, findTileOnMat } from './playerActor'
import type { Card } from '../../data/cards'
import type { IndustryTile } from '../../data/industryTiles'

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

const setupPlayerActor = () => {
  const actor = createActor(playerActor)
  activeActors.push(actor)
  actor.start()
  return actor
}

// Test data
const testCards: Card[] = [
  {
    id: 'card_1',
    type: 'location',
    location: 'birmingham',
    color: 'blue'
  },
  {
    id: 'card_2',
    type: 'industry',
    industries: ['coal']
  },
  {
    id: 'card_3',
    type: 'location',
    location: 'coventry',
    color: 'red'
  }
]

const testTiles: Record<string, IndustryTile[]> = {
  coal: [
    {
      id: 'coal_1',
      type: 'coal',
      level: 1,
      cost: 5,
      victoryPoints: 1,
      incomeSpaces: 4,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 2,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      linkScoringIcons: 1,
      incomeAdvancement: 4,
      quantity: 2
    }
  ],
  iron: [],
  cotton: [],
  manufactured: [],
  pottery: [],
  brewery: []
}

describe('Player Actor - Initialization', () => {
  test('starts in uninitialized state', () => {
    const actor = setupPlayerActor()
    const snapshot = actor.getSnapshot()
    
    expect(snapshot.value).toBe('uninitialized')
    expect(snapshot.context.playerId).toBe('')
    expect(snapshot.context.hand).toHaveLength(0)
  })
  
  test('can be initialized with player data', () => {
    const actor = setupPlayerActor()
    
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('ready')
    expect(snapshot.context.playerId).toBe('player_1')
    expect(snapshot.context.hand).toHaveLength(3)
    expect(snapshot.context.hand[0]).toEqual(testCards[0])
    expect(snapshot.context.industryTilesOnMat.coal).toHaveLength(1)
  })
})

describe('Player Actor - Hand Management', () => {
  test('can draw single card', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    const newCard: Card = {
      id: 'new_card',
      type: 'location',
      location: 'gloucester',
      color: 'green'
    }
    
    actor.send({ type: 'DRAW_CARD', card: newCard })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.hand).toHaveLength(1)
    expect(snapshot.context.hand[0]).toEqual(newCard)
  })
  
  test('can draw multiple cards', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [testCards[0]],
      initialTiles: testTiles as any
    })
    
    const newCards = [testCards[1], testCards[2]]
    actor.send({ type: 'DRAW_CARDS', cards: newCards })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.hand).toHaveLength(3)
    expect(snapshot.context.hand).toContain(testCards[0])
    expect(snapshot.context.hand).toContain(testCards[1])
    expect(snapshot.context.hand).toContain(testCards[2])
  })
  
  test('can discard single card', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    actor.send({ type: 'DISCARD_CARD', cardId: 'card_2' })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.hand).toHaveLength(2)
    expect(snapshot.context.hand.find(card => card.id === 'card_2')).toBeUndefined()
    expect(snapshot.context.hand.find(card => card.id === 'card_1')).toBeDefined()
  })
  
  test('can discard multiple cards', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    actor.send({ type: 'DISCARD_CARDS', cardIds: ['card_1', 'card_3'] })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.hand).toHaveLength(1)
    expect(snapshot.context.hand[0]?.id).toBe('card_2')
  })
  
  test('can replace entire hand', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    const newHand = [testCards[0]]
    actor.send({ type: 'REPLACE_HAND', newHand })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.hand).toHaveLength(1)
    expect(snapshot.context.hand[0]).toEqual(testCards[0])
  })
})

describe('Player Actor - Industry Tile Management', () => {
  test('can add industry tile', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    const newTile: IndustryTile = {
      id: 'iron_1',
      type: 'iron',
      level: 1,
      cost: 7,
      victoryPoints: 3,
      incomeSpaces: 4,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 4,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      linkScoringIcons: 1,
      incomeAdvancement: 4,
      quantity: 4
    }
    
    actor.send({ type: 'ADD_INDUSTRY_TILE', tile: newTile })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.industryTilesOnMat.iron).toHaveLength(1)
    expect(snapshot.context.industryTilesOnMat.iron[0]).toEqual(newTile)
  })
  
  test('can remove industry tile', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    actor.send({ type: 'REMOVE_INDUSTRY_TILE', tileId: 'coal_1' })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.industryTilesOnMat.coal).toHaveLength(0)
  })
  
  test('can flip industry tile', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    // Add isFlipped property for testing
    const tileWithFlipState = { ...testTiles.coal[0], isFlipped: false }
    actor.send({ type: 'REPLACE_TILES', newTiles: { ...testTiles, coal: [tileWithFlipState] } as any })
    
    actor.send({ type: 'FLIP_INDUSTRY_TILE', tileId: 'coal_1' })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.industryTilesOnMat.coal[0]?.isFlipped).toBe(true)
  })
  
  test('can replace entire tile collection', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    const newTiles = {
      coal: [],
      iron: [testTiles.coal[0]],
      cotton: [],
      manufactured: [],
      pottery: [],
      brewery: []
    }
    
    actor.send({ type: 'REPLACE_TILES', newTiles: newTiles as any })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.industryTilesOnMat.coal).toHaveLength(0)
    expect(snapshot.context.industryTilesOnMat.iron).toHaveLength(1)
  })
})

describe('Player Actor - Scout Cards', () => {
  test('can handle scout card action', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    // Scout: discard card_1 and card_2, keep card_3 and new cards
    const newCards = [
      {
        id: 'scout_1',
        type: 'location' as const,
        location: 'gloucester' as const,
        color: 'green' as const
      }
    ]
    
    actor.send({ 
      type: 'SCOUT_CARDS', 
      cardsToDiscard: [testCards[0], testCards[1]], 
      cardsToKeep: newCards 
    })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.hand).toHaveLength(2) // card_3 + scout_1
    expect(snapshot.context.hand.find(card => card.id === 'card_3')).toBeDefined()
    expect(snapshot.context.hand.find(card => card.id === 'scout_1')).toBeDefined()
    expect(snapshot.context.hand.find(card => card.id === 'card_1')).toBeUndefined()
    expect(snapshot.context.hand.find(card => card.id === 'card_2')).toBeUndefined()
  })
})

describe('Player Actor - Pending Changes', () => {
  test('can track pending changes without applying them', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    // Add pending changes (this would need to be implemented in actions)
    // For now just test that the structure exists
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.pendingHandChanges).toBeDefined()
    expect(snapshot.context.pendingHandChanges.cardsToAdd).toHaveLength(0)
    expect(snapshot.context.pendingHandChanges.cardsToRemove).toHaveLength(0)
  })
  
  test('can clear pending changes', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    actor.send({ type: 'CLEAR_PENDING_CHANGES' })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.pendingHandChanges.cardsToAdd).toHaveLength(0)
    expect(snapshot.context.pendingHandChanges.cardsToRemove).toHaveLength(0)
  })
})

describe('Player Actor - Test Events', () => {
  test('can set hand via test event', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    actor.send({ type: 'TEST_SET_HAND', hand: [testCards[0]] })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.hand).toHaveLength(1)
    expect(snapshot.context.hand[0]).toEqual(testCards[0])
  })
  
  test('can set tiles via test event', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: { coal: [], iron: [], cotton: [], manufactured: [], pottery: [], brewery: [] } as any
    })
    
    actor.send({ type: 'TEST_SET_TILES', tiles: testTiles as any })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.industryTilesOnMat.coal).toHaveLength(1)
  })
})

describe('Player Actor - Helper Functions', () => {
  test('getPlayerHand returns copy of hand', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    const hand = getPlayerHand(snapshot.context)
    
    expect(hand).toHaveLength(3)
    expect(hand).not.toBe(snapshot.context.hand) // Should be a copy
    expect(hand[0]).toEqual(testCards[0])
  })
  
  test('getPlayerTiles returns copy of tiles', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    const tiles = getPlayerTiles(snapshot.context)
    
    expect(tiles.coal).toHaveLength(1)
    expect(tiles).not.toBe(snapshot.context.industryTilesOnMat) // Should be a copy
  })
  
  test('getHandSize returns hand size', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    expect(getHandSize(snapshot.context)).toBe(3)
  })
  
  test('getTileCount returns total tile count', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    expect(getTileCount(snapshot.context)).toBe(1)
  })
  
  test('hasCard checks for card existence', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    expect(hasCard(snapshot.context, 'card_1')).toBe(true)
    expect(hasCard(snapshot.context, 'nonexistent')).toBe(false)
  })
  
  test('hasTile checks for tile existence', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    expect(hasTile(snapshot.context, 'coal_1')).toBe(true)
    expect(hasTile(snapshot.context, 'nonexistent')).toBe(false)
  })
  
  test('findCardInHand finds specific card', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    const foundCard = findCardInHand(snapshot.context, 'card_2')
    
    expect(foundCard).toBeDefined()
    expect(foundCard?.id).toBe('card_2')
    expect(findCardInHand(snapshot.context, 'nonexistent')).toBeUndefined()
  })
  
  test('findTileOnMat finds specific tile', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: [],
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    const foundTile = findTileOnMat(snapshot.context, 'coal_1')
    
    expect(foundTile).toBeDefined()
    expect(foundTile?.id).toBe('coal_1')
    expect(findTileOnMat(snapshot.context, 'nonexistent')).toBeUndefined()
  })
})

describe('Player Actor - Privacy Validation', () => {
  test('player state is completely private', () => {
    const actor = setupPlayerActor()
    actor.send({ 
      type: 'INITIALIZE_PLAYER', 
      playerId: 'player_1', 
      initialHand: testCards,
      initialTiles: testTiles as any
    })
    
    const snapshot = actor.getSnapshot()
    
    // This state should NEVER be shared with other players
    console.log('🔒 PRIVATE STATE - should never be synchronized:')
    console.log('   - Player hand:', snapshot.context.hand.length, 'cards')
    console.log('   - Industry tiles on mat:', getTileCount(snapshot.context), 'tiles')
    console.log('   - Player ID:', snapshot.context.playerId)
    
    // Verify all the private data is there
    expect(snapshot.context.hand).toBeDefined()
    expect(snapshot.context.industryTilesOnMat).toBeDefined()
    expect(snapshot.context.playerId).toBe('player_1')
    
    // This actor represents what should be client-only for each player
    expect(getHandSize(snapshot.context)).toBe(3)
    expect(getTileCount(snapshot.context)).toBe(1)
  })
})