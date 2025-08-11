import type { GameState, Player } from '../gameStore'
import type { Card, IndustryCard, LocationCard } from '../../data/cards'
import type { IndustryTile } from '../../data/industryTiles'
import type { CityId } from '../../data/board'
import { 
  consumeCoalFromSources, 
  consumeIronFromSources, 
  sellCoalToMarket, 
  sellIronToMarket, 
  isLocationConnectedToMerchant
} from '../market/marketActions'
import { 
  canOverbuildIndustry,
  getCardDescription,
  performOverbuild,
} from '../shared/gameUtils'

// Build validation functions
export function validateBuildActionSelections(context: GameState): void {
  if (!context.selectedCard) {
    throw new Error('No card selected for build action')
  }
  if (!context.selectedLocation) {
    throw new Error('No location selected for build action')
  }
}

export function validateCardType(card: Card): void {
  const validCardTypes = ['location', 'industry', 'wild_location', 'wild_industry']
  if (!validCardTypes.includes(card.type)) {
    throw new Error(
      `Invalid card type for build action: ${card.type}. Only Location, Industry, or Wild cards can be used.`,
    )
  }
}

export function validateCardLocationMatching(card: Card, selectedLocation: CityId): void {
  if (card.type === 'location') {
    const locationCard = card as LocationCard
    if (locationCard.location !== selectedLocation) {
      throw new Error(
        `Location card mismatch: card specifies ${locationCard.location}, but selected location is ${selectedLocation}`,
      )
    }
  }
}

export function validateCardIndustryMatching(card: Card, selectedIndustryTile: IndustryTile | null): void {
  if (card.type === 'industry' && selectedIndustryTile) {
    const industryCard = card as IndustryCard
    const tile = selectedIndustryTile
    if (!industryCard.industries.includes(tile.type)) {
      throw new Error(
        `Industry card mismatch: card allows ${industryCard.industries.join(', ')}, but selected tile type is ${tile.type}`,
      )
    }
  }

  if (card.type === 'industry' && !selectedIndustryTile) {
    throw new Error('Industry card requires industry tile selection')
  }
}

export function validateTileEraCompatibility(context: GameState, tile: IndustryTile): void {
  if (context.era === 'canal' && !tile.canBuildInCanalEra) {
    throw new Error(`Cannot build ${tile.type} Level ${tile.level} in Canal Era`)
  }
  if (context.era === 'rail' && !tile.canBuildInRailEra) {
    throw new Error(`Cannot build ${tile.type} Level ${tile.level} in Rail Era`)
  }
}

// Industry building helper function
export interface IndustryBuildResult {
  updatedPlayer: Player
  updatedPlayers: Player[]
  updatedCoalMarket: GameState['coalMarket']
  updatedIronMarket: GameState['ironMarket']
  logMessage: string
  totalCost: number
}

export function buildIndustryTile(
  context: GameState,
  currentPlayer: Player,
  tile: IndustryTile,
  updatedHand: Card[],
): IndustryBuildResult {
  let updatedPlayersFromResources = context.players
  let updatedCoalMarket = [...context.coalMarket]
  let updatedIronMarket = [...context.ironMarket]
  
  const cost = tile.cost
  let coalCost = 0
  let ironCost = 0
  const resourceLogDetails: string[] = []

  // Check for overbuilding
  const overbuildCheck = canOverbuildIndustry(
    context,
    context.currentPlayerIndex,
    context.selectedLocation!,
    tile.type,
    tile.level
  )

  if (!overbuildCheck.canOverbuild && overbuildCheck.reason) {
    throw new Error(overbuildCheck.reason)
  }

  // Consume coal if required
  if (tile.coalRequired > 0) {
    const coalResult = consumeCoalFromSources(
      { ...context, players: updatedPlayersFromResources },
      context.selectedLocation!,
      tile.coalRequired,
    )
    coalCost = coalResult.coalCost
    updatedPlayersFromResources = coalResult.updatedPlayers
    updatedCoalMarket = coalResult.updatedCoalMarket
    resourceLogDetails.push(...coalResult.logDetails)
  }

  // Consume iron if required
  if (tile.ironRequired > 0) {
    const ironResult = consumeIronFromSources(
      { ...context, players: updatedPlayersFromResources },
      tile.ironRequired,
    )
    ironCost = ironResult.ironCost
    updatedPlayersFromResources = ironResult.updatedPlayers
    updatedIronMarket = ironResult.updatedIronMarket
    resourceLogDetails.push(...ironResult.logDetails)
  }

  const totalCost = cost + coalCost + ironCost

  // Validate player can afford the total cost
  if (currentPlayer.money < totalCost) {
    throw new Error(
      `Insufficient funds. Cost: £${totalCost} (tile: £${cost}, coal: £${coalCost}, iron: £${ironCost}), Available: £${currentPlayer.money}`,
    )
  }

  // Add industry to player's board
  const newIndustry = {
    location: context.selectedLocation!,
    type: tile.type,
    level: tile.level,
    flipped: false,
    tile: tile,
    coalCubesOnTile: tile.coalProduced,
    ironCubesOnTile: tile.ironProduced,
    beerBarrelsOnTile:
      tile.type === 'brewery'
        ? context.era === 'canal'
          ? tile.beerProduced
          : tile.beerProduced * 2
        : 0,
  }

  // Handle automatic market selling
  let marketIncome = 0
  const marketLogDetails: string[] = []

  if (tile.type === 'coal') {
    // RULE: Coal mines only sell automatically if connected to merchant spaces with [left-right arrows] icon
    const { connected: isConnectedToMerchant } = isLocationConnectedToMerchant(context, context.selectedLocation!)
    if (isConnectedToMerchant && newIndustry.coalCubesOnTile > 0) {
      const sellResult = sellCoalToMarket(updatedCoalMarket, newIndustry.coalCubesOnTile)
      updatedCoalMarket = sellResult.updatedMarket
      marketIncome += sellResult.income
      marketLogDetails.push(...sellResult.logDetails)
      newIndustry.coalCubesOnTile -= sellResult.cubesSold

      // RULE: Flip when last resource is removed
      if (newIndustry.coalCubesOnTile === 0) {
        newIndustry.flipped = true
      }
    }
  } else if (tile.type === 'iron') {
    // RULE: Iron works ALWAYS sell automatically regardless of merchant connection
    if (newIndustry.ironCubesOnTile > 0) {
      const sellResult = sellIronToMarket(updatedIronMarket, newIndustry.ironCubesOnTile)
      updatedIronMarket = sellResult.updatedMarket
      marketIncome += sellResult.income
      marketLogDetails.push(...sellResult.logDetails)
      newIndustry.ironCubesOnTile -= sellResult.cubesSold

      // RULE: Flip when last resource is removed
      if (newIndustry.ironCubesOnTile === 0) {
        newIndustry.flipped = true
      }
    }
  }

  // Remove tile from player's mat
  const updatedTilesOnMat = { ...currentPlayer.industryTilesOnMat }
  const tileType = tile.type
  if (updatedTilesOnMat[tileType]) {
    updatedTilesOnMat[tileType] = updatedTilesOnMat[tileType].filter((t) => t.id !== tile.id)
  }

  // Handle overbuilding if necessary
  if (overbuildCheck.existingIndustry) {
    updatedPlayersFromResources = performOverbuild(
      context,
      overbuildCheck.existingIndustry,
      newIndustry
    )
  }

  // Get updated player state from resource consumption
  const currentPlayerFromResources = updatedPlayersFromResources[context.currentPlayerIndex]!
  const finalMoney = currentPlayerFromResources.money - totalCost + marketIncome
  let finalIncome = currentPlayerFromResources.income

  if (newIndustry.flipped) {
    finalIncome += newIndustry.tile.incomeSpaces
  }

  const updatedPlayer = {
    ...currentPlayerFromResources,
    hand: updatedHand,
    money: finalMoney,
    income: finalIncome,
    industries: [...currentPlayerFromResources.industries, newIndustry],
    industryTilesOnMat: updatedTilesOnMat,
  }

  // Build log message
  const resourceString = resourceLogDetails.length > 0 ? ` (consumed ${resourceLogDetails.join(', ')})` : ''
  const marketString = marketLogDetails.length > 0 ? ` (${marketLogDetails.join(', ')})` : ''
  const incomeString = newIndustry.flipped ? ` (tile flipped, +${newIndustry.tile.incomeSpaces} income)` : ''
  const overbuildString = overbuildCheck.existingIndustry 
    ? ` (overbuilt ${overbuildCheck.existingIndustry.playerIndex === context.currentPlayerIndex ? 'own' : 'opponent\'s'} level ${overbuildCheck.existingIndustry.industry.level})`
    : ''
  const logMessage = `${currentPlayer.name} built ${tile.type} Level ${tile.level} at ${context.selectedLocation} for £${totalCost}${resourceString}${marketString}${incomeString}${overbuildString} using ${getCardDescription(context.selectedCard!)}`

  return {
    updatedPlayer,
    updatedPlayers: updatedPlayersFromResources,
    updatedCoalMarket,
    updatedIronMarket,
    logMessage,
    totalCost,
  }
}