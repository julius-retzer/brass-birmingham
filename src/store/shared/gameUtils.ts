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
  // RULE: Find closest (fewest Link tiles distant) connected unflipped Coal Mines
  const allCoalMines = context.players
    .flatMap((player) => player.industries)
    .filter(
      (industry) =>
        industry.type === 'coal' &&
        !industry.flipped &&
        industry.coalCubesOnTile > 0,
    )

  // TODO: Implement proper distance calculation through network connectivity
  // For now, prioritize coal mines at the same location, then any available coal mine
  // This is a simplified implementation that needs proper network path finding

  // First priority: coal mines at the same location (distance 0)
  const sameLocationMines = allCoalMines.filter(
    (mine) => mine.location === location,
  )
  if (sameLocationMines.length > 0) {
    return sameLocationMines
  }

  // Second priority: any available coal mine (simplified - needs proper distance calculation)
  // In a proper implementation, this would calculate network distance through link tiles
  return allCoalMines
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

// Network validation functions
export function getPlayerNetworkLocations(
  context: GameState,
  player: Player,
): Set<CityId> {
  const networkLocations = new Set<CityId>()

  // Add locations where player has industry tiles
  player.industries.forEach((industry) => {
    networkLocations.add(industry.location)
  })

  // Add locations adjacent to player's links
  player.links.forEach((link) => {
    networkLocations.add(link.from)
    networkLocations.add(link.to)
  })

  return networkLocations
}

export function isLocationInPlayerNetwork(
  context: GameState,
  player: Player,
  location: CityId,
): boolean {
  // Exception: If player has no tiles on board, can build anywhere
  if (player.industries.length === 0 && player.links.length === 0) {
    return true
  }

  const networkLocations = getPlayerNetworkLocations(context, player)
  return networkLocations.has(location)
}

export function validateIndustryBuildLocation(
  context: GameState,
  player: Player,
  card: Card,
  location: CityId,
): boolean {
  // Location cards can build anywhere
  if (card.type === 'location' || card.type === 'wild_location') {
    return true
  }

  // Industry cards must build in network (rules 161-162)
  if (card.type === 'industry' || card.type === 'wild_industry') {
    return isLocationInPlayerNetwork(context, player, location)
  }

  return false
}
