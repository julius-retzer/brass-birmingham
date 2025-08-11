// Basic Game Setup Tests - Lightweight and focused
import { describe, expect, test, afterEach } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach(actor => {
    try { actor.stop() } catch {}
  })
  activeActors = []
})

// Simple test players without heavy imports
const createTestPlayers = () => [
  {
    id: '1',
    name: 'Player 1', 
    color: 'red' as const,
    character: 'Richard Arkwright' as const
  },
  {
    id: '2',
    name: 'Player 2',
    color: 'blue' as const, 
    character: 'Eliza Tinsley' as const
  }
]

const setupGame = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  
  const players = createTestPlayers()
  actor.send({ type: 'START_GAME', players })
  
  return { actor, players }
}

describe('Game Store - Basic Setup', () => {
  test('creates actor successfully', () => {
    const actor = createActor(gameStore)
    activeActors.push(actor)
    expect(actor).toBeDefined()
  })

  test('starts in setup state', () => {
    const actor = createActor(gameStore)
    activeActors.push(actor)
    actor.start()
    
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('setup')
  })

  test('transitions to playing state after START_GAME', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()
    
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(true)
    expect(snapshot.context.players).toHaveLength(2)
    expect(snapshot.context.currentPlayerIndex).toBe(0)
    expect(snapshot.context.era).toBe('canal')
    expect(snapshot.context.round).toBe(1)
    expect(snapshot.context.actionsRemaining).toBe(1)
  })

  test('initializes players with correct starting values', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()
    
    snapshot.context.players.forEach(player => {
      expect(player.money).toBe(17)
      expect(player.income).toBe(10)
      expect(player.victoryPoints).toBe(0)
      expect(player.hand.length).toBeGreaterThan(0)
      expect(player.links).toHaveLength(0)
      expect(player.industries).toHaveLength(0)
    })
  })

  test('sets up markets correctly', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()
    
    // Coal market
    expect(snapshot.context.coalMarket).toHaveLength(8)
    expect(snapshot.context.coalMarket[0]!.price).toBe(1)
    expect(snapshot.context.coalMarket[0]!.cubes).toBe(1)
    expect(snapshot.context.coalMarket[7]!.price).toBe(8)
    expect(snapshot.context.coalMarket[7]!.maxCubes).toBe(Infinity)
    
    // Iron market
    expect(snapshot.context.ironMarket).toHaveLength(6)
    expect(snapshot.context.ironMarket[0]!.price).toBe(1)
    expect(snapshot.context.ironMarket[0]!.cubes).toBe(0)
    expect(snapshot.context.ironMarket[5]!.price).toBe(6)
    expect(snapshot.context.ironMarket[5]!.maxCubes).toBe(Infinity)
  })

  test('initializes draw pile and wild cards', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()
    
    expect(snapshot.context.drawPile.length).toBeGreaterThan(0)
    expect(snapshot.context.discardPile).toHaveLength(0)
    expect(snapshot.context.wildLocationPile.length).toBeGreaterThan(0)
    expect(snapshot.context.wildIndustryPile.length).toBeGreaterThan(0)
  })
})