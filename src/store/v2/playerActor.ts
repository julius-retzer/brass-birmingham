// Player Actor - Private player state management (hand and industry tiles)
import { setup, assign } from 'xstate'
import type { Card } from '../../data/cards'
import type { IndustryTile, IndustryType } from '../../data/industryTiles'

/**
 * Player Actor - manages private player state for privacy separation
 * 
 * This actor handles:
 * - Player hand (cards) - PRIVATE: other players should not see this
 * - Industry tiles on mat - PRIVATE: other players should not see this
 * - Hand management (draw, discard, scout)
 * - Industry tile management (purchase, flip)
 * 
 * This state should NOT be synchronized to other players for privacy.
 */

export interface PlayerPrivateState {
  playerId: string
  
  // PRIVATE STATE - should never be visible to other players
  hand: Card[]
  industryTilesOnMat: Record<IndustryType, IndustryTile[]>
  
  // Temporary state for multi-step actions
  pendingHandChanges: {
    cardsToAdd: Card[]
    cardsToRemove: Card[]
  }
  pendingTileChanges: {
    tilesToAdd: IndustryTile[]
    tilesToRemove: IndustryTile[]
  }
}

export type PlayerEvent =
  | { type: 'INITIALIZE_PLAYER'; playerId: string; initialHand: Card[]; initialTiles: Record<IndustryType, IndustryTile[]> }
  | { type: 'DRAW_CARD'; card: Card }
  | { type: 'DRAW_CARDS'; cards: Card[] }
  | { type: 'DISCARD_CARD'; cardId: string }
  | { type: 'DISCARD_CARDS'; cardIds: string[] }
  | { type: 'ADD_INDUSTRY_TILE'; tile: IndustryTile }
  | { type: 'REMOVE_INDUSTRY_TILE'; tileId: string }
  | { type: 'FLIP_INDUSTRY_TILE'; tileId: string }
  | { type: 'SCOUT_CARDS'; cardsToDiscard: Card[]; cardsToKeep: Card[] }
  | { type: 'REPLACE_HAND'; newHand: Card[] }
  | { type: 'REPLACE_TILES'; newTiles: Record<IndustryType, IndustryTile[]> }
  | { type: 'COMMIT_PENDING_CHANGES' }
  | { type: 'ROLLBACK_PENDING_CHANGES' }
  | { type: 'CLEAR_PENDING_CHANGES' }
  // Test events
  | { type: 'TEST_SET_HAND'; hand: Card[] }
  | { type: 'TEST_SET_TILES'; tiles: Record<IndustryType, IndustryTile[]> }

const initialPlayerState: PlayerPrivateState = {
  playerId: '',
  hand: [],
  industryTilesOnMat: {
    coal: [],
    iron: [],
    cotton: [],
    manufactured: [],
    pottery: [],
    brewery: []
  },
  pendingHandChanges: {
    cardsToAdd: [],
    cardsToRemove: []
  },
  pendingTileChanges: {
    tilesToAdd: [],
    tilesToRemove: []
  }
}

export const playerActor = setup({
  types: {} as {
    context: PlayerPrivateState
    events: PlayerEvent
  },
  actions: {
    initializePlayer: assign({
      playerId: ({ event }) => event.type === 'INITIALIZE_PLAYER' ? event.playerId : '',
      hand: ({ event }) => event.type === 'INITIALIZE_PLAYER' ? [...event.initialHand] : [],
      industryTilesOnMat: ({ event }) => 
        event.type === 'INITIALIZE_PLAYER' 
          ? JSON.parse(JSON.stringify(event.initialTiles)) // Deep copy
          : initialPlayerState.industryTilesOnMat
    }),
    
    drawCard: assign({
      hand: ({ context, event }) => {
        if (event.type === 'DRAW_CARD') {
          return [...context.hand, event.card]
        }
        return context.hand
      }
    }),
    
    drawCards: assign({
      hand: ({ context, event }) => {
        if (event.type === 'DRAW_CARDS') {
          return [...context.hand, ...event.cards]
        }
        return context.hand
      }
    }),
    
    discardCard: assign({
      hand: ({ context, event }) => {
        if (event.type === 'DISCARD_CARD') {
          return context.hand.filter(card => card.id !== event.cardId)
        }
        return context.hand
      }
    }),
    
    discardCards: assign({
      hand: ({ context, event }) => {
        if (event.type === 'DISCARD_CARDS') {
          return context.hand.filter(card => !event.cardIds.includes(card.id))
        }
        return context.hand
      }
    }),
    
    addIndustryTile: assign({
      industryTilesOnMat: ({ context, event }) => {
        if (event.type === 'ADD_INDUSTRY_TILE') {
          const tile = event.tile
          return {
            ...context.industryTilesOnMat,
            [tile.type]: [...context.industryTilesOnMat[tile.type], tile]
          }
        }
        return context.industryTilesOnMat
      }
    }),
    
    removeIndustryTile: assign({
      industryTilesOnMat: ({ context, event }) => {
        if (event.type === 'REMOVE_INDUSTRY_TILE') {
          const newTiles = { ...context.industryTilesOnMat }
          for (const [type, tiles] of Object.entries(newTiles)) {
            newTiles[type as IndustryType] = tiles.filter(tile => tile.id !== event.tileId)
          }
          return newTiles
        }
        return context.industryTilesOnMat
      }
    }),
    
    flipIndustryTile: assign({
      industryTilesOnMat: ({ context, event }) => {
        if (event.type === 'FLIP_INDUSTRY_TILE') {
          const newTiles = { ...context.industryTilesOnMat }
          for (const [type, tiles] of Object.entries(newTiles)) {
            newTiles[type as IndustryType] = tiles.map(tile => 
              tile.id === event.tileId 
                ? { ...tile, isFlipped: !tile.isFlipped }
                : tile
            )
          }
          return newTiles
        }
        return context.industryTilesOnMat
      }
    }),
    
    scoutCards: assign(({ context, event }) => {
      if (event.type === 'SCOUT_CARDS') {
        // Remove discarded cards and add kept cards
        const remainingCards = context.hand.filter(card => 
          !event.cardsToDiscard.some(discarded => discarded.id === card.id)
        )
        return {
          hand: [...remainingCards, ...event.cardsToKeep]
        }
      }
      return {}
    }),
    
    replaceHand: assign({
      hand: ({ event }) => event.type === 'REPLACE_HAND' ? [...event.newHand] : []
    }),
    
    replaceTiles: assign({
      industryTilesOnMat: ({ event }) => 
        event.type === 'REPLACE_TILES' 
          ? JSON.parse(JSON.stringify(event.newTiles))
          : initialPlayerState.industryTilesOnMat
    }),
    
    // Pending changes for transaction-like behavior
    addPendingHandChange: assign({
      pendingHandChanges: ({ context, event }) => {
        if (event.type === 'DRAW_CARD') {
          return {
            ...context.pendingHandChanges,
            cardsToAdd: [...context.pendingHandChanges.cardsToAdd, event.card]
          }
        } else if (event.type === 'DISCARD_CARD') {
          const cardToRemove = context.hand.find(card => card.id === event.cardId)
          if (cardToRemove) {
            return {
              ...context.pendingHandChanges,
              cardsToRemove: [...context.pendingHandChanges.cardsToRemove, cardToRemove]
            }
          }
        }
        return context.pendingHandChanges
      }
    }),
    
    commitPendingChanges: assign(({ context }) => {
      // Apply all pending changes
      const newHand = context.hand
        .filter(card => !context.pendingHandChanges.cardsToRemove.some(remove => remove.id === card.id))
        .concat(context.pendingHandChanges.cardsToAdd)
      
      // Apply pending tile changes (simplified for now)
      return {
        hand: newHand,
        pendingHandChanges: { cardsToAdd: [], cardsToRemove: [] },
        pendingTileChanges: { tilesToAdd: [], tilesToRemove: [] }
      }
    }),
    
    rollbackPendingChanges: assign({
      pendingHandChanges: { cardsToAdd: [], cardsToRemove: [] },
      pendingTileChanges: { tilesToAdd: [], tilesToRemove: [] }
    }),
    
    clearPendingChanges: assign({
      pendingHandChanges: { cardsToAdd: [], cardsToRemove: [] },
      pendingTileChanges: { tilesToAdd: [], tilesToRemove: [] }
    }),
    
    // Test actions
    testSetHand: assign({
      hand: ({ event }) => event.type === 'TEST_SET_HAND' ? [...event.hand] : []
    }),
    
    testSetTiles: assign({
      industryTilesOnMat: ({ event }) => 
        event.type === 'TEST_SET_TILES' 
          ? JSON.parse(JSON.stringify(event.tiles))
          : initialPlayerState.industryTilesOnMat
    })
  }
}).createMachine({
  id: 'playerActor',
  initial: 'uninitialized',
  context: initialPlayerState,
  states: {
    uninitialized: {
      on: {
        INITIALIZE_PLAYER: {
          target: 'ready',
          actions: 'initializePlayer'
        }
      }
    },
    
    ready: {
      on: {
        // Hand management
        DRAW_CARD: {
          actions: 'drawCard'
        },
        DRAW_CARDS: {
          actions: 'drawCards'
        },
        DISCARD_CARD: {
          actions: 'discardCard'
        },
        DISCARD_CARDS: {
          actions: 'discardCards'
        },
        
        // Industry tile management
        ADD_INDUSTRY_TILE: {
          actions: 'addIndustryTile'
        },
        REMOVE_INDUSTRY_TILE: {
          actions: 'removeIndustryTile'
        },
        FLIP_INDUSTRY_TILE: {
          actions: 'flipIndustryTile'
        },
        
        // Complex actions
        SCOUT_CARDS: {
          actions: 'scoutCards'
        },
        REPLACE_HAND: {
          actions: 'replaceHand'
        },
        REPLACE_TILES: {
          actions: 'replaceTiles'
        },
        
        // Pending changes
        COMMIT_PENDING_CHANGES: {
          actions: 'commitPendingChanges'
        },
        ROLLBACK_PENDING_CHANGES: {
          actions: 'rollbackPendingChanges'
        },
        CLEAR_PENDING_CHANGES: {
          actions: 'clearPendingChanges'
        },
        
        // Test events
        TEST_SET_HAND: {
          actions: 'testSetHand'
        },
        TEST_SET_TILES: {
          actions: 'testSetTiles'
        }
      }
    }
  }
})

// Helper functions for player state management
export const getPlayerHand = (context: PlayerPrivateState): Card[] => {
  return [...context.hand]
}

export const getPlayerTiles = (context: PlayerPrivateState): Record<IndustryType, IndustryTile[]> => {
  return JSON.parse(JSON.stringify(context.industryTilesOnMat))
}

export const getHandSize = (context: PlayerPrivateState): number => {
  return context.hand.length
}

export const getTileCount = (context: PlayerPrivateState): number => {
  return Object.values(context.industryTilesOnMat).flat().length
}

export const hasCard = (context: PlayerPrivateState, cardId: string): boolean => {
  return context.hand.some(card => card.id === cardId)
}

export const hasTile = (context: PlayerPrivateState, tileId: string): boolean => {
  return Object.values(context.industryTilesOnMat).flat().some(tile => tile.id === tileId)
}

export const canAffordCard = (context: PlayerPrivateState, cardCost: number, playerMoney: number): boolean => {
  // This would need to access player money from game state
  // For now, just return whether they have enough money
  return playerMoney >= cardCost
}

export const findCardInHand = (context: PlayerPrivateState, cardId: string): Card | undefined => {
  return context.hand.find(card => card.id === cardId)
}

export const findTileOnMat = (context: PlayerPrivateState, tileId: string): IndustryTile | undefined => {
  return Object.values(context.industryTilesOnMat).flat().find(tile => tile.id === tileId)
}