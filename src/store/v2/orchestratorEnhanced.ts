// Enhanced Orchestrator - Complete actor coordination with pure game logic
import { setup, assign, createActor, type ActorRefFrom } from 'xstate'
import { gameLogicPure, type GameLogicContext, type GameLogicEvent } from './gameLogicPure'
import { playerActor, type PlayerPrivateState, getHandSize, getTileCount } from './playerActor'
import { uiActor, type UIState } from './uiActor'
import { getCombinedState } from './gameOrchestrator'
import type { GameState, GameEvent } from './gameActor'

/**
 * Enhanced Orchestrator - Complete actor system coordination
 * 
 * This orchestrator manages the complete actor ecosystem:
 * 1. Game Logic Actor: Pure public game state and rules
 * 2. Player Actors: One per player for private state (hands, tiles)
 * 3. UI Actor: Client-side UI state
 * 4. Coordination: Events, state sync, action delegation
 * 
 * Provides backward compatibility while using the new architecture.
 */

export interface EnhancedOrchestratorContext {
  // Core actors
  gameLogicRef: ActorRefFrom<typeof gameLogicPure> | null
  uiActorRef: ActorRefFrom<typeof uiActor> | null
  
  // Player actors (one per player)
  playerActors: Record<string, ActorRefFrom<typeof playerActor> | null>
  
  // Coordination state
  playersInitialized: Record<string, boolean>
  allPlayersReady: boolean
  
  // Current action coordination
  pendingAction: {
    type: string | null
    playerId: string | null
    data: any
  }
}

type EnhancedOrchestratorEvent = 
  | GameEvent
  | { type: 'INITIALIZE_ORCHESTRATOR' }
  | { type: 'CLEANUP_ORCHESTRATOR' }
  | { type: 'PLAYER_INITIALIZED'; playerId: string }
  | { type: 'SYNC_ALL_PLAYER_STATES' }

export const enhancedOrchestrator = setup({
  types: {} as {
    context: EnhancedOrchestratorContext
    events: EnhancedOrchestratorEvent
  },
  actors: {
    gameLogicPure,
    playerActor,
    uiActor
  },
  actions: {
    initializeActors: assign({
      gameLogicRef: ({ spawn }) => spawn('gameLogicPure', { id: 'gameLogic' }),
      uiActorRef: ({ spawn }) => spawn('uiActor', { id: 'ui' }),
      playersInitialized: {},
      allPlayersReady: false,
      pendingAction: { type: null, playerId: null, data: null }
    }),
    
    initializeGame: ({ context, event }) => {
      if (event.type === 'START_GAME' && context.gameLogicRef) {
        console.log('🎮 Initializing enhanced orchestrator with', event.players.length, 'players')
        
        // Create player actors
        event.players.forEach((player, index) => {
          const playerActorRef = createActor(playerActor, { id: `player_${player.id}` })
          playerActorRef.start()
          
          // Initialize player with their starting hand and tiles
          playerActorRef.send({
            type: 'INITIALIZE_PLAYER',
            playerId: player.id,
            initialHand: [], // TODO: Get initial hand from game setup
            initialTiles: {
              coal: [],
              iron: [],
              cotton: [],
              manufactured: [],
              pottery: [],
              brewery: []
            }
          })
          
          context.playerActors[player.id] = playerActorRef
        })
        
        // Initialize game logic
        context.gameLogicRef.send({
          type: 'INITIALIZE_GAME',
          players: event.players
        })
        
        // Register player actors with game logic
        Object.entries(context.playerActors).forEach(([playerId, actorRef]) => {
          if (actorRef && context.gameLogicRef) {
            context.gameLogicRef.send({
              type: 'REGISTER_PLAYER_ACTOR',
              playerId,
              actorRef
            })
          }
        })
        
        // Mark as ready
        if (context.gameLogicRef) {
          context.gameLogicRef.send({ type: 'ALL_PLAYERS_READY' })
        }
      }
    },
    
    // Action delegation to appropriate actors
    delegateBuildAction: ({ context, event }) => {
      if (event.type === 'BUILD' && context.gameLogicRef) {
        const currentPlayer = getCurrentPlayerId(context)
        if (currentPlayer) {
          context.gameLogicRef.send({
            type: 'START_BUILD_ACTION',
            playerId: currentPlayer
          })
        }
      }
    },
    
    delegateNetworkAction: ({ context, event }) => {
      if (event.type === 'NETWORK' && context.gameLogicRef) {
        const currentPlayer = getCurrentPlayerId(context)
        if (currentPlayer) {
          context.gameLogicRef.send({
            type: 'START_NETWORK_ACTION',
            playerId: currentPlayer
          })
        }
      }
    },
    
    delegateDevelopAction: ({ context, event }) => {
      if (event.type === 'DEVELOP' && context.gameLogicRef) {
        const currentPlayer = getCurrentPlayerId(context)
        if (currentPlayer) {
          context.gameLogicRef.send({
            type: 'START_DEVELOP_ACTION',
            playerId: currentPlayer
          })
        }
      }
    },
    
    delegateLoanAction: ({ context, event }) => {
      if (event.type === 'TAKE_LOAN' && context.gameLogicRef) {
        const currentPlayer = getCurrentPlayerId(context)
        if (currentPlayer) {
          context.gameLogicRef.send({
            type: 'START_LOAN_ACTION',
            playerId: currentPlayer
          })
        }
      }
    },
    
    // UI action delegation
    delegateUISelection: ({ context, event }) => {
      if (context.uiActorRef) {
        switch (event.type) {
          case 'SELECT_CARD':
            if (event.type === 'SELECT_CARD') {
              // Get the actual card from player actor
              const currentPlayer = getCurrentPlayerId(context)
              if (currentPlayer) {
                const playerActor = context.playerActors[currentPlayer]
                if (playerActor) {
                  const playerState = playerActor.getSnapshot().context
                  const card = playerState.hand.find(c => c.id === event.cardId)
                  if (card) {
                    context.uiActorRef.send({ type: 'SELECT_CARD', card })
                  }
                }
              }
            }
            break
          case 'SELECT_LOCATION':
            context.uiActorRef.send({ type: 'SELECT_LOCATION', cityId: event.cityId })
            break
          case 'SELECT_INDUSTRY_TYPE':
            context.uiActorRef.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: event.industryType })
            break
          case 'SELECT_LINK':
            context.uiActorRef.send({ type: 'SELECT_LINK', from: event.from, to: event.to })
            break
        }
      }
    },
    
    // Execute coordinated actions
    executeCoordinatedAction: ({ context, event }) => {
      if (event.type === 'CONFIRM' && context.gameLogicRef && context.uiActorRef) {
        const currentPlayer = getCurrentPlayerId(context)
        if (!currentPlayer) return
        
        const uiState = context.uiActorRef.getSnapshot().context
        const playerActor = context.playerActors[currentPlayer]
        
        if (!playerActor) return
        
        // Determine action type from UI state
        if (uiState.selectedCard && uiState.selectedLocation) {
          // Build action
          context.gameLogicRef.send({
            type: 'EXECUTE_BUILD',
            playerId: currentPlayer,
            cardId: uiState.selectedCard.id,
            location: uiState.selectedLocation,
            industryType: 'coal' // TODO: Get from UI selections
          })
        } else if (uiState.selectedCard && uiState.selectedLink) {
          // Network action
          context.gameLogicRef.send({
            type: 'EXECUTE_NETWORK',
            playerId: currentPlayer,
            cardId: uiState.selectedCard.id,
            links: [uiState.selectedLink]
          })
        } else if (uiState.selectedCard && !uiState.selectedLocation) {
          // Loan action
          context.gameLogicRef.send({
            type: 'EXECUTE_LOAN',
            playerId: currentPlayer,
            cardId: uiState.selectedCard.id
          })
        }
        
        // Clear UI selections after action
        context.uiActorRef.send({ type: 'CLEAR_ALL_SELECTIONS' })
      }
    },
    
    // State synchronization
    syncPlayerStates: ({ context }) => {
      if (!context.gameLogicRef) return
      
      Object.entries(context.playerActors).forEach(([playerId, playerActor]) => {
        if (playerActor) {
          const playerState = playerActor.getSnapshot().context
          const handSize = getHandSize(playerState)
          const tileCount = getTileCount(playerState)
          
          context.gameLogicRef!.send({
            type: 'SYNC_PLAYER_STATE',
            playerId,
            handSize,
            tileCount: {
              coal: playerState.industryTilesOnMat.coal.length,
              iron: playerState.industryTilesOnMat.iron.length,
              cotton: playerState.industryTilesOnMat.cotton.length,
              manufactured: playerState.industryTilesOnMat.manufactured.length,
              pottery: playerState.industryTilesOnMat.pottery.length,
              brewery: playerState.industryTilesOnMat.brewery.length
            }
          })
        }
      })
    },
    
    // Cleanup
    cleanupActors: assign({
      gameLogicRef: ({ context }) => {
        try {
          context.gameLogicRef?.stop()
        } catch {}
        return null
      },
      uiActorRef: ({ context }) => {
        try {
          context.uiActorRef?.stop()
        } catch {}
        return null
      },
      playerActors: ({ context }) => {
        Object.values(context.playerActors).forEach(actor => {
          try {
            actor?.stop()
          } catch {}
        })
        return {}
      }
    })
  }
}).createMachine({
  id: 'enhancedOrchestrator',
  initial: 'initializing',
  context: {
    gameLogicRef: null,
    uiActorRef: null,
    playerActors: {},
    playersInitialized: {},
    allPlayersReady: false,
    pendingAction: { type: null, playerId: null, data: null }
  },
  states: {
    initializing: {
      entry: 'initializeActors',
      always: {
        target: 'ready'
      }
    },
    
    ready: {
      on: {
        // Game initialization
        START_GAME: {
          actions: ['initializeGame', 'syncPlayerStates']
        },
        
        // Action delegation
        BUILD: {
          actions: 'delegateBuildAction'
        },
        NETWORK: {
          actions: 'delegateNetworkAction'
        },
        DEVELOP: {
          actions: 'delegateDevelopAction'
        },
        TAKE_LOAN: {
          actions: 'delegateLoanAction'
        },
        
        // UI selections
        SELECT_CARD: {
          actions: 'delegateUISelection'
        },
        SELECT_LOCATION: {
          actions: 'delegateUISelection'
        },
        SELECT_INDUSTRY_TYPE: {
          actions: 'delegateUISelection'
        },
        SELECT_LINK: {
          actions: 'delegateUISelection'
        },
        
        // Action execution
        CONFIRM: {
          actions: ['executeCoordinatedAction', 'syncPlayerStates']
        },
        
        // Cancel action
        CANCEL: {
          actions: ({ context }) => {
            if (context.uiActorRef) {
              context.uiActorRef.send({ type: 'CLEAR_ALL_SELECTIONS' })
            }
          }
        },
        
        // State synchronization
        SYNC_ALL_PLAYER_STATES: {
          actions: 'syncPlayerStates'
        },
        
        // Test events (forward to game logic)
        TEST_SET_PLAYER_STATE: {
          actions: ({ context, event }) => {
            if (context.gameLogicRef && event.type === 'TEST_SET_PLAYER_STATE') {
              // Forward test events for compatibility
              context.gameLogicRef.send(event as any)
            }
          }
        },
        
        // Cleanup
        CLEANUP_ORCHESTRATOR: {
          target: 'cleaned',
          actions: 'cleanupActors'
        }
      }
    },
    
    cleaned: {
      type: 'final'
    }
  }
})

// Helper functions
const getCurrentPlayerId = (context: EnhancedOrchestratorContext): string | null => {
  if (!context.gameLogicRef) return null
  
  const gameState = context.gameLogicRef.getSnapshot().context
  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  return currentPlayer?.id || null
}

/**
 * Enhanced Orchestrator Wrapper - Backward compatible interface
 */
export class EnhancedOrchestratorWrapper {
  private orchestrator: ActorRefFrom<typeof enhancedOrchestrator>
  
  constructor() {
    this.orchestrator = createActor(enhancedOrchestrator)
  }
  
  start() {
    this.orchestrator.start()
  }
  
  stop() {
    this.orchestrator.send({ type: 'CLEANUP_ORCHESTRATOR' })
    this.orchestrator.stop()
  }
  
  send(event: GameEvent) {
    this.orchestrator.send(event as EnhancedOrchestratorEvent)
  }
  
  getSnapshot() {
    const orchestratorSnapshot = this.orchestrator.getSnapshot()
    const gameLogicRef = orchestratorSnapshot.context.gameLogicRef
    const uiActorRef = orchestratorSnapshot.context.uiActorRef
    
    if (!gameLogicRef) {
      throw new Error('Game logic not initialized')
    }
    
    const gameSnapshot = gameLogicRef.getSnapshot()
    const uiSnapshot = uiActorRef?.getSnapshot()
    
    // Get player private states for compatibility
    const playerStates: Record<string, PlayerPrivateState> = {}
    Object.entries(orchestratorSnapshot.context.playerActors).forEach(([playerId, actor]) => {
      if (actor) {
        playerStates[playerId] = actor.getSnapshot().context
      }
    })
    
    // Create combined state for backward compatibility
    const combinedGameState = {
      ...gameSnapshot.context,
      players: gameSnapshot.context.players.map(player => {
        const privateState = playerStates[player.id]
        return {
          ...player,
          hand: privateState?.hand || [],
          industryTilesOnMat: privateState?.industryTilesOnMat || {}
        }
      })
    }
    
    const combinedContext = getCombinedState(
      combinedGameState as GameState,
      uiSnapshot?.context
    )
    
    return {
      ...gameSnapshot,
      context: combinedContext,
      value: gameSnapshot.value,
      matches: (state: unknown) => gameSnapshot.matches(state)
    }
  }
  
  // Enhanced methods for direct actor access
  getGameLogicActor() {
    return this.orchestrator.getSnapshot().context.gameLogicRef
  }
  
  getUIActor() {
    return this.orchestrator.getSnapshot().context.uiActorRef
  }
  
  getPlayerActor(playerId: string) {
    return this.orchestrator.getSnapshot().context.playerActors[playerId]
  }
  
  getAllPlayerActors() {
    return this.orchestrator.getSnapshot().context.playerActors
  }
  
  // Synchronization method
  syncPlayerStates() {
    this.orchestrator.send({ type: 'SYNC_ALL_PLAYER_STATES' })
  }
  
  // Debug method
  getActorStates() {
    const snapshot = this.orchestrator.getSnapshot()
    return {
      gameLogic: snapshot.context.gameLogicRef?.getSnapshot().context,
      ui: snapshot.context.uiActorRef?.getSnapshot().context,
      players: Object.fromEntries(
        Object.entries(snapshot.context.playerActors).map(([id, actor]) => [
          id,
          actor?.getSnapshot().context
        ])
      )
    }
  }
}