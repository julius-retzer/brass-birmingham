import { gameManager } from '~/server/gameManager'
import { GameLinks } from '~/components/GameLinks'
import { notFound } from 'next/navigation'

export default async function GameCreatedPage({ 
  params 
}: { 
  params: Promise<{ gameId: string }> 
}) {
  const { gameId } = await params
  const gameState = await gameManager.getGameState(gameId)
  
  if (!gameState) {
    notFound()
  }
  
  const player1Name = gameState.context.players[0]?.name || 'Player 1'
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-lg w-full mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Game Created!</h1>
          <p className="text-muted-foreground">Hi {player1Name}! Share this link with your opponent:</p>
        </div>
        <GameLinks gameId={gameId} />
      </div>
    </div>
  )
}