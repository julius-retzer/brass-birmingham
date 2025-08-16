// Privacy Boundaries Analysis Tests - identifies state separation requirements
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameActor } from './gameActor'
import type { GameState, Player } from './gameActor'

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

const setupGame = () => {
  const actor = createActor(gameActor)
  activeActors.push(actor)
  actor.start()

  const players = [
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
    },
  ]

  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

describe('Privacy Boundaries Analysis', () => {
  describe('Private Player State', () => {
    test('identifies player hand as private state', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const players = snapshot.context.players

      // Player hands should only be visible to the owning player
      players.forEach((player, index) => {
        expect(player.hand).toBeDefined()
        expect(player.hand.length).toBeGreaterThan(0)
        
        // In the current monolithic system, all players can see all hands (PRIVACY VIOLATION)
        // This should be fixed in the actor-based system
        console.warn(`PRIVACY ISSUE: Player ${index} hand visible to all players:`, player.hand.length, 'cards')
      })
    })

    test('identifies industry tiles on mat as private state', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const players = snapshot.context.players

      players.forEach((player, index) => {
        expect(player.industryTilesOnMat).toBeDefined()
        
        // Industry tiles on mat should only be visible to the owning player
        // In the current monolithic system, all players can see all tiles (PRIVACY VIOLATION)
        console.warn(`PRIVACY ISSUE: Player ${index} tiles on mat visible to all players`)
      })
    })

    test('identifies what should remain as public player state', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const players = snapshot.context.players

      players.forEach((player) => {
        // These should remain publicly visible
        expect(player.id).toBeDefined() // PUBLIC: player identification
        expect(player.name).toBeDefined() // PUBLIC: player name
        expect(player.color).toBeDefined() // PUBLIC: player color
        expect(player.character).toBeDefined() // PUBLIC: player character
        expect(typeof player.money).toBe('number') // PUBLIC: player money
        expect(typeof player.victoryPoints).toBe('number') // PUBLIC: victory points
        expect(typeof player.income).toBe('number') // PUBLIC: income level
        expect(Array.isArray(player.links)).toBe(true) // PUBLIC: built links
        expect(Array.isArray(player.industries)).toBe(true) // PUBLIC: built industries
      })
    })
  })

  describe('UI State Identification', () => {
    test('identifies UI-only state that should not be synchronized', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const state = snapshot.context

      // These should be client-only and never synchronized to server
      const uiState = {
        selectedCard: state.selectedCard, // UI: current player's card selection
        selectedCardsForScout: state.selectedCardsForScout, // UI: scout selections
        selectedLink: state.selectedLink, // UI: link selection
        selectedSecondLink: state.selectedSecondLink, // UI: second link selection
        selectedLocation: state.selectedLocation, // UI: location selection
        selectedIndustryTile: state.selectedIndustryTile, // UI: tile selection
        selectedTilesForDevelop: state.selectedTilesForDevelop, // UI: develop selections
        lastError: state.lastError, // UI: error messages
        errorContext: state.errorContext, // UI: error context
      }

      // Verify these exist in current state (they should be moved to UI actor)
      Object.entries(uiState).forEach(([key, value]) => {
        console.log(`UI STATE: ${key} should be client-only, current value:`, value)
      })

      // These selections should only exist during active player's turn
      if (state.selectedCard) {
        console.warn('UI STATE ISSUE: selectedCard persists in global state')
      }
    })

    test('demonstrates UI state pollution in current architecture', () => {
      const { actor } = setupGame()
      
      // Simulate player 1 starting a build action
      actor.send({ type: 'BUILD' })
      let snapshot = actor.getSnapshot()
      
      // Player 1 selects a card
      const player1Card = snapshot.context.players[0]!.hand[0]!
      actor.send({ type: 'SELECT_CARD', cardId: player1Card.id })
      snapshot = actor.getSnapshot()
      
      // UI state is now polluted - all players can see Player 1's selection
      expect(snapshot.context.selectedCard?.id).toBe(player1Card.id)
      
      console.warn('UI POLLUTION: Player 1 card selection visible to all players:', snapshot.context.selectedCard?.id)
      
      // Cancel to clean up
      actor.send({ type: 'CANCEL' })
    })
  })

  describe('Public Game State Identification', () => {
    test('identifies public game state that should be synchronized', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const state = snapshot.context

      // These should be visible to all players and synchronized
      const publicGameState = {
        currentPlayerIndex: state.currentPlayerIndex, // PUBLIC: whose turn it is
        era: state.era, // PUBLIC: current era
        round: state.round, // PUBLIC: current round
        actionsRemaining: state.actionsRemaining, // PUBLIC: remaining actions
        coalMarket: state.coalMarket, // PUBLIC: market state
        ironMarket: state.ironMarket, // PUBLIC: market state
        logs: state.logs, // PUBLIC: game log
        drawPile: state.drawPile, // PUBLIC: deck state (but not order)
        discardPile: state.discardPile, // PUBLIC: discard pile
        wildLocationPile: state.wildLocationPile, // PUBLIC: wild cards
        wildIndustryPile: state.wildIndustryPile, // PUBLIC: wild cards
        spentMoney: state.spentMoney, // PUBLIC: current round spending
        playerSpending: state.playerSpending, // PUBLIC: player spending
        turnOrder: state.turnOrder, // PUBLIC: turn order
        isFinalRound: state.isFinalRound, // PUBLIC: final round flag
        merchants: state.merchants, // PUBLIC: merchant system
      }

      // Verify all public state is present and accessible
      Object.entries(publicGameState).forEach(([key, value]) => {
        expect(value).toBeDefined()
        console.log(`PUBLIC STATE: ${key} should be synchronized to all players`)
      })
    })

    test('identifies built infrastructure as public state', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const players = snapshot.context.players

      players.forEach((player, index) => {
        // Built links and industries should be public (visible on board)
        expect(Array.isArray(player.links)).toBe(true)
        expect(Array.isArray(player.industries)).toBe(true)
        
        console.log(`PUBLIC BOARD STATE: Player ${index} links and industries visible to all`)
      })
    })
  })

  describe('Mixed State Analysis', () => {
    test('identifies player array as containing mixed visibility data', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const players = snapshot.context.players

      // The players array contains both public and private data
      // This needs to be split in the actor architecture
      players.forEach((player, index) => {
        const publicData = {
          id: player.id,
          name: player.name,
          color: player.color,
          character: player.character,
          money: player.money,
          victoryPoints: player.victoryPoints,
          income: player.income,
          links: player.links,
          industries: player.industries,
        }

        const privateData = {
          hand: player.hand,
          industryTilesOnMat: player.industryTilesOnMat,
        }

        console.log(`MIXED STATE: Player ${index} has public data:`, Object.keys(publicData))
        console.log(`MIXED STATE: Player ${index} has private data:`, Object.keys(privateData))
      })
    })
  })

  describe('Actor Architecture Implications', () => {
    test('documents required actor separation', () => {
      // This test documents the actor architecture requirements
      const architectureAnalysis = {
        gameLogicActor: {
          purpose: 'Manages public game state and rules',
          state: [
            'currentPlayerIndex',
            'era',
            'round', 
            'actionsRemaining',
            'coalMarket',
            'ironMarket',
            'logs',
            'drawPile', // (without order)
            'discardPile',
            'wildLocationPile',
            'wildIndustryPile',
            'spentMoney',
            'playerSpending',
            'turnOrder',
            'isFinalRound',
            'merchants',
            'publicPlayerData' // (money, VP, income, links, industries)
          ]
        },
        playerActor: {
          purpose: 'Manages private player state (one per player)',
          state: [
            'playerId',
            'hand',
            'industryTilesOnMat'
          ]
        },
        uiActor: {
          purpose: 'Manages client-side UI state (one per client)',
          state: [
            'selectedCard',
            'selectedCardsForScout',
            'selectedLink',
            'selectedSecondLink',
            'selectedLocation',
            'selectedIndustryTile',
            'selectedTilesForDevelop',
            'lastError',
            'errorContext'
          ]
        }
      }

      // Log the architecture plan
      console.log('ACTOR ARCHITECTURE PLAN:', JSON.stringify(architectureAnalysis, null, 2))
      
      // Verify the analysis is complete
      expect(architectureAnalysis.gameLogicActor.state.length).toBeGreaterThan(10)
      expect(architectureAnalysis.playerActor.state.length).toBeGreaterThan(1)
      expect(architectureAnalysis.uiActor.state.length).toBeGreaterThan(5)
    })

    test('verifies no state is lost in separation', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const currentState = snapshot.context

      // All current state keys
      const allStateKeys = Object.keys(currentState)
      
      // Keys that will be distributed across actors
      const distributedKeys = [
        // GameLogic Actor
        'currentPlayerIndex', 'era', 'round', 'actionsRemaining',
        'coalMarket', 'ironMarket', 'logs', 'drawPile', 'discardPile',
        'wildLocationPile', 'wildIndustryPile', 'spentMoney',
        'playerSpending', 'turnOrder', 'isFinalRound', 'merchants',
        'players', // (will be split into public/private)
        
        // UI Actor  
        'selectedCard', 'selectedCardsForScout', 'selectedLink',
        'selectedSecondLink', 'selectedLocation', 'selectedIndustryTile',
        'selectedTilesForDevelop', 'lastError', 'errorContext',
        
        // PlayerActor (extracted from players array)
        // 'hand', 'industryTilesOnMat' - these are inside players array
        
        // Deprecated/unused
        'resources' // This appears to be unused in current implementation
      ]

      // Verify all state is accounted for
      const unmappedKeys = allStateKeys.filter(key => !distributedKeys.includes(key))
      
      if (unmappedKeys.length > 0) {
        console.warn('UNMAPPED STATE KEYS:', unmappedKeys)
      }
      
      expect(unmappedKeys.length).toBe(0) // All state should be mapped
    })
  })
})