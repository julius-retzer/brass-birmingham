import { gameManager } from '~/server/gameManager'
import { GameInterface } from '~/components/GameInterface'
import { JoinGameForm } from '~/components/JoinGameForm'
import { notFound } from 'next/navigation'

export default async function GamePage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ gameId: string }>
  searchParams: Promise<{ player?: '1' | '2', name?: string }>
}) {
  const { gameId } = await params
  const { player, name } = await searchParams
  
  const gameState = await gameManager.getGameState(gameId)
  
  if (!gameState) {
    notFound()
  }

  // The gameState is already a properly serialized snapshot from getPersistedSnapshot()
  // No need to re-serialize, just pass it directly
  const persistedSnapshot = gameState
  
  const playerIndex = parseInt(player || '1') as 1 | 2
  const playerName = name
  
  // Get game info to check if player 2 has joined
  const gameInfo = await gameManager.getGameInfo(gameId)
  
  // If this is player 2 and they haven't joined yet, show join form
  if (playerIndex === 2 && gameInfo?.status === 'waiting_for_player2') {
    return <JoinGameForm gameId={gameId} />
  }
  
  // If no player name in URL, this is an invalid access
  if (!playerName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-auto p-6 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Invalid Access</h1>
          <p className="text-muted-foreground">
            Please use the correct player link to access this game.
          </p>
        </div>
      </div>
    )
  }
  
  // Game is ready to play
  return (
    <GameInterface 
      gameState={persistedSnapshot}
      gameId={gameId}
      playerIndex={playerIndex}
      playerName={playerName}
    />
  )
}