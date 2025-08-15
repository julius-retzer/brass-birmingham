import type { CityId, ConnectionType } from '../../data/board'
import { connections, cityIndustrySlots } from '../../data/board'
import type { Card, IndustryType } from '../../data/cards'
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

// Network connectivity utilities - graph-based using built links (era-aware)
export function calculateNetworkDistance(
  context: GameState,
  from: CityId,
  to: CityId,
  era: ConnectionType = context.era,
): number {
  if (from === to) return 0

  // Build adjacency from built links of any player that match current era
  const adjacency = new Map<CityId, Set<CityId>>()

  function addEdge(a: CityId, b: CityId) {
    if (!adjacency.has(a)) adjacency.set(a, new Set<CityId>())
    if (!adjacency.has(b)) adjacency.set(b, new Set<CityId>())
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }

  for (const player of context.players) {
    for (const link of player.links) {
      if (link.type !== era) continue
      addEdge(link.from, link.to)
    }
  }

  // BFS
  const visited = new Set<CityId>()
  const queue: Array<{ node: CityId; dist: number }> = [{ node: from, dist: 0 }]
  visited.add(from)

  while (queue.length > 0) {
    const { node, dist } = queue.shift()!
    const neighbors = adjacency.get(node)
    if (!neighbors) continue
    for (const nbr of neighbors) {
      if (visited.has(nbr)) continue
      if (nbr === to) return dist + 1
      visited.add(nbr)
      queue.push({ node: nbr as CityId, dist: dist + 1 })
    }
  }

  return Infinity
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

  // Calculate distance to each coal mine and group by distance
  const minesByDistance = new Map<number, Player['industries']>()

  for (const mine of allCoalMines) {
    const distance = calculateNetworkDistance(context, location, mine.location)
    if (distance !== Infinity) {
      // Only include connected mines
      if (!minesByDistance.has(distance)) {
        minesByDistance.set(distance, [])
      }
      minesByDistance.get(distance)!.push(mine)
    }
  }

  // Return mines at the closest distance (0 = same location, 1 = one link away, etc.)
  const distances = Array.from(minesByDistance.keys()).sort((a, b) => a - b)
  if (distances.length > 0) {
    const closestDistance = distances[0]
    if (closestDistance !== undefined) {
      return minesByDistance.get(closestDistance) || []
    }
  }

  return [] // No connected mines
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
  // Own breweries don't need to be connected to the location (rule)
  const ownBreweries = currentPlayer.industries.filter(
    (industry) =>
      industry.type === 'brewery' &&
      !industry.flipped &&
      industry.beerBarrelsOnTile > 0,
  )

  // Opponent breweries must be connected to the location where beer is required
  const connectedBreweries: Player['industries'] = []

  for (const player of context.players) {
    if (player.id === currentPlayer.id) continue

    for (const industry of player.industries) {
      if (
        industry.type === 'brewery' &&
        !industry.flipped &&
        industry.beerBarrelsOnTile > 0
      ) {
        const distance = calculateNetworkDistance(
          context,
          location,
          industry.location,
        )
        if (distance !== Infinity) {
          // Must be connected
          connectedBreweries.push(industry)
        }
      }
    }
  }

  return { ownBreweries, connectedBreweries }
}

// Auto-flip industry helper
export function checkAndFlipIndustryTilesLogic(context: GameState): {
  players?: Player[]
  logs?: LogEntry[]
} {
  const updatedPlayers = [...context.players]
  const logMessages: string[] = []
  const GAME_CONSTANTS = { MAX_INCOME: 30 } // Import this properly

  // Check all players' industries for auto-flipping
  for (
    let playerIndex = 0;
    playerIndex < updatedPlayers.length;
    playerIndex++
  ) {
    const player = updatedPlayers[playerIndex]!

    for (
      let industryIndex = 0;
      industryIndex < player.industries.length;
      industryIndex++
    ) {
      const industry = player.industries[industryIndex]!

      // Skip already flipped tiles
      if (industry.flipped) continue

      let shouldFlip = false

      // Check flipping conditions for different industry types
      if (industry.type === 'coal' && industry.coalCubesOnTile === 0) {
        shouldFlip = true
      } else if (industry.type === 'iron' && industry.ironCubesOnTile === 0) {
        shouldFlip = true
      } else if (
        industry.type === 'brewery' &&
        industry.beerBarrelsOnTile === 0
      ) {
        shouldFlip = true
      }

      if (shouldFlip) {
        // Flip the industry tile
        const updatedIndustry = { ...industry, flipped: true }
        const newIndustries = [...player.industries]
        newIndustries[industryIndex] = updatedIndustry

        // Advance player income (capped at level 30)
        const incomeAdvancement = industry.tile.incomeAdvancement || 0
        const newIncome = Math.min(
          player.income + incomeAdvancement,
          GAME_CONSTANTS.MAX_INCOME,
        )

        // Update player with flipped industry and new income
        updatedPlayers[playerIndex] = {
          ...player,
          industries: newIndustries,
          income: newIncome,
        }

        logMessages.push(
          `${player.name}'s ${industry.type} at ${industry.location} flipped (income +${incomeAdvancement}, now ${newIncome})`,
        )
      }
    }
  }

  if (logMessages.length > 0) {
    return {
      players: updatedPlayers,
      logs: logMessages.map((msg) => createLogEntry(msg, 'info')),
    }
  }

  return {}
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
  // Completely disabled to prevent memory issues
  return
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

// Overbuilding helper functions
export function findExistingIndustryAtLocation(
  context: GameState,
  location: CityId,
  industryType: IndustryType,
): { industry: Player['industries'][0]; playerIndex: number } | null {
  for (
    let playerIndex = 0;
    playerIndex < context.players.length;
    playerIndex++
  ) {
    const player = context.players[playerIndex]!
    const existingIndustry = player.industries.find(
      (industry) =>
        industry.location === location && industry.type === industryType,
    )

    if (existingIndustry) {
      return { industry: existingIndustry, playerIndex }
    }
  }

  return null
}

export function canOverbuildIndustry(
  context: GameState,
  currentPlayerIndex: number,
  location: CityId,
  industryType: IndustryType,
  newTileLevel: number,
): {
  canOverbuild: boolean
  reason?: string
  existingIndustry?: { industry: Player['industries'][0]; playerIndex: number }
} {
  const existingIndustry = findExistingIndustryAtLocation(
    context,
    location,
    industryType,
  )

  if (!existingIndustry) {
    return { canOverbuild: true } // No existing industry to overbuild
  }

  // Can't overbuild with same or lower level
  if (newTileLevel <= existingIndustry.industry.level) {
    return {
      canOverbuild: false,
      reason: `Cannot overbuild level ${existingIndustry.industry.level} with level ${newTileLevel}`,
      existingIndustry,
    }
  }

  // Overbuilding own tile - always allowed (rule: "You may Overbuild any Industry tile.")
  if (existingIndustry.playerIndex === currentPlayerIndex) {
    return { canOverbuild: true, existingIndustry }
  }

  // Overbuilding opponent's tile
  // Rule: "You may Overbuild only a Coal Mine or an Iron Works."
  if (industryType !== 'coal' && industryType !== 'iron') {
    return {
      canOverbuild: false,
      reason: `Cannot overbuild opponent's ${industryType} (only coal mines and iron works allowed)`,
      existingIndustry,
    }
  }

  // Rule: "There must be no resource cubes on the entire board, including in its Market"
  if (industryType === 'coal') {
    // Check if any coal cubes exist on board or in market
    const hasCoalOnBoard = context.players.some((player) =>
      player.industries.some((industry) => industry.coalCubesOnTile > 0),
    )
    const hasCoalInMarket = context.coalMarket.some((slot) => slot.cubes > 0)

    if (hasCoalOnBoard || hasCoalInMarket) {
      return {
        canOverbuild: false,
        reason:
          "Cannot overbuild opponent's coal mine while coal cubes exist on board or in market",
        existingIndustry,
      }
    }
  } else if (industryType === 'iron') {
    // Check if any iron cubes exist on board or in market
    const hasIronOnBoard = context.players.some((player) =>
      player.industries.some((industry) => industry.ironCubesOnTile > 0),
    )
    const hasIronInMarket = context.ironMarket.some((slot) => slot.cubes > 0)

    if (hasIronOnBoard || hasIronInMarket) {
      return {
        canOverbuild: false,
        reason:
          "Cannot overbuild opponent's iron works while iron cubes exist on board or in market",
        existingIndustry,
      }
    }
  }

  return { canOverbuild: true, existingIndustry }
}

export function performOverbuild(
  context: GameState,
  existingIndustry: { industry: Player['industries'][0]; playerIndex: number },
  newIndustry: Player['industries'][0],
): GameState['players'] {
  const players = [...context.players]
  const targetPlayer = { ...players[existingIndustry.playerIndex]! }

  // Remove the existing industry
  targetPlayer.industries = targetPlayer.industries.filter(
    (industry) => industry !== existingIndustry.industry,
  )

  // Add resources back to general supply (they are just removed)
  // Rule: "If there are any iron/coal/beer on the tile being replaced, place them back into the General Supply."

  players[existingIndustry.playerIndex] = targetPlayer
  return players
}

// Industry slot validation function
export function canCityAccommodateIndustryType(
  context: GameState,
  location: CityId,
  industryType: IndustryType,
): boolean {
  const availableSlots = cityIndustrySlots[location] || []
  
  // No slots defined for this city
  if (availableSlots.length === 0) {
    return false
  }
  
  // Find industries built in this city by all players
  const industriesInCity = context.players.flatMap((player) =>
    player.industries.filter((industry) => industry.location === location)
  )
  
  // Create a mapping of which slot each industry occupies
  // We assign industries to slots in the order they were built, 
  // choosing the first compatible available slot
  const occupiedSlots = new Set<number>()
  
  for (const industry of industriesInCity) {
    // Find the first available slot that can accommodate this industry
    for (let slotIndex = 0; slotIndex < availableSlots.length; slotIndex++) {
      if (occupiedSlots.has(slotIndex)) {
        continue // This slot is already occupied
      }
      
      const slotOptions = availableSlots[slotIndex]
      if (slotOptions?.includes(industry.type)) {
        occupiedSlots.add(slotIndex)
        break
      }
    }
  }
  
  // Now check if the requested industry type can find an available slot
  for (let slotIndex = 0; slotIndex < availableSlots.length; slotIndex++) {
    if (occupiedSlots.has(slotIndex)) {
      continue // This slot is already occupied
    }
    
    const slotOptions = availableSlots[slotIndex]
    if (slotOptions?.includes(industryType)) {
      return true // Found an available compatible slot
    }
  }
  
  return false // No available slots can accommodate this industry type
}
