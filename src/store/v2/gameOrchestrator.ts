import { setup, assign, createActor, type ActorRefFrom } from 'xstate'
import { gameActor, type GameState, type GameEvent } from './gameActor'
import { uiActor, type UIState } from './uiActor'

/**
 * Game Orchestrator - coordinates between game logic and UI actors
 * 
 * This orchestrator manages:
 * - Game logic actor (public game state)
 * - UI actor (client-side UI state)
 * - Communication between actors
 * - State synchronization
 * 
 * This maintains backward compatibility with existing tests by providing
 * a unified interface that looks like the original monolithic gameStore.
 */

export interface OrchestratorContext {
  gameActorRef: ActorRefFrom<typeof gameActor> | null
  uiActorRef: ActorRefFrom<typeof uiActor> | null
}

type OrchestratorEvent = 
  | GameEvent
  | { type: 'INITIALIZE' }
  | { type: 'CLEANUP' }

// Helper to get combined state (for backward compatibility)
export const getCombinedState = (
  gameState: GameState | undefined,
  uiState: UIState | undefined
): GameState & {
  // UI state fields for backward compatibility
  selectedCard: UIState['selectedCard']
  selectedCardsForScout: UIState['selectedCardsForScout']
  selectedLink: UIState['selectedLink']
  selectedSecondLink: UIState['selectedSecondLink']
  selectedLocation: UIState['selectedLocation']
  selectedIndustryTile: UIState['selectedIndustryTile']
  selectedTilesForDevelop: UIState['selectedTilesForDevelop']
  lastError: UIState['lastError']
  errorContext: UIState['errorContext']
} => {
  if (!gameState) {
    throw new Error('Game state not available')
  }
  
  // Merge UI state into game state for backward compatibility
  // This maintains the same interface as the original monolithic gameStore
  return {
    ...gameState,
    // UI selections that were originally in GameState
    selectedCard: uiState?.selectedCard ?? null,
    selectedCardsForScout: uiState?.selectedCardsForScout ?? [],
    selectedLink: uiState?.selectedLink ?? null,
    selectedSecondLink: uiState?.selectedSecondLink ?? null,
    selectedLocation: uiState?.selectedLocation ?? null,
    selectedIndustryTile: uiState?.selectedIndustryTile ?? null,
    selectedTilesForDevelop: uiState?.selectedTilesForDevelop ?? [],
    lastError: uiState?.lastError ?? null,
    errorContext: uiState?.errorContext ?? null
  }
}

export const gameOrchestrator = setup({
  types: {} as {
    context: OrchestratorContext
    events: OrchestratorEvent
  },
  actors: {
    gameActor,
    uiActor
  },
  actions: {
    initializeActors: assign({
      gameActorRef: ({ spawn }) => spawn('gameActor', { id: 'game' }),
      uiActorRef: ({ spawn }) => spawn('uiActor', { id: 'ui' })
    }),
    
    cleanupActors: assign({
      gameActorRef: ({ context }) => {
        context.gameActorRef?.stop()
        return null
      },
      uiActorRef: ({ context }) => {
        context.uiActorRef?.stop()
        return null
      }
    }),
    
    // Forward game events to game actor
    forwardToGame: ({ context, event }) => {
      if (context.gameActorRef && event.type !== 'INITIALIZE' && event.type !== 'CLEANUP') {
        context.gameActorRef.send(event)
      }
    },
    
    // Handle card selection by updating both actors
    handleCardSelection: ({ context, event }) => {
      if (event.type === 'SELECT_CARD' && context.gameActorRef && context.uiActorRef) {
        // Get the card from game state
        const gameState = context.gameActorRef.getSnapshot().context
        const card = gameState.players[gameState.currentPlayerIndex]?.hand.find(
          c => c.id === event.cardId
        )
        
        if (card) {
          // Update UI actor with the actual card
          context.uiActorRef.send({ type: 'SELECT_CARD', card })
        }
        
        // Forward to game actor for validation
        context.gameActorRef.send(event)
      }
    },
    
    // Handle location selection
    handleLocationSelection: ({ context, event }) => {
      if (event.type === 'SELECT_LOCATION' && context.uiActorRef) {
        context.uiActorRef.send({ type: 'SELECT_LOCATION', cityId: event.cityId })
        // Forward to game actor
        if (context.gameActorRef) {
          context.gameActorRef.send(event)
        }
      }
    },
    
    // Handle industry type selection
    handleIndustrySelection: ({ context, event }) => {
      if (event.type === 'SELECT_INDUSTRY_TYPE' && context.uiActorRef) {
        context.uiActorRef.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: event.industryType })
        // Forward to game actor
        if (context.gameActorRef) {
          context.gameActorRef.send(event)
        }
      }
    },
    
    // Handle link selection
    handleLinkSelection: ({ context, event }) => {
      if (event.type === 'SELECT_LINK' && context.uiActorRef) {
        context.uiActorRef.send({ type: 'SELECT_LINK', from: event.from, to: event.to })
        // Forward to game actor
        if (context.gameActorRef) {
          context.gameActorRef.send(event)
        }
      } else if (event.type === 'SELECT_SECOND_LINK' && context.uiActorRef) {
        context.uiActorRef.send({ type: 'SELECT_SECOND_LINK', from: event.from, to: event.to })
        // Forward to game actor
        if (context.gameActorRef) {
          context.gameActorRef.send(event)
        }
      }
    },
    
    // Handle cancel action - clear UI selections
    handleCancel: ({ context }) => {
      if (context.uiActorRef) {
        context.uiActorRef.send({ type: 'CLEAR_ALL_SELECTIONS' })
      }
      // Forward to game actor
      if (context.gameActorRef) {
        context.gameActorRef.send({ type: 'CANCEL' })
      }
    },
    
    // Handle confirm action - clear UI selections after action
    handleConfirm: ({ context }) => {
      // Forward to game actor first
      if (context.gameActorRef) {
        context.gameActorRef.send({ type: 'CONFIRM' })
      }
      // Then clear UI selections
      if (context.uiActorRef) {
        context.uiActorRef.send({ type: 'CLEAR_ALL_SELECTIONS' })
      }
    },
    
    // Handle error state
    handleError: ({ context, event }) => {
      if (event.type === 'SET_ERROR' && context.uiActorRef) {
        context.uiActorRef.send({ 
          type: 'SET_ERROR', 
          message: event.message, 
          context: event.context 
        })
      } else if (event.type === 'CLEAR_ERROR' && context.uiActorRef) {
        context.uiActorRef.send({ type: 'CLEAR_ERROR' })
      }
    }
  }
}).createMachine({
  id: 'gameOrchestrator',
  initial: 'initializing',
  context: {
    gameActorRef: null,
    uiActorRef: null
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
          actions: 'forwardToGame'
        },
        
        // Action selection
        BUILD: {
          actions: 'forwardToGame'
        },
        NETWORK: {
          actions: 'forwardToGame'
        },
        DEVELOP: {
          actions: 'forwardToGame'
        },
        SELL: {
          actions: 'forwardToGame'
        },
        TAKE_LOAN: {
          actions: 'forwardToGame'
        },
        SCOUT: {
          actions: 'forwardToGame'
        },
        PASS: {
          actions: 'forwardToGame'
        },
        
        // Selection events - update both actors
        SELECT_CARD: {
          actions: 'handleCardSelection'
        },
        SELECT_LOCATION: {
          actions: 'handleLocationSelection'
        },
        SELECT_INDUSTRY_TYPE: {
          actions: 'handleIndustrySelection'
        },
        SELECT_LINK: {
          actions: 'handleLinkSelection'
        },
        SELECT_SECOND_LINK: {
          actions: 'handleLinkSelection'
        },
        SELECT_TILES_FOR_DEVELOP: {
          actions: ['forwardToGame', ({ context, event }) => {
            if (context.uiActorRef && event.type === 'SELECT_TILES_FOR_DEVELOP') {
              // Clear and set develop tiles in UI
              context.uiActorRef.send({ type: 'CLEAR_DEVELOP_TILES' })
              event.industryTypes.forEach(type => {
                context.uiActorRef!.send({ type: 'ADD_DEVELOP_TILE', industryType: type })
              })
            }
          }]
        },
        
        // Confirmation/Cancellation
        CONFIRM: {
          actions: 'handleConfirm'
        },
        CANCEL: {
          actions: 'handleCancel'
        },
        
        // Error handling
        SET_ERROR: {
          actions: 'handleError'
        },
        CLEAR_ERROR: {
          actions: 'handleError'
        },
        
        // Test events
        TEST_SET_PLAYER_HAND: {
          actions: 'forwardToGame'
        },
        TEST_SET_ERA: {
          actions: 'forwardToGame'
        },
        TEST_SET_PLAYER_STATE: {
          actions: 'forwardToGame'
        },
        TEST_SET_FINAL_ROUND: {
          actions: 'forwardToGame'
        },
        TEST_SET_ERA_END_CONDITIONS: {
          actions: 'forwardToGame'
        },
        TEST_SET_DRAW_PILE: {
          actions: 'forwardToGame'
        },
        TRIGGER_ERA_SCORING: {
          actions: 'forwardToGame'
        },
        TRIGGER_CANAL_ERA_END: {
          actions: 'forwardToGame'
        },
        TRIGGER_RAIL_ERA_END: {
          actions: 'forwardToGame'
        },
        
        // Other game events
        BUILD_SECOND_LINK: {
          actions: 'forwardToGame'
        },
        CHOOSE_DOUBLE_LINK_BUILD: {
          actions: 'forwardToGame'
        },
        EXECUTE_DOUBLE_NETWORK_ACTION: {
          actions: 'forwardToGame'
        },
        CHECK_INDUSTRY_FLIPPING: {
          actions: 'forwardToGame'
        },
        
        // Cleanup
        CLEANUP: {
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

/**
 * Helper class to provide backward-compatible interface
 * This allows existing tests to work without modification
 */
export class GameOrchestratorWrapper {
  private orchestrator: ActorRefFrom<typeof gameOrchestrator>
  
  constructor() {
    this.orchestrator = createActor(gameOrchestrator)
  }
  
  start() {
    this.orchestrator.start()
  }
  
  stop() {
    this.orchestrator.send({ type: 'CLEANUP' })
    this.orchestrator.stop()
  }
  
  send(event: GameEvent) {
    this.orchestrator.send(event as OrchestratorEvent)
  }
  
  getSnapshot() {
    const orchestratorSnapshot = this.orchestrator.getSnapshot()
    const gameActorRef = orchestratorSnapshot.context.gameActorRef
    const uiActorRef = orchestratorSnapshot.context.uiActorRef
    
    if (!gameActorRef) {
      throw new Error('Game actor not initialized')
    }
    
    const gameSnapshot = gameActorRef.getSnapshot()
    const uiSnapshot = uiActorRef?.getSnapshot()
    
    // Combine states for backward compatibility
    const combinedContext = getCombinedState(
      gameSnapshot.context,
      uiSnapshot?.context
    )
    
    // Return a snapshot that looks like the original gameStore
    return {
      ...gameSnapshot,
      context: combinedContext,
      value: gameSnapshot.value,
      matches: (state: unknown) => gameSnapshot.matches(state)
    }
  }
  
  // For direct access to sub-actors (useful for testing)
  getGameActor() {
    return this.orchestrator.getSnapshot().context.gameActorRef
  }
  
  getUIActor() {
    return this.orchestrator.getSnapshot().context.uiActorRef
  }
}