import { setup, assign } from 'xstate'
import type { CityId } from '../../data/board'
import type { Card, IndustryType } from '../../data/cards'
import type { IndustryTile } from '../../data/industryTiles'

/**
 * UI Actor - manages client-side UI state that should never be synchronized to server
 * 
 * This actor manages:
 * - Card selections during actions
 * - Location and industry selections
 * - Link selections for network actions
 * - Error display state
 * 
 * Each client has its own UI actor instance, and the state is never shared between players.
 */

export interface UIState {
  // Card selections
  selectedCard: Card | null
  selectedCardsForScout: Card[]
  
  // Build selections
  selectedLocation: CityId | null
  selectedIndustryType: IndustryType | null
  selectedIndustryTile: IndustryTile | null
  
  // Network selections
  selectedLink: {
    from: CityId
    to: CityId
  } | null
  selectedSecondLink: {
    from: CityId
    to: CityId
  } | null
  
  // Develop selections
  selectedTilesForDevelop: IndustryType[]
  
  // Error state
  lastError: string | null
  errorContext: 'build' | 'network' | 'develop' | 'sell' | 'scout' | null
  
  // UI-specific tracking
  isSelectingCard: boolean
  isSelectingLocation: boolean
  isSelectingIndustry: boolean
  isSelectingLink: boolean
  isConfirming: boolean
}

type UIEvent =
  | { type: 'SELECT_CARD'; card: Card }
  | { type: 'DESELECT_CARD' }
  | { type: 'SELECT_LOCATION'; cityId: CityId }
  | { type: 'DESELECT_LOCATION' }
  | { type: 'SELECT_INDUSTRY_TYPE'; industryType: IndustryType }
  | { type: 'DESELECT_INDUSTRY_TYPE' }
  | { type: 'SELECT_INDUSTRY_TILE'; tile: IndustryTile }
  | { type: 'DESELECT_INDUSTRY_TILE' }
  | { type: 'SELECT_LINK'; from: CityId; to: CityId }
  | { type: 'DESELECT_LINK' }
  | { type: 'SELECT_SECOND_LINK'; from: CityId; to: CityId }
  | { type: 'DESELECT_SECOND_LINK' }
  | { type: 'ADD_SCOUT_CARD'; card: Card }
  | { type: 'REMOVE_SCOUT_CARD'; card: Card }
  | { type: 'CLEAR_SCOUT_CARDS' }
  | { type: 'ADD_DEVELOP_TILE'; industryType: IndustryType }
  | { type: 'REMOVE_DEVELOP_TILE'; industryType: IndustryType }
  | { type: 'CLEAR_DEVELOP_TILES' }
  | { type: 'SET_ERROR'; message: string; context: UIState['errorContext'] }
  | { type: 'CLEAR_ERROR' }
  | { type: 'CLEAR_ALL_SELECTIONS' }
  | { type: 'START_CARD_SELECTION' }
  | { type: 'END_CARD_SELECTION' }
  | { type: 'START_LOCATION_SELECTION' }
  | { type: 'END_LOCATION_SELECTION' }
  | { type: 'START_INDUSTRY_SELECTION' }
  | { type: 'END_INDUSTRY_SELECTION' }
  | { type: 'START_LINK_SELECTION' }
  | { type: 'END_LINK_SELECTION' }
  | { type: 'START_CONFIRMATION' }
  | { type: 'END_CONFIRMATION' }

export const uiActor = setup({
  types: {} as {
    context: UIState
    events: UIEvent
  },
  actions: {
    selectCard: assign({
      selectedCard: ({ event }) => {
        if (event.type !== 'SELECT_CARD') return null
        return event.card
      }
    }),
    
    deselectCard: assign({
      selectedCard: () => null
    }),
    
    selectLocation: assign({
      selectedLocation: ({ event }) => {
        if (event.type !== 'SELECT_LOCATION') return null
        return event.cityId
      }
    }),
    
    deselectLocation: assign({
      selectedLocation: () => null
    }),
    
    selectIndustryType: assign({
      selectedIndustryType: ({ event }) => {
        if (event.type !== 'SELECT_INDUSTRY_TYPE') return null
        return event.industryType
      }
    }),
    
    deselectIndustryType: assign({
      selectedIndustryType: () => null
    }),
    
    selectIndustryTile: assign({
      selectedIndustryTile: ({ event }) => {
        if (event.type !== 'SELECT_INDUSTRY_TILE') return null
        return event.tile
      }
    }),
    
    deselectIndustryTile: assign({
      selectedIndustryTile: () => null
    }),
    
    selectLink: assign({
      selectedLink: ({ event }) => {
        if (event.type !== 'SELECT_LINK') return null
        return { from: event.from, to: event.to }
      }
    }),
    
    deselectLink: assign({
      selectedLink: () => null
    }),
    
    selectSecondLink: assign({
      selectedSecondLink: ({ event }) => {
        if (event.type !== 'SELECT_SECOND_LINK') return null
        return { from: event.from, to: event.to }
      }
    }),
    
    deselectSecondLink: assign({
      selectedSecondLink: () => null
    }),
    
    addScoutCard: assign({
      selectedCardsForScout: ({ context, event }) => {
        if (event.type !== 'ADD_SCOUT_CARD') return context.selectedCardsForScout
        return [...context.selectedCardsForScout, event.card]
      }
    }),
    
    removeScoutCard: assign({
      selectedCardsForScout: ({ context, event }) => {
        if (event.type !== 'REMOVE_SCOUT_CARD') return context.selectedCardsForScout
        return context.selectedCardsForScout.filter(c => c.id !== event.card.id)
      }
    }),
    
    clearScoutCards: assign({
      selectedCardsForScout: () => []
    }),
    
    addDevelopTile: assign({
      selectedTilesForDevelop: ({ context, event }) => {
        if (event.type !== 'ADD_DEVELOP_TILE') return context.selectedTilesForDevelop
        return [...context.selectedTilesForDevelop, event.industryType]
      }
    }),
    
    removeDevelopTile: assign({
      selectedTilesForDevelop: ({ context, event }) => {
        if (event.type !== 'REMOVE_DEVELOP_TILE') return context.selectedTilesForDevelop
        return context.selectedTilesForDevelop.filter(t => t !== event.industryType)
      }
    }),
    
    clearDevelopTiles: assign({
      selectedTilesForDevelop: () => []
    }),
    
    setError: assign({
      lastError: ({ event }) => {
        if (event.type !== 'SET_ERROR') return null
        return event.message
      },
      errorContext: ({ event }) => {
        if (event.type !== 'SET_ERROR') return null
        return event.context
      }
    }),
    
    clearError: assign({
      lastError: () => null,
      errorContext: () => null
    }),
    
    clearAllSelections: assign({
      selectedCard: () => null,
      selectedCardsForScout: () => [],
      selectedLocation: () => null,
      selectedIndustryType: () => null,
      selectedIndustryTile: () => null,
      selectedLink: () => null,
      selectedSecondLink: () => null,
      selectedTilesForDevelop: () => [],
      isSelectingCard: () => false,
      isSelectingLocation: () => false,
      isSelectingIndustry: () => false,
      isSelectingLink: () => false,
      isConfirming: () => false
    }),
    
    startCardSelection: assign({
      isSelectingCard: () => true
    }),
    
    endCardSelection: assign({
      isSelectingCard: () => false
    }),
    
    startLocationSelection: assign({
      isSelectingLocation: () => true
    }),
    
    endLocationSelection: assign({
      isSelectingLocation: () => false
    }),
    
    startIndustrySelection: assign({
      isSelectingIndustry: () => true
    }),
    
    endIndustrySelection: assign({
      isSelectingIndustry: () => false
    }),
    
    startLinkSelection: assign({
      isSelectingLink: () => true
    }),
    
    endLinkSelection: assign({
      isSelectingLink: () => false
    }),
    
    startConfirmation: assign({
      isConfirming: () => true
    }),
    
    endConfirmation: assign({
      isConfirming: () => false
    })
  }
}).createMachine({
  id: 'uiActor',
  initial: 'idle',
  context: {
    // Card selections
    selectedCard: null,
    selectedCardsForScout: [],
    
    // Build selections
    selectedLocation: null,
    selectedIndustryType: null,
    selectedIndustryTile: null,
    
    // Network selections
    selectedLink: null,
    selectedSecondLink: null,
    
    // Develop selections
    selectedTilesForDevelop: [],
    
    // Error state
    lastError: null,
    errorContext: null,
    
    // UI-specific tracking
    isSelectingCard: false,
    isSelectingLocation: false,
    isSelectingIndustry: false,
    isSelectingLink: false,
    isConfirming: false
  },
  states: {
    idle: {
      on: {
        SELECT_CARD: {
          actions: 'selectCard'
        },
        DESELECT_CARD: {
          actions: 'deselectCard'
        },
        SELECT_LOCATION: {
          actions: 'selectLocation'
        },
        DESELECT_LOCATION: {
          actions: 'deselectLocation'
        },
        SELECT_INDUSTRY_TYPE: {
          actions: 'selectIndustryType'
        },
        DESELECT_INDUSTRY_TYPE: {
          actions: 'deselectIndustryType'
        },
        SELECT_INDUSTRY_TILE: {
          actions: 'selectIndustryTile'
        },
        DESELECT_INDUSTRY_TILE: {
          actions: 'deselectIndustryTile'
        },
        SELECT_LINK: {
          actions: 'selectLink'
        },
        DESELECT_LINK: {
          actions: 'deselectLink'
        },
        SELECT_SECOND_LINK: {
          actions: 'selectSecondLink'
        },
        DESELECT_SECOND_LINK: {
          actions: 'deselectSecondLink'
        },
        ADD_SCOUT_CARD: {
          actions: 'addScoutCard'
        },
        REMOVE_SCOUT_CARD: {
          actions: 'removeScoutCard'
        },
        CLEAR_SCOUT_CARDS: {
          actions: 'clearScoutCards'
        },
        ADD_DEVELOP_TILE: {
          actions: 'addDevelopTile'
        },
        REMOVE_DEVELOP_TILE: {
          actions: 'removeDevelopTile'
        },
        CLEAR_DEVELOP_TILES: {
          actions: 'clearDevelopTiles'
        },
        SET_ERROR: {
          actions: 'setError'
        },
        CLEAR_ERROR: {
          actions: 'clearError'
        },
        CLEAR_ALL_SELECTIONS: {
          actions: 'clearAllSelections'
        },
        START_CARD_SELECTION: {
          actions: 'startCardSelection'
        },
        END_CARD_SELECTION: {
          actions: 'endCardSelection'
        },
        START_LOCATION_SELECTION: {
          actions: 'startLocationSelection'
        },
        END_LOCATION_SELECTION: {
          actions: 'endLocationSelection'
        },
        START_INDUSTRY_SELECTION: {
          actions: 'startIndustrySelection'
        },
        END_INDUSTRY_SELECTION: {
          actions: 'endIndustrySelection'
        },
        START_LINK_SELECTION: {
          actions: 'startLinkSelection'
        },
        END_LINK_SELECTION: {
          actions: 'endLinkSelection'
        },
        START_CONFIRMATION: {
          actions: 'startConfirmation'
        },
        END_CONFIRMATION: {
          actions: 'endConfirmation'
        }
      }
    }
  }
})

// Helper functions for UI state management
export const getUISelections = (context: UIState) => ({
  card: context.selectedCard,
  location: context.selectedLocation,
  industryType: context.selectedIndustryType,
  industryTile: context.selectedIndustryTile,
  link: context.selectedLink,
  secondLink: context.selectedSecondLink,
  scoutCards: context.selectedCardsForScout,
  developTiles: context.selectedTilesForDevelop
})

export const hasUISelection = (context: UIState) => {
  return !!(
    context.selectedCard ||
    context.selectedLocation ||
    context.selectedIndustryType ||
    context.selectedIndustryTile ||
    context.selectedLink ||
    context.selectedSecondLink ||
    context.selectedCardsForScout.length > 0 ||
    context.selectedTilesForDevelop.length > 0
  )
}

export const clearUISelections = (): UIState => ({
  selectedCard: null,
  selectedCardsForScout: [],
  selectedLocation: null,
  selectedIndustryType: null,
  selectedIndustryTile: null,
  selectedLink: null,
  selectedSecondLink: null,
  selectedTilesForDevelop: [],
  lastError: null,
  errorContext: null,
  isSelectingCard: false,
  isSelectingLocation: false,
  isSelectingIndustry: false,
  isSelectingLink: false,
  isConfirming: false
})