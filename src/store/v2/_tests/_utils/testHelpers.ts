// Test helper utilities for V2 actor system
import { createActor } from 'xstate'
import { gameActor } from '../../gameActor'

// Track actors for cleanup
export let activeV2Actors: ReturnType<typeof createActor>[] = []

export const cleanupV2Actors = () => {
  activeV2Actors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeV2Actors = []
}

// Simple test players without heavy imports
export const createV2TestPlayers = () => [
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

export const setupV2Game = () => {
  const actor = createActor(gameActor)
  activeV2Actors.push(actor)
  actor.start()

  const players = createV2TestPlayers()
  actor.send({ type: 'START_GAME', players })

  return { actor, players }
}

export const setupV2GameWithErrorHandling = () => {
  const actor = createActor(gameActor)
  activeV2Actors.push(actor)
  
  // Add error handling to prevent unhandled exceptions during tests
  actor.subscribe({
    error: (error: any) => {
      console.warn('Actor error caught in test:', error.message)
      // Silently handle errors that are expected in failure test scenarios
    }
  })
  
  actor.start()

  const players = createV2TestPlayers()
  actor.send({ type: 'START_GAME', players })

  return { actor, players }
}