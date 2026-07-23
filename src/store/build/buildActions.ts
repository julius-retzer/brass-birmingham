import type { GameState, Player } from '../gameStore'
import type { Card, IndustryCard, LocationCard } from '../../data/cards'
import type { IndustryTile } from '../../data/industryTiles'
import {
  canBuildTileInEra,
  decrementTileQuantity,
} from '../../data/industryTiles'
import { type CityId, FARM_BREWERIES, cities } from '../../data/board'
import {
  advanceIncomeSpaces,
  incomeLevelForSpace,
} from '../../data/incomeTrack'
import { 
  consumeCoalFromSources, 
  consumeIronFromSources, 
  sellCoalToMarket, 
  sellIronToMarket, 
  isLocationConnectedToMerchant
} from '../market/marketActions'
import type { CoalSource, IronSource } from '../shared/resourceSources'
import {
  canCityAccommodateIndustryType,
  canOverbuildIndustry,
  canPlaceOrOverbuildIndustry,
  getCardDescription,
  getCurrentPlayer,
  isLocationInPlayerNetwork,
  performOverbuild,
  validateIndustryBuildLocation,
} from '../shared/gameUtils'

// Validation result types for recoverable error handling
export interface ValidationResult {
  isValid: boolean
  errorMessage?: string
  errorContext?: 'build' | 'network' | 'develop' | 'sell' | 'scout'
}

// Build validation functions
export function validateBuildActionSelections(context: GameState): void {
  if (!context.selectedCard) {
    throw new Error('No card selected for build action')
  }
  if (!context.selectedLocation) {
    throw new Error('No location selected for build action')
  }
}

export function validateNetworkRequirement(context: GameState): void {
  const currentPlayer = getCurrentPlayer(context)
  const card = context.selectedCard!
  const location = context.selectedLocation!

  // Location cards and wild location cards can build anywhere (game rules)
  if (card.type === 'location' || card.type === 'wild_location') {
    return
  }

  // Industry cards and wild industry cards must build in player's network
  if (card.type === 'industry' || card.type === 'wild_industry') {
    const isInNetwork = isLocationInPlayerNetwork(context, currentPlayer, location)
    if (!isInNetwork) {
      throw new Error(
        `Industry cards must be built in your network. ${location} is not connected to your industries or links.`
      )
    }
  }
}

export function validateIndustrySlotAvailability(context: GameState): void {
  const location = context.selectedLocation!
  const industryTile = context.selectedIndustryTile

  if (!industryTile) {
    throw new Error('No industry tile selected')
  }

  // A build is legal with a free compatible slot OR as a legal overbuild —
  // keep this aligned with validateIndustrySlotAvailabilityResult below.
  const canAccommodate = canPlaceOrOverbuildIndustry(
    context,
    location,
    industryTile.type,
    industryTile.level,
  )

  if (!canAccommodate) {
    throw new Error(
      `Cannot build ${industryTile.type} at ${location}. No available slots or slots are occupied.`
    )
  }
}

// Non-throwing validation functions for recoverable error handling
export function validateIndustrySlotAvailabilityResult(context: GameState): ValidationResult {
  const location = context.selectedLocation!
  const industryTile = context.selectedIndustryTile

  if (!industryTile) {
    return {
      isValid: false,
      errorMessage: 'No industry tile selected',
      errorContext: 'build'
    }
  }

  const canAccommodate = canPlaceOrOverbuildIndustry(
    context,
    location,
    industryTile.type,
    industryTile.level,
  )

  if (!canAccommodate) {
    return {
      isValid: false,
      errorMessage: `Cannot build ${industryTile.type} at ${location}. No available slots or slots are occupied.`,
      errorContext: 'build'
    }
  }

  return { isValid: true }
}

export function validateNetworkRequirementResult(context: GameState): ValidationResult {
  const currentPlayer = getCurrentPlayer(context)
  const card = context.selectedCard!
  const location = context.selectedLocation!

  // Location cards and wild location cards can build anywhere (game rules)
  if (card.type === 'location' || card.type === 'wild_location') {
    return { isValid: true }
  }

  // Industry cards and wild industry cards must build in player's network
  if (card.type === 'industry' || card.type === 'wild_industry') {
    const isInNetwork = isLocationInPlayerNetwork(context, currentPlayer, location)
    if (!isInNetwork) {
      return {
        isValid: false,
        errorMessage: `Industry cards must be built in your network. ${location} is not connected to your industries or links.`,
        errorContext: 'build'
      }
    }
  }

  return { isValid: true }
}

export function validateBuildActionSelectionsResult(context: GameState): ValidationResult {
  if (!context.selectedCard) {
    return {
      isValid: false,
      errorMessage: 'No card selected for build action',
      errorContext: 'build'
    }
  }
  if (!context.selectedLocation) {
    return {
      isValid: false,
      errorMessage: 'No location selected for build action',
      errorContext: 'build'
    }
  }
  return { isValid: true }
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

/**
 * Why a tile's slot is barred this era, phrased so the player knows the way
 * out: a canal-only tile (blue half-circle) is removed with Develop, not
 * skipped (rules p.7).
 */
export function eraRestrictionMessage(
  tile: IndustryTile,
  era: GameState['era'],
): string {
  if (era === 'rail') {
    return `Cannot build ${tile.type} Level ${tile.level} in the Rail Era — it is a canal-era tile; Develop to remove it first`
  }
  return `Cannot build ${tile.type} Level ${tile.level} in the Canal Era — it is a rail-era tile`
}

export function validateTileEraCompatibility(context: GameState, tile: IndustryTile): void {
  if (!canBuildTileInEra(tile, context.era)) {
    throw new Error(eraRestrictionMessage(tile, context.era))
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
  /** The player's choice of which iron works (or the market) each cube comes
   * from; omit to let the engine pick. */
  ironSources?: IronSource[],
  /** The player's choice of which mine each equal-distance coal tie drains;
   * omit to let the engine pick the nearest. */
  coalSources?: CoalSource[],
): IndustryBuildResult {
  const location = context.selectedLocation!

  // EXECUTION BACKSTOP: the placement primitive must never drop a tile onto a
  // city that has no compatible slot (and is not a legal overbuild). The
  // machine guards + executeBuildAction already reject this, but this is the
  // last line of defence — without it any unguarded caller (or a future guard
  // regression) could place e.g. a Brewery at Birmingham, which has no brewery
  // slot. canPlaceOrOverbuildIndustry covers free-slot, overbuild and the
  // canal one-tile rule uniformly, so a currently-legal build always passes it.
  if (!canPlaceOrOverbuildIndustry(context, location, tile.type, tile.level)) {
    throw new Error(
      `Cannot build ${tile.type} at ${location}: no compatible slot and not a legal overbuild.`,
    )
  }

  let updatedPlayersFromResources = context.players
  let updatedCoalMarket = [...context.coalMarket]
  let updatedIronMarket = [...context.ironMarket]

  const cost = tile.cost
  let coalCost = 0
  let ironCost = 0
  const resourceLogDetails: string[] = []

  // Canal Era: max ONE of the player's tiles per location — when they
  // already have a tile here the build MUST replace it (own overbuild),
  // even if another compatible slot is free (rules p.4 & p.7).
  const canalOneTileForced =
    context.era === 'canal' &&
    context.players[context.currentPlayerIndex]!.industries.some(
      (industry) => industry.location === context.selectedLocation,
    )

  // Free-slot-first: if the city still has a free compatible slot, the tile
  // is placed there and NO overbuild happens — an existing same-type tile
  // (any player's) stays on the board. Overbuild semantics apply only when
  // no compatible slot is free (rules: overbuild replaces an existing tile).
  const hasFreeSlot =
    !canalOneTileForced &&
    canCityAccommodateIndustryType(
      context,
      context.selectedLocation!,
      tile.type,
    )

  const overbuildCheck = hasFreeSlot
    ? ({ canOverbuild: true } as ReturnType<typeof canOverbuildIndustry>)
    : canOverbuildIndustry(
        context,
        context.currentPlayerIndex,
        context.selectedLocation!,
        tile.type,
        tile.level,
      )

  if (!overbuildCheck.canOverbuild && overbuildCheck.reason) {
    throw new Error(overbuildCheck.reason)
  }
  if (
    canalOneTileForced &&
    (!overbuildCheck.existingIndustry ||
      overbuildCheck.existingIndustry.playerIndex !==
        context.currentPlayerIndex)
  ) {
    throw new Error(
      `Cannot build at ${context.selectedLocation}: in the Canal Era each player may have only ONE tile per location.`,
    )
  }

  // Consume coal if required
  if (tile.coalRequired > 0) {
    const coalResult = consumeCoalFromSources(
      { ...context, players: updatedPlayersFromResources },
      context.selectedLocation!,
      tile.coalRequired,
      coalSources,
    )

    if (!coalResult.success) {
      throw new Error(coalResult.errorMessage || 'Coal consumption failed')
    }
    
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
      ironSources,
    )
    if (!ironResult.success) {
      throw new Error(ironResult.errorMessage || 'Iron consumption failed')
    }
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
    const { connected: isConnectedToMerchant, connectedMerchants } = isLocationConnectedToMerchant(context, context.selectedLocation!)
    
    
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

  // Decrement tile quantity from player's mat
  const updatedTilesOnMat = { ...currentPlayer.industryTilesOnMat }
  const tileType = tile.type
  if (updatedTilesOnMat[tileType]) {
    updatedTilesOnMat[tileType] = decrementTileQuantity(updatedTilesOnMat[tileType], tile)
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
  // A tile flipped by its own market auto-sale advances the marker by
  // SPACES on the income track (audited 2026-07-15).
  let finalIncomeSpace = currentPlayerFromResources.incomeSpace

  if (newIndustry.flipped) {
    finalIncomeSpace = advanceIncomeSpaces(
      finalIncomeSpace,
      newIndustry.tile.incomeSpaces,
    )
  }

  const updatedPlayer = {
    ...currentPlayerFromResources,
    hand: updatedHand,
    money: finalMoney,
    income: incomeLevelForSpace(finalIncomeSpace),
    incomeSpace: finalIncomeSpace,
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

export interface BuildCompletion {
  ok: boolean
  /** Present only when !ok — the FIRST requirement that blocks the build. */
  reason?: string
  /** Present only when ok — tile + coal + iron, priced with the cheapest
   * (engine auto-pick) sources. */
  totalCost?: number
}

/**
 * Can the current player COMPLETE a build of `tile` at `location` right now?
 *
 * Mirrors `buildIndustryTile`'s coal/iron/funds path without mutating, so a
 * SELECT_LOCATION guard can reject a slot-legal-but-uncompletable city up front
 * instead of letting it walk into a dead CONFIRM. Sources are the engine's
 * default auto-pick (nearest coal, works-before-market iron) — the cheapest way
 * to complete, i.e. "does ANY way to build here exist". The later
 * choosingCoalSource/choosingIronSource steps only re-tie equal-cost picks, so
 * the price computed here is the one CONFIRM will settle.
 */
export function buildCompletionAt(
  context: GameState,
  location: CityId,
  tile: IndustryTile,
): BuildCompletion {
  if (!canPlaceOrOverbuildIndustry(context, location, tile.type, tile.level)) {
    return { ok: false, reason: `${location} has no compatible slot for a ${tile.type}` }
  }

  const withLocation = { ...context, selectedLocation: location }
  const player = getCurrentPlayer(context)

  let coalCost = 0
  if (tile.coalRequired > 0) {
    const coal = consumeCoalFromSources(withLocation, location, tile.coalRequired)
    if (!coal.success) {
      return {
        ok: false,
        reason: `no coal reachable from ${location} — a ${tile.type} needs ${tile.coalRequired} coal`,
      }
    }
    coalCost = coal.coalCost
  }

  let ironCost = 0
  if (tile.ironRequired > 0) {
    const iron = consumeIronFromSources(withLocation, tile.ironRequired)
    if (!iron.success) {
      return {
        ok: false,
        reason:
          iron.errorMessage ??
          `no iron available — a ${tile.type} needs ${tile.ironRequired} iron`,
      }
    }
    ironCost = iron.ironCost
  }

  const totalCost = tile.cost + coalCost + ironCost
  if (player.money < totalCost) {
    return {
      ok: false,
      reason: `not enough money at ${location}: this ${tile.type} costs £${totalCost}, you have £${player.money}`,
    }
  }

  return { ok: true, totalCost }
}

/**
 * The complete "may this card build this tile at this city?" answer: card/city
 * agreement, the farm-brewery card restriction, network reach, and then full
 * completability. The single owner shared by `canSelectLocation` (which city may
 * be picked) and `canSelectIndustryType` (is any city left for this industry) —
 * so the two guards can never disagree.
 */
export function canBuildIndustryAt(
  context: GameState,
  card: Card,
  tile: IndustryTile,
  cityId: CityId,
): BuildCompletion {
  // Farm Breweries may only be reached with a Brewery Industry or a Wild
  // Industry card — never location/wild-location cards (rules p.5).
  if (
    FARM_BREWERIES.has(cityId) &&
    (card.type === 'location' || card.type === 'wild_location')
  ) {
    return {
      ok: false,
      reason: `${cityId} can only be built with an industry card`,
    }
  }

  if (card.type === 'location' && (card as LocationCard).location !== cityId) {
    return {
      ok: false,
      reason: `this card names ${(card as LocationCard).location}`,
    }
  }

  if (
    !validateIndustryBuildLocation(
      context,
      getCurrentPlayer(context),
      card,
      cityId,
    )
  ) {
    return { ok: false, reason: `${cityId} is not in your network` }
  }

  return buildCompletionAt(context, cityId, tile)
}

/** Is there ANY city where this card could complete a build of this tile? */
export function hasBuildableSite(
  context: GameState,
  card: Card,
  tile: IndustryTile,
): boolean {
  return (Object.keys(cities) as CityId[]).some(
    (cityId) => canBuildIndustryAt(context, card, tile, cityId).ok,
  )
}
