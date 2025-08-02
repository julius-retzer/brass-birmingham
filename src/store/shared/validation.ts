import type { GameState } from '../gameStore'

// Common validation utilities
export function validatePlayerIndex(
  context: GameState,
  playerIndex: number,
): void {
  if (playerIndex < 0 || playerIndex >= context.players.length) {
    throw new Error(`Invalid player index: ${playerIndex}`)
  }
}

export function validateGamePhase(
  context: GameState,
  expectedEra: 'canal' | 'rail',
): void {
  if (context.era !== expectedEra) {
    throw new Error(`Action not valid in ${context.era} era`)
  }
}

export function validatePlayerTurn(context: GameState, playerId: string): void {
  const currentPlayer = context.players[context.currentPlayerIndex]
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error(`Not player ${playerId}'s turn`)
  }
}
