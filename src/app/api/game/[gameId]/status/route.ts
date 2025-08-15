import { gameManager } from '~/server/gameManager'
import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params
    
    // Get basic game info and state
    const gameInfo = await gameManager.getGameInfo(gameId)
    const gameState = await gameManager.getGameState(gameId)
    
    if (!gameInfo || !gameState) {
      return Response.json({ error: 'Game not found' }, { status: 404 })
    }

    // Extract current player info from game state
    const context = (gameState as any)?.context
    const currentPlayerIndex = context?.currentPlayerIndex ?? 0
    const currentTurn = `player-${currentPlayerIndex}-actions-${context?.actionsRemaining ?? 0}`
    
    return Response.json({
      status: gameInfo.status,
      currentPlayerIndex,
      // Use a combination of player index and actions remaining as update indicator
      lastUpdate: currentTurn,
      player1Name: gameInfo.player1Name,
      player2Name: gameInfo.player2Name
    }, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Error getting game status:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}