'use server'

import { gameManager } from '~/server/gameManager'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { GameEvent } from '~/store/gameStore'

export async function createGameAction(formData: FormData): Promise<never> {
  const playerName = formData.get('playerName') as string
  
  if (!playerName || playerName.trim().length === 0) {
    throw new Error('Player name is required')
  }
  
  if (playerName.trim().length > 50) {
    throw new Error('Player name is too long')
  }
  
  const gameId = await gameManager.createGame(playerName.trim())
  redirect(`/game/${gameId}/created`)
}

export async function joinGameAction(gameId: string, formData: FormData): Promise<never> {
  const playerName = formData.get('playerName') as string
  
  if (!playerName || playerName.trim().length === 0) {
    throw new Error('Player name is required')
  }
  
  if (playerName.trim().length > 50) {
    throw new Error('Player name is too long')
  }
  
  await gameManager.joinGame(gameId, playerName.trim())
  redirect(`/game/${gameId}?player=2&name=${encodeURIComponent(playerName.trim())}`)
}

export async function sendEventAction(
  gameId: string, 
  playerIndex: number, 
  event: GameEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    await gameManager.sendGameEvent(gameId, playerIndex, event)
    revalidatePath(`/game/${gameId}`)
    return { success: true }
  } catch (error) {
    console.error('Error sending game event:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to send event'
    return { success: false, error: errorMessage }
  }
}