// Game Actor Pure - Public game state only (no private player data)
import { setup, assign } from 'xstate'
import { gameActor as baseGameActor, type GameState, type GameEvent } from './gameActor'

/**
 * Pure Game Actor - manages only public game state
 * 
 * This is the public game state that can be safely synchronized to all players:
 * - Player public data (money, income, victory points, etc.)
 * - Board state (built industries, links)
 * - Game phase (era, round, current player)
 * - Market state
 * - Available actions
 * 
 * EXCLUDED (private state managed by playerActor):
 * - Player hands
 * - Industry tiles on mat
 * 
 * This creates a clean separation for privacy in multiplayer games.
 */

// Player state without private data
export interface PublicPlayerState {
  id: string
  name: string
  color: 'red' | 'blue' | 'green' | 'yellow'
  character: string
  
  // PUBLIC FINANCIAL STATE - visible to all players
  money: number
  income: number
  victoryPoints: number
  
  // PUBLIC COUNTERS - visible to all players  
  handSize: number // Count of cards, not the actual cards
  industryTileCount: Record<string, number> // Count of tiles on mat, not the tiles themselves
  
  // PUBLIC BUILD STATE - visible to all players
  spentThisRound: number
  actionsThisRound: number
  hasPassedThisRound: boolean
  canTakeActions: boolean
  
  // REMOVED: hand (moved to playerActor)
  // REMOVED: industryTilesOnMat (moved to playerActor)
}

// Game state with public-only player data
export interface PublicGameState {
  // GAME PHASE - public to all players
  era: 'canal' | 'rail'
  phase: 'playing' | 'era_end_scoring' | 'game_end'
  round: number
  currentPlayerIndex: number
  finalRound: boolean
  
  // PUBLIC PLAYER STATE - visible to all players
  players: PublicPlayerState[]
  
  // BOARD STATE - public to all players
  board: GameState['board']
  
  // MARKET STATE - public to all players
  coalMarket: GameState['coalMarket']
  ironMarket: GameState['ironMarket']
  
  // GAME SETUP - public to all players
  deck: GameState['deck'] // Public deck state
  discardPile: GameState['discardPile']
  industryTileSupply: GameState['industryTileSupply']
  
  // ERA CONDITIONS - public to all players
  eraEndConditions: GameState['eraEndConditions']
  
  // GAME LOG - public to all players
  gameLog: GameState['gameLog']
  
  // GAME FLOW - public to all players
  turnOrder: GameState['turnOrder']
  actionsPerRound: GameState['actionsPerRound']
  
  // REMOVED: All UI state (moved to uiActor)
  // REMOVED: Private player data (moved to playerActor)
}

// Convert private GameState to public GameState
export const toPublicGameState = (gameState: GameState, playerHandSizes: Record<string, number>, playerTileCounts: Record<string, Record<string, number>>): PublicGameState => {
  return {
    era: gameState.era,
    phase: gameState.phase,
    round: gameState.round,
    currentPlayerIndex: gameState.currentPlayerIndex,
    finalRound: gameState.finalRound,
    
    players: gameState.players.map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      character: player.character,
      money: player.money,
      income: player.income,
      victoryPoints: player.victoryPoints,
      handSize: playerHandSizes[player.id] || 0,
      industryTileCount: playerTileCounts[player.id] || {},
      spentThisRound: player.spentThisRound,
      actionsThisRound: player.actionsThisRound,
      hasPassedThisRound: player.hasPassedThisRound,
      canTakeActions: player.canTakeActions
    })),
    
    board: gameState.board,
    coalMarket: gameState.coalMarket,
    ironMarket: gameState.ironMarket,
    deck: gameState.deck,
    discardPile: gameState.discardPile,
    industryTileSupply: gameState.industryTileSupply,
    eraEndConditions: gameState.eraEndConditions,
    gameLog: gameState.gameLog,
    turnOrder: gameState.turnOrder,
    actionsPerRound: gameState.actionsPerRound
  }
}

// Convert public GameState back to private for compatibility
export const fromPublicGameState = (publicState: PublicGameState, playerHands: Record<string, any[]>, playerTiles: Record<string, any>): GameState => {
  const privateState: GameState = {
    ...publicState,
    players: publicState.players.map(player => ({
      ...player,
      hand: playerHands[player.id] || [],
      industryTilesOnMat: playerTiles[player.id] || {}
    })),
    
    // Add back UI state with null values for compatibility
    selectedCard: null,
    selectedCardsForScout: [],
    selectedLocation: null,
    selectedIndustryTile: null,
    selectedLink: null,
    selectedSecondLink: null,
    selectedTilesForDevelop: [],
    lastError: null,
    errorContext: null
  } as GameState
  
  return privateState
}

// Game Actor with pure public state
export const gameActorPure = setup({
  types: {} as {
    context: PublicGameState
    events: GameEvent
  },
  actions: {
    // All actions from base gameActor adapted for public state
    // For now, we'll reuse the base gameActor logic but with public state
    
    // Player financial updates
    updatePlayerMoney: assign({
      players: ({ context, event }) => {
        if (event.type === 'TEST_SET_PLAYER_STATE' && typeof event.playerId === 'number') {
          return context.players.map((player, index) => 
            index === event.playerId && typeof event.money === 'number'
              ? { ...player, money: event.money }
              : player
          )
        }
        return context.players
      }
    }),
    
    updatePlayerIncome: assign({
      players: ({ context, event }) => {
        if (event.type === 'TEST_SET_PLAYER_STATE' && typeof event.playerId === 'number') {
          return context.players.map((player, index) => 
            index === event.playerId && typeof event.income === 'number'
              ? { ...player, income: event.income }
              : player
          )
        }
        return context.players
      }
    }),
    
    // Hand size tracking (without actual cards)
    updateHandSize: assign({
      players: ({ context, event }) => {
        if (event.type === 'DRAW_CARD' || event.type === 'DISCARD_CARD') {
          const currentPlayer = context.players[context.currentPlayerIndex]
          if (currentPlayer) {
            return context.players.map((player, index) => 
              index === context.currentPlayerIndex
                ? { 
                    ...player, 
                    handSize: event.type === 'DRAW_CARD' 
                      ? player.handSize + 1 
                      : Math.max(0, player.handSize - 1)
                  }
                : player
            )
          }
        }
        return context.players
      }
    }),
    
    // Era changes
    setEra: assign({
      era: ({ event }) => event.type === 'TEST_SET_ERA' ? event.era : 'canal'
    }),
    
    // Generic state forwarding for compatibility
    forwardToBase: ({ context, event }) => {
      // For now, we'll handle this through the orchestrator
      // The pure game actor focuses on public state management
      console.log('Pure game actor received event:', event.type)
    }
  }
}).createMachine({
  id: 'gameActorPure',
  initial: 'waitingForPlayers',
  context: {
    era: 'canal',
    phase: 'playing',
    round: 1,
    currentPlayerIndex: 0,
    finalRound: false,
    players: [],
    board: {
      locations: {},
      links: []
    },
    coalMarket: {
      price: 8,
      cubes: 13
    },
    ironMarket: {
      price: 8,
      cubes: 8
    },
    deck: {
      remaining: 0,
      era: 'canal'
    },
    discardPile: [],
    industryTileSupply: {},
    eraEndConditions: {
      industryTileMarketsEmpty: 0,
      playerHandsEmptyCount: 0
    },
    gameLog: [],
    turnOrder: [],
    actionsPerRound: 2
  },
  states: {
    waitingForPlayers: {
      on: {
        START_GAME: {
          target: 'playing',
          actions: [
            assign({
              players: ({ event }) => {
                if (event.type === 'START_GAME') {
                  return event.players.map(player => ({
                    id: player.id,
                    name: player.name,
                    color: player.color,
                    character: player.character,
                    money: player.money,
                    income: player.income,
                    victoryPoints: player.victoryPoints,
                    handSize: 8, // Initial hand size
                    industryTileCount: {},
                    spentThisRound: 0,
                    actionsThisRound: 0,
                    hasPassedThisRound: false,
                    canTakeActions: true
                  }))
                }
                return []
              }
            })
          ]
        }
      }
    },
    
    playing: {
      on: {
        // Financial updates
        TEST_SET_PLAYER_STATE: {
          actions: ['updatePlayerMoney', 'updatePlayerIncome']
        },
        
        // Era changes
        TEST_SET_ERA: {
          actions: 'setEra'
        },
        
        // Hand management (size only)
        DRAW_CARD: {
          actions: 'updateHandSize'
        },
        DISCARD_CARD: {
          actions: 'updateHandSize'
        },
        
        // All other events forwarded for compatibility
        BUILD: {
          actions: 'forwardToBase'
        },
        NETWORK: {
          actions: 'forwardToBase'
        },
        DEVELOP: {
          actions: 'forwardToBase'
        },
        SELL: {
          actions: 'forwardToBase'
        },
        TAKE_LOAN: {
          actions: 'forwardToBase'
        },
        SCOUT: {
          actions: 'forwardToBase'
        },
        PASS: {
          actions: 'forwardToBase'
        },
        CONFIRM: {
          actions: 'forwardToBase'
        },
        CANCEL: {
          actions: 'forwardToBase'
        }
      }
    }
  }
})

// Helper functions for public state management
export const getPublicPlayerState = (player: PublicPlayerState): PublicPlayerState => {
  return { ...player }
}

export const getPublicGameState = (context: PublicGameState): PublicGameState => {
  return { ...context }
}

export const isPublicStateValid = (state: PublicGameState): boolean => {
  // Validate that no private data is present
  const hasPrivateData = state.players.some(player => 
    'hand' in player || 'industryTilesOnMat' in player
  )
  
  return !hasPrivateData && state.players.length > 0
}

export const getPlayerCount = (state: PublicGameState): number => {
  return state.players.length
}

export const getCurrentPlayer = (state: PublicGameState): PublicPlayerState | undefined => {
  return state.players[state.currentPlayerIndex]
}

export const getPlayerById = (state: PublicGameState, playerId: string): PublicPlayerState | undefined => {
  return state.players.find(player => player.id === playerId)
}