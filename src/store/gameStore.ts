import { type Actor, StateFrom, assign, setup } from 'xstate'
import { type CityId } from '../data/board'
import {
  type Card,
  type IndustryCard,
  type IndustryType,
  type LocationCard,
  type WildIndustryCard,
  type WildLocationCard,
  getInitialCards,
} from '../data/cards'
import {
  type IndustryTile,
  type IndustryTileWithQuantity,
  getInitialPlayerIndustryTiles,
  getInitialPlayerIndustryTilesWithQuantities,
  getLowestLevelTile,
  getLowestAvailableTile,
  decrementTileQuantity,
} from '../data/industryTiles'
import {
  buildIndustryTile,
  validateBuildActionSelections,
  validateCardIndustryMatching,
  validateCardLocationMatching,
  validateCardType,
  validateIndustrySlotAvailability,
  validateNetworkRequirement,
  validateTileEraCompatibility,
  // Non-throwing validation functions
  validateBuildActionSelectionsResult,
  validateIndustrySlotAvailabilityResult,
  validateNetworkRequirementResult,
  type ValidationResult,
} from './build/buildActions'
import { GAME_CONSTANTS } from './constants'
import {
  consumeBeerFromSources,
  consumeCoalFromSources,
  consumeIronFromSources,
} from './market/marketActions'
import {
  calculateNetworkDistance,
  checkAndFlipIndustryTilesLogic,
  createLogEntry,
  debugLog,
  drawCards,
  findAvailableBreweries,
  findCardInHand,
  getCardDescription,
  getCurrentPlayer,
  isFirstRound,
  isLocationInPlayerNetwork,
  removeCardFromHand,
  shuffleArray,
  updatePlayerInList,
  validateIndustryBuildLocation,
  canCityAccommodateIndustryType,
} from './shared/gameUtils'

export type LogEntryType = 'system' | 'action' | 'info' | 'error'

export interface LogEntry {
  message: string
  type: LogEntryType
  timestamp: Date
}

export interface Link {
  from: CityId
  to: CityId
  type: 'canal' | 'rail'
}

export interface Merchant {
  location: CityId
  industryIcons: IndustryType[]
  bonusType: 'develop' | 'income' | 'victoryPoints' | 'money'
  bonusValue: number
  hasBeer: boolean
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
  // Industry tiles on player mat (available to build) - now with quantities
  industryTilesOnMat: Record<IndustryType, IndustryTileWithQuantity[]>
  // Built items on board
  links: Link[]
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
  // Round management state
  playerSpending: Record<string, number> // Track spending per player per round
  turnOrder: string[] // Player IDs in turn order (updated each round based on spending)
  isFinalRound: boolean
  // Network-related state
  selectedLink: {
    from: CityId
    to: CityId
  } | null
  selectedSecondLink: {
    from: CityId
    to: CityId
  } | null
  // Building-related state
  selectedLocation: CityId | null
  selectedIndustryTile: IndustryTile | null
  // Develop-related state
  selectedTilesForDevelop: IndustryType[]
  // Merchant system
  merchants: Merchant[]
  // Error state
  lastError: string | null
  errorContext: 'build' | 'network' | 'develop' | 'sell' | 'scout' | null
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
      type: 'SELECT_SECOND_LINK'
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
      type: 'SELECT_TILES_FOR_DEVELOP'
      industryTypes: IndustryType[]
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
      type: 'CHOOSE_DOUBLE_LINK_BUILD'
    }
  | {
      type: 'EXECUTE_DOUBLE_NETWORK_ACTION'
    }
  | {
      type: 'CHECK_INDUSTRY_FLIPPING'
    }
  | {
      type: 'TEST_SET_PLAYER_HAND'
      playerId: number
      hand: Card[]
    }
  | {
      type: 'TEST_SET_ERA'
      era: 'canal' | 'rail'
    }
  | {
      type: 'TEST_SET_PLAYER_STATE'
      playerId: number
      money?: number
      income?: number
      industries?: Player['industries']
    }
  | {
      type: 'TEST_SET_FINAL_ROUND'
      isFinalRound: boolean
    }
  | {
      type: 'TEST_SET_ERA_END_CONDITIONS'
      drawPile: Card[]
      allPlayersHandsEmpty: boolean
    }
  | {
      type: 'TEST_SET_DRAW_PILE'
      drawPile: Card[]
    }
  | {
      type: 'TRIGGER_ERA_SCORING'
    }
  | {
      type: 'TRIGGER_CANAL_ERA_END'
    }
  | {
      type: 'TRIGGER_RAIL_ERA_END'
    }
  | {
      type: 'CLEAR_ERROR'
    }
  | {
      type: 'SET_ERROR'
      message: string
      context: 'build' | 'network' | 'develop' | 'sell' | 'scout'
    }

export type GameStore = typeof gameStore
export type GameStoreSnapshot = StateFrom<typeof gameStore>
export type GameStoreSend = Actor<typeof gameStore>['send']
export type GameStoreActor = Actor<typeof gameStore>

// Helper function to create merchants based on player count
const createMerchantsForPlayerCount = (playerCount: number): Merchant[] => {
  const merchants: Merchant[] = []

  // Base merchants for all player counts (2+)
  merchants.push(
    {
      location: 'warrington' as CityId,
      industryIcons: ['cotton', 'manufacturer', 'pottery'] as IndustryType[],
      bonusType: 'money',
      bonusValue: 5,
      hasBeer: true,
    },
    {
      location: 'gloucester' as CityId,
      industryIcons: ['cotton', 'manufacturer', 'pottery'] as IndustryType[],
      bonusType: 'develop',
      bonusValue: 1,
      hasBeer: true,
    },
  )

  // Add Oxford for 3+ players
  if (playerCount >= 3) {
    merchants.push({
      location: 'oxford' as CityId,
      industryIcons: ['cotton', 'manufacturer', 'pottery'] as IndustryType[],
      bonusType: 'income',
      bonusValue: 2,
      hasBeer: true,
    })
  }

  // Add Nottingham and Shrewsbury for 4 players
  if (playerCount >= 4) {
    merchants.push(
      {
        location: 'nottingham' as CityId,
        industryIcons: ['cotton', 'manufacturer', 'pottery'] as IndustryType[],
        bonusType: 'victoryPoints',
        bonusValue: 2,
        hasBeer: true,
      },
      {
        location: 'shrewsbury' as CityId,
        industryIcons: ['cotton', 'manufacturer', 'pottery'] as IndustryType[],
        bonusType: 'victoryPoints',
        bonusValue: 2,
        hasBeer: true,
      },
    )
  }

  return merchants
}

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
        hands.push(
          shuffledCards.slice(
            currentIndex,
            currentIndex + GAME_CONSTANTS.STARTING_HAND_SIZE,
          ),
        )
        currentIndex += GAME_CONSTANTS.STARTING_HAND_SIZE
      }

      // Initialize players with starting money, income, hands, and industry tiles
      const players: Player[] = event.players.map((playerData, index) => ({
        ...playerData,
        money: GAME_CONSTANTS.STARTING_MONEY,
        income: GAME_CONSTANTS.STARTING_INCOME,
        victoryPoints: 0,
        hand: hands[index] ?? [],
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
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
        playerSpending: {},
        turnOrder: players.map((p) => p.id), // Initial turn order
        isFinalRound: false,
        selectedLink: null,
        selectedSecondLink: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        selectedTilesForDevelop: [],
        merchants: createMerchantsForPlayerCount(playerCount),
        lastError: null,
        errorContext: null,
      }
    }),

    selectCard: assign(({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return {}
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      debugLog('selectCard', context, event)
      
      const result: Partial<GameState> = {
        selectedCard: card,
      }
      
      // If the selected card is an industry card, auto-select the lowest tile of that industry type
      if (card?.type === 'industry') {
        const industryCard = card as IndustryCard
        
        // Find the first industry type from the card that the player has tiles for
        for (const industryType of industryCard.industries) {
          const tilesWithQuantity = player.industryTilesOnMat[industryType] || []
          const availableTiles = tilesWithQuantity
            .filter(t => t.quantityAvailable > 0)
            .map(t => t.tile)
            .filter((tile) => {
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

    selectCardForScout: assign(({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return {}
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      if (!card) return {}

      // Add card to scout selection if not already selected and we have less than 3
      const alreadySelected = context.selectedCardsForScout.some(
        (c) => c.id === card.id,
      )
      if (
        !alreadySelected &&
        context.selectedCardsForScout.length <
          GAME_CONSTANTS.MAX_SCOUT_SELECTION
      ) {
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
        income: Math.max(
          GAME_CONSTANTS.MIN_INCOME,
          currentPlayer.income - GAME_CONSTANTS.LOAN_INCOME_PENALTY,
        ),
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

      // Run validations using non-throwing functions for recoverable errors
      const validationChecks: ValidationResult[] = [
        validateBuildActionSelectionsResult(context),
        validateNetworkRequirementResult(context),
        validateIndustrySlotAvailabilityResult(context),
      ]

      // Check if any validation failed
      const failedValidation = validationChecks.find(check => !check.isValid)
      if (failedValidation) {
        return {
          lastError: failedValidation.errorMessage || 'Validation failed',
          errorContext: failedValidation.errorContext || 'build' as const,
        }
      }

      // Validations passed, proceed with build action

      // Still need to run the throwing validations for card type and matching
      // These are less likely to fail and don't involve async state machine issues
      try {
        validateCardType(context.selectedCard!)
        validateCardLocationMatching(
          context.selectedCard!,
          context.selectedLocation!,
        )
        validateCardIndustryMatching(
          context.selectedCard!,
          context.selectedIndustryTile,
        )
      } catch (error) {
        return {
          lastError: error instanceof Error ? error.message : 'Card validation failed',
          errorContext: 'build' as const,
        }
      }

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

        const buildResult = buildIndustryTile(
          context,
          currentPlayer,
          tile,
          updatedHand,
        )
        updatedPlayer = buildResult.updatedPlayer
        updatedCoalMarket = buildResult.updatedCoalMarket
        updatedIronMarket = buildResult.updatedIronMarket
        logMessage = buildResult.logMessage

        // Track money spent (totalCost = tile cost + coal cost + iron cost - market income)
        const totalCost = buildResult.totalCost
        const currentSpending = context.playerSpending[currentPlayer.id] || 0

        // Use the updated players list from the build result
        let playersAfterBuild = updatePlayerInList(
          buildResult.updatedPlayers,
          context.currentPlayerIndex,
          updatedPlayer,
        )

        // Check for auto-flipping industries after resource consumption
        const contextAfterBuild = {
          ...context,
          players: playersAfterBuild,
          coalMarket: updatedCoalMarket,
          ironMarket: updatedIronMarket,
        }
        // Apply the checkAndFlipIndustryTiles logic manually
        const autoFlipContext = {
          ...contextAfterBuild,
          players: playersAfterBuild,
        }
        const autoFlipResult = checkAndFlipIndustryTilesLogic(autoFlipContext)
        if (autoFlipResult.players) {
          playersAfterBuild = autoFlipResult.players
        }

        const result: Partial<GameState> = {
          players: playersAfterBuild,
          discardPile: [...context.discardPile, context.selectedCard!],
          selectedCard: null,
          selectedLocation: null,
          selectedIndustryTile: null,
          actionsRemaining: context.actionsRemaining - 1,
          spentMoney: context.spentMoney + totalCost,
          playerSpending: {
            ...context.playerSpending,
            [currentPlayer.id]: currentSpending + totalCost,
          },
          // Clear errors since build was successful
          lastError: null,
          errorContext: null,
          logs: [
            ...context.logs,
            createLogEntry(logMessage, 'action'),
            ...(autoFlipResult.logs || []),
          ],
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
        console.warn(
          'executeNetworkAction called without selected card/link - skipping',
        )
        return {}
      }

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )
      // Rail era can build 1 link or 2 links (with beer consumption)
      // For now, implement single link logic - double link will be separate action/choice
      const linkCost =
        context.era === 'canal'
          ? GAME_CONSTANTS.CANAL_LINK_COST
          : GAME_CONSTANTS.RAIL_LINK_COST

      const newLink = {
        from: context.selectedLink.from,
        to: context.selectedLink.to,
        type: context.era,
      }

      let coalCost = 0
      let coalResult: ReturnType<typeof consumeCoalFromSources> | null = null
      const updatedCoalMarket = context.coalMarket.map((level) => ({
        ...level,
      }))
      let logMessage = `${currentPlayer.name} built a ${context.era} link between ${context.selectedLink.from} and ${context.selectedLink.to}`

      // Consume coal if rail era
      if (context.era === 'rail') {
        coalResult = consumeCoalFromSources(
          context,
          context.selectedLink.from, // Use the source of the link
          1
        )
        
        if (!coalResult.success) {
          throw new Error(
            coalResult.errorMessage || 'Cannot build rail link: no coal available'
          )
        }
        
        coalCost = coalResult.coalCost
        // Apply coal market changes
        for (let i = 0; i < updatedCoalMarket.length; i++) {
          updatedCoalMarket[i] = coalResult.updatedCoalMarket[i]!
        }
        
        logMessage += ` (${coalResult.logDetails.join(', ')})`
      }

      const totalCost = linkCost + coalCost
      
      // Get player state after coal consumption, if any
      const playerAfterCoal = context.era === 'rail' && coalResult ? 
        coalResult.updatedPlayers[context.currentPlayerIndex]! : 
        currentPlayer
      
      const updatedPlayer = {
        ...playerAfterCoal,
        hand: updatedHand,
        money: playerAfterCoal.money - totalCost,
        links: [...playerAfterCoal.links, newLink],
      }

      // Track money spent
      const currentSpending = context.playerSpending[currentPlayer.id] || 0

      debugLog('executeNetworkAction', context)
      return {
        players: updatePlayerInList(
          coalResult ? coalResult.updatedPlayers : context.players,
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
        spentMoney: context.spentMoney + totalCost,
        playerSpending: {
          ...context.playerSpending,
          [currentPlayer.id]: currentSpending + totalCost,
        },
        logs: [...context.logs, createLogEntry(logMessage, 'action')],
      }
    }),

    selectSecondLink: assign(({ context, event }) => {
      if (event.type !== 'SELECT_SECOND_LINK') return {}
      debugLog('selectSecondLink', context, event)
      return {
        selectedSecondLink: {
          from: event.from,
          to: event.to,
        },
      }
    }),

    clearSecondLink: assign({
      selectedSecondLink: null,
    }),

    setError: assign(({ context, event }) => {
      if (event.type !== 'SET_ERROR') return {}
      return {
        lastError: event.message,
        errorContext: event.context,
      }
    }),

    clearError: assign({
      lastError: null,
      errorContext: null,
    }),

    executeDoubleNetworkAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (
        !context.selectedCard ||
        !context.selectedLink ||
        !context.selectedSecondLink
      ) {
        throw new Error('Card or links not selected for double network action')
      }

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )

      // Double link building: £15 + 1 beer + 2 coal
      const linkCost = GAME_CONSTANTS.RAIL_DOUBLE_LINK_COST
      let totalCost = linkCost

      // CORRECT SEQUENCE per rules:
      // 1. Build first rail + consume first coal (closest)
      // 2. Build second rail + consume second coal (closest from new network state)  
      // 3. Consume beer (must be reachable from second rail)
      
      let updatedPlayersAfterCoal = [...context.players]
      let updatedCoalMarket = [...context.coalMarket]
      let coalCost = 0
      const coalLogDetails: string[] = []

      // Create first link
      const firstLink = {
        from: context.selectedLink.from,
        to: context.selectedLink.to,
        type: context.era as 'canal' | 'rail',
      }

      // Add first link to current player and consume first coal
      const playerWithFirstLink = {
        ...currentPlayer,
        links: [...currentPlayer.links, firstLink],
      }
      updatedPlayersAfterCoal = updatePlayerInList(
        updatedPlayersAfterCoal,
        context.currentPlayerIndex,
        playerWithFirstLink,
      )

      // Consume first coal (closest to first link)
      const firstCoalResult = consumeCoalFromSources(
        { ...context, players: updatedPlayersAfterCoal, coalMarket: updatedCoalMarket },
        context.selectedLink.from,
        1,
      )
      
      if (!firstCoalResult.success) {
        throw new Error(
          firstCoalResult.errorMessage || 'Failed to consume coal for first rail link'
        )
      }
      
      coalCost += firstCoalResult.coalCost
      updatedCoalMarket = firstCoalResult.updatedCoalMarket
      updatedPlayersAfterCoal = firstCoalResult.updatedPlayers
      coalLogDetails.push(...firstCoalResult.logDetails)

      // Create second link
      const secondLink = {
        from: context.selectedSecondLink.from,
        to: context.selectedSecondLink.to,
        type: context.era as 'canal' | 'rail',
      }

      // Add second link to current player and consume second coal
      const currentPlayerAfterFirstCoal = updatedPlayersAfterCoal[context.currentPlayerIndex]!
      const playerWithBothLinks = {
        ...currentPlayerAfterFirstCoal,
        links: [...currentPlayerAfterFirstCoal.links, secondLink],
      }
      updatedPlayersAfterCoal = updatePlayerInList(
        updatedPlayersAfterCoal,
        context.currentPlayerIndex,
        playerWithBothLinks,
      )

      // Consume second coal (closest to second link, considering new network state)
      const secondCoalResult = consumeCoalFromSources(
        { ...context, players: updatedPlayersAfterCoal, coalMarket: updatedCoalMarket },
        context.selectedSecondLink.from,
        1,
      )
      
      if (!secondCoalResult.success) {
        throw new Error(
          secondCoalResult.errorMessage || 'Failed to consume coal for second rail link'
        )
      }
      
      coalCost += secondCoalResult.coalCost
      updatedCoalMarket = secondCoalResult.updatedCoalMarket
      updatedPlayersAfterCoal = secondCoalResult.updatedPlayers
      coalLogDetails.push(...secondCoalResult.logDetails)

      // Now consume beer (must be reachable from second rail specifically)
      const beerResult = consumeBeerFromSources(
        { ...context, players: updatedPlayersAfterCoal },
        context.selectedSecondLink.to,
        1,
        false, // No merchant beer for Network actions
      )

      if (!beerResult.success) {
        throw new Error(
          beerResult.errorMessage ||
            'Beer consumption failed - no brewery reachable from second rail',
        )
      }

      totalCost += coalCost

      // Get final player state with beer consumption applied
      const finalPlayerAfterBeer = beerResult.updatedPlayers[context.currentPlayerIndex]!
      const updatedPlayer = {
        ...finalPlayerAfterBeer,
        hand: updatedHand,
        money: finalPlayerAfterBeer.money - totalCost,
      }

      // Track money spent
      const currentSpending = context.playerSpending[currentPlayer.id] || 0

      const logMessage = `${currentPlayer.name} built 2 rail links (${context.selectedLink.from}-${context.selectedLink.to}, ${context.selectedSecondLink.from}-${context.selectedSecondLink.to}) for £${linkCost} + beer + 2 coal (£${coalCost}) (${coalLogDetails.join(', ')})`

      debugLog('executeDoubleNetworkAction', context)
      return {
        players: updatePlayerInList(
          beerResult.updatedPlayers,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        coalMarket: updatedCoalMarket,
        resources: beerResult.updatedResources,
        selectedCard: null,
        selectedLink: null,
        selectedSecondLink: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        actionsRemaining: context.actionsRemaining - 1,
        spentMoney: context.spentMoney + totalCost,
        playerSpending: {
          ...context.playerSpending,
          [currentPlayer.id]: currentSpending + totalCost,
        },
        logs: [...context.logs, createLogEntry(logMessage, 'action')],
      }
    }),

    checkAndFlipIndustryTiles: assign(({ context }) => {
      const updatedPlayers = [...context.players]
      const logMessages: string[] = []

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
          } else if (
            industry.type === 'iron' &&
            industry.ironCubesOnTile === 0
          ) {
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
          logs: [
            ...context.logs,
            ...logMessages.map((msg) => createLogEntry(msg, 'info')),
          ],
        }
      }

      return {}
    }),

    executeDevelopAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        console.warn(
          'executeDevelopAction called without selected card - skipping',
        )
        return {}
      }

      // Remove selected tiles from player mat and consume iron
      let selectedIndustryTypes = context.selectedTilesForDevelop

      // If no tiles selected (for backward compatibility with tests), auto-select first available tile
      if (selectedIndustryTypes.length === 0) {
        const availableTypes: IndustryType[] = []
        for (const industryType of [
          'coal',
          'iron',
          'cotton',
          'pottery',
          'manufacturer',
          'brewery',
        ] as IndustryType[]) {
          const tilesWithQuantity =
            currentPlayer.industryTilesOnMat[industryType] || []
          const developableTiles = tilesWithQuantity
            .filter(t => t.quantityAvailable > 0)
            .map(t => t.tile)
            .filter(
              (tile) => industryType !== 'pottery' || !tile.hasLightbulbIcon,
            )
          if (developableTiles.length > 0) {
            availableTypes.push(industryType)
          }
        }
        selectedIndustryTypes = availableTypes.slice(0, 1) // Just pick first available for backward compatibility
      }

      const tilesRemoved = selectedIndustryTypes.length
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

      // Remove tiles from player mat
      const updatedIndustryTilesOnMat = {
        ...currentPlayerAfterIron.industryTilesOnMat,
      }

      for (const industryType of selectedIndustryTypes) {
        const tilesWithQuantity = updatedIndustryTilesOnMat[industryType] || []

        // Filter out pottery tiles with lightbulb and tiles with no quantity
        const developableTiles = tilesWithQuantity
          .filter(t => t.quantityAvailable > 0)
          .map(t => t.tile)
          .filter(
            (tile) => industryType !== 'pottery' || !tile.hasLightbulbIcon,
          )

        if (developableTiles.length > 0) {
          // Decrement quantity of the lowest level tile
          const lowestTile = getLowestLevelTile(developableTiles)
          if (lowestTile) {
            updatedIndustryTilesOnMat[industryType] = decrementTileQuantity(
              tilesWithQuantity,
              lowestTile
            )
          }
        }
      }

      const updatedPlayer = {
        ...currentPlayerAfterIron,
        hand: updatedHand,
        money: currentPlayerAfterIron.money - ironCost, // Pay for iron cost
        industryTilesOnMat: updatedIndustryTilesOnMat,
      }

      let playersAfterDevelop = updatePlayerInList(
        updatedPlayersFromIron,
        context.currentPlayerIndex,
        updatedPlayer,
      )

      // Check for auto-flipping industries after iron consumption
      const contextAfterDevelop = {
        ...context,
        players: playersAfterDevelop,
        ironMarket: updatedIronMarket,
      }
      const autoFlipResult = checkAndFlipIndustryTilesLogic(contextAfterDevelop)
      if (autoFlipResult.players) {
        playersAfterDevelop = autoFlipResult.players
      }

      debugLog('executeDevelopAction', context)
      return {
        players: playersAfterDevelop,
        discardPile: [...context.discardPile, context.selectedCard],
        ironMarket: updatedIronMarket,
        selectedCard: null,
        selectedTilesForDevelop: [],
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} developed (removed ${tilesRemoved} tile${tilesRemoved > 1 ? 's' : ''}, ${ironResult.logDetails.join(', ')}) using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
          ...(autoFlipResult.logs || []),
        ],
      }
    }),

    executeSellAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for sell action')
      }

      // Find sellable industries (cotton mill, manufacturer, pottery that are unflipped)
      const sellableIndustries = currentPlayer.industries.filter(
        (industry) =>
          !industry.flipped &&
          ['cotton', 'manufacturer', 'pottery'].includes(industry.type),
      )

      if (sellableIndustries.length === 0) {
        throw new Error('No sellable industries available')
      }

      // For now, sell the first available industry
      const industryToSell = sellableIndustries[0]!
      const sellLocation = industryToSell.location

      // Check if industry is connected to a merchant with matching icon
      const connectedMerchant = context.merchants.find((merchant) => {
        if (!merchant.industryIcons.includes(industryToSell.type)) {
          return false
        }

        // Check network connectivity between industry location and merchant
        const distance = calculateNetworkDistance(
          context,
          sellLocation,
          merchant.location,
        )
        return distance !== Infinity
      })

      if (!connectedMerchant) {
        return {
          ...context,
          logs: [
            ...context.logs,
            createLogEntry(
              `Cannot sell: No merchant connected with ${industryToSell.type} icon`,
              'error',
            ),
          ],
        }
      }

      // Consume beer (can use merchant beer for sell actions)
      const beerRequired = industryToSell.tile.beerRequired
      const beerResult = consumeBeerFromSources(
        context,
        sellLocation,
        beerRequired,
        true, // Allow merchant beer for sell actions
      )

      if (!beerResult.success) {
        // Cannot sell without required beer - return early with no changes
        debugLog('executeSellAction - insufficient beer', context)
        return {
          // No state changes - sell action fails silently
          logs: [
            ...context.logs,
            createLogEntry(
              `${currentPlayer.name} cannot sell ${industryToSell.type} at ${sellLocation} - insufficient beer (${beerResult.errorMessage})`,
              'error',
            ),
          ],
        }
      }

      // Flip the industry and advance income
      const updatedIndustries = currentPlayer.industries.map((industry) =>
        industry === industryToSell ? { ...industry, flipped: true } : industry,
      )

      const incomeAdvancement = industryToSell.tile.incomeAdvancement || 0
      const newIncome = Math.min(
        currentPlayer.income + incomeAdvancement,
        GAME_CONSTANTS.MAX_INCOME,
      )

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )

      // Apply merchant bonuses if merchant beer was consumed
      let updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
        industries: updatedIndustries,
        income: newIncome,
      }

      // Apply merchant bonuses
      for (const bonus of beerResult.merchantBonusesCollected) {
        switch (bonus.type) {
          case 'money':
            updatedPlayer.money += bonus.value
            break
          case 'income':
            updatedPlayer.income = Math.min(
              updatedPlayer.income + bonus.value,
              GAME_CONSTANTS.MAX_INCOME,
            )
            break
          case 'victoryPoints':
            updatedPlayer.victoryPoints += bonus.value
            break
          case 'develop':
            // Remove 1 of the lowest level tiles of any industry from Player Mat
            // RULE: Find lowest level tile (excluding pottery with lightbulb icon)
            let lowestLevel = Infinity
            let industryTypeToRemove: IndustryType | null = null

            for (const [industryType, tilesWithQuantity] of Object.entries(
              updatedPlayer.industryTilesOnMat,
            )) {
              for (const tileWithQty of tilesWithQuantity) {
                if (tileWithQty.quantityAvailable === 0) continue
                const tile = tileWithQty.tile
                
                // Skip pottery tiles with lightbulb icon
                if (tile.type === 'pottery' && tile.hasLightbulbIcon) {
                  continue
                }

                if (tile.level < lowestLevel) {
                  lowestLevel = tile.level
                  industryTypeToRemove = industryType as IndustryType
                }
              }
            }

            // Decrement quantity of the lowest level tile found
            if (industryTypeToRemove) {
              const tilesWithQuantity =
                updatedPlayer.industryTilesOnMat[industryTypeToRemove]
              const tileToRemove = tilesWithQuantity
                .filter(t => t.quantityAvailable > 0)
                .map(t => t.tile)
                .find(
                  (t) =>
                    t.level === lowestLevel &&
                    !(t.type === 'pottery' && t.hasLightbulbIcon),
                )

              if (tileToRemove) {
                updatedPlayer.industryTilesOnMat = {
                  ...updatedPlayer.industryTilesOnMat,
                  [industryTypeToRemove]: decrementTileQuantity(
                    tilesWithQuantity,
                    tileToRemove
                  ),
                }
              }
            }
            break
        }
      }

      // Get player state after beer consumption and merge with sell updates
      const playerFromBeer =
        beerResult.updatedPlayers[context.currentPlayerIndex]!

      // Update the industries from beer consumption with the flipped industry
      const finalIndustries = playerFromBeer.industries.map((industry) =>
        industry === industryToSell ? { ...industry, flipped: true } : industry,
      )

      updatedPlayer = {
        ...playerFromBeer, // Start with beer consumption changes
        ...updatedPlayer, // Apply sell-specific updates (hand, income, bonuses)
        industries: finalIndustries, // Use properly merged industries
      }

      let playersAfterSell = updatePlayerInList(
        beerResult.updatedPlayers,
        context.currentPlayerIndex,
        updatedPlayer,
      )

      // Check for auto-flipping industries after beer consumption
      const contextAfterSell = {
        ...context,
        players: playersAfterSell,
        resources: beerResult.updatedResources,
        merchants: beerResult.updatedMerchants || context.merchants,
      }
      const autoFlipResult = checkAndFlipIndustryTilesLogic(contextAfterSell)
      if (autoFlipResult.players) {
        playersAfterSell = autoFlipResult.players
      }

      const result: Partial<GameState> = {
        players: playersAfterSell,
        discardPile: [...context.discardPile, context.selectedCard],
        resources: beerResult.updatedResources,
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} sold ${industryToSell.type} at ${sellLocation} (flipped, income +${incomeAdvancement}, ${beerResult.logDetails.join(', ')}) using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
          ...(autoFlipResult.logs || []),
        ],
      }

      // Update merchants if merchant beer was consumed
      if (beerResult.updatedMerchants) {
        result.merchants = beerResult.updatedMerchants
      }

      return result
    }),

    executeScoutAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (
        context.selectedCardsForScout.length !==
        GAME_CONSTANTS.SCOUT_CARDS_REQUIRED
      ) {
        throw new Error(
          `Scout action requires exactly ${GAME_CONSTANTS.SCOUT_CARDS_REQUIRED} cards to be selected`,
        )
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

      // For Claude: We actually need to let user selet a card to discard
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
      const cardsNeeded =
        GAME_CONSTANTS.STARTING_HAND_SIZE - currentPlayer.hand.length

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

      let updatedPlayers = [...context.players]
      let updatedPlayerSpending = { ...context.playerSpending }
      let finalPlayerIndex = nextPlayerIndex
      const newTurnOrder = context.turnOrder
      const logs = [...context.logs]

      // If round is complete, handle end of round logic
      if (isRoundComplete) {
        // 1. Determine turn order for next round based on spending
        const playerSpendingArray = updatedPlayers.map((player, index) => ({
          player,
          index,
          spent: context.playerSpending[player.id] || 0,
        }))

        // Sort by spending (least first), then by current index for ties
        playerSpendingArray.sort((a, b) => {
          if (a.spent !== b.spent) return a.spent - b.spent
          return a.index - b.index
        })

        // Set the next player to be the one who spent the least
        finalPlayerIndex = playerSpendingArray[0]?.index ?? 0

        // Update turn order based on spending (least spenders first)
        const newTurnOrder = playerSpendingArray.map((p) => p.player.id)

        // Reset player spending for the new round
        updatedPlayerSpending = {}

        // 2. Collect income (if not final round)
        if (!context.isFinalRound) {
          updatedPlayers = updatedPlayers.map((player) => {
            const updatedPlayer = { ...player }

            if (player.income >= 0) {
              // Positive income: collect money
              updatedPlayer.money += player.income
              logs.push(
                createLogEntry(
                  `${player.name} collected £${player.income} income`,
                  'info',
                ),
              )
            } else {
              // Negative income: pay bank or sell tiles
              const amountOwed = Math.abs(player.income)

              if (player.money >= amountOwed) {
                // Can afford to pay
                updatedPlayer.money -= amountOwed
                logs.push(
                  createLogEntry(
                    `${player.name} paid £${amountOwed} negative income`,
                    'info',
                  ),
                )
              } else {
                // Need to sell industry tiles or lose VP
                const shortfall = amountOwed - player.money
                updatedPlayer.money = 0 // Pay what they can

                let remainingShortfall = shortfall
                const industriesToRemove: number[] = []

                // Try to sell industry tiles (worth half cost, rounded down)
                for (
                  let i = 0;
                  i < player.industries.length && remainingShortfall > 0;
                  i++
                ) {
                  const industry = player.industries[i]!
                  const saleValue = Math.floor(industry.tile.cost / 2)

                  if (saleValue > 0) {
                    industriesToRemove.push(i)
                    updatedPlayer.money += saleValue
                    remainingShortfall -= saleValue

                    logs.push(
                      createLogEntry(
                        `${player.name} sold ${industry.type} industry for £${saleValue}`,
                        'info',
                      ),
                    )
                  }
                }

                // Remove sold industries (in reverse order to maintain indices)
                industriesToRemove.reverse().forEach((index) => {
                  updatedPlayer.industries.splice(index, 1)
                })

                // If still short, lose VP
                if (remainingShortfall > 0) {
                  updatedPlayer.victoryPoints = Math.max(
                    0,
                    updatedPlayer.victoryPoints - remainingShortfall,
                  )
                  logs.push(
                    createLogEntry(
                      `${player.name} lost ${remainingShortfall} VP due to income shortfall`,
                      'info',
                    ),
                  )
                }

                logs.push(
                  createLogEntry(
                    `${player.name} paid £${amountOwed} negative income (shortfall: £${shortfall})`,
                    'info',
                  ),
                )
              }
            }

            return updatedPlayer
          })
        }

        // 3. Reset spending for next round
        updatedPlayerSpending = {}

        logs.push(createLogEntry(`Round ${context.round} completed`, 'system'))

        // Check for era end after round completion
        const drawDeckEmpty = context.drawPile.length === 0
        const allHandsEmpty = updatedPlayers.every(
          (player) => player.hand.length === 0,
        )

        if (drawDeckEmpty && allHandsEmpty) {
          logs.push(
            createLogEntry(
              `Era end detected: draw deck and all hands exhausted`,
              'system',
            ),
          )
        }
      }

      debugLog('nextPlayer', context)
      return {
        currentPlayerIndex: finalPlayerIndex,
        round: nextRound,
        actionsRemaining: nextActionsRemaining,
        players: updatedPlayers,
        playerSpending: updatedPlayerSpending,
        turnOrder: newTurnOrder,
        selectedCard: null,
        selectedCardsForScout: [],
        selectedLink: null,
        // Only reset spentMoney when round is complete
        spentMoney: isRoundComplete ? 0 : context.spentMoney,
        logs,
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

      // Get current player and find the lowest available tile of the selected industry type
      const player = getCurrentPlayer(context)
      const tilesWithQuantity = player.industryTilesOnMat[event.industryType] || []
      const lowestTile = getLowestAvailableTile(tilesWithQuantity)

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

    selectTilesForDevelop: assign(({ context, event }) => {
      if (event.type !== 'SELECT_TILES_FOR_DEVELOP') return {}

      const currentPlayer = getCurrentPlayer(context)
      const validTiles: IndustryType[] = []

      // Validate each selected industry type
      for (const industryType of event.industryTypes) {
        const tilesWithQuantity = currentPlayer.industryTilesOnMat[industryType] || []

        // Filter out pottery tiles with lightbulb icon and tiles with no quantity
        const developableTiles = tilesWithQuantity
          .filter(t => t.quantityAvailable > 0)
          .map(t => t.tile)
          .filter(
            (tile) => industryType !== 'pottery' || !tile.hasLightbulbIcon,
          )

        if (developableTiles.length > 0) {
          validTiles.push(industryType)
        }
      }

      // Limit to maximum 2 tiles per develop action
      const finalSelection = validTiles.slice(0, 2)

      return {
        selectedTilesForDevelop: finalSelection,
      }
    }),

    clearIndustryTile: assign({
      selectedIndustryTile: null,
    }),

    clearTilesForDevelop: assign({
      selectedTilesForDevelop: [],
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

    setEra: assign(({ context, event }) => {
      if (event.type !== 'TEST_SET_ERA') return {}
      return {
        era: event.era,
      }
    }),

    setPlayerState: assign(({ context, event }) => {
      if (event.type !== 'TEST_SET_PLAYER_STATE') return {}

      const updatedPlayers = [...context.players]
      const currentPlayer = updatedPlayers[event.playerId]!
      updatedPlayers[event.playerId] = {
        ...currentPlayer,
        ...(event.money !== undefined && { money: event.money }),
        ...(event.income !== undefined && { income: event.income }),
        ...(event.industries !== undefined && { industries: event.industries }),
      }

      return {
        players: updatedPlayers,
      }
    }),

    setFinalRound: assign(({ context, event }) => {
      if (event.type !== 'TEST_SET_FINAL_ROUND') return {}
      return {
        isFinalRound: event.isFinalRound,
      }
    }),

    setEraEndConditions: assign(({ context, event }) => {
      if (event.type !== 'TEST_SET_ERA_END_CONDITIONS') return {}
      return {
        drawPile: event.drawPile,
        // Note: allPlayersHandsEmpty would need additional logic to check
      }
    }),
    setDrawPile: assign(({ context, event }) => {
      if (event.type !== 'TEST_SET_DRAW_PILE') return {}
      return {
        drawPile: event.drawPile,
      }
    }),

    trackMoneySpent: assign(({ context }, amount: number) => {
      const currentPlayer = getCurrentPlayer(context)
      const currentSpending = context.playerSpending[currentPlayer.id] || 0

      return {
        spentMoney: context.spentMoney + amount,
        playerSpending: {
          ...context.playerSpending,
          [currentPlayer.id]: currentSpending + amount,
        },
      }
    }),

    triggerEraScoring: assign(({ context }) => {
      const updatedPlayers = [...context.players]
      const logMessages: string[] = []

      // Score Link tiles - each link scores 1 VP for each "•—•" in adjacent locations
      for (let i = 0; i < updatedPlayers.length; i++) {
        const player = updatedPlayers[i]!
        let linkVPs = 0

        for (const link of player.links) {
          // Each link tile scores 1 VP (simplified - in full game would count "•—•" symbols)
          linkVPs += 1
        }

        if (linkVPs > 0) {
          logMessages.push(
            `${player.name} scored ${linkVPs} VPs from link tiles`,
          )
          updatedPlayers[i] = {
            ...player,
            victoryPoints: player.victoryPoints + linkVPs,
            links: [], // Remove link tiles after scoring
          }
        }
      }

      // Score Flipped Industry tiles - score VPs shown in bottom left corner
      // Also remove unflipped industries (per rules)
      for (let i = 0; i < updatedPlayers.length; i++) {
        const player = updatedPlayers[i]!
        let industryVPs = 0
        const remainingIndustries = []
        let removedUnflippedCount = 0

        for (const industry of player.industries) {
          if (industry.flipped) {
            industryVPs += industry.tile.victoryPoints
            remainingIndustries.push(industry) // Keep flipped industries
          } else {
            removedUnflippedCount++ // Count removed unflipped industries
          }
        }

        const messages = []
        if (industryVPs > 0) {
          messages.push(
            `${player.name} scored ${industryVPs} VPs from flipped industry tiles`,
          )
        }
        if (removedUnflippedCount > 0) {
          messages.push(
            `${player.name} had ${removedUnflippedCount} unflipped industry tiles removed`,
          )
        }
        logMessages.push(...messages)

        updatedPlayers[i] = {
          ...player,
          victoryPoints: player.victoryPoints + industryVPs,
          industries: remainingIndustries, // Only keep flipped industries
        }
      }

      return {
        players: updatedPlayers,
        logs: [
          ...context.logs,
          createLogEntry(`End of ${context.era} era scoring`, 'system'),
          ...logMessages.map((msg) => createLogEntry(msg, 'info')),
        ],
      }
    }),

    triggerCanalEraEnd: assign(({ context }) => {
      const updatedPlayers = [...context.players]
      const logMessages: string[] = []

      // Remove all level 1 Industry tiles from the board
      for (let i = 0; i < updatedPlayers.length; i++) {
        const player = updatedPlayers[i]!
        const remainingIndustries = player.industries.filter(
          (industry) => industry.level > 1,
        )
        const removedCount =
          player.industries.length - remainingIndustries.length

        if (removedCount > 0) {
          logMessages.push(
            `${player.name} had ${removedCount} level 1 industry tiles removed`,
          )
          updatedPlayers[i] = {
            ...player,
            industries: remainingIndustries,
          }
        }
      }

      // Reset merchant beer - place 1 beer on each merchant space (per rules)
      const updatedMerchants = context.merchants.map((merchant) => ({
        ...merchant,
        hasBeer: true,
      }))
      logMessages.push('Merchant beer reset for Rail Era')

      // Shuffle all discard piles together to create new draw deck
      const allDiscardCards: Card[] = []
      for (const player of context.players) {
        // In a real game, we'd collect from each player's discard pile
        // For testing, we'll use the current discard pile
      }

      // Combine current discard pile and any remaining draw pile cards
      const newDrawPile = shuffleArray([
        ...context.discardPile,
        ...context.drawPile,
      ])

      // Deal new hands - each player draws 8 cards
      const newHands: Card[][] = []
      let currentIndex = 0
      for (let i = 0; i < updatedPlayers.length; i++) {
        const newHand = newDrawPile.slice(currentIndex, currentIndex + 8)
        newHands.push(newHand)
        currentIndex += 8

        updatedPlayers[i] = {
          ...updatedPlayers[i]!,
          hand: newHand,
        }
      }

      return {
        players: updatedPlayers,
        era: 'rail' as const,
        round: 1,
        actionsRemaining: 2, // Rail Era starts with 2 actions per turn
        drawPile: newDrawPile.slice(currentIndex),
        discardPile: [],
        isFinalRound: false,
        playerSpending: {}, // Reset spending tracking
        turnOrder: context.turnOrder, // Maintain current turn order
        merchants: updatedMerchants,
        logs: [
          ...context.logs,
          createLogEntry('Canal Era ended', 'system'),
          ...logMessages.map((msg) => createLogEntry(msg, 'info')),
          createLogEntry('Rail Era started', 'system'),
          createLogEntry('All players drew new 8-card hands', 'info'),
        ],
      }
    }),

    triggerRailEraEnd: assign(({ context }) => {
      return {
        logs: [
          ...context.logs,
          createLogEntry('Rail Era ended', 'system'),
          createLogEntry('Game Over! Final scores calculated.', 'system'),
        ],
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
      
      // For industry cards, need card, tile, location AND sufficient resources
      if (
        context.selectedCard === null ||
        context.selectedIndustryTile === null ||
        context.selectedLocation === null
      ) {
        return false
      }
      
      const tile = context.selectedIndustryTile
      
      // Check coal availability if required
      if (tile.coalRequired > 0) {
        const coalResult = consumeCoalFromSources(
          context,
          context.selectedLocation,
          tile.coalRequired,
        )
        if (!coalResult.success) {
          return false
        }
      }
      
      // Iron is always available from market with fallback pricing, so no check needed
      
      return true
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
    hasSelectedLink: ({ context }) => {
      if (context.selectedLink === null) {
        return false
      }
      
      // Check coal availability for rail era links
      if (context.era === 'rail') {
        const coalResult = consumeCoalFromSources(
          context,
          context.selectedLink.from,
          1,
        )
        if (!coalResult.success) {
          return false
        }
      }
      
      return true
    },
    canBuildLink: ({ context, event }) => {
      if (event.type !== 'SELECT_LINK' && event.type !== 'SELECT_SECOND_LINK') {
        console.log('canBuildLink: wrong event type', event.type)
        return false
      }
      
      console.log('canBuildLink called with event:', event.type, event.from, event.to)

      // Check if any player already has a link on this connection
      const existingLink = context.players.some((player) =>
        player.links.some(
          (link) =>
            (link.from === event.from && link.to === event.to) ||
            (link.from === event.to && link.to === event.from),
        ),
      )

      if (existingLink) {
        console.log('canBuildLink: existing link found', event.from, event.to)
        return false
      }

      const currentPlayer = getCurrentPlayer(context)

      // Exception: If player has no industries or links on board, can build anywhere
      const hasNoTilesOnBoard =
        currentPlayer.industries.length === 0 &&
        currentPlayer.links.length === 0
      if (hasNoTilesOnBoard) {
        console.log('canBuildLink: no tiles on board, allowing')
        return true
      }

      // Special handling for second link in double link building
      if (event.type === 'SELECT_SECOND_LINK') {
        if (!context.selectedLink) {
          console.log('canBuildLink: no first link selected for second link')
          return false
        }
        
        // Second link follows same network adjacency rules as regular links
        // (No special adjacency requirement between the two links)
        console.log('canBuildLink: second link - checking network adjacency')
        // Continue to regular network adjacency check below
      }

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

      const currentPlayer = getCurrentPlayer(context)

      // Validate based on card type and network requirements
      const isValidBuild = validateIndustryBuildLocation(
        context,
        currentPlayer,
        context.selectedCard,
        event.cityId,
      )

      if (!isValidBuild) {
        return false
      }

      // Additional location card validation
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        return locationCard.location === event.cityId
      }

      // For industry cards, check if the location can accommodate the selected industry type
      if ((context.selectedCard.type === 'industry' || context.selectedCard.type === 'wild_industry') && context.selectedIndustryTile) {
        return canCityAccommodateIndustryType(context, event.cityId, context.selectedIndustryTile.type)
      }

      return true
    },
    canSelectIndustryType: ({ context, event }) => {
      if (event.type !== 'SELECT_INDUSTRY_TYPE') return false
      if (!context.selectedCard) return false

      // Check if player has tiles of this industry type available
      const player = getCurrentPlayer(context)
      const tilesWithQuantity = player.industryTilesOnMat[event.industryType] || []
      const availableTiles = tilesWithQuantity
        .filter(t => t.quantityAvailable > 0)
        .map(t => t.tile)
        .filter((tile) => {
          if (context.era === 'canal') return tile.canBuildInCanalEra
          if (context.era === 'rail') return tile.canBuildInRailEra
          return false
        })

      if (availableTiles.length === 0) {
        return false
      }

      // For location cards, check if the location can accommodate this industry type
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        return canCityAccommodateIndustryType(context, locationCard.location as CityId, event.industryType)
      }

      // For wild location cards, can build anywhere (no slot restriction)
      if (context.selectedCard.type === 'wild_location') {
        return true
      }

      // For industry cards, location validation happens later when location is selected
      return true
    },
    isLocationCardSelected: ({ context }) => {
      return (
        context.selectedCard?.type === 'location' ||
        context.selectedCard?.type === 'wild_location'
      )
    },

    isEraEnd: ({ context }) => {
      // Era ends when draw deck is exhausted AND all players' hands are empty
      const drawDeckEmpty = context.drawPile.length === 0
      const allHandsEmpty = context.players.every(
        (player) => player.hand.length === 0,
      )
      return drawDeckEmpty && allHandsEmpty
    },

    isGameEnd: ({ context }) => {
      // Game ends after Rail Era scoring
      return (
        context.era === 'rail' &&
        context.drawPile.length === 0 &&
        context.players.every((player) => player.hand.length === 0)
      )
    },

    canBuildSecondLink: ({ context }) => {
      // Must be in rail era and have a first link selected
      if (context.era !== 'rail') return false
      if (!context.selectedLink) return false

      const currentPlayer = getCurrentPlayer(context)

      // Check if player has access to ANY beer from their own breweries
      const ownBreweries = currentPlayer.industries.filter(
        (industry) =>
          industry.type === 'brewery' &&
          !industry.flipped &&
          industry.beerBarrelsOnTile > 0,
      )

      // Also check if there are opponent breweries available (detailed connectivity validation during execution)
      const opponentBreweries = context.players
        .filter(player => player.id !== currentPlayer.id)
        .flatMap(player => player.industries)
        .filter(industry => 
          industry.type === 'brewery' &&
          !industry.flipped &&
          industry.beerBarrelsOnTile > 0
        )

      // Allow if player has own brewery beer OR there are opponent breweries available
      return ownBreweries.length > 0 || opponentBreweries.length > 0
    },

    hasSelectedSecondLink: ({ context }) => context.selectedSecondLink !== null,

    hasSelectedTilesForDevelop: ({ context }) => {
      // Allow confirmation if tiles are selected OR for backward compatibility
      if (context.selectedTilesForDevelop.length > 0) return true

      // For backward compatibility, check if there are any developable tiles
      const currentPlayer = getCurrentPlayer(context)
      for (const industryType of [
        'coal',
        'iron',
        'cotton',
        'pottery',
        'manufacturer',
        'brewery',
      ] as IndustryType[]) {
        const tilesWithQuantity = currentPlayer.industryTilesOnMat[industryType] || []
        const developableTiles = tilesWithQuantity
          .filter(t => t.quantityAvailable > 0)
          .map(t => t.tile)
          .filter(
            (tile) => industryType !== 'pottery' || !tile.hasLightbulbIcon,
          )
        if (developableTiles.length > 0) {
          return true
        }
      }
      return false
    },

    canCompleteDoubleLink: ({ context }) => {
      if (
        context.selectedCard === null ||
        context.selectedLink === null ||
        context.selectedSecondLink === null ||
        context.era !== 'rail'
      ) {
        return false
      }
      
      // Check if beer is available for double rail link
      const beerCheckResult = consumeBeerFromSources(
        context,
        context.selectedSecondLink.to,
        1,
        false, // No merchant beer for Network actions
      )
      
      return beerCheckResult.success
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
    playerSpending: {},
    turnOrder: [],
    isFinalRound: false,
    selectedLink: null,
    selectedSecondLink: null,
    selectedLocation: null,
    selectedIndustryTile: null,
    selectedTilesForDevelop: [],
    merchants: [],
    // Error state
    lastError: null,
    errorContext: null,
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
        TEST_SET_ERA: {
          actions: 'setEra',
        },
        TEST_SET_PLAYER_STATE: {
          actions: 'setPlayerState',
        },
        TEST_SET_FINAL_ROUND: {
          actions: 'setFinalRound',
        },
        TEST_SET_ERA_END_CONDITIONS: {
          actions: 'setEraEndConditions',
        },
        TEST_SET_DRAW_PILE: {
          actions: 'setDrawPile',
        },
        TRIGGER_ERA_SCORING: {
          actions: 'triggerEraScoring',
        },
        TRIGGER_CANAL_ERA_END: {
          actions: 'triggerCanalEraEnd',
        },
        TRIGGER_RAIL_ERA_END: {
          actions: 'triggerRailEraEnd',
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
                      target: 'selectingTiles',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                selectingTiles: {
                  on: {
                    SELECT_TILES_FOR_DEVELOP: {
                      target: 'confirmingDevelop',
                      actions: 'selectTilesForDevelop',
                    },
                    CONFIRM: {
                      target: 'confirmingDevelop',
                      // Don't run selectTilesForDevelop action - use auto-selection in executeDevelopAction
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingDevelop: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeDevelopAction',
                      guard: 'hasSelectedTilesForDevelop',
                    },
                    CANCEL: {
                      target: 'selectingTiles',
                      actions: 'clearTilesForDevelop',
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
                    CHOOSE_DOUBLE_LINK_BUILD: {
                      target: 'selectingSecondLink',
                      guard: 'canBuildSecondLink',
                    },
                    CANCEL: {
                      target: 'selectingLink',
                      actions: 'clearSelections',
                    },
                  },
                },
                selectingSecondLink: {
                  on: {
                    SELECT_SECOND_LINK: {
                      target: 'confirmingDoubleLink',
                      actions: 'selectSecondLink',
                      guard: 'canBuildLink',
                    },
                    CANCEL: {
                      target: 'confirmingLink',
                      actions: 'clearSecondLink',
                    },
                  },
                },
                confirmingDoubleLink: {
                  on: {
                    EXECUTE_DOUBLE_NETWORK_ACTION: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeDoubleNetworkAction',
                      guard: 'canCompleteDoubleLink',
                    },
                    CANCEL: {
                      target: 'selectingSecondLink',
                      actions: 'clearSecondLink',
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
          entry: ['refillPlayerHand', 'checkAndFlipIndustryTiles'],
          always: [
            {
              guard: 'hasActionsRemaining',
              target: 'action',
            },
            {
              target: 'nextPlayer',
            },
          ],
          on: {
            CHECK_INDUSTRY_FLIPPING: {
              actions: 'checkAndFlipIndustryTiles',
            },
          },
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
  on: {
    SET_ERROR: {
      actions: 'setError',
    },
    CLEAR_ERROR: {
      actions: 'clearError',
    },
  },
})
