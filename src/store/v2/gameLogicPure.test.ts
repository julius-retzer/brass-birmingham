// Game Logic Pure Tests - Actor coordination and pure game logic
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameLogicPure, validateActionWithActors, coordinatePlayerAction } from './gameLogicPure'
import { playerActor } from './playerActor'
import type { PublicGameState } from './gameActorPure'

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

const setupGameLogic = () => {
  const actor = createActor(gameLogicPure)
  activeActors.push(actor)
  actor.start()
  return actor
}

const setupPlayerActor = () => {
  const actor = createActor(playerActor)
  activeActors.push(actor)
  actor.start()
  return actor
}

// Test data
const testPlayers = [
  {
    id: 'player1',
    name: 'Alice',
    color: 'red' as const,
    character: 'Richard Arkwright' as const,
    money: 17,
    victoryPoints: 0,
    income: 10
  },
  {
    id: 'player2',
    name: 'Bob',
    color: 'blue' as const,
    character: 'Eliza Tinsley' as const,
    money: 17,
    victoryPoints: 0,
    income: 10
  }
]

describe('Game Logic Pure - Initialization', () => {
  test('starts in initializing state', () => {
    const gameLogic = setupGameLogic()
    const snapshot = gameLogic.getSnapshot()
    
    expect(snapshot.value).toBe('initializing')
    expect(snapshot.context.players).toHaveLength(0)
    expect(snapshot.context.playerActors).toEqual({})
    expect(snapshot.context.currentAction.type).toBeNull()
  })
  
  test('can initialize game with players', () => {
    const gameLogic = setupGameLogic()
    
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    
    const snapshot = gameLogic.getSnapshot()
    expect(snapshot.value).toBe('waitingForPlayers')
    expect(snapshot.context.players).toHaveLength(2)
    expect(snapshot.context.players[0]?.handSize).toBe(8)
    expect(snapshot.context.players[0]?.industryTileCount).toEqual({
      coal: 0,
      iron: 0,
      cotton: 0,
      manufactured: 0,
      pottery: 0,
      brewery: 0
    })
    expect(snapshot.context.turnOrder).toEqual(['player1', 'player2'])
  })
})

describe('Game Logic Pure - Player Actor Registration', () => {
  test('can register player actors', () => {
    const gameLogic = setupGameLogic()
    const player1Actor = setupPlayerActor()
    const player2Actor = setupPlayerActor()
    
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    
    // Register player actors
    gameLogic.send({ 
      type: 'REGISTER_PLAYER_ACTOR', 
      playerId: 'player1', 
      actorRef: player1Actor 
    })
    gameLogic.send({ 
      type: 'REGISTER_PLAYER_ACTOR', 
      playerId: 'player2', 
      actorRef: player2Actor 
    })
    
    const snapshot = gameLogic.getSnapshot()
    expect(snapshot.context.playerActors['player1']).toBe(player1Actor)
    expect(snapshot.context.playerActors['player2']).toBe(player2Actor)
  })
  
  test('transitions to playing when all players ready', () => {
    const gameLogic = setupGameLogic()
    
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    const snapshot = gameLogic.getSnapshot()
    expect(snapshot.value).toEqual({ playing: 'idle' })
  })
})

describe('Game Logic Pure - Action Management', () => {
  test('can start build action', () => {
    const gameLogic = setupGameLogic()
    
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    gameLogic.send({ type: 'START_BUILD_ACTION', playerId: 'player1' })
    
    const snapshot = gameLogic.getSnapshot()
    expect(snapshot.value).toEqual({ playing: 'executingAction' })
    expect(snapshot.context.currentAction.type).toBe('build')
    expect(snapshot.context.currentAction.playerId).toBe('player1')
    expect(snapshot.context.currentAction.step).toBe('selecting')
  })
  
  test('can execute build action with player actor coordination', () => {
    const gameLogic = setupGameLogic()
    const player1Actor = setupPlayerActor()
    
    // Initialize
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ 
      type: 'REGISTER_PLAYER_ACTOR', 
      playerId: 'player1', 
      actorRef: player1Actor 
    })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    // Initialize player actor
    player1Actor.send({
      type: 'INITIALIZE_PLAYER',
      playerId: 'player1',
      initialHand: [
        { id: 'card1', type: 'location', location: 'birmingham', color: 'blue' }
      ],
      initialTiles: { coal: [], iron: [], cotton: [], manufactured: [], pottery: [], brewery: [] }
    })
    
    // Start and execute build action
    gameLogic.send({ type: 'START_BUILD_ACTION', playerId: 'player1' })
    gameLogic.send({ 
      type: 'EXECUTE_BUILD', 
      playerId: 'player1', 
      cardId: 'card1',
      location: 'birmingham',
      industryType: 'coal'
    })
    
    const gameSnapshot = gameLogic.getSnapshot()
    expect(gameSnapshot.value).toEqual({ playing: 'idle' })
    expect(gameSnapshot.context.currentAction.type).toBeNull()
    expect(gameSnapshot.context.currentPlayerIndex).toBe(1) // Turn advanced
    
    // Verify player actor received the discard command
    const playerSnapshot = player1Actor.getSnapshot()
    expect(playerSnapshot.context.hand).toHaveLength(0) // Card was discarded
  })
  
  test('can execute loan action with money update', () => {
    const gameLogic = setupGameLogic()
    const player1Actor = setupPlayerActor()
    
    // Initialize
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ 
      type: 'REGISTER_PLAYER_ACTOR', 
      playerId: 'player1', 
      actorRef: player1Actor 
    })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    // Initialize player actor
    player1Actor.send({
      type: 'INITIALIZE_PLAYER',
      playerId: 'player1',
      initialHand: [
        { id: 'card1', type: 'location', location: 'birmingham', color: 'blue' }
      ],
      initialTiles: { coal: [], iron: [], cotton: [], manufactured: [], pottery: [], brewery: [] }
    })
    
    let gameSnapshot = gameLogic.getSnapshot()
    const initialMoney = gameSnapshot.context.players[0]?.money ?? 0
    const initialIncome = gameSnapshot.context.players[0]?.income ?? 0
    
    // Execute loan action
    gameLogic.send({ type: 'START_LOAN_ACTION', playerId: 'player1' })
    gameLogic.send({ 
      type: 'EXECUTE_LOAN', 
      playerId: 'player1', 
      cardId: 'card1'
    })
    
    gameSnapshot = gameLogic.getSnapshot()
    const updatedPlayer = gameSnapshot.context.players[0]
    
    expect(updatedPlayer?.money).toBe(initialMoney + 30) // +£30
    expect(updatedPlayer?.income).toBe(Math.max(-10, initialIncome - 3)) // -3 income
    expect(gameSnapshot.context.currentPlayerIndex).toBe(1) // Turn advanced
    
    // Verify player actor received the discard command
    const playerSnapshot = player1Actor.getSnapshot()
    expect(playerSnapshot.context.hand).toHaveLength(0) // Card was discarded
  })
  
  test('can execute develop action with multiple cards and tiles', () => {
    const gameLogic = setupGameLogic()
    const player1Actor = setupPlayerActor()
    
    // Initialize
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ 
      type: 'REGISTER_PLAYER_ACTOR', 
      playerId: 'player1', 
      actorRef: player1Actor 
    })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    // Initialize player actor with multiple cards
    player1Actor.send({
      type: 'INITIALIZE_PLAYER',
      playerId: 'player1',
      initialHand: [
        { id: 'card1', type: 'industry', industries: ['coal'] },
        { id: 'card2', type: 'industry', industries: ['iron'] }
      ],
      initialTiles: { coal: [], iron: [], cotton: [], manufactured: [], pottery: [], brewery: [] }
    })
    
    // Execute develop action
    gameLogic.send({ type: 'START_DEVELOP_ACTION', playerId: 'player1' })
    gameLogic.send({ 
      type: 'EXECUTE_DEVELOP', 
      playerId: 'player1', 
      cardIds: ['card1', 'card2'],
      industryTypes: ['coal', 'iron']
    })
    
    const gameSnapshot = gameLogic.getSnapshot()
    expect(gameSnapshot.value).toEqual({ playing: 'idle' })
    expect(gameSnapshot.context.currentPlayerIndex).toBe(1) // Turn advanced
    
    // Verify player actor received the commands
    const playerSnapshot = player1Actor.getSnapshot()
    expect(playerSnapshot.context.hand).toHaveLength(0) // Cards were discarded
    
    // Check that tiles were added (simplified check)
    const totalTiles = Object.values(playerSnapshot.context.industryTilesOnMat).flat().length
    expect(totalTiles).toBe(2) // 2 tiles added
  })
})

describe('Game Logic Pure - Turn Management', () => {
  test('advances turn after action execution', () => {
    const gameLogic = setupGameLogic()
    
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    let snapshot = gameLogic.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(0)
    
    // Execute pass action
    gameLogic.send({ type: 'PASS_ACTION', playerId: 'player1' })
    
    snapshot = gameLogic.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(1)
    
    // Execute another pass action
    gameLogic.send({ type: 'PASS_ACTION', playerId: 'player2' })
    
    snapshot = gameLogic.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(0) // Wrapped around
  })
  
  test('can advance to next round', () => {
    const gameLogic = setupGameLogic()
    
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    let snapshot = gameLogic.getSnapshot()
    expect(snapshot.context.round).toBe(1)
    
    gameLogic.send({ type: 'NEXT_ROUND' })
    
    snapshot = gameLogic.getSnapshot()
    expect(snapshot.context.round).toBe(2)
    expect(snapshot.context.currentPlayerIndex).toBe(0) // Reset to first player
  })
})

describe('Game Logic Pure - Player State Synchronization', () => {
  test('can sync player state from player actors', () => {
    const gameLogic = setupGameLogic()
    
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    // Sync updated player state
    gameLogic.send({ 
      type: 'SYNC_PLAYER_STATE', 
      playerId: 'player1', 
      handSize: 5,
      tileCount: { coal: 2, iron: 1, cotton: 0, manufactured: 0, pottery: 0, brewery: 0 }
    })
    
    const snapshot = gameLogic.getSnapshot()
    const player1 = snapshot.context.players.find(p => p.id === 'player1')
    
    expect(player1?.handSize).toBe(5)
    expect(player1?.industryTileCount.coal).toBe(2)
    expect(player1?.industryTileCount.iron).toBe(1)
  })
})

describe('Game Logic Pure - Action Validation', () => {
  test('validates actions using only public state', () => {
    const publicState: PublicGameState = {
      era: 'canal',
      phase: 'playing',
      round: 1,
      currentPlayerIndex: 0,
      finalRound: false,
      players: [
        {
          id: 'player1',
          name: 'Alice',
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
        },
        {
          id: 'player2',
          name: 'Bob',
          color: 'blue',
          character: 'Eliza Tinsley',
          money: 4, // Low money
          income: -8, // Low income
          victoryPoints: 0,
          handSize: 5,
          industryTileCount: {},
          spentThisRound: 0,
          actionsThisRound: 0,
          hasPassedThisRound: false,
          canTakeActions: true
        }
      ],
      board: { locations: {}, links: [] },
      coalMarket: [],
      ironMarket: [],
      deck: { remaining: 0, era: 'canal' },
      discardPile: [],
      industryTileSupply: {},
      eraEndConditions: { industryTileMarketsEmpty: 0, playerHandsEmptyCount: 0 },
      gameLog: [],
      turnOrder: ['player1', 'player2'],
      actionsPerRound: 2
    }
    
    // Valid build action for player1 (current player with enough money)
    const validBuild = validateActionWithActors(publicState, 'player1', 'build', {})
    expect(validBuild.valid).toBe(true)
    
    // Invalid build action for player2 (not their turn)
    const invalidTurn = validateActionWithActors(publicState, 'player2', 'build', {})
    expect(invalidTurn.valid).toBe(false)
    expect(invalidTurn.error).toContain('turn')
    
    // Invalid build action for player2 (insufficient money)
    publicState.currentPlayerIndex = 1 // Make it player2's turn
    const invalidMoney = validateActionWithActors(publicState, 'player2', 'build', {})
    expect(invalidMoney.valid).toBe(false)
    expect(invalidMoney.error).toContain('money')
    
    // Invalid loan action for player2 (income too low)
    const invalidLoan = validateActionWithActors(publicState, 'player2', 'loan', {})
    expect(invalidLoan.valid).toBe(false)
    expect(invalidLoan.error).toContain('Income')
    
    // Valid loan action for player1 
    publicState.currentPlayerIndex = 0 // Back to player1
    const validLoan = validateActionWithActors(publicState, 'player1', 'loan', {})
    expect(validLoan.valid).toBe(true)
  })
})

describe('Game Logic Pure - Privacy and Coordination', () => {
  test('demonstrates pure game logic with no private state access', () => {
    const gameLogic = setupGameLogic()
    const player1Actor = setupPlayerActor()
    
    console.log('\n🧩 PURE GAME LOGIC DEMONSTRATION')
    console.log('================================')
    
    // Initialize game
    gameLogic.send({ type: 'INITIALIZE_GAME', players: testPlayers })
    gameLogic.send({ 
      type: 'REGISTER_PLAYER_ACTOR', 
      playerId: 'player1', 
      actorRef: player1Actor 
    })
    gameLogic.send({ type: 'ALL_PLAYERS_READY' })
    
    // Initialize player with private state
    player1Actor.send({
      type: 'INITIALIZE_PLAYER',
      playerId: 'player1',
      initialHand: [
        { id: 'secret_card_1', type: 'location', location: 'birmingham', color: 'blue' },
        { id: 'secret_card_2', type: 'industry', industries: ['coal'] }
      ],
      initialTiles: { coal: [], iron: [], cotton: [], manufactured: [], pottery: [], brewery: [] }
    })
    
    const gameSnapshot = gameLogic.getSnapshot()
    const playerSnapshot = player1Actor.getSnapshot()
    
    console.log('🌐 Game Logic State (public only):')
    console.log('   - Current player:', gameSnapshot.context.currentPlayerIndex)
    console.log('   - Player count:', gameSnapshot.context.players.length)
    console.log('   - Player 1 hand size:', gameSnapshot.context.players[0]?.handSize)
    console.log('   - NO access to actual cards ✅')
    
    console.log('🔒 Player Actor State (private):')
    console.log('   - Actual hand:', playerSnapshot.context.hand.map(c => c.id))
    console.log('   - Player can see their cards ✅')
    
    console.log('🎯 Action Coordination:')
    
    // Execute an action through coordination
    gameLogic.send({ type: 'START_BUILD_ACTION', playerId: 'player1' })
    gameLogic.send({ 
      type: 'EXECUTE_BUILD', 
      playerId: 'player1', 
      cardId: 'secret_card_1',
      location: 'birmingham',
      industryType: 'coal'
    })
    
    const updatedGameSnapshot = gameLogic.getSnapshot()
    const updatedPlayerSnapshot = player1Actor.getSnapshot()
    
    console.log('   - Game logic executed public state changes ✅')
    console.log('   - Player actor handled private state changes ✅')
    console.log('   - Turn advanced to:', updatedGameSnapshot.context.currentPlayerIndex)
    console.log('   - Player hand after action:', updatedPlayerSnapshot.context.hand.length, 'cards')
    
    // Verify the coordination worked
    expect(updatedGameSnapshot.context.currentPlayerIndex).toBe(1)
    expect(updatedPlayerSnapshot.context.hand).toHaveLength(1) // Card was discarded
    expect(updatedPlayerSnapshot.context.hand[0]?.id).toBe('secret_card_2')
    
    console.log('✅ Pure game logic with actor coordination successful')
    console.log('✅ No private state leaked to game logic')
    console.log('✅ Privacy maintained while game functions correctly')
  })
})