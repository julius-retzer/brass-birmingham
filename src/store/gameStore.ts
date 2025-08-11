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
  getInitialPlayerIndustryTiles,
  getLowestLevelTile,
} from '../data/industryTiles'
import {
  buildIndustryTile,
  validateBuildActionSelections,
  validateCardIndustryMatching,
  validateCardLocationMatching,
  validateCardType,
  validateTileEraCompatibility,
} from './build/buildActions'
import { GAME_CONSTANTS } from './constants'
import {
  consumeBeerFromSources,
  consumeCoalFromSources,
  consumeIronFromSources,
} from './market/marketActions'
import {
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
  // Industry tiles on player mat (available to build)
  industryTilesOnMat: Record<IndustryType, IndustryTile[]>
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
  // Merchant system
  merchants: Merchant[]
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
      type: 'TRIGGER_ERA_SCORING'
    }
  | {
      type: 'TRIGGER_CANAL_ERA_END'
    }
  | {
      type: 'TRIGGER_RAIL_ERA_END'
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
        playerSpending: {},
        isFinalRound: false,
        selectedLink: null,
        selectedSecondLink: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        merchants: createMerchantsForPlayerCount(playerCount),
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

      // Run all validations
      validateBuildActionSelections(context)
      validateCardType(context.selectedCard!)
      validateCardLocationMatching(
        context.selectedCard!,
        context.selectedLocation!,
      )
      validateCardIndustryMatching(
        context.selectedCard!,
        context.selectedIndustryTile,
      )

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
          spentMoney: context.spentMoney + totalCost,
          playerSpending: {
            ...context.playerSpending,
            [currentPlayer.id]: currentSpending + totalCost,
          },
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
      const updatedCoalMarket = context.coalMarket.map((level) => ({
        ...level,
      }))
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

      const totalCost = linkCost + coalCost
      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
        money: currentPlayer.money - totalCost,
        links: [...currentPlayer.links, newLink],
      }

      // Track money spent
      const currentSpending = context.playerSpending[currentPlayer.id] || 0

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

      // Consume 1 beer (from breweries, not merchant beer per rules 302-303)
      const beerResult = consumeBeerFromSources(
        context,
        context.selectedSecondLink.to,
        1,
        false, // No merchant beer for Network actions
      )

      if (!beerResult.success) {
        throw new Error(beerResult.errorMessage || 'Beer consumption failed for network action')
      }

      // Consume 2 coal (1 per link)
      const coalResult = consumeCoalFromSources(
        context,
        context.selectedLink.to,
        2,
      )
      totalCost += coalResult.coalCost

      // Create both links
      const firstLink = {
        from: context.selectedLink.from,
        to: context.selectedLink.to,
        type: context.era as 'canal' | 'rail',
      }

      const secondLink = {
        from: context.selectedSecondLink.from,
        to: context.selectedSecondLink.to,
        type: context.era as 'canal' | 'rail',
      }

      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
        money: currentPlayer.money - totalCost,
        links: [...currentPlayer.links, firstLink, secondLink],
      }

      // Track money spent
      const currentSpending = context.playerSpending[currentPlayer.id] || 0

      const logMessage = `${currentPlayer.name} built 2 rail links (${context.selectedLink.from}-${context.selectedLink.to}, ${context.selectedSecondLink.from}-${context.selectedSecondLink.to}) for £${linkCost} + beer + 2 coal (£${coalResult.coalCost})`

      debugLog('executeDoubleNetworkAction', context)
      return {
        players: updatePlayerInList(
          beerResult.updatedPlayers,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        coalMarket: coalResult.updatedCoalMarket,
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
      const connectedMerchant = context.merchants.find(
        (merchant) =>
          merchant.industryIcons.includes(industryToSell.type) &&
          // TODO: Add proper network connectivity check
          // For now, assume all industries are connected to merchants for testing
          true,
      )

      if (!connectedMerchant) {
        throw new Error(
          `No merchant connected with ${industryToSell.type} icon`,
        )
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
            // Remove lowest level tile from player mat (simplified)
            // In full implementation, player would choose which tile to remove
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

      const result: Partial<GameState> = {
        players: updatePlayerInList(
          beerResult.updatedPlayers,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
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
        currentPlayerIndex: nextPlayerIndex,
        round: nextRound,
        actionsRemaining: nextActionsRemaining,
        players: updatedPlayers,
        playerSpending: updatedPlayerSpending,
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
      for (let i = 0; i < updatedPlayers.length; i++) {
        const player = updatedPlayers[i]!
        let industryVPs = 0

        for (const industry of player.industries) {
          if (industry.flipped) {
            industryVPs += industry.tile.victoryPoints
          }
        }

        if (industryVPs > 0) {
          logMessages.push(
            `${player.name} scored ${industryVPs} VPs from flipped industry tiles`,
          )
          updatedPlayers[i] = {
            ...player,
            victoryPoints: player.victoryPoints + industryVPs,
          }
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

      const currentPlayer = getCurrentPlayer(context)

      // Validate based on card type and network requirements
      const isValidBuild = validateIndustryBuildLocation(
        context,
        currentPlayer,
        context.selectedCard,
        event.cityId,
      )

      // Additional location card validation
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        return locationCard.location === event.cityId && isValidBuild
      }

      return isValidBuild
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
      // Must be in rail era and have beer available
      if (context.era !== 'rail') return false
      if (!context.selectedLink) return false

      const currentPlayer = getCurrentPlayer(context)

      // Check if player has access to beer (own breweries, connected breweries, or merchant beer)
      const { ownBreweries, connectedBreweries } = findAvailableBreweries(
        context,
        context.selectedLink.to,
        currentPlayer,
      )

      const hasBreweryBeer = [...ownBreweries, ...connectedBreweries].some(
        (brewery) => brewery.beerBarrelsOnTile > 0,
      )

      // RULE: Network actions cannot use merchant beer (only brewery beer)
      return hasBreweryBeer
    },

    hasSelectedSecondLink: ({ context }) => context.selectedSecondLink !== null,

    canCompleteDoubleLink: ({ context }) => {
      return (
        context.selectedCard !== null &&
        context.selectedLink !== null &&
        context.selectedSecondLink !== null &&
        context.era === 'rail'
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
    playerSpending: {},
    isFinalRound: false,
    selectedLink: null,
    selectedSecondLink: null,
    selectedLocation: null,
    selectedIndustryTile: null,
    merchants: [],
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
        TEST_SET_PLAYER_STATE: {
          actions: 'setPlayerState',
        },
        TEST_SET_FINAL_ROUND: {
          actions: 'setFinalRound',
        },
        TEST_SET_ERA_END_CONDITIONS: {
          actions: 'setEraEndConditions',
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
})
