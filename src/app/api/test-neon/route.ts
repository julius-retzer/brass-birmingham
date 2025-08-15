import { neon } from '@neondatabase/serverless'
import { env } from '~/env'

export async function GET() {
  try {
    console.log('Testing direct Neon connection...')
    
    const sql = neon(env.DATABASE_URL)
    
    // Test direct SQL query
    const result = await sql`
      INSERT INTO games (state, player1_name, status) 
      VALUES ('{"test": true}', 'Test Player', 'waiting_for_player2') 
      RETURNING id, player1_name
    `
    
    console.log('Direct Neon query successful:', result)
    
    return Response.json({ 
      success: true, 
      result,
      message: 'Direct Neon test passed' 
    })
  } catch (error) {
    console.error('Direct Neon test failed:', error)
    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}