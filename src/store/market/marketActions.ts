import type { CityId } from '../../data/board'
import { GAME_CONSTANTS } from '../constants'
import type { GameState, Player } from '../gameStore'
import {
  findAvailableBreweries,
  findAvailableIronWorks,
  findConnectedCoalMines,
  getCurrentPlayer,
} from '../shared/gameUtils'

export function consumeCoalFromSources(
  context: GameState,
  location: CityId,
  coalRequired: number,
): {
  updatedPlayers: Player[]
  updatedCoalMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  coalCost: number
  logDetails: string[]
} {
  let coalConsumed = 0
  let coalCost = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  const updatedCoalMarket = context.coalMarket.map((level) => ({ ...level }))

  const currentPlayer = getCurrentPlayer(context)

  // First, try to consume from connected coal mines (free)
  const connectedCoalMines = findConnectedCoalMines(
    context,
    location,
    currentPlayer,
  )

  for (const coalMine of connectedCoalMines) {
    if (coalConsumed >= coalRequired) break

    if (coalMine.coalCubesOnTile > 0) {
      // Find the player who owns this coal mine and update it
      updatedPlayers = updatedPlayers.map((player) => ({
        ...player,
        industries: player.industries.map((industry) =>
          industry === coalMine
            ? { ...industry, coalCubesOnTile: industry.coalCubesOnTile - 1 }
            : industry,
        ),
      }))

      coalConsumed++
      logDetails.push(`1 coal from connected coal mine (free)`)

      // TODO: Check if coal mine should flip when empty
    }
  }

  // If still need coal, consume from coal market (cheapest first)
  while (coalConsumed < coalRequired) {
    let foundCoal = false

    // Find cheapest available coal (price levels in order)
    for (const level of updatedCoalMarket) {
      if (level.cubes > 0) {
        level.cubes--
        coalCost += level.price
        coalConsumed++
        logDetails.push(`consumed 1 coal from market for £${level.price}`)
        foundCoal = true
        break
      }
    }

    // If market is empty, still buy at fallback price (infinite capacity fallback)
    if (!foundCoal) {
      const fallbackLevel = updatedCoalMarket.find(
        (l) => l.price === GAME_CONSTANTS.COAL_FALLBACK_PRICE,
      )
      if (fallbackLevel) {
        // Don't decrement cubes for infinite capacity level
        coalCost += GAME_CONSTANTS.COAL_FALLBACK_PRICE
        coalConsumed++
        logDetails.push(
          `consumed 1 coal from general supply for £${GAME_CONSTANTS.COAL_FALLBACK_PRICE}`,
        )
      }
    }
  }

  return { updatedPlayers, updatedCoalMarket, coalCost, logDetails }
}

export function consumeIronFromSources(
  context: GameState,
  ironRequired: number,
): {
  updatedPlayers: Player[]
  updatedIronMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  ironCost: number
  logDetails: string[]
} {
  let ironConsumed = 0
  let ironCost = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  const updatedIronMarket = context.ironMarket.map((level) => ({ ...level }))

  // First, try to consume from any available iron works (free)
  const availableIronWorks = findAvailableIronWorks(context)

  // TODO: For iron and coal you can consume multiple cubes from single tile.
  for (const ironWorks of availableIronWorks) {
    if (ironConsumed >= ironRequired) break

    if (ironWorks.ironCubesOnTile > 0) {
      // Find the player who owns this iron works and update it
      updatedPlayers = updatedPlayers.map((player) => ({
        ...player,
        industries: player.industries.map((industry) =>
          industry === ironWorks
            ? { ...industry, ironCubesOnTile: industry.ironCubesOnTile - 1 }
            : industry,
        ),
      }))

      ironConsumed++
      logDetails.push(`1 iron from iron works (free)`)

      // TODO: Check if iron works should flip when empty
    }
  }

  // If still need iron, consume from iron market (cheapest first)
  while (ironConsumed < ironRequired) {
    let foundIron = false

    // Find cheapest available iron (price levels in order)
    for (const level of updatedIronMarket) {
      if (level.cubes > 0) {
        level.cubes--
        ironCost += level.price
        ironConsumed++
        logDetails.push(`consumed 1 iron from market for £${level.price}`)
        foundIron = true
        break
      }
    }

    // If market is empty, still buy at fallback price (infinite capacity fallback)
    if (!foundIron) {
      const fallbackLevel = updatedIronMarket.find(
        (l) => l.price === GAME_CONSTANTS.IRON_FALLBACK_PRICE,
      )
      if (fallbackLevel) {
        // Don't decrement cubes for infinite capacity level
        ironCost += GAME_CONSTANTS.IRON_FALLBACK_PRICE
        ironConsumed++
        logDetails.push(
          `consumed 1 iron from general supply for £${GAME_CONSTANTS.IRON_FALLBACK_PRICE}`,
        )
      }
    }
  }

  return { updatedPlayers, updatedIronMarket, ironCost, logDetails }
}

// Helper function to check if a location is connected to a merchant
export function isLocationConnectedToMerchant(location: CityId): boolean {
  // Based on the board data, these connections exist:
  // Stoke -> Warrington, Coalbrookdale -> Shrewsbury
  // TODO: This should use proper network connectivity check, but for now hardcode known connections
  const merchantConnections = new Set<CityId>(['stoke', 'coalbrookdale'])

  return merchantConnections.has(location)
}

// Helper function to sell coal to market (most expensive spaces first)
export function sellCoalToMarket(
  coalMarket: Array<{ price: number; cubes: number; maxCubes: number }>,
  cubesAvailable: number,
): {
  updatedMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  cubesSold: number
  income: number
  logDetails: string[]
} {
  const updatedMarket = coalMarket.map((level) => ({ ...level }))
  const logDetails: string[] = []
  let cubesSold = 0
  let income = 0

  // Sell to most expensive available spaces first (£7 down to £1)
  // If market is full, remaining cubes stay on the industry tile
  for (
    let i = updatedMarket.length - 2;
    i >= 0 && cubesSold < cubesAvailable;
    i--
  ) {
    const level = updatedMarket[i]
    if (level && level.cubes < level.maxCubes) {
      // Space available at this price level
      const spacesAvailable = level.maxCubes - level.cubes
      const cubesToSell = Math.min(spacesAvailable, cubesAvailable - cubesSold)

      level.cubes += cubesToSell
      income += level.price * cubesToSell
      cubesSold += cubesToSell

      for (let j = 0; j < cubesToSell; j++) {
        logDetails.push(`sold 1 coal to market for £${level.price}`)
      }
    }
  }

  // Note: £8 infinite capacity is only for PURCHASING when market is empty,
  // NOT for selling when market is full. Unsold cubes remain on the tile.

  return {
    updatedMarket,
    cubesSold,
    income,
    logDetails,
  }
}

// Helper function to sell iron to market (most expensive spaces first)
export function sellIronToMarket(
  ironMarket: Array<{ price: number; cubes: number; maxCubes: number }>,
  cubesAvailable: number,
): {
  updatedMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  cubesSold: number
  income: number
  logDetails: string[]
} {
  const updatedMarket = ironMarket.map((level) => ({ ...level }))
  const logDetails: string[] = []
  let cubesSold = 0
  let income = 0

  // Sell to most expensive available spaces first (£5 down to £1)
  // If market is full, remaining cubes stay on the industry tile
  for (
    let i = updatedMarket.length - 2;
    i >= 0 && cubesSold < cubesAvailable;
    i--
  ) {
    const level = updatedMarket[i]
    if (level && level.cubes < level.maxCubes) {
      // Space available at this price level
      const spacesAvailable = level.maxCubes - level.cubes
      const cubesToSell = Math.min(spacesAvailable, cubesAvailable - cubesSold)

      level.cubes += cubesToSell
      income += level.price * cubesToSell
      cubesSold += cubesToSell

      if (cubesToSell > 0) {
        logDetails.push(
          `sold ${cubesToSell} iron to market for £${level.price * cubesToSell}`,
        )
      }
    }
  }

  // Note: £6 infinite capacity is only for PURCHASING when market is empty,
  // NOT for selling when market is full. Unsold cubes remain on the tile.

  return {
    updatedMarket,
    cubesSold,
    income,
    logDetails,
  }
}

export function consumeBeerFromSources(
  context: GameState,
  location: CityId,
  beerRequired: number,
  includeMerchantBeer = false,
): {
  success: boolean
  updatedPlayers: Player[]
  updatedResources: GameState['resources']
  updatedMerchants?: Array<{
    location: CityId
    industryIcons: string[]
    bonusType: 'develop' | 'income' | 'victoryPoints' | 'money'
    bonusValue: number
    hasBeer: boolean
  }>
  merchantBonusesCollected: Array<{
    type: 'develop' | 'income' | 'victoryPoints' | 'money'
    value: number
  }>
  logDetails: string[]
  errorMessage?: string
} {
  let beerConsumed = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  const updatedResources = { ...context.resources }
  const updatedMerchants = context.merchants
    ? [...context.merchants]
    : undefined
  const merchantBonusesCollected: Array<{
    type: 'develop' | 'income' | 'victoryPoints' | 'money'
    value: number
  }> = []

  const currentPlayer = getCurrentPlayer(context)
  const { ownBreweries, connectedBreweries } = findAvailableBreweries(
    context,
    location,
    currentPlayer,
  )

  // First, consume from own breweries (free, no connection required)
  for (const brewery of ownBreweries) {
    if (beerConsumed >= beerRequired) break

    if (brewery.beerBarrelsOnTile > 0) {
      // Find the player who owns this brewery and update it
      updatedPlayers = updatedPlayers.map((player) => 
        player.id === currentPlayer.id 
          ? {
              ...player,
              industries: player.industries.map((industry) =>
                industry === brewery
                  ? { ...industry, beerBarrelsOnTile: industry.beerBarrelsOnTile - 1 }
                  : industry,
              ),
            }
          : player,
      )

      beerConsumed++
      logDetails.push(`1 beer from own brewery at ${brewery.location} (free)`)

      // TODO: Check if brewery should flip when empty
      break // Only consume from one brewery at a time
    }
  }

  // If still need beer, consume from connected opponent breweries
  for (const brewery of connectedBreweries) {
    if (beerConsumed >= beerRequired) break

    if (brewery.beerBarrelsOnTile > 0) {
      // Find the owner of this brewery and update it
      updatedPlayers = updatedPlayers.map((player) => ({
        ...player,
        industries: player.industries.map((industry) =>
          industry === brewery
            ? { ...industry, beerBarrelsOnTile: industry.beerBarrelsOnTile - 1 }
            : industry,
        ),
      }))

      beerConsumed++
      logDetails.push(`1 beer from connected opponent brewery at ${brewery.location} (free)`)

      // TODO: Check if brewery should flip when empty
      break // Only consume from one connected brewery at a time
    }
  }

  // If still need beer and merchant beer is allowed, consume from merchants
  if (includeMerchantBeer && updatedMerchants && beerConsumed < beerRequired) {
    // Find merchant connected to this location with beer
    // NOTE: This is simplified - in full game would check proper network connectivity
    // Stoke connects to Warrington, Coalbrookdale connects to Shrewsbury
    let connectedMerchant = null
    
    if (location === 'stoke') {
      connectedMerchant = updatedMerchants.find(m => m.location === 'warrington' && m.hasBeer)
    } else if (location === 'coalbrookdale') {
      connectedMerchant = updatedMerchants.find(m => m.location === 'shrewsbury' && m.hasBeer)
    }
    
    // Also check if there's a merchant directly at this location (for edge cities)
    if (!connectedMerchant) {
      connectedMerchant = updatedMerchants.find(m => m.location === location && m.hasBeer)
    }

    if (connectedMerchant) {
      // Consume merchant beer and collect bonus
      connectedMerchant.hasBeer = false
      beerConsumed++
      merchantBonusesCollected.push({
        type: connectedMerchant.bonusType,
        value: connectedMerchant.bonusValue,
      })
      logDetails.push(
        `1 beer from merchant at ${connectedMerchant.location} (${connectedMerchant.bonusType} +${connectedMerchant.bonusValue})`,
      )
    }
  }

  // If still need beer, action fails - cannot consume beer from general supply
  if (beerConsumed < beerRequired) {
    return {
      success: false,
      updatedPlayers: context.players, // Return original state
      updatedResources: context.resources,
      updatedMerchants: context.merchants,
      merchantBonusesCollected: [],
      logDetails,
      errorMessage: `Insufficient beer available. Required: ${beerRequired}, available: ${beerConsumed}`,
    }
  }

  return {
    success: true,
    updatedPlayers,
    updatedResources,
    updatedMerchants,
    merchantBonusesCollected,
    logDetails,
  }
}
