import type { GameState, Player } from '../store/gameStore'
import type { Card, WildIndustryCard, WildLocationCard } from '../data/cards'

// Filtered types for client-side state
export interface FilteredPlayer extends Omit<Player, 'hand'> {
  hand?: Card[] // Only present for the requesting player
  handCount: number // Always present for all players
}

export interface FilteredGameState
  extends Omit<
    GameState,
    | 'players'
    | 'drawPile'
    | 'discardPile'
    | 'wildLocationPile'
    | 'wildIndustryPile'
  > {
  players: FilteredPlayer[]
  drawPileCount: number
  topDiscardCard: Card | null
  wildLocationCount: number
  wildIndustryCount: number
  // Original arrays are removed, only counts/limited info provided
}

/**
 * Filters the game state to hide private information from other players
 * @param state The full game state
 * @param requestingPlayerIndex The index of the player requesting the state (0-based)
 * @returns A filtered game state with private information hidden
 */
export function filterGameStateForPlayer(
  state: GameState,
  requestingPlayerIndex: number,
): FilteredGameState {
  // Filter player information
  const filteredPlayers: FilteredPlayer[] = state.players.map(
    (player, index) => {
      // Extract hand from player and create a new object without it
      const { hand, ...playerWithoutHand } = player

      const filteredPlayer: FilteredPlayer = {
        ...playerWithoutHand,
        handCount: hand.length,
      }

      // Only include the actual hand for the requesting player
      if (index === requestingPlayerIndex) {
        filteredPlayer.hand = hand
      }
      // For other players, hand property is not included (undefined)

      return filteredPlayer
    },
  )

  // Get the top discard card (if any)
  const topDiscardCard =
    state.discardPile.length > 0
      ? state.discardPile[state.discardPile.length - 1] || null
      : null

  // Create the filtered state
  const filteredState: FilteredGameState = {
    ...state,
    players: filteredPlayers,
    drawPileCount: state.drawPile.length,
    topDiscardCard,
    wildLocationCount: state.wildLocationPile.length,
    wildIndustryCount: state.wildIndustryPile.length,
  }

  // Remove the original arrays from the filtered state
  // (they're already excluded by the type, but let's be explicit)
  delete (filteredState as any).drawPile
  delete (filteredState as any).discardPile
  delete (filteredState as any).wildLocationPile
  delete (filteredState as any).wildIndustryPile

  return filteredState
}

/**
 * Reconstructs a minimal game state from filtered state for XState compatibility
 * This is needed when the client needs to create an actor from filtered state
 * @param filteredState The filtered game state
 * @param playerIndex The index of the current player
 * @returns A reconstructed game state with placeholder data for hidden information
 */
export function reconstructGameStateFromFiltered(
  filteredState: FilteredGameState,
  playerIndex: number,
): GameState {
  // Reconstruct players with empty hands for opponents
  const players: Player[] = filteredState.players.map(
    (filteredPlayer, index) => {
      const player: Player = {
        ...filteredPlayer,
        hand:
          index === playerIndex && filteredPlayer.hand
            ? filteredPlayer.hand
            : [], // Empty array for opponents or if hand is missing
      }
      return player
    },
  )

  // Create placeholder arrays for hidden information
  const drawPile: Card[] = [] // Empty array, client doesn't need actual cards
  const discardPile: Card[] = filteredState.topDiscardCard
    ? [filteredState.topDiscardCard]
    : []
  const wildLocationPile: WildLocationCard[] = [] // Empty arrays for wild cards - use any to avoid type issues
  const wildIndustryPile: WildIndustryCard[] = []

  // Reconstruct the full state structure
  const reconstructedState: GameState = {
    ...filteredState,
    players,
    drawPile,
    discardPile,
    wildLocationPile,
    wildIndustryPile,
  }

  return reconstructedState
}
