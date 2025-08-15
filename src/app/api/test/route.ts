import { db } from '~/server/db'
import { games } from '~/server/db/schema'

export async function GET() {
  try {
    console.log('Testing simple database operation...')
    
    // Try a simple insert
    const [testGame] = await db.insert(games).values({
      state: JSON.stringify({ test: 'simple test' }),
      player1Name: 'Test Player',
      status: 'waiting_for_player2'
    }).returning()
    
    console.log('Test insert successful:', testGame)
    
    return Response.json({ 
      success: true, 
      gameId: testGame?.id,
      message: 'Database test passed' 
    })
  } catch (error) {
    console.error('Database test failed:', error)
    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}