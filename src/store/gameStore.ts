import { type Actor, StateFrom, assign, setup } from 'xstate'
import { type CityId } from '../data/board'
import {
  type BaseCard,
  type Card,
  type CardDecks,
  type CardType,
  type IndustryCard,
  type IndustryType,
  type LocationCard,
  type LocationColor,
  type WildIndustryCard,
  type WildLocationCard,
  getInitialCards,
} from '../data/cards'
import {
  type IndustryTile,
  canBuildTileInEra,
  canDevelopTile,
  getInitialPlayerIndustryTiles,
  getLowestLevelTile,
} from '../data/industryTiles'

// Game constants
const GAME_CONSTANTS = {
  STARTING_MONEY: 17,
  STARTING_INCOME: 10,
  STARTING_HAND_SIZE: 8,
  LOAN_AMOUNT: 30,
  LOAN_INCOME_PENALTY: 3,
  MIN_INCOME: -10,
  CANAL_LINK_COST: 3,
  RAIL_LINK_COST: 5,
  COAL_FALLBACK_PRICE: 8,
  IRON_FALLBACK_PRICE: 6,
  SCOUT_CARDS_REQUIRED: 3,
  MAX_SCOUT_SELECTION: 3,
  FIRST_ROUND_ACTIONS: 1,
  NORMAL_ROUND_ACTIONS: 2,
} as const

export type LogEntryType = 'system' | 'action' | 'info' | 'error'

export interface LogEntry {
  message: string
  type: LogEntryType
  timestamp: Date
}

export interface Player {
  id: string
  name: string
  color: 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'
  character:
    | 'Richard Arkwright'
    | 'Eliza Tinsley'
    | 'Isambard Kingdom Brunel'
    | 'George Stephenson'
    | 'Robert Owen'
    | 'Henry Bessemer'
  money: number
  victoryPoints: number
  income: number
  hand: Card[]
  // Industry tiles on player mat (available to build)
  industryTilesOnMat: Record<IndustryType, IndustryTile[]>
  // Built items on board
  links: {
    from: CityId
    to: CityId
    type: 'canal' | 'rail'
  }[]
  industries: {
    location: CityId
    type: IndustryType
    level: number
    flipped: boolean
    tile: IndustryTile // Reference to the actual tile data
    coalCubesOnTile: number // Current coal cubes on this tile
    ironCubesOnTile: number // Current iron cubes on this tile
    beerBarrelsOnTile: number // Current beer barrels on this tile
  }[]
}

export interface GameState {
  players: Player[]
  currentPlayerIndex: number
  era: 'canal' | 'rail'
  round: number
  actionsRemaining: number
  resources: {
    coal: number
    iron: number
    beer: number
  }
  // Resource markets - explicit structure with max capacity per price
  coalMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  ironMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  logs: LogEntry[]
  // Card-related state
  drawPile: Card[]
  discardPile: Card[]
  wildLocationPile: WildLocationCard[]
  wildIndustryPile: WildIndustryCard[]
  selectedCard: Card | null
  selectedCardsForScout: Card[]
  spentMoney: number
  // Network-related state
  selectedLink: {
    from: CityId
    to: CityId
  } | null
  // Building-related state
  selectedLocation: CityId | null
  selectedIndustryTile: IndustryTile | null
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
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

const DEBUG = false

function debugLog(
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

function createLogEntry(message: string, type: LogEntryType): LogEntry {
  return {
    message,
    type,
    timestamp: new Date(),
  }
}

type GameEvent =
  | {
      type: 'START_GAME'
      players: Array<Omit<Player, 'hand' | 'links' | 'industries'>>
    }
  | {
      type: 'BUILD'
    }
  | {
      type: 'DEVELOP'
    }
  | {
      type: 'SELL'
    }
  | {
      type: 'TAKE_LOAN'
    }
  | {
      type: 'SCOUT'
    }
  | {
      type: 'NETWORK'
    }
  | {
      type: 'PASS'
    }
  | {
      type: 'SELECT_LINK'
      from: CityId
      to: CityId
    }
  | {
      type: 'SELECT_CARD'
      cardId: string
    }
  | {
      type: 'SELECT_LOCATION'
      cityId: CityId
    }
  | {
      type: 'SELECT_INDUSTRY_TYPE'
      industryType: IndustryType
    }
  | {
      type: 'CONFIRM'
    }
  | {
      type: 'CANCEL'
    }
  | {
      type: 'BUILD_SECOND_LINK'
    }
  | {
      type: 'TEST_SET_PLAYER_HAND'
      playerId: number
      hand: Card[]
    }

// Utility functions
function findCardInHand(player: Player, cardId: string): Card | null {
  return player.hand.find((card) => card.id === cardId) ?? null
}

function removeCardFromHand(
  player: Player,
  cardId: string | undefined,
): Card[] {
  if (!cardId) return player.hand
  return player.hand.filter((card) => card.id !== cardId)
}

function updatePlayerInList(
  players: Player[],
  currentPlayerIndex: number,
  updatedPlayer: Partial<Player>,
): Player[] {
  return players.map((player, index) =>
    index === currentPlayerIndex ? { ...player, ...updatedPlayer } : player,
  )
}

function getCurrentPlayer(context: GameState): Player {
  const player = context.players[context.currentPlayerIndex]
  if (!player) {
    throw new Error('Current player not found')
  }
  return player
}

function getCardDescription(card: Card): string {
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

function drawCards(context: GameState, count: number): Card[] {
  return context.drawPile.slice(0, count)
}

function isFirstRound(context: GameState): boolean {
  return context.era === 'canal' && context.round === 1
}

// Resource consumption utility functions
function findConnectedCoalMines(
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

function findAvailableIronWorks(context: GameState): Player['industries'] {
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

function findAvailableBreweries(
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

function consumeCoalFromSources(
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
  const updatedCoalMarket = context.coalMarket.map(level => ({ ...level }))

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
      const fallbackLevel = updatedCoalMarket.find(l => l.price === GAME_CONSTANTS.COAL_FALLBACK_PRICE)
      if (fallbackLevel) {
        // Don't decrement cubes for infinite capacity level
        coalCost += GAME_CONSTANTS.COAL_FALLBACK_PRICE
        coalConsumed++
        logDetails.push(`consumed 1 coal from general supply for £${GAME_CONSTANTS.COAL_FALLBACK_PRICE}`)
      }
    }
  }

  return { updatedPlayers, updatedCoalMarket, coalCost, logDetails }
}

function consumeIronFromSources(
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
  const updatedIronMarket = context.ironMarket.map(level => ({ ...level }))

  // First, try to consume from any available iron works (free)
  const availableIronWorks = findAvailableIronWorks(context)

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
      const fallbackLevel = updatedIronMarket.find(l => l.price === GAME_CONSTANTS.IRON_FALLBACK_PRICE)
      if (fallbackLevel) {
        // Don't decrement cubes for infinite capacity level
        ironCost += GAME_CONSTANTS.IRON_FALLBACK_PRICE
        ironConsumed++
        logDetails.push(`consumed 1 iron from general supply for £${GAME_CONSTANTS.IRON_FALLBACK_PRICE}`)
      }
    }
  }

  return { updatedPlayers, updatedIronMarket, ironCost, logDetails }
}

// Helper function to check if a location is connected to a merchant
function isLocationConnectedToMerchant(location: CityId): boolean {
  // Based on the board data, these connections exist:
  // Stoke -> Warrington, Coalbrookdale -> Shrewsbury
  // TODO: This should use proper network connectivity check, but for now hardcode known connections
  const merchantConnections = new Set<CityId>(['stoke', 'coalbrookdale'])

  return merchantConnections.has(location)
}

// Helper function to sell coal to market (most expensive spaces first)
function sellCoalToMarket(
  coalMarket: Array<{ price: number; cubes: number; maxCubes: number }>,
  cubesAvailable: number,
): {
  updatedMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  cubesSold: number
  income: number
  logDetails: string[]
} {
  const updatedMarket = coalMarket.map(level => ({ ...level }))
  const logDetails: string[] = []
  let cubesSold = 0
  let income = 0

  // Sell to most expensive available spaces first (£7 down to £1)
  // If market is full, remaining cubes stay on the industry tile
  for (let i = updatedMarket.length - 2; i >= 0 && cubesSold < cubesAvailable; i--) {
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
function sellIronToMarket(
  ironMarket: Array<{ price: number; cubes: number; maxCubes: number }>,
  cubesAvailable: number,
): {
  updatedMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  cubesSold: number
  income: number
  logDetails: string[]
} {
  const updatedMarket = ironMarket.map(level => ({ ...level }))
  const logDetails: string[] = []
  let cubesSold = 0
  let income = 0

  // Sell to most expensive available spaces first (£5 down to £1)
  // If market is full, remaining cubes stay on the industry tile
  for (let i = updatedMarket.length - 2; i >= 0 && cubesSold < cubesAvailable; i--) {
    const level = updatedMarket[i]
    if (level && level.cubes < level.maxCubes) {
      // Space available at this price level
      const spacesAvailable = level.maxCubes - level.cubes
      const cubesToSell = Math.min(spacesAvailable, cubesAvailable - cubesSold)
      
      level.cubes += cubesToSell
      income += level.price * cubesToSell
      cubesSold += cubesToSell
      
      if (cubesToSell > 0) {
        logDetails.push(`sold ${cubesToSell} iron to market for £${level.price * cubesToSell}`)
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


function consumeBeerFromSources(
  context: GameState,
  location: CityId,
  beerRequired: number,
): {
  updatedPlayers: Player[]
  updatedResources: GameState['resources']
  logDetails: string[]
} {
  let beerConsumed = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  const updatedResources = { ...context.resources }

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
      updatedPlayers = updatedPlayers.map((player) => ({
        ...player,
        industries: player.industries.map((industry) =>
          industry === brewery
            ? { ...industry, beerBarrelsOnTile: industry.beerBarrelsOnTile - 1 }
            : industry,
        ),
      }))

      beerConsumed++
      logDetails.push(`1 beer from own brewery (free)`)

      // TODO: Check if brewery should flip when empty
    }
  }

  // If still need beer, consume from connected opponent breweries
  for (const brewery of connectedBreweries) {
    if (beerConsumed >= beerRequired) break

    if (brewery.beerBarrelsOnTile > 0) {
      updatedPlayers = updatedPlayers.map((player) => ({
        ...player,
        industries: player.industries.map((industry) =>
          industry === brewery
            ? { ...industry, beerBarrelsOnTile: industry.beerBarrelsOnTile - 1 }
            : industry,
        ),
      }))

      beerConsumed++
      logDetails.push(`1 beer from connected opponent brewery (free)`)

      // TODO: Check if brewery should flip when empty
    }
  }

  // If still need beer, consume from general supply (fallback - should not happen in proper game)
  while (beerConsumed < beerRequired) {
    if (updatedResources.beer > 0) {
      updatedResources.beer--
      beerConsumed++
      logDetails.push(`consumed 1 beer from general supply`)
    } else {
      // Cannot consume beer - this should cause the action to fail
      throw new Error('Insufficient beer available')
    }
  }

  return { updatedPlayers, updatedResources, logDetails }
}

// Build action validation helpers
function validateBuildActionSelections(context: GameState): void {
  if (!context.selectedCard) {
    throw new Error('No card selected for build action')
  }
  if (!context.selectedLocation) {
    throw new Error('No location selected for build action')
  }
}

function validateCardType(card: Card): void {
  const validCardTypes = ['location', 'industry', 'wild_location', 'wild_industry']
  if (!validCardTypes.includes(card.type)) {
    throw new Error(
      `Invalid card type for build action: ${card.type}. Only Location, Industry, or Wild cards can be used.`,
    )
  }
}

function validateCardLocationMatching(card: Card, selectedLocation: CityId): void {
  if (card.type === 'location') {
    const locationCard = card as LocationCard
    if (locationCard.location !== selectedLocation) {
      throw new Error(
        `Location card mismatch: card specifies ${locationCard.location}, but selected location is ${selectedLocation}`,
      )
    }
  }
}

function validateCardIndustryMatching(card: Card, selectedIndustryTile: IndustryTile | null): void {
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

function validateTileEraCompatibility(context: GameState, tile: IndustryTile): void {
  if (context.era === 'canal' && !tile.canBuildInCanalEra) {
    throw new Error(`Cannot build ${tile.type} Level ${tile.level} in Canal Era`)
  }
  if (context.era === 'rail' && !tile.canBuildInRailEra) {
    throw new Error(`Cannot build ${tile.type} Level ${tile.level} in Rail Era`)
  }
}

// Industry building helper function
interface IndustryBuildResult {
  updatedPlayer: Player
  updatedPlayers: Player[]
  updatedCoalMarket: GameState['coalMarket']
  updatedIronMarket: GameState['ironMarket']
  logMessage: string
}

function buildIndustryTile(
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
    const isConnectedToMerchant = isLocationConnectedToMerchant(context.selectedLocation!)
    if (isConnectedToMerchant && newIndustry.coalCubesOnTile > 0) {
      const sellResult = sellCoalToMarket(updatedCoalMarket, newIndustry.coalCubesOnTile)
      updatedCoalMarket = sellResult.updatedMarket
      marketIncome += sellResult.income
      marketLogDetails.push(...sellResult.logDetails)
      newIndustry.coalCubesOnTile -= sellResult.cubesSold

      if (newIndustry.coalCubesOnTile === 0) {
        newIndustry.flipped = true
      }
    }
  } else if (tile.type === 'iron') {
    if (newIndustry.ironCubesOnTile > 0) {
      const sellResult = sellIronToMarket(updatedIronMarket, newIndustry.ironCubesOnTile)
      updatedIronMarket = sellResult.updatedMarket
      marketIncome += sellResult.income
      marketLogDetails.push(...sellResult.logDetails)
      newIndustry.ironCubesOnTile -= sellResult.cubesSold

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
  const logMessage = `${currentPlayer.name} built ${tile.type} Level ${tile.level} at ${context.selectedLocation} for £${totalCost}${resourceString}${marketString}${incomeString} using ${getCardDescription(context.selectedCard!)}`

  return {
    updatedPlayer,
    updatedPlayers: updatedPlayersFromResources,
    updatedCoalMarket,
    updatedIronMarket,
    logMessage,
  }
}

export type GameStore = typeof gameStore
export type GameStoreSnapshot = StateFrom<typeof gameStore>
export type GameStoreSend = Actor<typeof gameStore>['send']
export type GameStoreActor = Actor<typeof gameStore>

// Setup the machine with proper typing
export const gameStore = setup({
  types: {} as {
    context: GameState
    events: GameEvent
  },
  actions: {
    initializeGame: assign(({ event }) => {
      if (event.type !== 'START_GAME') return {}
      debugLog('initializeGame', {} as GameState)

      const playerCount = event.players.length
      const { regularCards, wildLocationCards, wildIndustryCards } =
        getInitialCards(playerCount)
      const shuffledCards = shuffleArray(regularCards)

      // Deal starting hand to each player
      const hands: Card[][] = []
      let currentIndex = 0
      for (let i = 0; i < playerCount; i++) {
        hands.push(shuffledCards.slice(currentIndex, currentIndex + GAME_CONSTANTS.STARTING_HAND_SIZE))
        currentIndex += GAME_CONSTANTS.STARTING_HAND_SIZE
      }

      // Initialize players with starting money, income, hands, and industry tiles
      const players: Player[] = event.players.map((playerData, index) => ({
        ...playerData,
        money: GAME_CONSTANTS.STARTING_MONEY,
        income: GAME_CONSTANTS.STARTING_INCOME,
        victoryPoints: 0,
        hand: hands[index] ?? [],
        industryTilesOnMat: getInitialPlayerIndustryTiles(),
        links: [],
        industries: [],
      }))

      return {
        players,
        currentPlayerIndex: 0,
        era: 'canal' as const,
        round: 1,
        actionsRemaining: GAME_CONSTANTS.FIRST_ROUND_ACTIONS,
        resources: {
          coal: 24,
          iron: 10, // Iron total: 17 cubes in game (5 in market + 10 in general supply, 2 market spaces empty)
          beer: 24,
        },
        // Initialize coal market: £1 has 1/2 cubes, £2-£7 have 2/2 cubes, £8 has infinite capacity
        coalMarket: [
          { price: 1, cubes: 1, maxCubes: 2 },
          { price: 2, cubes: 2, maxCubes: 2 },
          { price: 3, cubes: 2, maxCubes: 2 },
          { price: 4, cubes: 2, maxCubes: 2 },
          { price: 5, cubes: 2, maxCubes: 2 },
          { price: 6, cubes: 2, maxCubes: 2 },
          { price: 7, cubes: 2, maxCubes: 2 },
          { price: 8, cubes: 0, maxCubes: Infinity }, // Infinite capacity fallback
        ],
        // Initialize iron market: £1 has 0/2 cubes, £2-£5 have 2/2 cubes, £6 has infinite capacity
        ironMarket: [
          { price: 1, cubes: 0, maxCubes: 2 },
          { price: 2, cubes: 2, maxCubes: 2 },
          { price: 3, cubes: 2, maxCubes: 2 },
          { price: 4, cubes: 2, maxCubes: 2 },
          { price: 5, cubes: 2, maxCubes: 2 },
          { price: 6, cubes: 0, maxCubes: Infinity }, // Infinite capacity fallback
        ],
        logs: [createLogEntry('Game started', 'system')],
        drawPile: shuffledCards.slice(currentIndex),
        discardPile: [],
        wildLocationPile: wildLocationCards,
        wildIndustryPile: wildIndustryCards,
        selectedCard: null,
        selectedCardsForScout: [],
        spentMoney: 0,
        selectedLink: null,
        selectedLocation: null,
        selectedIndustryTile: null,
      }
    }),

    selectCard: assign(({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return {}
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      debugLog('selectCard', context, event)
      return {
        selectedCard: card,
      }
    }),

    selectCardForScout: assign(({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return {}
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      if (!card) return {}

      // Add card to scout selection if not already selected and we have less than 3
      const alreadySelected = context.selectedCardsForScout.some(
        (c) => c.id === card.id,
      )
      if (!alreadySelected && context.selectedCardsForScout.length < GAME_CONSTANTS.MAX_SCOUT_SELECTION) {
        debugLog('selectCardForScout', context, event)
        return {
          selectedCardsForScout: [...context.selectedCardsForScout, card],
        }
      }
      return {}
    }),

    selectLink: assign(({ context, event }) => {
      if (event.type !== 'SELECT_LINK') return {}
      debugLog('selectLink', context, event)
      return {
        selectedLink: {
          from: event.from,
          to: event.to,
        },
      }
    }),

    executeLoanAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for loan action')
      }

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )
      const updatedPlayer = {
        ...currentPlayer,
        money: currentPlayer.money + GAME_CONSTANTS.LOAN_AMOUNT,
        income: Math.max(GAME_CONSTANTS.MIN_INCOME, currentPlayer.income - GAME_CONSTANTS.LOAN_INCOME_PENALTY),
        hand: updatedHand,
      }

      debugLog('executeLoanAction', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} took a loan (£${GAME_CONSTANTS.LOAN_AMOUNT}, -${GAME_CONSTANTS.LOAN_INCOME_PENALTY} income) using ${context.selectedCard.id}`,
            'action',
          ),
        ],
      }
    }),

    executeBuildAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)

      // Run all validations
      validateBuildActionSelections(context)
      validateCardType(context.selectedCard!)
      validateCardLocationMatching(context.selectedCard!, context.selectedLocation!)
      validateCardIndustryMatching(context.selectedCard!, context.selectedIndustryTile)

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard!.id,
      )

      let updatedPlayer = { ...currentPlayer, hand: updatedHand }
      let logMessage = `${currentPlayer.name} built`
      let updatedCoalMarket = [...context.coalMarket]
      let updatedIronMarket = [...context.ironMarket]

      // Handle industry building (when tile is selected)
      if (context.selectedIndustryTile) {
        const tile = context.selectedIndustryTile
        validateTileEraCompatibility(context, tile)
        
        const buildResult = buildIndustryTile(context, currentPlayer, tile, updatedHand)
        updatedPlayer = buildResult.updatedPlayer
        updatedCoalMarket = buildResult.updatedCoalMarket
        updatedIronMarket = buildResult.updatedIronMarket
        logMessage = buildResult.logMessage
        
        // Use the updated players list from the build result
        const result: Partial<GameState> = {
          players: updatePlayerInList(
            buildResult.updatedPlayers,
            context.currentPlayerIndex,
            updatedPlayer,
          ),
          discardPile: [...context.discardPile, context.selectedCard!],
          selectedCard: null,
          selectedLocation: null,
          selectedIndustryTile: null,
          actionsRemaining: context.actionsRemaining - 1,
          logs: [...context.logs, createLogEntry(logMessage, 'action')],
        }

        // Update resource markets if they were modified
        if (
          context.selectedIndustryTile.coalRequired > 0 ||
          context.selectedIndustryTile.type === 'coal'
        ) {
          result.coalMarket = updatedCoalMarket
        }
        if (
          context.selectedIndustryTile.ironRequired > 0 ||
          context.selectedIndustryTile.type === 'iron'
        ) {
          result.ironMarket = updatedIronMarket
        }

        return result
      }

      // Handle location card building (fallback case)
      debugLog('executeBuildAction', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard!],
        selectedCard: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [...context.logs, createLogEntry(logMessage, 'action')],
      }
    }),

    executeNetworkAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard || !context.selectedLink) {
        throw new Error('Card or link not selected for network action')
      }

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )
      // Rail era can build 1 link or 2 links (with beer consumption)
      // For now, implement single link logic - double link will be separate action/choice
      const linkCost = context.era === 'canal' ? GAME_CONSTANTS.CANAL_LINK_COST : GAME_CONSTANTS.RAIL_LINK_COST

      const newLink = {
        from: context.selectedLink.from,
        to: context.selectedLink.to,
        type: context.era,
      }

      let coalCost = 0
      const updatedCoalMarket = context.coalMarket.map(level => ({ ...level }))
      let logMessage = `${currentPlayer.name} built a ${context.era} link between ${context.selectedLink.from} and ${context.selectedLink.to}`

      // Consume coal if rail era
      if (context.era === 'rail') {
        // In a full implementation, we would first check for connected coal mines
        // For now, consume from coal market (cheapest first)
        let coalFromMarket = 0

        // Find cheapest available coal and consume 1
        for (const level of updatedCoalMarket) {
          if (level.cubes > 0 && coalFromMarket < 1) {
            level.cubes-- // Remove 1 cube from this price level
            coalCost += level.price
            coalFromMarket++
            break // Only consume 1 coal for rail link
          }
        }

        // If market is empty, can still purchase coal at fallback price per rules
        if (coalFromMarket < 1) {
          coalCost += GAME_CONSTANTS.COAL_FALLBACK_PRICE
          coalFromMarket = 1
        }

        logMessage += ` (consumed 1 coal from market for £${coalCost})`
      }

      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
        money: currentPlayer.money - linkCost - coalCost,
        links: [...currentPlayer.links, newLink],
      }

      debugLog('executeNetworkAction', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        coalMarket: updatedCoalMarket,
        // Note: general coal supply remains unchanged when consuming from market
        selectedCard: null,
        selectedLink: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [...context.logs, createLogEntry(logMessage, 'action')],
      }
    }),

    executeDevelopAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for develop action')
      }

      // For now, simulate removing 1 tile and consuming 1 iron
      // In a full implementation, this would:
      // 1. Allow player to select 1-2 industry types to develop
      // 2. Remove the lowest level tile from each selected industry from player mat
      // 3. Consume 1 iron per tile removed from iron works or iron market
      // 4. Check pottery tiles with lightbulb icon cannot be developed

      const tilesRemoved = 1 // Simplified - would be dynamic based on player choice
      const ironRequired = tilesRemoved

      // Use enhanced iron consumption logic
      const ironResult = consumeIronFromSources(context, ironRequired)
      const ironCost = ironResult.ironCost
      const updatedPlayersFromIron = ironResult.updatedPlayers
      const updatedIronMarket = ironResult.updatedIronMarket

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )

      // Get the current player's updated state after iron consumption
      const currentPlayerAfterIron =
        updatedPlayersFromIron[context.currentPlayerIndex]!
      const updatedPlayer = {
        ...currentPlayerAfterIron,
        hand: updatedHand,
        money: currentPlayerAfterIron.money - ironCost, // Pay for iron cost
      }

      debugLog('executeDevelopAction', context)
      return {
        players: updatePlayerInList(
          updatedPlayersFromIron,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        ironMarket: updatedIronMarket,
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} developed (removed ${tilesRemoved} tile${tilesRemoved > 1 ? 's' : ''}, ${ironResult.logDetails.join(', ')}) using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
        ],
      }
    }),

    executeSellAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for sell action')
      }

      // For now, simulate selling 1 cotton mill/manufacturer/pottery tile
      // In a full implementation, this would:
      // 1. Check player has unflipped Cotton Mill, Manufacturer, or Pottery tiles
      // 2. Verify the tile is connected to a Merchant tile with matching industry icon
      // 3. Consume required beer (usually 1) from breweries or merchant beer
      // 4. Flip the industry tile and advance player income
      // 5. Potentially collect merchant beer bonus if using merchant beer

      const tilesFlipped = 1 // Simplified - would be dynamic based on player choice
      const beerRequired = tilesFlipped // Most tiles require 1 beer to sell

      // Use enhanced beer consumption logic
      // For now, assume we're selling at a location where the player has other industries
      const sellLocation = currentPlayer.industries[0]?.location || 'birmingham' // Fallback location
      const beerResult = consumeBeerFromSources(
        context,
        sellLocation,
        beerRequired,
      )
      const updatedPlayersFromBeer = beerResult.updatedPlayers
      const updatedResources = beerResult.updatedResources

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )

      // Get the current player's updated state after beer consumption
      const currentPlayerAfterBeer =
        updatedPlayersFromBeer[context.currentPlayerIndex]!
      const updatedPlayer = {
        ...currentPlayerAfterBeer,
        hand: updatedHand,
      }

      debugLog('executeSellAction', context)
      return {
        players: updatePlayerInList(
          updatedPlayersFromBeer,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        resources: updatedResources,
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} sold (flipped ${tilesFlipped} tile${tilesFlipped > 1 ? 's' : ''}, ${beerResult.logDetails.join(', ')}) using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
        ],
      }
    }),

    executeScoutAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (context.selectedCardsForScout.length !== GAME_CONSTANTS.SCOUT_CARDS_REQUIRED) {
        throw new Error(`Scout action requires exactly ${GAME_CONSTANTS.SCOUT_CARDS_REQUIRED} cards to be selected`)
      }

      // Remove the 3 selected cards from hand
      let updatedHand = [...currentPlayer.hand]
      context.selectedCardsForScout.forEach((card) => {
        updatedHand = updatedHand.filter((c) => c.id !== card.id)
      })

      // Take 1 wild location and 1 wild industry card
      const wildLocation = context.wildLocationPile[0]
      const wildIndustry = context.wildIndustryPile[0]

      if (!wildLocation || !wildIndustry) {
        throw new Error('No wild cards available for scout action')
      }

      // Add wild cards to hand
      updatedHand = [...updatedHand, wildLocation, wildIndustry]

      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
      }

      debugLog('executeScoutAction', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, ...context.selectedCardsForScout],
        wildLocationPile: context.wildLocationPile.slice(1), // Remove used wild card
        wildIndustryPile: context.wildIndustryPile.slice(1), // Remove used wild card
        selectedCardsForScout: [],
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} scouted (discarded 3 cards, gained 2 wild cards)`,
            'action',
          ),
        ],
      }
    }),

    executePassAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)

      // For pass action, we need to discard a card but don't need to select it
      // Let's discard the first card in hand
      const cardToDiscard = currentPlayer.hand[0]
      if (!cardToDiscard) {
        throw new Error('No cards in hand to discard for pass action')
      }

      const updatedHand = removeCardFromHand(currentPlayer, cardToDiscard.id)
      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
      }

      debugLog('executePassAction', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, cardToDiscard],
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} passed (discarded ${getCardDescription(cardToDiscard)})`,
            'action',
          ),
        ],
      }
    }),

    refillPlayerHand: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      const cardsNeeded = GAME_CONSTANTS.STARTING_HAND_SIZE - currentPlayer.hand.length

      if (cardsNeeded <= 0 || context.drawPile.length === 0) {
        return {}
      }

      const newCards = drawCards(context, cardsNeeded)
      const updatedHand = [...currentPlayer.hand, ...newCards]

      debugLog('refillPlayerHand', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          { hand: updatedHand },
        ),
        drawPile: context.drawPile.slice(cardsNeeded),
      }
    }),

    nextPlayer: assign(({ context }) => {
      const nextPlayerIndex =
        (context.currentPlayerIndex + 1) % context.players.length
      const isRoundComplete = nextPlayerIndex === 0
      const nextRound = isRoundComplete ? context.round + 1 : context.round
      const nextActionsRemaining = isFirstRound({
        ...context,
        round: nextRound,
      })
        ? GAME_CONSTANTS.FIRST_ROUND_ACTIONS
        : GAME_CONSTANTS.NORMAL_ROUND_ACTIONS

      debugLog('nextPlayer', context)
      return {
        currentPlayerIndex: nextPlayerIndex,
        round: nextRound,
        actionsRemaining: nextActionsRemaining,
        selectedCard: null,
        selectedCardsForScout: [],
        selectedLink: null,
        spentMoney: 0,
      }
    }),

    clearSelections: assign({
      selectedCard: null,
      selectedCardsForScout: [],
      selectedLink: null,
      selectedLocation: null,
      selectedIndustryTile: null,
    }),

    selectLocation: assign(({ context, event }) => {
      if (event.type !== 'SELECT_LOCATION') return {}

      const result: Partial<GameState> = {
        selectedLocation: event.cityId,
      }

      // If the selected card is an industry card, auto-select the lowest tile of that industry type
      if (context.selectedCard?.type === 'industry') {
        const industryCard = context.selectedCard as IndustryCard
        const player = getCurrentPlayer(context)

        // Find the first industry type from the card that the player has tiles for
        for (const industryType of industryCard.industries) {
          const tilesOfType = player.industryTilesOnMat[industryType] || []
          const availableTiles = tilesOfType.filter((tile) => {
            if (context.era === 'canal') return tile.canBuildInCanalEra
            if (context.era === 'rail') return tile.canBuildInRailEra
            return false
          })

          if (availableTiles.length > 0) {
            const lowestTile = getLowestLevelTile(availableTiles)
            if (lowestTile) {
              result.selectedIndustryTile = lowestTile
              break
            }
          }
        }
      }

      return result
    }),

    clearCard: assign({
      selectedCard: null,
    }),

    clearLocation: assign({
      selectedLocation: null,
    }),

    selectIndustryType: assign(({ context, event }) => {
      if (event.type !== 'SELECT_INDUSTRY_TYPE') return {}

      // Get current player and find the lowest level tile of the selected industry type
      const player = getCurrentPlayer(context)
      const tilesOfType = player.industryTilesOnMat[event.industryType] || []
      const lowestTile = getLowestLevelTile(tilesOfType)

      if (!lowestTile) {
        throw new Error(`No ${event.industryType} tiles available`)
      }

      const result: Partial<GameState> = {
        selectedIndustryTile: lowestTile,
      }

      // If the selected card is a location card, auto-select the location
      if (
        context.selectedCard?.type === 'location' ||
        context.selectedCard?.type === 'wild_location'
      ) {
        const locationCard = context.selectedCard as LocationCard
        result.selectedLocation = locationCard.location
      }

      return result
    }),

    clearIndustryTile: assign({
      selectedIndustryTile: null,
    }),
    setPlayerHand: assign(({ context, event }) => {
      if (event.type !== 'TEST_SET_PLAYER_HAND') return {}

      const updatedPlayers = [...context.players]
      updatedPlayers[event.playerId] = {
        ...updatedPlayers[event.playerId]!,
        hand: event.hand,
      }

      return {
        players: updatedPlayers,
      }
    }),
  },
  guards: {
    hasActionsRemaining: ({ context }) => context.actionsRemaining > 0,
    hasSelectedCard: ({ context }) => context.selectedCard !== null,
    isIndustryCard: ({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return false
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      return card?.type === 'industry' || card?.type === 'wild_industry'
    },
    isLocationCard: ({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return false
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      return card?.type === 'location' || card?.type === 'wild_location'
    },
    canCompleteBuild: ({ context }) => {
      // For location cards, just need card and location
      if (
        context.selectedCard?.type === 'location' ||
        context.selectedCard?.type === 'wild_location'
      ) {
        return (
          context.selectedCard !== null && context.selectedLocation !== null
        )
      }
      // For industry cards, need card, tile, and location
      return (
        context.selectedCard !== null &&
        context.selectedIndustryTile !== null &&
        context.selectedLocation !== null
      )
    },
    canScout: ({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      // Cannot scout if player already has wild cards in hand
      const hasWildCard = currentPlayer.hand.some(
        (card) =>
          card.type === 'wild_location' || card.type === 'wild_industry',
      )
      return context.selectedCardsForScout.length === 3 && !hasWildCard
    },
    hasSelectedLink: ({ context }) => context.selectedLink !== null,
    canBuildLink: ({ context, event }) => {
      if (event.type !== 'SELECT_LINK') return false

      // Check if any player already has a link on this connection
      const existingLink = context.players.some((player) =>
        player.links.some(
          (link) =>
            (link.from === event.from && link.to === event.to) ||
            (link.from === event.to && link.to === event.from),
        ),
      )

      if (existingLink) return false

      const currentPlayer = getCurrentPlayer(context)

      // Exception: If player has no industries or links on board, can build anywhere
      const hasNoTilesOnBoard =
        currentPlayer.industries.length === 0 &&
        currentPlayer.links.length === 0
      if (hasNoTilesOnBoard) return true

      // Check if link is adjacent to player's network
      // A location is part of your network if:
      // 1. It contains one or more of your industry tiles
      // 2. It is adjacent to one or more of your link tiles

      const playerLocations = new Set<CityId>()

      // Add locations with player's industries
      currentPlayer.industries.forEach((industry) => {
        playerLocations.add(industry.location)
      })

      // Add locations adjacent to player's links
      currentPlayer.links.forEach((link) => {
        playerLocations.add(link.from)
        playerLocations.add(link.to)
      })

      // Check if either end of the new link is part of player's network
      return playerLocations.has(event.from) || playerLocations.has(event.to)
    },
    canSelectLocation: ({ context, event }) => {
      if (event.type !== 'SELECT_LOCATION') return false
      if (!context.selectedCard) return false

      // Wild location cards can select any location
      if (context.selectedCard.type === 'wild_location') return true

      // Location cards must match their specified location
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        return locationCard.location === event.cityId
      }

      // Industry and wild industry cards can select any location (for now)
      return true
    },
    canSelectIndustryType: ({ context, event }) => {
      if (event.type !== 'SELECT_INDUSTRY_TYPE') return false
      if (!context.selectedCard) return false

      // Check if player has tiles of this industry type available
      const player = getCurrentPlayer(context)
      const tilesOfType = player.industryTilesOnMat[event.industryType] || []
      const availableTiles = tilesOfType.filter((tile) => {
        if (context.era === 'canal') return tile.canBuildInCanalEra
        if (context.era === 'rail') return tile.canBuildInRailEra
        return false
      })

      return availableTiles.length > 0
    },
    isLocationCardSelected: ({ context }) => {
      return (
        context.selectedCard?.type === 'location' ||
        context.selectedCard?.type === 'wild_location'
      )
    },
  },
}).createMachine({
  id: 'brassGame',
  context: {
    players: [],
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 1,
    resources: {
      coal: 24,
      iron: 10,
      beer: 24,
    },
    coalMarket: [],
    ironMarket: [],
    logs: [],
    drawPile: [],
    discardPile: [],
    wildLocationPile: [],
    wildIndustryPile: [],
    selectedCard: null,
    selectedCardsForScout: [],
    spentMoney: 0,
    selectedLink: null,
    selectedLocation: null,
    selectedIndustryTile: null,
  },
  initial: 'setup',
  states: {
    setup: {
      on: {
        START_GAME: {
          target: 'playing',
          actions: 'initializeGame',
          guard: ({ event }) =>
            event.type === 'START_GAME' &&
            event.players.length >= 2 &&
            event.players.length <= 4,
        },
      },
    },
    playing: {
      initial: 'action',
      on: {
        TEST_SET_PLAYER_HAND: {
          actions: 'setPlayerHand',
        },
      },
      states: {
        action: {
          initial: 'selectingAction',
          states: {
            selectingAction: {
              on: {
                BUILD: 'building',
                DEVELOP: 'developing',
                SELL: 'selling',
                SCOUT: 'scouting',
                TAKE_LOAN: 'takingLoan',
                NETWORK: 'networking',
                PASS: 'passing',
              },
            },
            building: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: [
                      {
                        target: 'selectingIndustryType',
                        actions: 'selectCard',
                        guard: 'isLocationCard',
                      },
                      {
                        target: 'selectingLocation',
                        actions: 'selectCard',
                        guard: 'isIndustryCard',
                      },
                      {
                        target: 'selectingIndustryType',
                        actions: 'selectCard',
                      },
                    ],
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                selectingIndustryType: {
                  on: {
                    SELECT_INDUSTRY_TYPE: [
                      {
                        target: 'confirmingBuild',
                        actions: 'selectIndustryType',
                        guard: 'isLocationCardSelected',
                      },
                      {
                        target: 'selectingLocation',
                        actions: 'selectIndustryType',
                        guard: 'canSelectIndustryType',
                      },
                    ],
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearCard',
                    },
                  },
                },
                selectingLocation: {
                  on: {
                    SELECT_LOCATION: {
                      target: 'confirmingBuild',
                      actions: 'selectLocation',
                      guard: 'canSelectLocation',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearCard',
                    },
                  },
                },
                confirmingBuild: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeBuildAction',
                      guard: 'canCompleteBuild',
                    },
                    CANCEL: {
                      target: 'selectingLocation',
                      actions: 'clearLocation',
                    },
                  },
                },
              },
            },
            developing: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingDevelop',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingDevelop: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeDevelopAction',
                      guard: 'hasSelectedCard',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
                    },
                  },
                },
              },
            },
            selling: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingSell',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingSell: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeSellAction',
                      guard: 'hasSelectedCard',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
                    },
                  },
                },
              },
            },
            scouting: {
              initial: 'selectingCards',
              states: {
                selectingCards: {
                  on: {
                    SELECT_CARD: {
                      actions: 'selectCardForScout',
                    },
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeScoutAction',
                      guard: 'canScout',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
              },
            },
            takingLoan: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingLoan',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingLoan: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeLoanAction',
                      guard: 'hasSelectedCard',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
                    },
                  },
                },
              },
            },
            networking: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'selectingLink',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                selectingLink: {
                  on: {
                    SELECT_LINK: {
                      target: 'confirmingLink',
                      actions: 'selectLink',
                      guard: 'canBuildLink',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingLink: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeNetworkAction',
                      guard: 'hasSelectedLink',
                    },
                    CANCEL: {
                      target: 'selectingLink',
                      actions: 'clearSelections',
                    },
                  },
                },
              },
            },
            passing: {
              entry: 'executePassAction',
              always: {
                target: '#brassGame.playing.actionComplete',
              },
            },
          },
        },
        actionComplete: {
          entry: 'refillPlayerHand',
          always: [
            {
              guard: 'hasActionsRemaining',
              target: 'action',
            },
            {
              target: 'nextPlayer',
            },
          ],
        },
        nextPlayer: {
          entry: 'nextPlayer',
          always: {
            target: 'action',
          },
        },
      },
    },
  },
})
