import type { CityId } from '../../data/board'
import type { Card } from '../../data/cards'
import type { GameState, LogEntry, LogEntryType, Player } from '../gameStore'

export function getCurrentPlayer(context: GameState): Player {
  const player = context.players[context.currentPlayerIndex]
  if (!player) {
    throw new Error('Current player not found')
  }
  return player
}

export function getCardDescription(card: Card): string {
  switch (card.type) {
    case 'location':
      return `${card.location} (${card.color})`
    case 'industry':
      return `${card.industries.join('/')} industry`
    case 'wild_location':
      return 'wild location'
    case 'wild_industry':
      return 'wild industry'
  }
}

export function drawCards(context: GameState, count: number): Card[] {
  return context.drawPile.slice(0, count)
}

export function isFirstRound(context: GameState): boolean {
  return context.era === 'canal' && context.round === 1
}

// Resource consumption utility functions
export function findConnectedCoalMines(
  context: GameState,
  location: CityId,
  currentPlayer: Player,
): Player['industries'] {
  // TODO: Implement proper network connectivity checking
  // For now, return coal mines at the same location (simplified)
  return context.players
    .flatMap((player) => player.industries)
    .filter(
      (industry) =>
        industry.type === 'coal' &&
        !industry.flipped &&
        industry.coalCubesOnTile > 0 &&
        industry.location === location,
    )
}

export function findAvailableIronWorks(
  context: GameState,
): Player['industries'] {
  // Iron works can be used from anywhere (no connection required)
  return context.players
    .flatMap((player) => player.industries)
    .filter(
      (industry) =>
        industry.type === 'iron' &&
        !industry.flipped &&
        industry.ironCubesOnTile > 0,
    )
}

export function findAvailableBreweries(
  context: GameState,
  location: CityId,
  currentPlayer: Player,
): {
  ownBreweries: Player['industries']
  connectedBreweries: Player['industries']
} {
  const ownBreweries = currentPlayer.industries.filter(
    (industry) =>
      industry.type === 'brewery' &&
      !industry.flipped &&
      industry.beerBarrelsOnTile > 0,
  )

  // TODO: Implement proper network connectivity for opponent breweries
  // For now, return breweries at the same location (simplified)
  const connectedBreweries = context.players
    .filter((player) => player.id !== currentPlayer.id)
    .flatMap((player) => player.industries)
    .filter(
      (industry) =>
        industry.type === 'brewery' &&
        !industry.flipped &&
        industry.beerBarrelsOnTile > 0 &&
        industry.location === location,
    )

  return { ownBreweries, connectedBreweries }
}

// Array utilities
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = shuffled[i]
    const next = shuffled[j]
    if (temp !== undefined && next !== undefined) {
      shuffled[i] = next
      shuffled[j] = temp
    }
  }
  return shuffled
}

// Logging utilities
const DEBUG = false

export function debugLog(
  actionName: string,
  context: GameState,
  event?: { type: string } & Record<string, unknown>,
) {
  if (DEBUG) {
    console.log(`🔴 ${actionName}`, {
      currentPlayer: context.currentPlayerIndex,
      actionsRemaining: context.actionsRemaining,
      round: context.round,
      era: context.era,
      selectedCard: context.selectedCard?.id,
      event: event?.type,
    })
  }
}

export function createLogEntry(message: string, type: LogEntryType): LogEntry {
  return {
    message,
    type,
    timestamp: new Date(),
  }
}

// Network validation helper functions
export function isLocationInPlayerNetwork(
  context: GameState, 
  targetLocation: CityId, 
  playerIndex: number
): boolean {
  const player = context.players[playerIndex]
  if (!player) return false

  // A location is part of your network if:
  // 1. It contains one or more of your industry tiles
  // 2. It is adjacent to one or more of your link tiles

  // Check if player has industry at this location
  const hasIndustryAtLocation = player.industries.some(
    industry => industry.location === targetLocation
  )
  if (hasIndustryAtLocation) return true

  // Check if location is adjacent to any of player's links
  const isAdjacentToPlayerLink = player.links.some(
    link => link.from === targetLocation || link.to === targetLocation
  )
  if (isAdjacentToPlayerLink) return true

  // TODO: Add BFS pathfinding for multi-hop connections through other players' links
  // For now, this basic implementation covers direct connections

  return false
}

export function hasMarketAccess(
  context: GameState,
  playerIndex: number,
  marketType: 'coal' | 'iron'
): boolean {
  if (marketType === 'iron') {
    // Iron market is always accessible
    return true
  }

  // Coal market requires connection to merchant with [↔] icon
  const player = context.players[playerIndex]
  if (!player) return false

  // Check if player is connected to any merchant that provides market access
  const merchantsWithMarketAccess = ['warrington', 'shrewsbury', 'nottingham', 'gloucester', 'oxford']
  
  return merchantsWithMarketAccess.some(merchantLocation => 
    isLocationInPlayerNetwork(context, merchantLocation, playerIndex)
  )
}

// Card utilities
export function findCardInHand(player: Player, cardId: string): Card | null {
  return player.hand.find((card) => card.id === cardId) ?? null
}

export function removeCardFromHand(
  player: Player,
  cardId: string | undefined,
): Card[] {
  if (!cardId) return player.hand
  return player.hand.filter((card) => card.id !== cardId)
}

// Player utilities
export function updatePlayerInList(
  players: Player[],
  currentPlayerIndex: number,
  updatedPlayer: Partial<Player>,
): Player[] {
  return players.map((player, index) =>
    index === currentPlayerIndex ? { ...player, ...updatedPlayer } : player,
  )
}
