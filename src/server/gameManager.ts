import { createActor } from 'xstate'
import { gameStore, type GameEvent, type Player } from '../store/gameStore'
import { getInitialPlayerIndustryTilesWithQuantities } from '../data/industryTiles'
import { db } from './db'
import { games } from './db/schema'
import { eq } from 'drizzle-orm'

// Type for persisted snapshot (JSON-serializable data from getPersistedSnapshot())
interface PersistedGameSnapshot {
  state: unknown
  context: unknown
  [key: string]: unknown
}

export class GameManager {
  // Remove in-memory cache - we'll load from DB on demand for event processing only
  
  async createGame(player1Name: string): Promise<string> {
    try {
      console.log('Creating game for player:', player1Name)
      
      // Create initial XState snapshot for 2 players
      const actor = createActor(gameStore)
      actor.start()
      console.log('Actor created and started')
      
      console.log('Creating proper initial players with full industry tiles...')
      // Create proper player data with full industry tiles
      const player1IndustryTiles = getInitialPlayerIndustryTilesWithQuantities()
      const player2IndustryTiles = getInitialPlayerIndustryTilesWithQuantities()
      
      const initialPlayers: Array<Omit<Player, 'hand' | 'links' | 'industries'>> = [
        {
          id: '1',
          name: player1Name,
          color: 'red' as const,
          character: 'Richard Arkwright' as const,
          money: 30,
          victoryPoints: 0,
          income: 10,
          industryTilesOnMat: player1IndustryTiles,
        },
        {
          id: '2', 
          name: 'Waiting for Player 2...',
          color: 'blue' as const,
          character: 'Eliza Tinsley' as const,
          money: 30,
          victoryPoints: 0,
          income: 10,
          industryTilesOnMat: player2IndustryTiles,
        }
      ]
      console.log('Initial players created')
      
      console.log('About to send START_GAME event with players:', initialPlayers.length)
      try {
        actor.send({ type: 'START_GAME', players: initialPlayers })
        console.log('START_GAME event sent successfully')
      } catch (xstateError) {
        console.error('XState error:', xstateError)
        throw xstateError
      }
      
      console.log('Getting persisted snapshot...')
      let persistedSnapshot: unknown
      try {
        persistedSnapshot = actor.getPersistedSnapshot()
        console.log('Persisted snapshot obtained successfully')
      } catch (snapshotError) {
        console.error('Snapshot error:', snapshotError)
        throw snapshotError
      }
      
      // Save to database - no need to keep actor in memory
      console.log('Attempting database insert...')
      const [game] = await db.insert(games).values({
        state: JSON.stringify(persistedSnapshot),
        player1Name,
        status: 'waiting_for_player2'
      }).returning()
      console.log('Database insert successful:', game?.id)
      
      if (!game) {
        throw new Error('Failed to create game record')
      }
      
      // Stop actor after saving - we'll recreate it when needed for events
      actor.stop()
      console.log('Actor stopped after saving to database')
      
      return game.id
    } catch (error) {
      console.error('Error in createGame:', error)
      throw error
    }
  }
  
  async joinGame(gameId: string, player2Name: string): Promise<void> {
    // Load game from DB and start actor only for processing this event
    const [game] = await db.select().from(games).where(eq(games.id, gameId))
    if (!game) {
      throw new Error('Game not found')
    }
    
    // Recreate actor from persisted snapshot
    const persistedSnapshot = JSON.parse(game.state)
    const actor = createActor(gameStore, { snapshot: persistedSnapshot })
    actor.start()
    
    try {
      // Send JOIN_GAME event to update player 2 name
      actor.send({ type: 'JOIN_GAME', player2Name })
      
      // Get the updated persisted snapshot
      const updatedPersistedSnapshot = actor.getPersistedSnapshot()
      
      // Update database with new state and status
      await db.update(games)
        .set({ 
          player2Name,
          status: 'in_progress',
          state: JSON.stringify(updatedPersistedSnapshot),
          updatedAt: new Date()
        })
        .where(eq(games.id, gameId))
    } finally {
      // Always stop the actor after processing
      actor.stop()
    }
  }
  
  async getGameState(gameId: string): Promise<PersistedGameSnapshot | null> {
    try {
      // Return only the persisted snapshot (JSON-serializable) for client components
      const [game] = await db.select().from(games).where(eq(games.id, gameId))
      if (!game) {
        return null
      }
      
      // Return the persisted snapshot directly from database
      return JSON.parse(game.state)
    } catch (error) {
      console.error('Error getting game state:', error)
      return null
    }
  }
  
  async sendGameEvent(gameId: string, playerIndex: number, event: GameEvent): Promise<void> {
    // Load game from DB and validate
    const [game] = await db.select().from(games).where(eq(games.id, gameId))
    if (!game) {
      throw new Error('Game not found')
    }
    
    if (game.status !== 'in_progress') {
      throw new Error('Game is not in progress')
    }
    
    // Recreate actor from persisted snapshot only for event processing
    const persistedSnapshot = JSON.parse(game.state)
    const actor = createActor(gameStore, { snapshot: persistedSnapshot })
    actor.start()
    
    try {
      // Validate it's the player's turn
      const snapshot = actor.getSnapshot()
      const currentPlayerIndex = snapshot.context.currentPlayerIndex
      
      if (currentPlayerIndex !== playerIndex - 1) {
        throw new Error(`Not your turn. Current turn: Player ${currentPlayerIndex + 1}, You are: Player ${playerIndex}`)
      }
      
      // Send event to actor
      actor.send(event)
      
      // Save updated state to database
      const updatedPersistedSnapshot = actor.getPersistedSnapshot()
      await db.update(games)
        .set({ 
          state: JSON.stringify(updatedPersistedSnapshot),
          updatedAt: new Date()
        })
        .where(eq(games.id, gameId))
    } finally {
      // Always stop the actor after processing
      actor.stop()
    }
  }
  
  // Removed loadFromDB and saveToDB methods - we now handle DB operations directly in each method
  
  async getGameInfo(gameId: string): Promise<{ player1Name?: string | null; player2Name?: string | null; status: string } | null> {
    const [game] = await db.select({
      player1Name: games.player1Name,
      player2Name: games.player2Name,
      status: games.status
    }).from(games).where(eq(games.id, gameId))
    
    return game || null
  }
}

// Export singleton instance
export const gameManager = new GameManager()