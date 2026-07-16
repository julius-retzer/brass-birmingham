import { type Actor, StateFrom, and, assign, setup } from 'xstate'
import {
  type CityId,
  FARM_BREWERIES,
  linkConnectedLocations,
} from '../data/board'
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
  STARTING_INCOME_SPACE,
  advanceIncomeSpaces,
  highestSpaceForLevel,
  incomeLevelForSpace,
} from '../data/incomeTrack'
import {
  type IndustryTile,
  type IndustryTileWithQuantity,
  canBuildTileInEra,
  decrementTileQuantity,
  getBuildableTileInEra,
  getInitialPlayerIndustryTiles,
  getInitialPlayerIndustryTilesWithQuantities,
  getLowestAvailableTile,
  getLowestLevelTile,
} from '../data/industryTiles'
import {
  type ValidationResult,
  buildIndustryTile,
  eraRestrictionMessage,
  validateBuildActionSelections,
  // Non-throwing validation functions
  validateBuildActionSelectionsResult,
  validateCardIndustryMatching,
  validateCardLocationMatching,
  validateCardType,
  validateIndustrySlotAvailability,
  validateIndustrySlotAvailabilityResult,
  validateNetworkRequirement,
  validateNetworkRequirementResult,
  validateTileEraCompatibility,
} from './build/buildActions'
import { GAME_CONSTANTS } from './constants'
import {
  consumeBeerFromSources,
  consumeCoalFromSources,
  consumeIronFromSources,
} from './market/marketActions'
import {
  calculateLinkVictoryPoints,
  calculateNetworkDistance,
  canPlaceOrOverbuildIndustry,
  checkAndFlipIndustryTilesLogic,
  createLogEntry,
  debugLog,
  drawCards,
  findAvailableBreweries,
  findCardInHand,
  getCardDescription,
  getCurrentPlayer,
  incomeAfterFlip,
  isDevelopable,
  isFirstRound,
  isLocationInPlayerNetwork,
  removeCardFromHand,
  routeCardsToDiscard,
  shuffleArray,
  updatePlayerInList,
  validateIndustryBuildLocation,
} from './shared/gameUtils'
import {
  type BeerSource,
  type IronSource,
  beerChoiceSatisfied,
  canChooseBeerSource,
  canChooseIronSource,
  ironChoiceSatisfied,
  pendingBeerChoice,
  pendingIronChoice,
  withProvisionalDoubleLink,
} from './shared/resourceSources'

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

/** Where a slice of a player's score came from. */
export type VpAwardSource =
  | 'industry'
  | 'link'
  | 'merchantBonus'
  | 'incomeShortfall'
  /** Only from `saveMigration`: VP scored before this ledger existed. */
  | 'carriedForward'

/**
 * One entry in a player's append-only VP ledger.
 *
 * The engine only ever kept a running `victoryPoints` total, and era scoring
 * DESTROYS `player.links` — so the components of a final score cannot be
 * recomputed from the end state. Every site that moves `victoryPoints` appends
 * an award here instead, recording the VP *actually* applied (penalties clamp
 * at zero). Invariant, pinned by gameStore.vpbreakdown.test.ts:
 *
 *   sum(player.vpAwards.map(a => a.vp)) === player.victoryPoints
 *
 * Public information — scoring is open in Brass, so this is deliberately NOT
 * redacted by `filterSnapshotForSeat`.
 */
export interface VpAward {
  source: VpAwardSource
  era: 'canal' | 'rail'
  /** Signed VP applied to the total; negative for `incomeShortfall`. */
  vp: number
  /** The industry's location, or the merchant sold to. */
  location?: CityId
  industryType?: IndustryType
  level?: number
  link?: Link
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
  /** Append-only ledger explaining `victoryPoints`; see {@link VpAward}. */
  vpAwards: VpAward[]
  /** Income LEVEL (-10..30) — the coin beside the marker; what a round pays. */
  income: number
  /** Marker position on the Progress Track (0..99). Flips advance SPACES. */
  incomeSpace: number
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

/** What happened in the round that just ended, as the engine recorded it. */
export interface RoundSummary {
  /** The round that ENDED (context.round has already advanced past it). */
  round: number
  era: 'canal' | 'rail'
  /** Turn order used during the round that ended. */
  previousOrder: string[]
  /** Turn order installed for the next round (least spender first). */
  newOrder: string[]
  /** Money spent per player id during the round that ended. */
  spending: Record<string, number>
  /**
   * Net money change per player id from the end-of-round income settlement.
   * Empty on the game's final round, where no income is collected.
   */
  income: Record<string, number>
  /** The round's end also exhausted the deck, so the era ends. */
  eraEnded: boolean
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
  // Record of the most recently completed round. playerSpending/turnOrder are
  // overwritten the instant a round ends, so this is the only place the UI can
  // read what actually happened (it drives the round-end curtain). Public
  // information — every value in it is already visible at the table.
  roundSummary: RoundSummary | null
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
  // Sell action state - number of industries flipped during the current Sell action
  salesMadeThisAction: number
  /**
   * The sale staged while its beer source is being chosen — the machine's own
   * step, not UI staging. Null outside `selling.choosingBeerSource`.
   */
  pendingSale: {
    location: CityId
    industryType: IndustryType
    merchant: CityId
  } | null
  /**
   * Where the player chose to take the pending action's beer / iron from, one
   * entry per unit. Empty = the engine's default pick. Public board
   * references only (no card data), so multiplayer need not filter them.
   */
  chosenBeerSources: BeerSource[]
  chosenIronSources: IronSource[]
  /**
   * Which action the open iron-source step belongs to — set on entry to the
   * choosing state, so the engine never has to infer build-vs-develop from
   * context (the fields collide: an industry Develop card also sets
   * `selectedIndustryTile`). Null outside a choosingIronSource state.
   */
  pendingIronStep: 'build' | 'develop' | null
  // Set when a round completes with the draw deck and all hands exhausted;
  // drives the automatic era-end transition
  eraEndPending: boolean
  // Game end state - ids of winning player(s), set when the game is over
  winners: string[] | null
  // Error state
  lastError: string | null
  errorContext: 'build' | 'network' | 'develop' | 'sell' | 'scout' | null
}

type GameEvent =
  | {
      type: 'START_GAME'
      // income/incomeSpace are overwritten by setup (marker on space 10),
      // so callers need not provide the marker position.
      players: Array<
        Omit<
          Player,
          'hand' | 'links' | 'industries' | 'incomeSpace' | 'vpAwards'
        > &
          Partial<Pick<Player, 'incomeSpace'>>
      >
    }
  | {
      type: 'JOIN_GAME'
      player2Name: string
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
      type: 'SELECT_SALE'
      location: CityId
      industryType: IndustryType
      merchant: CityId
    }
  | {
      /** Take one barrel from this source (the `choosingBeerSource` step). */
      type: 'SELECT_BEER_SOURCE'
      source: BeerSource
    }
  | {
      /** Take one cube from this source (the `choosingIronSource` step). */
      type: 'SELECT_IRON_SOURCE'
      source: IronSource
    }
  | {
      type: 'CONFIRM'
    }
  | {
      type: 'CANCEL'
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
      type: 'TEST_SET_MERCHANTS'
      merchants: Merchant[]
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
export type { GameEvent }

// Merchant setup (rules "Board Setup" steps 4-5 + result note):
// - 2 players: merchant tiles at Shrewsbury, Gloucester and Oxford only
// - 3 players: adds Warrington
// - 4 players: adds Nottingham
// The merchant tiles for the player count are shuffled and dealt one per
// merchant space. Blank tiles accept no goods and get no beer barrel.
type MerchantTileGoods = IndustryType[]

const MERCHANT_LOCATION_BONUSES: Partial<
  Record<CityId, { bonusType: Merchant['bonusType']; bonusValue: number }>
> = {
  warrington: { bonusType: 'money', bonusValue: 5 },
  gloucester: { bonusType: 'develop', bonusValue: 1 },
  oxford: { bonusType: 'income', bonusValue: 2 },
  nottingham: { bonusType: 'victoryPoints', bonusValue: 3 },
  shrewsbury: { bonusType: 'victoryPoints', bonusValue: 4 },
}

const MERCHANT_SLOTS_BY_PLAYER_COUNT: Record<number, CityId[]> = {
  2: ['shrewsbury', 'gloucester', 'gloucester', 'oxford', 'oxford'],
  3: [
    'shrewsbury',
    'gloucester',
    'gloucester',
    'oxford',
    'oxford',
    'warrington',
    'warrington',
  ],
  4: [
    'shrewsbury',
    'gloucester',
    'gloucester',
    'oxford',
    'oxford',
    'warrington',
    'warrington',
    'nottingham',
    'nottingham',
  ],
}

const ANY_GOODS: MerchantTileGoods = ['cotton', 'manufacturer', 'pottery']

const MERCHANT_TILES_BY_PLAYER_COUNT: Record<number, MerchantTileGoods[]> = {
  // 5 tiles at 2p: 2 blanks, cotton, manufactured goods, any
  2: [[], [], ['cotton'], ['manufacturer'], ANY_GOODS],
  // 3p adds pottery + a second "any"
  3: [[], [], ['cotton'], ['manufacturer'], ANY_GOODS, ['pottery'], ANY_GOODS],
  // 4p adds a second cotton + second manufactured goods
  4: [
    [],
    [],
    ['cotton'],
    ['manufacturer'],
    ANY_GOODS,
    ['pottery'],
    ANY_GOODS,
    ['cotton'],
    ['manufacturer'],
  ],
}

const createMerchantsForPlayerCount = (playerCount: number): Merchant[] => {
  const slots =
    MERCHANT_SLOTS_BY_PLAYER_COUNT[playerCount] ??
    MERCHANT_SLOTS_BY_PLAYER_COUNT[2]!
  const tiles = shuffleArray(
    MERCHANT_TILES_BY_PLAYER_COUNT[playerCount] ??
      MERCHANT_TILES_BY_PLAYER_COUNT[2]!,
  )

  return slots.map((location, index) => {
    const goods = tiles[index] ?? []
    const bonus = MERCHANT_LOCATION_BONUSES[location]!
    return {
      location,
      industryIcons: goods,
      bonusType: bonus.bonusType,
      bonusValue: bonus.bonusValue,
      // Beer barrels only sit beside non-blank merchant tiles
      hasBeer: goods.length > 0,
    }
  })
}

const SELLABLE_INDUSTRY_TYPES: IndustryType[] = [
  'cotton',
  'manufacturer',
  'pottery',
]

// Shared validation for a single sale within a Sell action, used by the
// canExecuteSale guard, the executeSingleSale action, and `explainRefusal`
// (src/store/refusal.ts) — which surfaces the `error` the guard discards.
export const validateSale = (
  context: GameState,
  event: {
    location: CityId
    industryType: IndustryType
    merchant: CityId
    beerSources?: BeerSource[]
  },
): {
  isValid: boolean
  error?: string
  industry?: Player['industries'][number]
} => {
  const currentPlayer = getCurrentPlayer(context)

  const industry = currentPlayer.industries.find(
    (i) =>
      i.location === event.location &&
      i.type === event.industryType &&
      !i.flipped,
  )
  if (!industry || !SELLABLE_INDUSTRY_TYPES.includes(industry.type)) {
    return {
      isValid: false,
      error: `No unflipped ${event.industryType} to sell at ${event.location}`,
    }
  }

  // The merchant being sold to must feature the industry's icon
  const merchantSlot = context.merchants.find(
    (m) =>
      m.location === event.merchant && m.industryIcons.includes(industry.type),
  )
  if (!merchantSlot) {
    return {
      isValid: false,
      error: `Cannot sell: no merchant at ${event.merchant} buys ${industry.type}`,
      industry,
    }
  }

  // ... and be connected to the industry's location
  if (
    calculateNetworkDistance(context, event.location, event.merchant) ===
    Infinity
  ) {
    return {
      isValid: false,
      error: `Cannot sell: ${event.location} is not connected to ${event.merchant}`,
      industry,
    }
  }

  // Required beer must be consumable (merchant beer only from the
  // icon-matching tile at the merchant being sold to). A source the player
  // chose must itself be legal, so the guard sees the same answer execution
  // will give.
  const beerCheck = consumeBeerFromSources(
    context,
    event.location,
    industry.tile.beerRequired,
    event.merchant,
    industry.type,
    event.beerSources,
  )
  if (!beerCheck.success) {
    return {
      isValid: false,
      error: beerCheck.errorMessage || 'Insufficient beer for sale',
      industry,
    }
  }

  return { isValid: true, industry }
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
        // Setup (audited 2026-07-15): the marker starts on Progress Track
        // SPACE 10, which carries income LEVEL 0 — not level 10.
        income: incomeLevelForSpace(STARTING_INCOME_SPACE),
        incomeSpace: STARTING_INCOME_SPACE,
        victoryPoints: 0,
        vpAwards: [],
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
        roundSummary: null,
        isFinalRound: false,
        selectedLink: null,
        selectedSecondLink: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        selectedTilesForDevelop: [],
        merchants: createMerchantsForPlayerCount(playerCount),
        salesMadeThisAction: 0,
        pendingSale: null,
        chosenBeerSources: [],
        chosenIronSources: [],
        pendingIronStep: null,
        eraEndPending: false,
        winners: null,
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
          const tilesWithQuantity =
            player.industryTilesOnMat[industryType] || []
          const buildableTile = getBuildableTileInEra(
            tilesWithQuantity,
            context.era,
          )

          if (buildableTile) {
            result.selectedIndustryTile = buildableTile
            break
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

    // Card-first Scout entry: the card held in cardSelected becomes the
    // first of the three discards (selectCard may also have auto-picked an
    // industry tile — clear it, scout never uses one).
    seedScoutFromSelectedCard: assign(({ context }) => {
      if (!context.selectedCard) return {}
      return {
        selectedCardsForScout: [context.selectedCard],
        selectedCard: null,
        selectedIndustryTile: null,
      }
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

    updatePlayer2Name: assign(({ context, event }) => {
      if (event.type !== 'JOIN_GAME') return {}
      debugLog('updatePlayer2Name', context, event)

      // Update player 2 name in the players array
      const updatedPlayers = context.players.map((player, index) =>
        index === 1 ? { ...player, name: event.player2Name } : player,
      )

      return {
        players: updatedPlayers,
      }
    }),

    executeLoanAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        return {
          lastError: 'No card selected for loan action',
          errorContext: null,
        }
      }

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )
      // Loan: drop 3 income LEVELS (not spaces); the marker moves to the
      // highest space within the new level (rulebook p.6 / audited board).
      const loanLevel = Math.max(
        GAME_CONSTANTS.MIN_INCOME,
        currentPlayer.income - GAME_CONSTANTS.LOAN_INCOME_PENALTY,
      )
      const updatedPlayer = {
        ...currentPlayer,
        money: currentPlayer.money + GAME_CONSTANTS.LOAN_AMOUNT,
        income: loanLevel,
        incomeSpace: highestSpaceForLevel(loanLevel),
        hand: updatedHand,
      }

      debugLog('executeLoanAction', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          updatedPlayer,
        ),
        ...routeCardsToDiscard(context, [context.selectedCard]),
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
      const failedValidation = validationChecks.find((check) => !check.isValid)
      if (failedValidation) {
        return {
          lastError: failedValidation.errorMessage || 'Validation failed',
          errorContext: failedValidation.errorContext || ('build' as const),
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
          lastError:
            error instanceof Error ? error.message : 'Card validation failed',
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

        // buildIndustryTile validates era, overbuild, resources and funds.
        // Failures are recoverable - surface them via lastError instead of
        // letting a throw kill the actor.
        let buildResult: ReturnType<typeof buildIndustryTile>
        try {
          validateTileEraCompatibility(context, tile)
          buildResult = buildIndustryTile(
            context,
            currentPlayer,
            tile,
            updatedHand,
            context.chosenIronSources ?? [],
          )
        } catch (error) {
          return {
            lastError:
              error instanceof Error ? error.message : 'Build action failed',
            errorContext: 'build' as const,
          }
        }
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
          ...routeCardsToDiscard(context, [context.selectedCard!]),
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
        ...routeCardsToDiscard(context, [context.selectedCard!]),
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
          1,
        )

        if (!coalResult.success) {
          return {
            lastError:
              coalResult.errorMessage ||
              'Cannot build rail link: no coal available',
            errorContext: 'network' as const,
          }
        }

        coalCost = coalResult.coalCost
        // Apply coal market changes
        for (let i = 0; i < updatedCoalMarket.length; i++) {
          updatedCoalMarket[i] = coalResult.updatedCoalMarket[i]!
        }

        logMessage += ` (${coalResult.logDetails.join(', ')})`
      }

      const totalCost = linkCost + coalCost

      if (currentPlayer.money < totalCost) {
        return {
          lastError: `Insufficient funds. Cost: £${totalCost}, Available: £${currentPlayer.money}`,
          errorContext: 'network' as const,
        }
      }

      // Get player state after coal consumption, if any
      const playerAfterCoal =
        context.era === 'rail' && coalResult
          ? coalResult.updatedPlayers[context.currentPlayerIndex]!
          : currentPlayer

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
        ...routeCardsToDiscard(context, [context.selectedCard]),
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
      // The double-link barrel belongs to this second link; drop any pick so a
      // re-selected link asks again rather than inheriting the stale choice.
      chosenBeerSources: [],
    }),

    // Entered from selectingSecondLink — start the barrel pick fresh so a
    // cancelled-and-reselected double link re-asks (mirror of the iron steps).
    enterDoubleLinkBeerStep: assign({ chosenBeerSources: [] }),

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

    executeDoubleNetworkAction: assign(({ context, event }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (
        !context.selectedCard ||
        !context.selectedLink ||
        !context.selectedSecondLink
      ) {
        return {
          lastError: 'Card or links not selected for double network action',
          errorContext: 'network' as const,
        }
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
        {
          ...context,
          players: updatedPlayersAfterCoal,
          coalMarket: updatedCoalMarket,
        },
        context.selectedLink.from,
        1,
      )

      if (!firstCoalResult.success) {
        return {
          lastError:
            firstCoalResult.errorMessage ||
            'Failed to consume coal for first rail link',
          errorContext: 'network' as const,
        }
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
      const currentPlayerAfterFirstCoal =
        updatedPlayersAfterCoal[context.currentPlayerIndex]!
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
        {
          ...context,
          players: updatedPlayersAfterCoal,
          coalMarket: updatedCoalMarket,
        },
        context.selectedSecondLink.from,
        1,
      )

      if (!secondCoalResult.success) {
        return {
          lastError:
            secondCoalResult.errorMessage ||
            'Failed to consume coal for second rail link',
          errorContext: 'network' as const,
        }
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
        // No merchant beer for Network actions
        undefined,
        undefined,
        context.chosenBeerSources ?? [],
      )

      if (!beerResult.success) {
        return {
          lastError:
            beerResult.errorMessage ||
            'Beer consumption failed - no brewery reachable from second rail',
          errorContext: 'network' as const,
        }
      }

      totalCost += coalCost

      if (currentPlayer.money < totalCost) {
        return {
          lastError: `Insufficient funds. Cost: £${totalCost}, Available: £${currentPlayer.money}`,
          errorContext: 'network' as const,
        }
      }

      // Get final player state with beer consumption applied
      const finalPlayerAfterBeer =
        beerResult.updatedPlayers[context.currentPlayerIndex]!
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
        ...routeCardsToDiscard(context, [context.selectedCard]),
        coalMarket: updatedCoalMarket,
        resources: beerResult.updatedResources,
        selectedCard: null,
        selectedLink: null,
        selectedSecondLink: null,
        selectedLocation: null,
        selectedIndustryTile: null,
        chosenBeerSources: [],
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

            const flip = incomeAfterFlip(player.incomeSpace, industry.tile)

            // Update player with flipped industry and new income
            updatedPlayers[playerIndex] = {
              ...player,
              industries: newIndustries,
              income: flip.income,
              incomeSpace: flip.incomeSpace,
            }

            logMessages.push(
              `${player.name}'s ${industry.type} at ${industry.location} flipped (income +${flip.advancedBy}, now ${flip.income})`,
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
            .filter((t) => t.quantityAvailable > 0)
            .map((t) => t.tile)
            .filter(isDevelopable)
          if (developableTiles.length > 0) {
            availableTypes.push(industryType)
          }
        }
        selectedIndustryTypes = availableTypes.slice(0, 1) // Just pick first available for backward compatibility
      }

      const tilesRemoved = selectedIndustryTypes.length
      const ironRequired = tilesRemoved

      // Use enhanced iron consumption logic
      const ironResult = consumeIronFromSources(
        context,
        ironRequired,
        context.chosenIronSources ?? [],
      )
      if (!ironResult.success) {
        return {
          lastError: ironResult.errorMessage ?? 'Iron consumption failed',
          errorContext: 'develop' as const,
        }
      }
      const ironCost = ironResult.ironCost
      const updatedPlayersFromIron = ironResult.updatedPlayers
      const updatedIronMarket = ironResult.updatedIronMarket

      if (currentPlayer.money < ironCost) {
        return {
          lastError: `Insufficient funds. Cost: £${ironCost}, Available: £${currentPlayer.money}`,
          errorContext: 'develop' as const,
        }
      }

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
          .filter((t) => t.quantityAvailable > 0)
          .map((t) => t.tile)
          .filter(isDevelopable)

        if (developableTiles.length > 0) {
          // Decrement quantity of the lowest level tile
          const lowestTile = getLowestLevelTile(developableTiles)
          if (lowestTile) {
            updatedIndustryTilesOnMat[industryType] = decrementTileQuantity(
              tilesWithQuantity,
              lowestTile,
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
        ...routeCardsToDiscard(context, [context.selectedCard]),
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

    // Execute a single sale within a Sell action: flip one chosen industry,
    // consuming beer (merchant beer comes from the merchant being sold to).
    // The Sell action may repeat this for multiple industries before CONFIRM.
    executeStagedSale: assign(({ context }) => {
      const event = context.pendingSale
      if (!event) return {}
      const currentPlayer = getCurrentPlayer(context)

      const validation = validateSale(context, {
        ...event,
        beerSources: context.chosenBeerSources ?? [],
      })
      if (!validation.isValid) {
        return {
          // Drop the staged sale so a failed attempt doesn't leave a phantom
          // pending question (the board spotlight keys on pendingSale).
          pendingSale: null,
          chosenBeerSources: [],
          lastError: validation.error ?? 'Invalid sale',
          errorContext: 'sell' as const,
          logs: [
            ...context.logs,
            createLogEntry(`Cannot sell: ${validation.error}`, 'error'),
          ],
        }
      }
      const industryToSell = validation.industry!

      // Consume beer; merchant beer may come from the icon-matching tile at
      // the merchant being sold to
      const beerResult = consumeBeerFromSources(
        context,
        event.location,
        industryToSell.tile.beerRequired,
        event.merchant,
        industryToSell.type,
        context.chosenBeerSources ?? [],
      )

      if (!beerResult.success) {
        return {
          lastError: beerResult.errorMessage || 'Insufficient beer for sale',
          errorContext: 'sell' as const,
          logs: [
            ...context.logs,
            createLogEntry(
              `${currentPlayer.name} cannot sell ${industryToSell.type} at ${event.location} - insufficient beer (${beerResult.errorMessage})`,
              'error',
            ),
          ],
        }
      }

      // Flip the industry and advance income, starting from the post-beer state
      const playerAfterBeer =
        beerResult.updatedPlayers[context.currentPlayerIndex]!
      const updatedIndustries = playerAfterBeer.industries.map((industry) =>
        industry.location === event.location &&
        industry.type === event.industryType &&
        !industry.flipped
          ? { ...industry, flipped: true }
          : industry,
      )

      // Selling advances the marker by SPACES (the tile's arrow value).
      const incomeAdvancement = industryToSell.tile.incomeAdvancement || 0
      const soldSpace = advanceIncomeSpaces(
        playerAfterBeer.incomeSpace,
        incomeAdvancement,
      )
      const newIncome = incomeLevelForSpace(soldSpace)

      const updatedPlayer = {
        ...playerAfterBeer,
        industries: updatedIndustries,
        income: newIncome,
        incomeSpace: soldSpace,
      }

      // Apply merchant bonuses
      for (const bonus of beerResult.merchantBonusesCollected) {
        switch (bonus.type) {
          case 'money':
            updatedPlayer.money += bonus.value
            break
          case 'income':
            // Oxford's bonus advances the marker 2 SPACES (rules reference:
            // "Advance your income marker 2 spaces along the progress track")
            updatedPlayer.incomeSpace = advanceIncomeSpaces(
              updatedPlayer.incomeSpace,
              bonus.value,
            )
            updatedPlayer.income = incomeLevelForSpace(
              updatedPlayer.incomeSpace,
            )
            break
          case 'victoryPoints':
            updatedPlayer.victoryPoints += bonus.value
            updatedPlayer.vpAwards = [
              ...(updatedPlayer.vpAwards ?? []),
              {
                source: 'merchantBonus',
                era: context.era,
                vp: bonus.value,
                location: bonus.merchantLocation,
              },
            ]
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
                if (!isDevelopable(tile)) {
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
                .filter((t) => t.quantityAvailable > 0)
                .map((t) => t.tile)
                .find((t) => t.level === lowestLevel && isDevelopable(t))

              if (tileToRemove) {
                updatedPlayer.industryTilesOnMat = {
                  ...updatedPlayer.industryTilesOnMat,
                  [industryTypeToRemove]: decrementTileQuantity(
                    tilesWithQuantity,
                    tileToRemove,
                  ),
                }
              }
            }
            break
        }
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

      return {
        players: playersAfterSell,
        resources: beerResult.updatedResources,
        merchants: beerResult.updatedMerchants || context.merchants,
        salesMadeThisAction: context.salesMadeThisAction + 1,
        // The staged sale is done; reset so the next SELECT_SALE stages afresh.
        pendingSale: null,
        chosenBeerSources: [],
        lastError: null,
        errorContext: null,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} sold ${industryToSell.type} at ${event.location} to merchant at ${event.merchant} (flipped, income +${incomeAdvancement}, ${beerResult.logDetails.join(', ')})`,
            'action',
          ),
          ...(autoFlipResult.logs || []),
        ],
      }
    }),

    // Finish the Sell action: discard the action card and consume the action
    completeSellAction: assign(({ context }) => {
      if (!context.selectedCard) return {}
      const currentPlayer = getCurrentPlayer(context)
      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )
      const salesMade = context.salesMadeThisAction

      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          { hand: updatedHand },
        ),
        ...routeCardsToDiscard(context, [context.selectedCard]),
        selectedCard: null,
        salesMadeThisAction: 0,
        pendingSale: null,
        chosenBeerSources: [],
        actionsRemaining: context.actionsRemaining - 1,
        lastError: null,
        errorContext: null,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} completed Sell action (${salesMade} industr${salesMade === 1 ? 'y' : 'ies'} sold) using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
        ],
      }
    }),

    executeScoutAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (
        context.selectedCardsForScout.length !==
        GAME_CONSTANTS.SCOUT_CARDS_REQUIRED
      ) {
        return {
          lastError: `Scout action requires exactly ${GAME_CONSTANTS.SCOUT_CARDS_REQUIRED} cards to be selected`,
          errorContext: 'scout' as const,
        }
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
        return {
          lastError: 'No wild cards available for scout action',
          errorContext: 'scout' as const,
        }
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
        return {
          lastError: 'No cards in hand to discard for pass action',
          errorContext: null,
        }
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
        ...routeCardsToDiscard(context, [cardToDiscard]),
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
      const currentPlayer = getCurrentPlayer(context)
      // Position of the current player within this round's turn order
      const orderPosition = context.turnOrder.indexOf(currentPlayer.id)
      const isRoundComplete =
        orderPosition === -1 || orderPosition === context.turnOrder.length - 1

      const nextRound = isRoundComplete ? context.round + 1 : context.round
      const nextActionsRemaining = isFirstRound({
        ...context,
        round: nextRound,
      })
        ? GAME_CONSTANTS.FIRST_ROUND_ACTIONS
        : GAME_CONSTANTS.NORMAL_ROUND_ACTIONS

      let updatedPlayers = [...context.players]
      let updatedPlayerSpending = { ...context.playerSpending }
      let newTurnOrder = context.turnOrder
      let finalPlayerIndex = context.currentPlayerIndex
      let eraEndPending = false
      let roundSummary = context.roundSummary
      const logs = [...context.logs]

      if (!isRoundComplete) {
        // Advance to the next player in this round's turn order
        const nextPlayerId = context.turnOrder[orderPosition + 1]!
        finalPlayerIndex = context.players.findIndex(
          (p) => p.id === nextPlayerId,
        )
      }

      // If round is complete, handle end of round logic
      if (isRoundComplete) {
        // 1. Determine turn order for next round based on spending:
        // least spender first; equal spenders keep their relative order
        // from the current round.
        const spendingOrder = context.turnOrder.map((playerId, position) => ({
          playerId,
          position,
          spent: context.playerSpending[playerId] || 0,
        }))
        spendingOrder.sort((a, b) => {
          if (a.spent !== b.spent) return a.spent - b.spent
          return a.position - b.position
        })
        newTurnOrder = spendingOrder.map((p) => p.playerId)

        // The least spender starts the next round
        finalPlayerIndex = context.players.findIndex(
          (p) => p.id === newTurnOrder[0],
        )

        // Reset player spending for the new round
        updatedPlayerSpending = {}

        // Era/game end detection: the era ends following the round in which
        // the draw deck and all hands are exhausted. Income is not collected
        // at the end of the final round of the game (rail era end).
        const isEraOver =
          context.drawPile.length === 0 &&
          updatedPlayers.every((player) => player.hand.length === 0)
        eraEndPending = isEraOver
        const isFinalGameRound =
          context.isFinalRound || (context.era === 'rail' && isEraOver)

        // Money before settlement, so the summary can report the income
        // delta the players actually experienced (a shortfall pays only
        // what it can) rather than the nominal income figure.
        const moneyBefore = new Map(
          updatedPlayers.map((player) => [player.id, player.money]),
        )

        // 2. Collect income (if not final round of the game)
        if (!isFinalGameRound) {
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
                    remainingShortfall -= saleValue

                    logs.push(
                      createLogEntry(
                        `${player.name} sold ${industry.type} industry for £${saleValue}`,
                        'info',
                      ),
                    )
                  }
                }

                // Sale proceeds settle the debt; the player keeps only the
                // excess (rules: "You keep any excess money") — audited
                // 2026-07-15, the proceeds were previously kept in full.
                if (remainingShortfall < 0) {
                  updatedPlayer.money = -remainingShortfall
                  remainingShortfall = 0
                }

                // Remove sold industries (in reverse order to maintain
                // indices). Copy first: after {...player} the array is
                // still SHARED with the previous context, and in-place
                // splices leak through snapshot probes and undo anchors.
                updatedPlayer.industries = [...updatedPlayer.industries]
                industriesToRemove.reverse().forEach((index) => {
                  updatedPlayer.industries.splice(index, 1)
                })

                // If still short, lose VP
                if (remainingShortfall > 0) {
                  // The penalty clamps at 0, so the VP actually lost can be
                  // less than the debt. Record the applied delta — recording
                  // the debt would break the ledger's reconciliation.
                  const lost = Math.min(
                    remainingShortfall,
                    updatedPlayer.victoryPoints,
                  )
                  updatedPlayer.victoryPoints -= lost
                  if (lost > 0) {
                    updatedPlayer.vpAwards = [
                      ...(updatedPlayer.vpAwards ?? []),
                      {
                        source: 'incomeShortfall',
                        era: context.era,
                        vp: -lost,
                      },
                    ]
                  }
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

        const income: Record<string, number> = {}
        updatedPlayers.forEach((player) => {
          const delta = player.money - (moneyBefore.get(player.id) ?? 0)
          if (delta !== 0) income[player.id] = delta
        })

        roundSummary = {
          round: context.round,
          era: context.era,
          previousOrder: context.turnOrder,
          newOrder: newTurnOrder,
          spending: Object.fromEntries(
            context.turnOrder.map((playerId) => [
              playerId,
              context.playerSpending[playerId] || 0,
            ]),
          ),
          income,
          eraEnded: isEraOver,
        }

        logs.push(createLogEntry(`Round ${context.round} completed`, 'system'))

        if (isEraOver) {
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
        roundSummary,
        eraEndPending,
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
      pendingSale: null,
      chosenBeerSources: [],
      chosenIronSources: [],
      pendingIronStep: null,
    }),

    /** Hold a sale still while the player says where its beer comes from. */
    stageSale: assign(({ event }) => {
      if (event.type !== 'SELECT_SALE') return {}
      return {
        pendingSale: {
          location: event.location,
          industryType: event.industryType,
          merchant: event.merchant,
        },
        chosenBeerSources: [],
      }
    }),

    clearStagedSale: assign({ pendingSale: null, chosenBeerSources: [] }),

    // Entered from either build or develop — record which, and start the pick
    // list fresh. pendingIronChoice reads this rather than guessing.
    enterBuildIronStep: assign({
      pendingIronStep: 'build' as const,
      chosenIronSources: [],
    }),
    enterDevelopIronStep: assign({
      pendingIronStep: 'develop' as const,
      chosenIronSources: [],
    }),

    /**
     * Assign one barrel. Picking again once every barrel is spoken for starts
     * the allocation over, so a single-barrel step behaves like a radio.
     */
    chooseBeerSource: assign(({ context, event }) => {
      if (event.type !== 'SELECT_BEER_SOURCE') return {}
      const required = pendingBeerChoice(context)?.required ?? 0
      const picks = context.chosenBeerSources ?? []
      return {
        chosenBeerSources:
          picks.length >= required ? [event.source] : [...picks, event.source],
      }
    }),

    chooseIronSource: assign(({ context, event }) => {
      if (event.type !== 'SELECT_IRON_SOURCE') return {}
      const required = pendingIronChoice(context)?.required ?? 0
      const picks = context.chosenIronSources ?? []
      return {
        chosenIronSources:
          picks.length >= required ? [event.source] : [...picks, event.source],
      }
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
      const tilesWithQuantity =
        player.industryTilesOnMat[event.industryType] || []
      const lowestTile = getLowestAvailableTile(tilesWithQuantity)

      if (!lowestTile) {
        return {
          lastError: `No ${event.industryType} tiles available`,
          errorContext: 'build' as const,
        }
      }

      // Stay era-aware so this agrees with canSelectIndustryType: the lowest
      // tile is the only candidate, and a canal-only one must be Developed
      // away rather than skipped (rules p.7).
      if (!canBuildTileInEra(lowestTile, context.era)) {
        return {
          lastError: eraRestrictionMessage(lowestTile, context.era),
          errorContext: 'build' as const,
        }
      }

      const result: Partial<GameState> = {
        selectedIndustryTile: lowestTile,
      }

      // If the selected card is a REAL location card, auto-select the
      // location printed on it. Wild location cards have no printed city —
      // the player picks one in the selectingLocation step instead.
      if (context.selectedCard?.type === 'location') {
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
        const tilesWithQuantity =
          currentPlayer.industryTilesOnMat[industryType] || []

        // Filter out pottery tiles with lightbulb icon and tiles with no quantity
        const developableTiles = tilesWithQuantity
          .filter((t) => t.quantityAvailable > 0)
          .map((t) => t.tile)
          .filter(isDevelopable)

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
        // Tests set income by LEVEL; keep the marker consistent by placing
        // it on the highest space of that level.
        ...(event.income !== undefined && {
          income: event.income,
          incomeSpace: highestSpaceForLevel(event.income),
        }),
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

    setMerchants: assign(({ event }) => {
      if (event.type !== 'TEST_SET_MERCHANTS') return {}
      return {
        merchants: event.merchants,
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

      // Score Link tiles - each link scores 1 VP for each "•—•" in adjacent
      // locations (icons on built industry tiles + printed merchant icons).
      // All links are valued against the board state before any tiles are
      // removed by scoring.
      for (let i = 0; i < updatedPlayers.length; i++) {
        const player = updatedPlayers[i]!
        let linkVPs = 0
        const awards: VpAward[] = []

        for (const link of player.links) {
          const vp = calculateLinkVictoryPoints(context, link)
          linkVPs += vp
          // Recorded even at 0 VP: the end screen still wants to show that
          // the link existed, and these tiles are about to be destroyed.
          awards.push({ source: 'link', era: context.era, vp, link })
        }

        if (linkVPs > 0) {
          logMessages.push(
            `${player.name} scored ${linkVPs} VPs from link tiles`,
          )
        }
        // Link tiles are removed from the board after scoring
        updatedPlayers[i] = {
          ...player,
          victoryPoints: player.victoryPoints + linkVPs,
          vpAwards: [...(player.vpAwards ?? []), ...awards],
          links: [],
        }
      }

      // Score Flipped Industry tiles - score VPs shown in bottom left corner.
      // Unflipped tiles do not score but stay on the board (only level 1
      // tiles are removed, by the canal-era-end step).
      for (let i = 0; i < updatedPlayers.length; i++) {
        const player = updatedPlayers[i]!
        let industryVPs = 0
        const awards: VpAward[] = []

        for (const industry of player.industries) {
          if (industry.flipped) {
            industryVPs += industry.tile.victoryPoints
            awards.push({
              source: 'industry',
              era: context.era,
              vp: industry.tile.victoryPoints,
              location: industry.location,
              industryType: industry.type,
              level: industry.level,
            })
          }
        }

        if (industryVPs > 0) {
          logMessages.push(
            `${player.name} scored ${industryVPs} VPs from flipped industry tiles`,
          )
        }

        updatedPlayers[i] = {
          ...player,
          victoryPoints: player.victoryPoints + industryVPs,
          vpAwards: [...(player.vpAwards ?? []), ...awards],
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
        eraEndPending: false,
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
      // Declare the winner: most VPs; ties broken first by highest income,
      // then by most money remaining; players still tied share the win.
      const ranked = [...context.players].sort(
        (a, b) =>
          b.victoryPoints - a.victoryPoints ||
          b.income - a.income ||
          b.money - a.money,
      )
      const top = ranked[0]!
      const winners = ranked
        .filter(
          (p) =>
            p.victoryPoints === top.victoryPoints &&
            p.income === top.income &&
            p.money === top.money,
        )
        .map((p) => p.id)

      const winnerNames = context.players
        .filter((p) => winners.includes(p.id))
        .map((p) => p.name)

      return {
        winners,
        logs: [
          ...context.logs,
          createLogEntry('Rail Era ended', 'system'),
          createLogEntry('Game Over! Final scores calculated.', 'system'),
          createLogEntry(
            winnerNames.length === 1
              ? `${winnerNames[0]} wins with ${top.victoryPoints} VPs!`
              : `Game drawn between ${winnerNames.join(' and ')} with ${top.victoryPoints} VPs`,
            'system',
          ),
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
      // Wild industry cards are NOT routed here: they carry no printed
      // industries, so the flow must pass through selectingIndustryType
      // (the fallback SELECT_CARD transition) before picking a location.
      return card?.type === 'industry'
    },
    isLocationCard: ({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return false
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      return card?.type === 'location' || card?.type === 'wild_location'
    },
    isCardInHand: ({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return false
      const player = getCurrentPlayer(context)
      return findCardInHand(player, event.cardId) !== null
    },
    isSelectedCardReclick: ({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return false
      return (
        context.selectedCard !== null &&
        context.selectedCard.id === event.cardId
      )
    },
    // Card-first BUILD routing — the same split isLocationCard/isIndustryCard
    // make on the SELECT_CARD event, but read from the already-held card.
    isSelectedCardLocationKind: ({ context }) =>
      context.selectedCard?.type === 'location' ||
      context.selectedCard?.type === 'wild_location',
    isSelectedCardIndustry: ({ context }) =>
      context.selectedCard?.type === 'industry',
    canCompleteBuild: ({ context }) => {
      // For REAL location cards, just need card and location (wild location
      // cards fall through to the full tile + location + resources check).
      if (context.selectedCard?.type === 'location') {
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
    /** The source question this step asks is answered (or there was none). */
    beerChoiceSatisfied: ({ context }) => beerChoiceSatisfied(context),
    ironChoiceSatisfied: ({ context }) => ironChoiceSatisfied(context),

    /** Only a source this step actually offers may be picked. */
    canChooseBeerSource: ({ context, event }) =>
      event.type === 'SELECT_BEER_SOURCE' &&
      canChooseBeerSource(context, event.source),
    canChooseIronSource: ({ context, event }) =>
      event.type === 'SELECT_IRON_SOURCE' &&
      canChooseIronSource(context, event.source),

    canExecuteSale: ({ context, event }) => {
      if (event.type !== 'SELECT_SALE') return false
      return validateSale(context, event).isValid
    },

    // You cannot take a loan if it would take your income level below -10
    canTakeLoan: ({ context }) =>
      context.selectedCard !== null &&
      getCurrentPlayer(context).income - GAME_CONSTANTS.LOAN_INCOME_PENALTY >=
        GAME_CONSTANTS.MIN_INCOME,

    hasSoldThisAction: ({ context }) => context.salesMadeThisAction > 0,

    hasNotSoldThisAction: ({ context }) => context.salesMadeThisAction === 0,

    canScout: ({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      // Cannot scout if player already has wild cards in hand
      const hasWildCard = currentPlayer.hand.some(
        (card) =>
          card.type === 'wild_location' || card.type === 'wild_industry',
      )
      return (
        context.selectedCardsForScout.length === 3 &&
        !hasWildCard &&
        context.wildLocationPile.length > 0 &&
        context.wildIndustryPile.length > 0
      )
    },
    hasSelectedLink: ({ context }) => {
      if (context.selectedLink === null) {
        return false
      }

      const linkCost =
        context.era === 'canal'
          ? GAME_CONSTANTS.CANAL_LINK_COST
          : GAME_CONSTANTS.RAIL_LINK_COST
      let coalCost = 0

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
        coalCost = coalResult.coalCost
      }

      // Brass has no debt: the player must be able to pay the full cost
      return getCurrentPlayer(context).money >= linkCost + coalCost
    },
    canBuildLink: ({ context, event }) => {
      if (event.type !== 'SELECT_LINK' && event.type !== 'SELECT_SECOND_LINK') {
        return false
      }

      // Check if any player already has a link on this connection
      const existingLink = context.players.some((player) =>
        player.links.some(
          (link) =>
            (link.from === event.from && link.to === event.to) ||
            (link.from === event.to && link.to === event.from),
        ),
      )

      if (existingLink) {
        return false
      }

      const currentPlayer = getCurrentPlayer(context)

      // Brass has no debt. Coal cost isn't known until a link is picked, so
      // this only gates on the base cost; hasSelectedLink checks cost + coal.
      const baseLinkCost =
        context.era === 'canal'
          ? GAME_CONSTANTS.CANAL_LINK_COST
          : GAME_CONSTANTS.RAIL_LINK_COST
      if (currentPlayer.money < baseLinkCost) {
        return false
      }

      // Exception: If player has no industries or links on board, can build anywhere
      const hasNoTilesOnBoard =
        currentPlayer.industries.length === 0 &&
        currentPlayer.links.length === 0
      if (hasNoTilesOnBoard) {
        return true
      }

      // Special handling for second link in double link building
      if (event.type === 'SELECT_SECOND_LINK') {
        if (!context.selectedLink) {
          return false
        }

        // Second link follows same network adjacency rules as regular links
        // (No special adjacency requirement between the two links)
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

      // Add locations adjacent to player's links (incl. farm breweries)
      currentPlayer.links.forEach((link) => {
        for (const loc of linkConnectedLocations(link.from, link.to)) {
          playerLocations.add(loc)
        }
      })

      // Check if either end of the new link is part of player's network
      return playerLocations.has(event.from) || playerLocations.has(event.to)
    },
    canSelectLocation: ({ context, event }) => {
      if (event.type !== 'SELECT_LOCATION') return false
      if (!context.selectedCard) return false

      // Farm Breweries may only be reached with a Brewery Industry or a
      // Wild Industry card — never location/wild-location cards (rules p.5)
      if (
        FARM_BREWERIES.has(event.cityId) &&
        (context.selectedCard.type === 'location' ||
          context.selectedCard.type === 'wild_location')
      ) {
        return false
      }

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

      // For industry and wild cards the industry tile is already chosen —
      // check the location can accommodate it, either in a free slot or as
      // a legal overbuild
      if (context.selectedIndustryTile) {
        return canPlaceOrOverbuildIndustry(
          context,
          event.cityId,
          context.selectedIndustryTile.type,
          context.selectedIndustryTile.level,
        )
      }

      return true
    },
    canSelectIndustryType: ({ context, event }) => {
      if (event.type !== 'SELECT_INDUSTRY_TYPE') return false
      if (!context.selectedCard) return false

      // The mat's lowest tile is the only candidate, and it must be legal in
      // the current era - a canal-only tile is not skipped, it blocks the
      // industry until Develop removes it (rules p.4 step 2 / p.7).
      const player = getCurrentPlayer(context)
      const tilesWithQuantity =
        player.industryTilesOnMat[event.industryType] || []
      const buildableTile = getBuildableTileInEra(
        tilesWithQuantity,
        context.era,
      )

      if (!buildableTile) {
        return false
      }

      // For location cards, check if the location can accommodate this
      // industry type - either in a free slot or as a legal overbuild
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        return canPlaceOrOverbuildIndustry(
          context,
          locationCard.location as CityId,
          event.industryType,
          buildableTile.level,
        )
      }

      // For wild location cards, can build anywhere (no slot restriction)
      if (context.selectedCard.type === 'wild_location') {
        return true
      }

      // For industry cards, location validation happens later when location is selected
      return true
    },
    isLocationCardSelected: ({ context }) => {
      // Only REAL location cards skip location selection (the city is
      // printed on the card). A wild location card must continue to
      // selectingLocation so the player can choose any city.
      return context.selectedCard?.type === 'location'
    },

    isEraEnd: ({ context }) => {
      // Era ends when draw deck is exhausted AND all players' hands are empty
      const drawDeckEmpty = context.drawPile.length === 0
      const allHandsEmpty = context.players.every(
        (player) => player.hand.length === 0,
      )
      return drawDeckEmpty && allHandsEmpty
    },

    // Era end fires only once the round in which the last cards were played
    // has fully completed (turn order + income resolved by nextPlayer)
    isCanalEraEnd: ({ context }) =>
      context.eraEndPending && context.era === 'canal',

    isRailEraEnd: ({ context }) =>
      context.eraEndPending && context.era === 'rail',

    // A player may only keep taking actions while they have actions left AND
    // cards to discard for them (hands shrink once the draw deck is empty)
    canContinueTurn: ({ context }) =>
      context.actionsRemaining > 0 && getCurrentPlayer(context).hand.length > 0,

    currentPlayerHandEmpty: ({ context }) =>
      getCurrentPlayer(context).hand.length === 0,

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
        .filter((player) => player.id !== currentPlayer.id)
        .flatMap((player) => player.industries)
        .filter(
          (industry) =>
            industry.type === 'brewery' &&
            !industry.flipped &&
            industry.beerBarrelsOnTile > 0,
        )

      // Allow if player has own brewery beer OR there are opponent breweries available
      return ownBreweries.length > 0 || opponentBreweries.length > 0
    },

    hasSelectedSecondLink: ({ context }) => context.selectedSecondLink !== null,

    hasSelectedTilesForDevelop: ({ context }) => {
      const canAffordIron = (tileCount: number) => {
        const iron = consumeIronFromSources(
          context,
          tileCount,
          context.chosenIronSources ?? [],
        )
        // Brass has no debt, and a source the player named must be legal
        return iron.success && getCurrentPlayer(context).money >= iron.ironCost
      }

      // Allow confirmation if tiles are selected OR for backward compatibility
      if (context.selectedTilesForDevelop.length > 0) {
        // Brass has no debt: the iron for the selected tiles must be payable
        return canAffordIron(context.selectedTilesForDevelop.length)
      }

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
        const tilesWithQuantity =
          currentPlayer.industryTilesOnMat[industryType] || []
        const developableTiles = tilesWithQuantity
          .filter((t) => t.quantityAvailable > 0)
          .map((t) => t.tile)
          .filter(isDevelopable)
        if (developableTiles.length > 0) {
          // The auto-select fallback develops exactly one tile
          return canAffordIron(1)
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

      // Check if beer is available for double rail link. Judge reachability
      // against the post-placement network (both rails built), matching
      // execution — an opponent brewery reachable only via the new rails must
      // be treated the same here as at consumption.
      const beerCheckResult = consumeBeerFromSources(
        withProvisionalDoubleLink(context),
        context.selectedSecondLink.to,
        1,
        // No merchant beer for Network actions
        undefined,
        undefined,
        context.chosenBeerSources ?? [],
      )

      if (!beerCheckResult.success) {
        return false
      }

      // Brass has no debt: £15 plus the coal for both links must be payable
      const firstCoal = consumeCoalFromSources(
        context,
        context.selectedLink.from,
        1,
      )
      if (!firstCoal.success) {
        return false
      }
      // Mirror execution: the second link is on the board (and so part of the
      // player's network) before its coal is sourced
      const playerWithLinks =
        firstCoal.updatedPlayers[context.currentPlayerIndex]!
      const secondCoal = consumeCoalFromSources(
        {
          ...context,
          players: updatePlayerInList(
            firstCoal.updatedPlayers,
            context.currentPlayerIndex,
            {
              ...playerWithLinks,
              links: [
                ...playerWithLinks.links,
                { ...context.selectedLink, type: 'rail' as const },
                { ...context.selectedSecondLink, type: 'rail' as const },
              ],
            },
          ),
          coalMarket: firstCoal.updatedCoalMarket,
        },
        context.selectedSecondLink.from,
        1,
      )
      if (!secondCoal.success) {
        return false
      }

      const totalCost =
        GAME_CONSTANTS.RAIL_DOUBLE_LINK_COST +
        firstCoal.coalCost +
        secondCoal.coalCost
      return getCurrentPlayer(context).money >= totalCost
    },
  },
}).createMachine({
  id: 'brassGame',
  // Safety net on the `always` chains. The engine leans on eventless
  // transitions to auto-advance (actionComplete → nextPlayer, the era-end
  // guards, the source-choice auto-skips); a regressed guard could spin one
  // of those forever and hang the request that is driving it. A finite cap
  // turns that hang into a loud throw. Well above any real chain (the
  // longest is a handful of microsteps), so it can only fire on a genuine
  // bug — never on legal play.
  options: { maxIterations: 1000 },
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
    roundSummary: null,
    isFinalRound: false,
    selectedLink: null,
    selectedSecondLink: null,
    selectedLocation: null,
    selectedIndustryTile: null,
    selectedTilesForDevelop: [],
    merchants: [],
    salesMadeThisAction: 0,
    pendingSale: null,
    chosenBeerSources: [],
    chosenIronSources: [],
    pendingIronStep: null,
    eraEndPending: false,
    winners: null,
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
        JOIN_GAME: {
          actions: 'updatePlayer2Name',
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
        TEST_SET_MERCHANTS: {
          actions: 'setMerchants',
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
                // Card-first entry: picking a hand card before an action
                // holds it and offers the actions it can start.
                SELECT_CARD: {
                  target: 'cardSelected',
                  actions: 'selectCard',
                  guard: 'isCardInHand',
                },
              },
            },
            // A hand card is held but no action chosen yet. Each action
            // event continues into that action's normal flow PAST its
            // card step — the held card is carried, never re-asked.
            cardSelected: {
              on: {
                SELECT_CARD: [
                  {
                    // Clicking the held card again puts it back.
                    target: 'selectingAction',
                    actions: 'clearSelections',
                    guard: 'isSelectedCardReclick',
                  },
                  {
                    // Clicking another card switches the held card.
                    actions: 'selectCard',
                    guard: 'isCardInHand',
                  },
                ],
                BUILD: [
                  {
                    // Same routing as the action-first SELECT_CARD split:
                    // location & wild cards pick the industry next; a real
                    // industry card (tile auto-picked) goes to the site.
                    target:
                      '#brassGame.playing.action.building.selectingIndustryType',
                    guard: 'isSelectedCardLocationKind',
                  },
                  {
                    target:
                      '#brassGame.playing.action.building.selectingLocation',
                    guard: 'isSelectedCardIndustry',
                  },
                  {
                    target:
                      '#brassGame.playing.action.building.selectingIndustryType',
                  },
                ],
                NETWORK: {
                  target: '#brassGame.playing.action.networking.selectingLink',
                },
                DEVELOP: {
                  target: '#brassGame.playing.action.developing.selectingTiles',
                },
                SELL: {
                  target: '#brassGame.playing.action.selling.selectingSale',
                },
                TAKE_LOAN: {
                  target: '#brassGame.playing.action.takingLoan.confirmingLoan',
                },
                SCOUT: {
                  target: '#brassGame.playing.action.scouting.selectingCards',
                  actions: 'seedScoutFromSelectedCard',
                },
                CANCEL: {
                  target: 'selectingAction',
                  actions: 'clearSelections',
                },
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
                        // A location card fixes the site, so the next question
                        // is the iron source (choosingIronSource auto-skips
                        // when the tile needs no iron or only one works can
                        // supply it). Routing straight to confirmingBuild here
                        // skipped that step for location-card builds.
                        target: 'choosingIronSource',
                        actions: 'selectIndustryType',
                        // BOTH guards: a real location card fixes the site,
                        // and canSelectIndustryType checks the industry has
                        // a compatible slot (or legal overbuild) THERE.
                        // Guard-order bug fixed 2026-07-15: with only
                        // isLocationCardSelected, the wizard reached an
                        // enabled Confirm for brewery at Birmingham (no
                        // brewery slot) and failed only at execution.
                        guard: and([
                          'isLocationCardSelected',
                          'canSelectIndustryType',
                        ]),
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
                      target: 'choosingIronSource',
                      actions: 'selectLocation',
                      guard: 'canSelectLocation',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearCard',
                    },
                  },
                },
                /**
                 * Which iron works (or the market) pays for this build. Skipped
                 * whenever the tile needs no iron, or only one source could
                 * supply it — which is most builds.
                 */
                choosingIronSource: {
                  entry: 'enterBuildIronStep',
                  always: [
                    { guard: 'ironChoiceSatisfied', target: 'confirmingBuild' },
                  ],
                  on: {
                    SELECT_IRON_SOURCE: {
                      actions: 'chooseIronSource',
                      guard: 'canChooseIronSource',
                    },
                    CANCEL: {
                      target: 'selectingLocation',
                      actions: 'clearLocation',
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
                      target: 'choosingIronSource',
                      actions: 'selectTilesForDevelop',
                    },
                    CONFIRM: {
                      target: 'choosingIronSource',
                      // Don't run selectTilesForDevelop action - use auto-selection in executeDevelopAction
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
                    },
                  },
                },
                /** One cube per scrapped tile — from any unflipped works. */
                choosingIronSource: {
                  entry: 'enterDevelopIronStep',
                  always: [
                    {
                      guard: 'ironChoiceSatisfied',
                      target: 'confirmingDevelop',
                    },
                  ],
                  on: {
                    SELECT_IRON_SOURCE: {
                      actions: 'chooseIronSource',
                      guard: 'canChooseIronSource',
                    },
                    CANCEL: {
                      target: 'selectingTiles',
                      actions: 'clearTilesForDevelop',
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
                      target: 'selectingSale',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                selectingSale: {
                  on: {
                    // Each sale flips one industry; the player may repeat for
                    // multiple industries before confirming. The sale is
                    // STAGED here and executed by choosingBeerSource, which
                    // asks where its beer comes from — or skips straight
                    // through when there is nothing to ask.
                    SELECT_SALE: {
                      target: 'choosingBeerSource',
                      actions: 'stageSale',
                      guard: 'canExecuteSale',
                    },
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'completeSellAction',
                      guard: 'hasSoldThisAction',
                    },
                    CANCEL: {
                      // Sales are irreversible; only cancel before selling
                      target: 'selectingCard',
                      actions: 'clearSelections',
                      guard: 'hasNotSoldThisAction',
                    },
                  },
                },
                /**
                 * Where does this sale's beer come from? A real step, like
                 * choosing a card — but only when the answer could differ:
                 * `beerChoiceSatisfied` is already true when one source must
                 * supply it all, so the machine passes straight through and
                 * the engine picks as it always has.
                 */
                choosingBeerSource: {
                  always: [
                    {
                      guard: 'beerChoiceSatisfied',
                      target: 'selectingSale',
                      actions: 'executeStagedSale',
                    },
                  ],
                  on: {
                    SELECT_BEER_SOURCE: {
                      actions: 'chooseBeerSource',
                      guard: 'canChooseBeerSource',
                    },
                    CANCEL: {
                      // Nothing was flipped yet — the staged sale is free to drop
                      target: 'selectingSale',
                      actions: 'clearStagedSale',
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
                      guard: 'canTakeLoan',
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
                      target: 'choosingDoubleLinkBeer',
                      actions: 'selectSecondLink',
                      guard: 'canBuildLink',
                    },
                    CANCEL: {
                      target: 'confirmingLink',
                      actions: 'clearSecondLink',
                    },
                  },
                },
                /**
                 * The double rail's one barrel — never merchant beer (rules
                 * p.9). Skipped when only one brewery can supply it.
                 */
                choosingDoubleLinkBeer: {
                  entry: 'enterDoubleLinkBeerStep',
                  always: [
                    {
                      guard: 'beerChoiceSatisfied',
                      target: 'confirmingDoubleLink',
                    },
                  ],
                  on: {
                    SELECT_BEER_SOURCE: {
                      actions: 'chooseBeerSource',
                      guard: 'canChooseBeerSource',
                    },
                    CANCEL: {
                      target: 'selectingSecondLink',
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
          entry: ['checkAndFlipIndustryTiles'],
          always: [
            {
              guard: 'canContinueTurn',
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
          // Hands are refilled at the END of a player's turn (before the
          // next player is determined), per the rules.
          entry: ['refillPlayerHand', 'nextPlayer'],
          always: [
            {
              // Canal era ends automatically: score, apply canal-era-end
              // effects, and continue play into the rail era
              guard: 'isCanalEraEnd',
              actions: ['triggerEraScoring', 'triggerCanalEraEnd'],
              target: 'action',
            },
            {
              // Rail era ends automatically: score and finish the game
              guard: 'isRailEraEnd',
              actions: ['triggerEraScoring', 'triggerRailEraEnd'],
              target: '#brassGame.gameOver',
            },
            {
              // A player with no cards left cannot act - skip them
              guard: 'currentPlayerHandEmpty',
              target: 'nextPlayer',
              reenter: true,
            },
            {
              target: 'action',
            },
          ],
        },
      },
    },
    gameOver: {
      type: 'final',
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
