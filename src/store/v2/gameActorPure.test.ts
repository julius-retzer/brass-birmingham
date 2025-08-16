// Game Actor Pure Tests - Public game state without private player data
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { 
  gameActorPure, 
  toPublicGameState, 
  fromPublicGameState,
  isPublicStateValid,
  getPlayerCount,
  getCurrentPlayer,
  getPlayerById,
  type PublicGameState,
  type PublicPlayerState
} from './gameActorPure'
import type { GameState } from './gameActor'

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

const setupPureGameActor = () => {
  const actor = createActor(gameActorPure)
  activeActors.push(actor)
  actor.start()
  return actor
}

// Test data
const testPlayers = [
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
  }
]

describe('Game Actor Pure - Initialization', () => {
  test('starts in waitingForPlayers state', () => {
    const actor = setupPureGameActor()
    const snapshot = actor.getSnapshot()
    
    expect(snapshot.value).toBe('waitingForPlayers')
    expect(snapshot.context.players).toHaveLength(0)
    expect(snapshot.context.era).toBe('canal')
    expect(snapshot.context.round).toBe(1)
  })
  
  test('can start game with public player data only', () => {
    const actor = setupPureGameActor()
    
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('playing')
    expect(snapshot.context.players).toHaveLength(2)
    
    // Verify public player state
    const player1 = snapshot.context.players[0]!
    expect(player1.id).toBe('1')
    expect(player1.name).toBe('Player 1')
    expect(player1.money).toBe(17)
    expect(player1.income).toBe(10)
    expect(player1.handSize).toBe(8) // Initial hand size
    expect(player1.industryTileCount).toEqual({})
    
    // Verify NO private data exists
    expect('hand' in player1).toBe(false)
    expect('industryTilesOnMat' in player1).toBe(false)
  })
})

describe('Game Actor Pure - Public State Management', () => {
  test('updates public player financial state', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    // Update player money and income
    actor.send({ 
      type: 'TEST_SET_PLAYER_STATE', 
      playerId: 0, 
      money: 50,
      income: 15 
    })
    
    const snapshot = actor.getSnapshot()
    const player = snapshot.context.players[0]!
    
    expect(player.money).toBe(50)
    expect(player.income).toBe(15)
    expect(player.victoryPoints).toBe(0) // Unchanged
  })
  
  test('tracks hand size without actual cards', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.players[0]!.handSize).toBe(8)
    
    // Simulate drawing a card (hand size increases)
    actor.send({ type: 'DRAW_CARD', card: {} as any })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[0]!.handSize).toBe(9)
    
    // Simulate discarding a card (hand size decreases)
    actor.send({ type: 'DISCARD_CARD', cardId: 'test' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[0]!.handSize).toBe(8)
    
    // Hand size shouldn't go below 0
    for (let i = 0; i < 10; i++) {
      actor.send({ type: 'DISCARD_CARD', cardId: `test_${i}` })
    }
    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[0]!.handSize).toBe(0)
  })
  
  test('handles era changes', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('canal')
    
    actor.send({ type: 'TEST_SET_ERA', era: 'rail' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')
  })
  
  test('forwards game actions for compatibility', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    // These should not crash and should be forwarded
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELL' })
    actor.send({ type: 'TAKE_LOAN' })
    actor.send({ type: 'SCOUT' })
    actor.send({ type: 'PASS' })
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('playing')
  })
})

describe('Game Actor Pure - State Conversion', () => {
  test('converts private GameState to public', () => {
    const privateGameState: Partial<GameState> = {
      era: 'canal',
      phase: 'playing',
      round: 2,
      currentPlayerIndex: 1,
      finalRound: false,
      players: [
        {
          id: '1',
          name: 'Player 1',
          color: 'red',
          character: 'Richard Arkwright',
          money: 25,
          income: 12,
          victoryPoints: 5,
          hand: [{ id: 'card1' }, { id: 'card2' }] as any,
          industryTilesOnMat: { coal: [{ id: 'tile1' }] } as any,
          spentThisRound: 10,
          actionsThisRound: 1,
          hasPassedThisRound: false,
          canTakeActions: true
        }
      ],
      board: { locations: {}, links: [] },
      coalMarket: { price: 6, cubes: 10 },
      ironMarket: { price: 7, cubes: 5 }
    } as GameState
    
    const playerHandSizes = { '1': 2 }
    const playerTileCounts = { '1': { coal: 1 } }
    
    const publicState = toPublicGameState(privateGameState as GameState, playerHandSizes, playerTileCounts)
    
    expect(publicState.era).toBe('canal')
    expect(publicState.round).toBe(2)
    expect(publicState.currentPlayerIndex).toBe(1)
    expect(publicState.players).toHaveLength(1)
    
    const publicPlayer = publicState.players[0]!
    expect(publicPlayer.id).toBe('1')
    expect(publicPlayer.money).toBe(25)
    expect(publicPlayer.handSize).toBe(2)
    expect(publicPlayer.industryTileCount).toEqual({ coal: 1 })
    
    // Verify private data is excluded
    expect('hand' in publicPlayer).toBe(false)
    expect('industryTilesOnMat' in publicPlayer).toBe(false)
  })
  
  test('converts public GameState back to private for compatibility', () => {
    const publicState: PublicGameState = {
      era: 'rail',
      phase: 'playing',
      round: 3,
      currentPlayerIndex: 0,
      finalRound: true,
      players: [
        {
          id: '1',
          name: 'Player 1',
          color: 'red',
          character: 'Richard Arkwright',
          money: 30,
          income: 15,
          victoryPoints: 10,
          handSize: 3,
          industryTileCount: { coal: 2, iron: 1 },
          spentThisRound: 15,
          actionsThisRound: 2,
          hasPassedThisRound: false,
          canTakeActions: true
        }
      ],
      board: { locations: {}, links: [] },
      coalMarket: { price: 5, cubes: 8 },
      ironMarket: { price: 6, cubes: 3 },
      deck: { remaining: 10, era: 'rail' },
      discardPile: [],
      industryTileSupply: {},
      eraEndConditions: { industryTileMarketsEmpty: 0, playerHandsEmptyCount: 0 },
      gameLog: [],
      turnOrder: [],
      actionsPerRound: 2
    }
    
    const playerHands = { '1': [{ id: 'card1' }, { id: 'card2' }, { id: 'card3' }] }
    const playerTiles = { '1': { coal: [{ id: 'tile1' }, { id: 'tile2' }], iron: [{ id: 'tile3' }] } }
    
    const privateState = fromPublicGameState(publicState, playerHands, playerTiles)
    
    expect(privateState.era).toBe('rail')
    expect(privateState.round).toBe(3)
    expect(privateState.finalRound).toBe(true)
    
    const privatePlayer = privateState.players[0]!
    expect(privatePlayer.money).toBe(30)
    expect(privatePlayer.hand).toHaveLength(3)
    expect(privatePlayer.hand[0]?.id).toBe('card1')
    expect(privatePlayer.industryTilesOnMat.coal).toHaveLength(2)
    expect(privatePlayer.industryTilesOnMat.iron).toHaveLength(1)
    
    // Verify UI state is added back with null values
    expect(privateState.selectedCard).toBeNull()
    expect(privateState.selectedLocation).toBeNull()
    expect(privateState.lastError).toBeNull()
  })
})

describe('Game Actor Pure - Helper Functions', () => {
  test('isPublicStateValid validates state privacy', () => {
    const validPublicState: PublicGameState = {
      era: 'canal',
      phase: 'playing',
      round: 1,
      currentPlayerIndex: 0,
      finalRound: false,
      players: [
        {
          id: '1',
          name: 'Player 1',
          color: 'red',
          character: 'Richard Arkwright',
          money: 17,
          income: 10,
          victoryPoints: 0,
          handSize: 8,
          industryTileCount: {},
          spentThisRound: 0,
          actionsThisRound: 0,
          hasPassedThisRound: false,
          canTakeActions: true
        }
      ],
      board: { locations: {}, links: [] },
      coalMarket: { price: 8, cubes: 13 },
      ironMarket: { price: 8, cubes: 8 },
      deck: { remaining: 0, era: 'canal' },
      discardPile: [],
      industryTileSupply: {},
      eraEndConditions: { industryTileMarketsEmpty: 0, playerHandsEmptyCount: 0 },
      gameLog: [],
      turnOrder: [],
      actionsPerRound: 2
    }
    
    expect(isPublicStateValid(validPublicState)).toBe(true)
    
    // Invalid state with private data
    const invalidState = {
      ...validPublicState,
      players: [
        {
          ...validPublicState.players[0],
          hand: [{ id: 'card1' }] // Private data should not be here
        }
      ]
    } as any
    
    expect(isPublicStateValid(invalidState)).toBe(false)
    
    // Invalid state with no players
    const emptyState = {
      ...validPublicState,
      players: []
    }
    
    expect(isPublicStateValid(emptyState)).toBe(false)
  })
  
  test('getPlayerCount returns player count', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    const snapshot = actor.getSnapshot()
    expect(getPlayerCount(snapshot.context)).toBe(2)
  })
  
  test('getCurrentPlayer returns current player', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    const snapshot = actor.getSnapshot()
    const currentPlayer = getCurrentPlayer(snapshot.context)
    
    expect(currentPlayer).toBeDefined()
    expect(currentPlayer?.id).toBe('1')
    expect(currentPlayer?.name).toBe('Player 1')
  })
  
  test('getPlayerById finds player by id', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    const snapshot = actor.getSnapshot()
    
    const player1 = getPlayerById(snapshot.context, '1')
    expect(player1?.name).toBe('Player 1')
    
    const player2 = getPlayerById(snapshot.context, '2')
    expect(player2?.name).toBe('Player 2')
    
    const nonexistent = getPlayerById(snapshot.context, '999')
    expect(nonexistent).toBeUndefined()
  })
})

describe('Game Actor Pure - Privacy Verification', () => {
  test('contains no private player data', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    const snapshot = actor.getSnapshot()
    
    console.log('🌐 PUBLIC GAME STATE - safe to synchronize to all players:')
    console.log('   - Era:', snapshot.context.era)
    console.log('   - Round:', snapshot.context.round)
    console.log('   - Current player:', snapshot.context.currentPlayerIndex)
    console.log('   - Player count:', snapshot.context.players.length)
    
    snapshot.context.players.forEach((player, index) => {
      console.log(`   - Player ${index + 1}:`)
      console.log(`     * Name: ${player.name}`)
      console.log(`     * Money: £${player.money}`)
      console.log(`     * Income: ${player.income}`)
      console.log(`     * Hand size: ${player.handSize} cards (count only)`)
      console.log(`     * NO private data: ✅`)
      
      // Verify NO private data exists
      expect('hand' in player).toBe(false)
      expect('industryTilesOnMat' in player).toBe(false)
    })
    
    // Verify public state is valid for synchronization
    expect(isPublicStateValid(snapshot.context)).toBe(true)
    
    console.log('✅ Public game state contains no private player data')
    console.log('✅ Safe for multiplayer synchronization')
  })
  
  test('demonstrates privacy separation architecture', () => {
    const actor = setupPureGameActor()
    actor.send({ type: 'START_GAME', players: testPlayers })
    
    const snapshot = actor.getSnapshot()
    
    console.log('🏗️ PRIVACY ARCHITECTURE DEMONSTRATION:')
    console.log('   📊 PUBLIC STATE (gameActorPure):')
    console.log('     - Player money, income, victory points')
    console.log('     - Hand size (count only)')
    console.log('     - Board state and markets')
    console.log('     - Game phase and round')
    
    console.log('   🔒 PRIVATE STATE (playerActor - separate):')
    console.log('     - Actual cards in hand')
    console.log('     - Industry tiles on mat')
    console.log('     - Player-specific secrets')
    
    console.log('   🖥️ UI STATE (uiActor - separate):')
    console.log('     - Card selections')
    console.log('     - Location selections')
    console.log('     - Error states')
    
    // The public state actor successfully isolates public data
    expect(snapshot.context.players.every(p => 'handSize' in p)).toBe(true)
    expect(snapshot.context.players.every(p => !('hand' in p))).toBe(true)
    expect(snapshot.context.players.every(p => !('industryTilesOnMat' in p))).toBe(true)
    
    console.log('✅ Actor separation enables true multiplayer privacy')
  })
})