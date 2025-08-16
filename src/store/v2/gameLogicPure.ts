// Game Logic Pure - Clean game logic with actor coordination
import { setup, assign, ActorRefFrom } from 'xstate'
import type { CityId } from '../../data/board'
import type { Card, IndustryType } from '../../data/cards'
import type { IndustryTile } from '../../data/industryTiles'
import { gameActorPure, type PublicGameState, type PublicPlayerState } from './gameActorPure'
import { playerActor, type PlayerEvent } from './playerActor'
import { uiActor } from './uiActor'

/**
 * Game Logic Pure - Enhanced game logic with actor coordination
 * 
 * This actor manages:
 * 1. Pure game logic without private state dependencies
 * 2. Coordination between player actors and UI actors
 * 3. Public game state that can be safely synchronized
 * 4. Game action delegation to appropriate actors
 * 
 * Actor Coordination Pattern:
 * - gameLogicPure: Manages public game state and rules
 * - playerActors: Handle private player state (hands, tiles)
 * - uiActors: Handle client-side UI state
 */

export interface GameLogicContext extends PublicGameState {
  // Actor references for coordination
  playerActors: Record<string, ActorRefFrom<typeof playerActor> | null>
  
  // Action state for multi-step coordination
  currentAction: {
    type: 'build' | 'network' | 'develop' | 'sell' | 'scout' | 'loan' | 'pass' | null
    playerId: string | null
    step: 'selecting' | 'confirming' | 'executing' | null
    data: any // Action-specific data
  }
  
  // Game flow state
  waitingForPlayerActors: boolean
  pendingPlayerUpdates: Record<string, PlayerEvent[]>
}

export type GameLogicEvent =
  | { type: 'INITIALIZE_GAME'; players: Omit<PublicPlayerState, 'handSize' | 'industryTileCount'>[] }
  | { type: 'REGISTER_PLAYER_ACTOR'; playerId: string; actorRef: ActorRefFrom<typeof playerActor> }
  | { type: 'PLAYER_READY'; playerId: string }
  | { type: 'ALL_PLAYERS_READY' }
  
  // Game Actions
  | { type: 'START_BUILD_ACTION'; playerId: string }
  | { type: 'START_NETWORK_ACTION'; playerId: string }
  | { type: 'START_DEVELOP_ACTION'; playerId: string }
  | { type: 'START_SELL_ACTION'; playerId: string }
  | { type: 'START_SCOUT_ACTION'; playerId: string }
  | { type: 'START_LOAN_ACTION'; playerId: string }
  | { type: 'PASS_ACTION'; playerId: string }
  
  // Action Execution
  | { type: 'EXECUTE_BUILD'; playerId: string; cardId: string; location: CityId; industryType: IndustryType }
  | { type: 'EXECUTE_NETWORK'; playerId: string; cardId: string; links: { from: CityId; to: CityId }[] }
  | { type: 'EXECUTE_DEVELOP'; playerId: string; cardIds: string[]; industryTypes: IndustryType[] }
  | { type: 'EXECUTE_SELL'; playerId: string; industryLocation: CityId; industryType: IndustryType }
  | { type: 'EXECUTE_SCOUT'; playerId: string; cardIds: string[] }
  | { type: 'EXECUTE_LOAN'; playerId: string; cardId: string }
  
  // Game Flow
  | { type: 'END_TURN' }
  | { type: 'NEXT_ROUND' }
  | { type: 'END_ERA' }
  | { type: 'END_GAME' }
  
  // Coordination Events
  | { type: 'SYNC_PLAYER_STATE'; playerId: string; handSize: number; tileCount: Record<string, number> }
  | { type: 'PLAYER_ACTION_COMPLETED'; playerId: string; success: boolean; error?: string }

const initialGameLogicContext: GameLogicContext = {
  // Public game state
  era: 'canal',
  phase: 'playing',
  round: 1,
  currentPlayerIndex: 0,
  finalRound: false,
  players: [],
  board: { locations: {}, links: [] },
  coalMarket: [
    { price: 8, cubes: 13, maxCubes: 13 },
    { price: 7, cubes: 0, maxCubes: 6 },
    { price: 6, cubes: 0, maxCubes: 6 },
    { price: 5, cubes: 0, maxCubes: 6 }
  ],
  ironMarket: [
    { price: 8, cubes: 8, maxCubes: 8 },
    { price: 7, cubes: 0, maxCubes: 4 },
    { price: 6, cubes: 0, maxCubes: 4 },
    { price: 5, cubes: 0, maxCubes: 4 }
  ],
  deck: { remaining: 0, era: 'canal' },
  discardPile: [],
  industryTileSupply: {},
  eraEndConditions: { industryTileMarketsEmpty: 0, playerHandsEmptyCount: 0 },
  gameLog: [],
  turnOrder: [],
  actionsPerRound: 2,
  
  // Actor coordination
  playerActors: {},
  currentAction: {
    type: null,
    playerId: null,
    step: null,
    data: null
  },
  waitingForPlayerActors: false,
  pendingPlayerUpdates: {}
}

export const gameLogicPure = setup({
  types: {} as {
    context: GameLogicContext
    events: GameLogicEvent
  },
  actions: {
    // Game Initialization
    initializeGame: assign({
      players: ({ event }) => {
        if (event.type === 'INITIALIZE_GAME') {
          return event.players.map(player => ({
            ...player,
            handSize: 8, // Initial hand size
            industryTileCount: {
              coal: 0,
              iron: 0,
              cotton: 0,
              manufactured: 0,
              pottery: 0,
              brewery: 0
            }
          }))
        }
        return []
      },
      turnOrder: ({ event }) => {
        if (event.type === 'INITIALIZE_GAME') {
          return event.players.map(player => player.id)
        }
        return []
      }
    }),
    
    // Player Actor Registration
    registerPlayerActor: assign({
      playerActors: ({ context, event }) => {
        if (event.type === 'REGISTER_PLAYER_ACTOR') {
          return {
            ...context.playerActors,
            [event.playerId]: event.actorRef
          }
        }
        return context.playerActors
      }
    }),
    
    // Action Management
    startAction: assign({
      currentAction: ({ context, event }) => {
        if (event.type.startsWith('START_') && 'playerId' in event) {
          const actionType = event.type.replace('START_', '').replace('_ACTION', '').toLowerCase()
          return {
            type: actionType as any,
            playerId: event.playerId,
            step: 'selecting',
            data: {}
          }
        }
        return context.currentAction
      }
    }),
    
    // Build Action Execution
    executeBuild: assign(({ context, event }) => {
      if (event.type === 'EXECUTE_BUILD') {
        console.log(`🏗️ Executing build action for player ${event.playerId}`)
        
        // Update public game state
        const updatedContext = {
          ...context,
          currentAction: { type: null, playerId: null, step: null, data: null }
        }
        
        // Send updates to player actor
        const playerActor = context.playerActors[event.playerId]
        if (playerActor) {
          playerActor.send({ type: 'DISCARD_CARD', cardId: event.cardId })
        }
        
        return updatedContext
      }
      return {}
    }),
    
    // Network Action Execution
    executeNetwork: assign(({ context, event }) => {
      if (event.type === 'EXECUTE_NETWORK') {
        console.log(`🛤️ Executing network action for player ${event.playerId}`)
        
        // Update public game state with new links
        const updatedContext = {
          ...context,
          currentAction: { type: null, playerId: null, step: null, data: null }
        }
        
        // Send updates to player actor
        const playerActor = context.playerActors[event.playerId]
        if (playerActor) {
          playerActor.send({ type: 'DISCARD_CARD', cardId: event.cardId })
        }
        
        return updatedContext
      }
      return {}
    }),
    
    // Develop Action Execution
    executeDevelop: assign(({ context, event }) => {
      if (event.type === 'EXECUTE_DEVELOP') {
        console.log(`🔬 Executing develop action for player ${event.playerId}`)
        
        const updatedContext = {
          ...context,
          currentAction: { type: null, playerId: null, step: null, data: null }
        }
        
        // Send updates to player actor
        const playerActor = context.playerActors[event.playerId]
        if (playerActor) {
          // Discard cards used for develop
          event.cardIds.forEach(cardId => {
            playerActor.send({ type: 'DISCARD_CARD', cardId })
          })
          
          // Add developed industry tiles
          event.industryTypes.forEach(industryType => {
            // This would need to get the actual tile from the supply
            const tile = { id: `${industryType}_dev`, type: industryType } as IndustryTile
            playerActor.send({ type: 'ADD_INDUSTRY_TILE', tile })
          })
        }
        
        return updatedContext
      }
      return {}
    }),
    
    // Loan Action Execution
    executeLoan: assign(({ context, event }) => {
      if (event.type === 'EXECUTE_LOAN') {
        console.log(`💰 Executing loan action for player ${event.playerId}`)
        
        // Update player money in public state
        const updatedPlayers = context.players.map(player => 
          player.id === event.playerId
            ? { 
                ...player, 
                money: player.money + 30,
                income: Math.max(-10, player.income - 3)
              }
            : player
        )
        
        const updatedContext = {
          ...context,
          players: updatedPlayers,
          currentAction: { type: null, playerId: null, step: null, data: null }
        }
        
        // Send updates to player actor
        const playerActor = context.playerActors[event.playerId]
        if (playerActor) {
          playerActor.send({ type: 'DISCARD_CARD', cardId: event.cardId })
        }
        
        return updatedContext
      }
      return {}
    }),
    
    // Scout Action Execution
    executeScout: assign(({ context, event }) => {
      if (event.type === 'EXECUTE_SCOUT') {
        console.log(`🔍 Executing scout action for player ${event.playerId}`)
        
        const updatedContext = {
          ...context,
          currentAction: { type: null, playerId: null, step: null, data: null }
        }
        
        // Send updates to player actor
        const playerActor = context.playerActors[event.playerId]
        if (playerActor) {
          playerActor.send({ type: 'DISCARD_CARDS', cardIds: event.cardIds })
          // TODO: Add new cards from deck
        }
        
        return updatedContext
      }
      return {}
    }),
    
    // Turn Management
    endTurn: assign({
      currentPlayerIndex: ({ context }) => {
        return (context.currentPlayerIndex + 1) % context.players.length
      },
      currentAction: { type: null, playerId: null, step: null, data: null }
    }),
    
    nextRound: assign({
      round: ({ context }) => context.round + 1,
      currentPlayerIndex: 0
    }),
    
    // Player State Synchronization
    syncPlayerState: assign({
      players: ({ context, event }) => {
        if (event.type === 'SYNC_PLAYER_STATE') {
          return context.players.map(player =>
            player.id === event.playerId
              ? {
                  ...player,
                  handSize: event.handSize,
                  industryTileCount: event.tileCount
                }
              : player
          )
        }
        return context.players
      }
    }),
    
    // Error Handling
    logActionError: ({ event }) => {
      if (event.type === 'PLAYER_ACTION_COMPLETED' && event.error) {
        console.error(`❌ Action failed for player ${event.playerId}: ${event.error}`)
      }
    }
  }
}).createMachine({
  id: 'gameLogicPure',
  initial: 'initializing',
  context: initialGameLogicContext,
  states: {
    initializing: {
      on: {
        INITIALIZE_GAME: {
          target: 'waitingForPlayers',
          actions: 'initializeGame'
        }
      }
    },
    
    waitingForPlayers: {
      on: {
        REGISTER_PLAYER_ACTOR: {
          actions: 'registerPlayerActor'
        },
        ALL_PLAYERS_READY: {
          target: 'playing'
        }
      }
    },
    
    playing: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            START_BUILD_ACTION: {
              target: 'executingAction',
              actions: 'startAction'
            },
            START_NETWORK_ACTION: {
              target: 'executingAction',
              actions: 'startAction'
            },
            START_DEVELOP_ACTION: {
              target: 'executingAction',
              actions: 'startAction'
            },
            START_SELL_ACTION: {
              target: 'executingAction',
              actions: 'startAction'
            },
            START_SCOUT_ACTION: {
              target: 'executingAction',
              actions: 'startAction'
            },
            START_LOAN_ACTION: {
              target: 'executingAction',
              actions: 'startAction'
            },
            PASS_ACTION: {
              actions: 'endTurn'
            }
          }
        },
        
        executingAction: {
          on: {
            EXECUTE_BUILD: {
              target: 'idle',
              actions: ['executeBuild', 'endTurn']
            },
            EXECUTE_NETWORK: {
              target: 'idle',
              actions: ['executeNetwork', 'endTurn']
            },
            EXECUTE_DEVELOP: {
              target: 'idle',
              actions: ['executeDevelop', 'endTurn']
            },
            EXECUTE_SELL: {
              target: 'idle',
              actions: ['endTurn']
            },
            EXECUTE_SCOUT: {
              target: 'idle',
              actions: ['executeScout', 'endTurn']
            },
            EXECUTE_LOAN: {
              target: 'idle',
              actions: ['executeLoan', 'endTurn']
            },
            PLAYER_ACTION_COMPLETED: [
              {
                target: 'idle',
                actions: ['endTurn'],
                guard: ({ event }) => event.success
              },
              {
                target: 'idle',
                actions: 'logActionError',
                guard: ({ event }) => !event.success
              }
            ]
          }
        }
      },
      
      on: {
        SYNC_PLAYER_STATE: {
          actions: 'syncPlayerState'
        },
        END_TURN: {
          actions: 'endTurn'
        },
        NEXT_ROUND: {
          actions: 'nextRound'
        }
      }
    },
    
    eraEnd: {
      on: {
        END_ERA: {
          target: 'playing'
        }
      }
    },
    
    gameEnd: {
      type: 'final'
    }
  }
})

// Helper functions for game logic coordination
export const createGameLogicWithActors = () => {
  // This would be used by the orchestrator to create a fully coordinated game
  return gameLogicPure
}

export const coordinatePlayerAction = (
  gameLogicRef: ActorRefFrom<typeof gameLogicPure>,
  playerActorRef: ActorRefFrom<typeof playerActor>,
  actionType: string,
  actionData: any
) => {
  // Coordinate between game logic and player actors
  console.log(`🎯 Coordinating ${actionType} action with player actor`)
  
  // This would implement the coordination logic between actors
  return true
}

export const validateActionWithActors = (
  publicState: PublicGameState,
  playerId: string,
  actionType: string,
  actionData: any
): { valid: boolean; error?: string } => {
  // Validate actions using only public state
  // This ensures validation can work in multiplayer without private data
  
  const player = publicState.players.find(p => p.id === playerId)
  if (!player) {
    return { valid: false, error: 'Player not found' }
  }
  
  if (publicState.currentPlayerIndex !== publicState.players.indexOf(player)) {
    return { valid: false, error: 'Not this player\'s turn' }
  }
  
  // Additional validation based on action type
  switch (actionType) {
    case 'build':
      if (player.money < 5) {
        return { valid: false, error: 'Insufficient money for build' }
      }
      break
    case 'loan':
      if (player.income <= -10) {
        return { valid: false, error: 'Income too low for loan' }
      }
      break
    // Add more action-specific validations
  }
  
  return { valid: true }
}