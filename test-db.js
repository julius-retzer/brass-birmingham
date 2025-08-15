// Simple test to check database connection
import { db } from './src/server/db/index.ts'
import { games } from './src/server/db/schema.ts'

async function testDB() {
  try {
    console.log('Testing database connection...')
    
    // Test simple insert
    const result = await db.insert(games).values({
      state: JSON.stringify({ test: true }),
      player1Name: 'Test Player',
      status: 'waiting_for_player2'
    }).returning()
    
    console.log('Insert successful:', result)
    
    // Test select
    const allGames = await db.select().from(games).limit(5)
    console.log('Games in database:', allGames)
    
  } catch (error) {
    console.error('Database test failed:', error)
  }
}

testDB()