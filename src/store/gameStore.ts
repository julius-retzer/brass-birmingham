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
  // Resource markets
  coalMarket: (number | null)[] // Prices for coal, null means empty slot
  ironMarket: (number | null)[] // Prices for iron, null means empty slot
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
  updatedCoalMarket: (number | null)[]
  coalCost: number
  logDetails: string[]
} {
  let coalConsumed = 0
  let coalCost = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  let updatedCoalMarket = [...context.coalMarket]

  const currentPlayer = getCurrentPlayer(context)

  // First, try to consume from connected coal mines (free)
  const connectedCoalMines = findConnectedCoalMines(context, location, currentPlayer)
  
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

  // If still need coal, consume from coal market
  while (coalConsumed < coalRequired) {
    let foundCoal = false
    
    for (let i = 0; i < updatedCoalMarket.length; i++) {
      if (updatedCoalMarket[i] !== null) {
        coalCost += updatedCoalMarket[i] as number
        updatedCoalMarket[i] = null
        coalConsumed++
        logDetails.push(`consumed 1 coal from market for £${updatedCoalMarket[i]}`)
        foundCoal = true
        break
      }
    }
    
    // If market is empty, can still buy for £8
    if (!foundCoal) {
      coalCost += 8
      coalConsumed++
      logDetails.push(`consumed 1 coal from general supply for £8`)
    }
  }

  return { updatedPlayers, updatedCoalMarket, coalCost, logDetails }
}

function consumeIronFromSources(
  context: GameState,
  ironRequired: number,
): {
  updatedPlayers: Player[]
  updatedIronMarket: (number | null)[]
  ironCost: number
  logDetails: string[]
} {
  let ironConsumed = 0
  let ironCost = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  let updatedIronMarket = [...context.ironMarket]

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

  // If still need iron, consume from iron market
  while (ironConsumed < ironRequired) {
    let foundIron = false
    
    for (let i = 0; i < updatedIronMarket.length; i++) {
      if (updatedIronMarket[i] !== null) {
        ironCost += updatedIronMarket[i] as number
        updatedIronMarket[i] = null
        ironConsumed++
        logDetails.push(`consumed 1 iron from market for £${updatedIronMarket[i]}`)
        foundIron = true
        break
      }
    }
    
    // If market is empty, can still buy for £6
    if (!foundIron) {
      ironCost += 6
      ironConsumed++
      logDetails.push(`consumed 1 iron from general supply for £6`)
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

// Helper function to sell resources to market (most expensive spaces first)
function sellResourcesToMarket(
  market: (number | null)[],
  cubesAvailable: number,
  resourceType: 'coal' | 'iron'
): {
  updatedMarket: (number | null)[]
  cubesSold: number
  income: number
  logDetails: string[]
} {
  const updatedMarket = [...market]
  const logDetails: string[] = []
  let cubesSold = 0
  let income = 0
  
  // Sell to most expensive spaces first (iterate from right to left)
  for (let i = updatedMarket.length - 1; i >= 0 && cubesSold < cubesAvailable; i--) {
    if (updatedMarket[i] === null) {
      // Space is empty, can sell here
      const price = getMarketPrice(i, resourceType)
      updatedMarket[i] = 1 // Place a cube marker (could be any non-null value)
      income += price
      cubesSold++
      logDetails.push(`sold 1 ${resourceType} to market for £${price}`)
    }
  }
  
  return {
    updatedMarket,
    cubesSold,
    income,
    logDetails
  }
}

// Helper function to get market price for a given position
function getMarketPrice(position: number, resourceType: 'coal' | 'iron'): number {
  // Market prices based on position (leftmost = cheapest, rightmost = most expensive)
  // Coal: [null, 1, 2, 3, 4] - position 0=£1, 1=£1, 2=£2, 3=£3, 4=£4
  // Iron: [1, 1, 2, 3, 4] - position 0=£1, 1=£1, 2=£2, 3=£3, 4=£4
  const coalPrices = [1, 1, 2, 3, 4]
  const ironPrices = [1, 1, 2, 3, 4]
  
  if (resourceType === 'coal') {
    return coalPrices[position] || 1
  } else {
    return ironPrices[position] || 1
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
  let updatedResources = { ...context.resources }

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

      // Deal 8 cards to each player
      const hands: Card[][] = []
      let currentIndex = 0
      for (let i = 0; i < playerCount; i++) {
        hands.push(shuffledCards.slice(currentIndex, currentIndex + 8))
        currentIndex += 8
      }

      // Initialize players with starting money, income, hands, and industry tiles
      const players: Player[] = event.players.map((playerData, index) => ({
        ...playerData,
        money: 17, // Starting money per rules
        income: 10,
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
        actionsRemaining: 1, // First round only has 1 action
        resources: {
          coal: 24,
          iron: 24,
          beer: 24,
        },
        // Initialize markets based on player count (2-player setup)
        coalMarket: [null, 1, 2, 3, 4], // One £1 space empty initially
        ironMarket: [1, 1, 2, 3, 4], // Both £1 spaces filled initially
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
      if (!alreadySelected && context.selectedCardsForScout.length < 3) {
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
        money: currentPlayer.money + 30,
        income: Math.max(-10, currentPlayer.income - 3), // Cannot go below -10 per rules
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
            `${currentPlayer.name} took a loan (£30, -3 income) using ${context.selectedCard.id}`,
            'action',
          ),
        ],
      }
    }),

    executeBuildAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)

      // Validate required selections
      if (!context.selectedCard) {
        throw new Error('No card selected for build action')
      }
      if (!context.selectedLocation) {
        throw new Error('No location selected for build action')
      }

      // Validate card type
      const validCardTypes = [
        'location',
        'industry',
        'wild_location',
        'wild_industry',
      ]
      if (!validCardTypes.includes(context.selectedCard.type)) {
        throw new Error(
          `Invalid card type for build action: ${context.selectedCard.type}. Only Location, Industry, or Wild cards can be used.`,
        )
      }

      // Validate card-location matching (except for wild cards)
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        if (locationCard.location !== context.selectedLocation) {
          throw new Error(
            `Location card mismatch: card specifies ${locationCard.location}, but selected location is ${context.selectedLocation}`,
          )
        }
      }

      // Validate card-industry matching (except for wild cards)
      if (
        context.selectedCard.type === 'industry' &&
        context.selectedIndustryTile
      ) {
        const industryCard = context.selectedCard as IndustryCard
        const tile = context.selectedIndustryTile
        if (!industryCard.industries.includes(tile.type)) {
          throw new Error(
            `Industry card mismatch: card allows ${industryCard.industries.join(', ')}, but selected tile type is ${tile.type}`,
          )
        }
      }

      // For industry cards, validate industry tile selection
      if (
        context.selectedCard.type === 'industry' &&
        !context.selectedIndustryTile
      ) {
        throw new Error('Industry card requires industry tile selection')
      }

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )

      let updatedPlayer = { ...currentPlayer, hand: updatedHand }
      let cost = 0
      let logMessage = `${currentPlayer.name} built`
      let updatedCoalMarket = [...context.coalMarket]
      let updatedIronMarket = [...context.ironMarket]
      let updatedPlayersFromResources = context.players // Initialize outside the block

      // Handle industry building (when tile is selected)
      if (context.selectedIndustryTile) {
        const tile = context.selectedIndustryTile

        // Validate tile can be built in current era
        if (context.era === 'canal' && !tile.canBuildInCanalEra) {
          throw new Error(
            `Cannot build ${tile.type} Level ${tile.level} in Canal Era`,
          )
        }
        if (context.era === 'rail' && !tile.canBuildInRailEra) {
          throw new Error(
            `Cannot build ${tile.type} Level ${tile.level} in Rail Era`,
          )
        }

        cost = tile.cost

        // Consume required resources using enhanced resource consumption logic
        let coalCost = 0
        let ironCost = 0
        const resourceLogDetails: string[] = []

        // Consume coal if required
        if (tile.coalRequired > 0) {
          const coalResult = consumeCoalFromSources(
            { ...context, players: updatedPlayersFromResources },
            context.selectedLocation,
            tile.coalRequired,
          )
          coalCost = coalResult.coalCost
          updatedPlayersFromResources = coalResult.updatedPlayers
          updatedCoalMarket.splice(0, updatedCoalMarket.length, ...coalResult.updatedCoalMarket)
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
          updatedIronMarket.splice(0, updatedIronMarket.length, ...ironResult.updatedIronMarket)
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
        let newIndustry = {
          location: context.selectedLocation,
          type: tile.type,
          level: tile.level,
          flipped: false,
          tile: tile,
          coalCubesOnTile: tile.coalProduced, // Place coal cubes if this is a coal mine
          ironCubesOnTile: tile.ironProduced, // Place iron cubes if this is an iron works
          beerBarrelsOnTile: tile.type === 'brewery' 
            ? (context.era === 'canal' ? tile.beerProduced : tile.beerProduced * 2)
            : 0, // Place beer barrels if this is a brewery (2x in Rail Era)
        }

        // Automatic market selling per Brass Birmingham rules
        let marketIncome = 0
        let marketLogDetails: string[] = []
        
        if (tile.type === 'coal') {
          // Coal mines: sell to market only if connected to merchant
          const isConnectedToMerchant = isLocationConnectedToMerchant(context.selectedLocation!)
          if (isConnectedToMerchant && newIndustry.coalCubesOnTile > 0) {
            const sellResult = sellResourcesToMarket(updatedCoalMarket, newIndustry.coalCubesOnTile, 'coal')
            updatedCoalMarket = sellResult.updatedMarket
            marketIncome += sellResult.income
            marketLogDetails.push(...sellResult.logDetails)
            newIndustry.coalCubesOnTile -= sellResult.cubesSold
            
            // If all cubes sold, flip tile and advance income
            if (newIndustry.coalCubesOnTile === 0) {
              newIndustry.flipped = true
              // Income will be advanced after player update
            }
          }
        } else if (tile.type === 'iron') {
          // Iron works: ALWAYS sell to market regardless of connection
          if (newIndustry.ironCubesOnTile > 0) {
            const sellResult = sellResourcesToMarket(updatedIronMarket, newIndustry.ironCubesOnTile, 'iron')
            updatedIronMarket = sellResult.updatedMarket
            marketIncome += sellResult.income
            marketLogDetails.push(...sellResult.logDetails)
            newIndustry.ironCubesOnTile -= sellResult.cubesSold
            
            // If all cubes sold, flip tile and advance income
            if (newIndustry.ironCubesOnTile === 0) {
              newIndustry.flipped = true
              // Income will be advanced after player update
            }
          }
        }

        // Remove tile from player's mat
        const updatedTilesOnMat = { ...currentPlayer.industryTilesOnMat }
        const tileType = tile.type
        if (updatedTilesOnMat[tileType]) {
          updatedTilesOnMat[tileType] = updatedTilesOnMat[tileType].filter(
            (t) => t.id !== tile.id,
          )
        }

        // Update the current player with building costs and new industry
        // But first get their updated state from resource consumption
        const currentPlayerFromResources = updatedPlayersFromResources[context.currentPlayerIndex]!
        // Update player money: subtract costs, add market income, advance income if tile flipped
        let finalMoney = currentPlayerFromResources.money - totalCost + marketIncome
        let finalIncome = currentPlayerFromResources.income
        
        if (newIndustry.flipped) {
          finalIncome += newIndustry.tile.incomeSpaces
        }
        
        updatedPlayer = {
          ...currentPlayerFromResources,
          hand: updatedHand,
          money: finalMoney,
          income: finalIncome,
          industries: [...currentPlayerFromResources.industries, newIndustry],
          industryTilesOnMat: updatedTilesOnMat,
        }

        // Update resource consumption and market selling logging
        const resourceString = resourceLogDetails.length > 0
          ? ` (consumed ${resourceLogDetails.join(', ')})`
          : ''
        
        const marketString = marketLogDetails.length > 0
          ? ` (${marketLogDetails.join(', ')})`
          : ''
        
        const incomeString = newIndustry.flipped
          ? ` (tile flipped, +${newIndustry.tile.incomeSpaces} income)`
          : ''

        logMessage = `${currentPlayer.name} built ${tile.type} Level ${tile.level} at ${context.selectedLocation} for £${totalCost}${resourceString}${marketString}${incomeString} using ${getCardDescription(context.selectedCard)}`
      } else {
        // Handle location card building (simplified - no specific industry placement)
        logMessage = `${currentPlayer.name} built at ${context.selectedLocation} using ${getCardDescription(context.selectedCard)}`
      }

      debugLog('executeBuildAction', context)
      const result: Partial<GameState> = {
        players: updatePlayerInList(
          updatedPlayersFromResources,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        selectedCard: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [...context.logs, createLogEntry(logMessage, 'action')],
      }

      // Update resource markets if they were modified (consumption OR selling)
      if (context.selectedIndustryTile) {
        if (context.selectedIndustryTile.coalRequired > 0 || context.selectedIndustryTile.type === 'coal') {
          result.coalMarket = updatedCoalMarket
        }
        if (context.selectedIndustryTile.ironRequired > 0 || context.selectedIndustryTile.type === 'iron') {
          result.ironMarket = updatedIronMarket
        }
      }

      return result
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
      // Rail era can build 1 link for £5 or 2 links for £15 (with beer consumption)
      // For now, implement single link logic - double link will be separate action/choice
      const linkCost = context.era === 'canal' ? 3 : 5

      const newLink = {
        from: context.selectedLink.from,
        to: context.selectedLink.to,
        type: context.era,
      }

      let coalCost = 0
      const updatedCoalMarket = [...context.coalMarket]
      let logMessage = `${currentPlayer.name} built a ${context.era} link between ${context.selectedLink.from} and ${context.selectedLink.to}`

      // Consume coal if rail era
      if (context.era === 'rail') {
        // In a full implementation, we would first check for connected coal mines
        // For now, consume from coal market (cheapest first)
        let coalFromMarket = 0

        // Find cheapest available coal slot and consume from it
        for (let i = 0; i < updatedCoalMarket.length; i++) {
          if (updatedCoalMarket[i] !== null && coalFromMarket < 1) {
            coalCost += updatedCoalMarket[i] as number
            updatedCoalMarket[i] = null // Mark slot as empty
            coalFromMarket++
            break // Only consume 1 coal for rail link
          }
        }

        // If market is empty, can still purchase coal for £8 per piece per rules
        if (coalFromMarket < 1) {
          coalCost += 8 // £8 per coal when market is empty
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
      const currentPlayerAfterIron = updatedPlayersFromIron[context.currentPlayerIndex]!
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
      const beerResult = consumeBeerFromSources(context, sellLocation, beerRequired)
      const updatedPlayersFromBeer = beerResult.updatedPlayers
      const updatedResources = beerResult.updatedResources

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )
      
      // Get the current player's updated state after beer consumption
      const currentPlayerAfterBeer = updatedPlayersFromBeer[context.currentPlayerIndex]!
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
      if (context.selectedCardsForScout.length !== 3) {
        throw new Error('Scout action requires exactly 3 cards to be selected')
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
      const cardsNeeded = 8 - currentPlayer.hand.length

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
        ? 1
        : 2

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
      iron: 24,
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
