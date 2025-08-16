// UI Actor Tests - Client-side UI state management
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { uiActor, getUISelections, hasUISelection, clearUISelections } from './uiActor'
import type { Card } from '../../data/cards'

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

const setupUIActor = () => {
  const actor = createActor(uiActor)
  activeActors.push(actor)
  actor.start()
  return actor
}

// Test data
const testCard: Card = {
  id: 'test_card_1',
  type: 'location',
  location: 'birmingham',
  color: 'blue'
}

const testCard2: Card = {
  id: 'test_card_2',
  type: 'industry',
  industries: ['coal']
}

describe('UI Actor - Card Selection', () => {
  test('can select and deselect a card', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Initially no card selected
    expect(snapshot.context.selectedCard).toBeNull()
    
    // Select a card
    actor.send({ type: 'SELECT_CARD', card: testCard })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard).toEqual(testCard)
    
    // Deselect the card
    actor.send({ type: 'DESELECT_CARD' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard).toBeNull()
  })
  
  test('can manage scout card selections', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Initially no scout cards selected
    expect(snapshot.context.selectedCardsForScout).toHaveLength(0)
    
    // Add first scout card
    actor.send({ type: 'ADD_SCOUT_CARD', card: testCard })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCardsForScout).toHaveLength(1)
    expect(snapshot.context.selectedCardsForScout[0]).toEqual(testCard)
    
    // Add second scout card
    actor.send({ type: 'ADD_SCOUT_CARD', card: testCard2 })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCardsForScout).toHaveLength(2)
    
    // Remove first card
    actor.send({ type: 'REMOVE_SCOUT_CARD', card: testCard })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCardsForScout).toHaveLength(1)
    expect(snapshot.context.selectedCardsForScout[0]).toEqual(testCard2)
    
    // Clear all scout cards
    actor.send({ type: 'CLEAR_SCOUT_CARDS' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCardsForScout).toHaveLength(0)
  })
})

describe('UI Actor - Location Selection', () => {
  test('can select and deselect a location', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Initially no location selected
    expect(snapshot.context.selectedLocation).toBeNull()
    
    // Select a location
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedLocation).toBe('birmingham')
    
    // Change location
    actor.send({ type: 'SELECT_LOCATION', cityId: 'coventry' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedLocation).toBe('coventry')
    
    // Deselect location
    actor.send({ type: 'DESELECT_LOCATION' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedLocation).toBeNull()
  })
})

describe('UI Actor - Industry Selection', () => {
  test('can select industry type and tile', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Select industry type
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryType).toBe('coal')
    
    // Select industry tile
    const testTile = {
      id: 'coal_1',
      type: 'coal' as const,
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
    
    actor.send({ type: 'SELECT_INDUSTRY_TILE', tile: testTile })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile).toEqual(testTile)
    
    // Deselect industry type
    actor.send({ type: 'DESELECT_INDUSTRY_TYPE' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryType).toBeNull()
    
    // Deselect industry tile
    actor.send({ type: 'DESELECT_INDUSTRY_TILE' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
  })
  
  test('can manage develop tile selections', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Add develop tiles
    actor.send({ type: 'ADD_DEVELOP_TILE', industryType: 'coal' })
    actor.send({ type: 'ADD_DEVELOP_TILE', industryType: 'iron' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedTilesForDevelop).toEqual(['coal', 'iron'])
    
    // Remove a tile
    actor.send({ type: 'REMOVE_DEVELOP_TILE', industryType: 'coal' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedTilesForDevelop).toEqual(['iron'])
    
    // Clear all develop tiles
    actor.send({ type: 'CLEAR_DEVELOP_TILES' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedTilesForDevelop).toHaveLength(0)
  })
})

describe('UI Actor - Network Selection', () => {
  test('can select and deselect links', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Select first link
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedLink).toEqual({ from: 'birmingham', to: 'coventry' })
    
    // Select second link (for double rail)
    actor.send({ type: 'SELECT_SECOND_LINK', from: 'coventry', to: 'nuneaton' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedSecondLink).toEqual({ from: 'coventry', to: 'nuneaton' })
    
    // Deselect links
    actor.send({ type: 'DESELECT_LINK' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedLink).toBeNull()
    
    actor.send({ type: 'DESELECT_SECOND_LINK' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedSecondLink).toBeNull()
  })
})

describe('UI Actor - Error State', () => {
  test('can set and clear error state', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Initially no error
    expect(snapshot.context.lastError).toBeNull()
    expect(snapshot.context.errorContext).toBeNull()
    
    // Set error
    actor.send({ type: 'SET_ERROR', message: 'Invalid build location', context: 'build' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBe('Invalid build location')
    expect(snapshot.context.errorContext).toBe('build')
    
    // Clear error
    actor.send({ type: 'CLEAR_ERROR' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    expect(snapshot.context.errorContext).toBeNull()
  })
})

describe('UI Actor - Selection States', () => {
  test('can track selection states', () => {
    const actor = setupUIActor()
    let snapshot = actor.getSnapshot()
    
    // Initially all selection states are false
    expect(snapshot.context.isSelectingCard).toBe(false)
    expect(snapshot.context.isSelectingLocation).toBe(false)
    expect(snapshot.context.isSelectingIndustry).toBe(false)
    expect(snapshot.context.isSelectingLink).toBe(false)
    expect(snapshot.context.isConfirming).toBe(false)
    
    // Start card selection
    actor.send({ type: 'START_CARD_SELECTION' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.isSelectingCard).toBe(true)
    
    // End card selection
    actor.send({ type: 'END_CARD_SELECTION' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.isSelectingCard).toBe(false)
    
    // Start location selection
    actor.send({ type: 'START_LOCATION_SELECTION' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.isSelectingLocation).toBe(true)
    
    // Start confirmation
    actor.send({ type: 'START_CONFIRMATION' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.isConfirming).toBe(true)
  })
})

describe('UI Actor - Clear All Selections', () => {
  test('can clear all selections at once', () => {
    const actor = setupUIActor()
    
    // Set various selections
    actor.send({ type: 'SELECT_CARD', card: testCard })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    actor.send({ type: 'ADD_SCOUT_CARD', card: testCard2 })
    actor.send({ type: 'ADD_DEVELOP_TILE', industryType: 'iron' })
    actor.send({ type: 'START_CARD_SELECTION' })
    actor.send({ type: 'START_CONFIRMATION' })
    
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard).not.toBeNull()
    expect(snapshot.context.selectedLocation).not.toBeNull()
    expect(snapshot.context.selectedIndustryType).not.toBeNull()
    expect(snapshot.context.selectedLink).not.toBeNull()
    expect(snapshot.context.selectedCardsForScout).not.toHaveLength(0)
    expect(snapshot.context.selectedTilesForDevelop).not.toHaveLength(0)
    expect(snapshot.context.isSelectingCard).toBe(true)
    expect(snapshot.context.isConfirming).toBe(true)
    
    // Clear all selections
    actor.send({ type: 'CLEAR_ALL_SELECTIONS' })
    snapshot = actor.getSnapshot()
    
    // Verify everything is cleared
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedLocation).toBeNull()
    expect(snapshot.context.selectedIndustryType).toBeNull()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
    expect(snapshot.context.selectedLink).toBeNull()
    expect(snapshot.context.selectedSecondLink).toBeNull()
    expect(snapshot.context.selectedCardsForScout).toHaveLength(0)
    expect(snapshot.context.selectedTilesForDevelop).toHaveLength(0)
    expect(snapshot.context.isSelectingCard).toBe(false)
    expect(snapshot.context.isSelectingLocation).toBe(false)
    expect(snapshot.context.isSelectingIndustry).toBe(false)
    expect(snapshot.context.isSelectingLink).toBe(false)
    expect(snapshot.context.isConfirming).toBe(false)
  })
})

describe('UI Actor - Helper Functions', () => {
  test('getUISelections returns all selections', () => {
    const actor = setupUIActor()
    
    actor.send({ type: 'SELECT_CARD', card: testCard })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    
    const snapshot = actor.getSnapshot()
    const selections = getUISelections(snapshot.context)
    
    expect(selections.card).toEqual(testCard)
    expect(selections.location).toBe('birmingham')
    expect(selections.industryType).toBe('coal')
    expect(selections.link).toBeNull()
    expect(selections.scoutCards).toHaveLength(0)
  })
  
  test('hasUISelection detects any active selection', () => {
    const actor = setupUIActor()
    
    let snapshot = actor.getSnapshot()
    expect(hasUISelection(snapshot.context)).toBe(false)
    
    // Add a selection
    actor.send({ type: 'SELECT_CARD', card: testCard })
    snapshot = actor.getSnapshot()
    expect(hasUISelection(snapshot.context)).toBe(true)
    
    // Clear and add different selection
    actor.send({ type: 'CLEAR_ALL_SELECTIONS' })
    actor.send({ type: 'ADD_SCOUT_CARD', card: testCard })
    snapshot = actor.getSnapshot()
    expect(hasUISelection(snapshot.context)).toBe(true)
  })
  
  test('clearUISelections returns clean state', () => {
    const cleanState = clearUISelections()
    
    expect(cleanState.selectedCard).toBeNull()
    expect(cleanState.selectedLocation).toBeNull()
    expect(cleanState.selectedIndustryType).toBeNull()
    expect(cleanState.selectedIndustryTile).toBeNull()
    expect(cleanState.selectedLink).toBeNull()
    expect(cleanState.selectedSecondLink).toBeNull()
    expect(cleanState.selectedCardsForScout).toHaveLength(0)
    expect(cleanState.selectedTilesForDevelop).toHaveLength(0)
    expect(cleanState.lastError).toBeNull()
    expect(cleanState.errorContext).toBeNull()
    expect(cleanState.isSelectingCard).toBe(false)
    expect(cleanState.isSelectingLocation).toBe(false)
    expect(cleanState.isSelectingIndustry).toBe(false)
    expect(cleanState.isSelectingLink).toBe(false)
    expect(cleanState.isConfirming).toBe(false)
  })
})