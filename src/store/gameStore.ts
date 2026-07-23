import { type Actor, StateFrom, and, assign, not, setup } from 'xstate'
import {
  type CityId,
  FARM_BREWERIES,
  connections,
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
  buildCompletionAt,
  buildIndustryTile,
  canBuildIndustryAt,
  eraRestrictionMessage,
  hasBuildableSite,
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
  railNetworkCostView,
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
  type CoalSource,
  type IronSource,
  type Resource,
  beerChoiceSatisfied,
  canChooseBeerSource,
  canChooseCoalSource,
  canChooseIronSource,
  coalChoiceSatisfied,
  ironChoiceSatisfied,
  pendingBeerChoice,
  pendingCoalChoice,
  pendingIronChoice,
  withProvisionalDoubleLink,
  withProvisionalLink,
} from './shared/resourceSources'
import { getDevelopBonusOptions } from './shared/developBonus'

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
   * Which mine each equal-distance coal tie drains, in order — one entry per
   * tie cube the action needs. Empty = the engine's nearest-mine auto-pick.
   * Public board references only (like the beer/iron picks), so multiplayer
   * need not filter them.
   */
  chosenCoalSources: CoalSource[]
  /**
   * Which action the open iron-source step belongs to — set on entry to the
   * choosing state, so the engine never has to infer build-vs-develop from
   * context (the fields collide: an industry Develop card also sets
   * `selectedIndustryTile`). Null outside a choosingIronSource state.
   */
  pendingIronStep: 'build' | 'develop' | null
  /**
   * Which action the open coal-source step belongs to — set on entry, for the
   * same reason as `pendingIronStep`. `build` sources one demand (the build
   * city), `link` one (the placed rail link), `doubleLink` two (each rail in
   * turn). Null outside a coal-choosing state.
   */
  pendingCoalStep: 'build' | 'link' | 'doubleLink' | null
  /**
   * A merchant "Develop" beer bonus (Gloucester) owed to the current player:
   * `remaining` tiles still to remove from their mat, for no iron cost. Only
   * set when 2+ industry tracks could be developed — a single legal option is
   * auto-applied at sale time, so the machine never enters the choosing step
   * for it. Cleared as each pick lands. Public (mats are open information), so
   * multiplayer need not filter it.
   */
  pendingDevelopChoice: { remaining: number; merchant: CityId } | null
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
      /** Drain this mine for one tied coal cube (a `choosing*Coal` step). */
      type: 'SELECT_COAL_SOURCE'
      source: CoalSource
    }
  | {
      /**
       * Remove this industry's lowest tile for a merchant Develop bonus (the
       * `selling.choosingDevelopTile` step).
       */
      type: 'SELECT_DEVELOP_TILE'
      industryType: IndustryType
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
      links?: Player['links']
      industryTilesOnMat?: Player['industryTilesOnMat']
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

// A rail Network action is payable when every link reaches coal once placed
// (rules L116/L308) and the player can afford the base cost plus any market
// coal (Brass has no debt). The preview (`railNetworkCostView`) reads
// `context.selectedLink`/`selectedSecondLink` and is the single source of truth
// for both SELECT candidacy and the confirm guards, so an offered route is
// always confirmable and the dock's cost display can never drift from the
// guard. The double form also needs beer, checked separately by
// `canCompleteDoubleLink`.
function railNetworkPayable(context: GameState): boolean {
  const preview = railNetworkCostView(context)
  if (preview === null || !preview.ok) return false
  return getCurrentPlayer(context).money >= preview.total
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

      // Official setup (rules p.11, l.402): after drawing their 8-card hand
      // each player draws 1 more card face down as their starting Discard
      // Pile. We keep a single shared discard pile, so the per-player,
      // face-down distinction has no effect once setup is done — deal one
      // card per player into it. This brings the post-setup draw deck to the
      // official 22/27/28 for 2/3/4 players.
      const startingDiscard = shuffledCards.slice(
        currentIndex,
        currentIndex + playerCount,
      )
      currentIndex += playerCount

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
        discardPile: startingDiscard,
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
        chosenCoalSources: [],
        pendingIronStep: null,
        pendingCoalStep: null,
        pendingDevelopChoice: null,
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
            `${currentPlayer.name} took a loan (£${GAME_CONSTANTS.LOAN_AMOUNT}, -${GAME_CONSTANTS.LOAN_INCOME_PENALTY} income) using ${getCardDescription(context.selectedCard)}`,
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
            context.chosenCoalSources ?? [],
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
          chosenCoalSources: [],
          pendingCoalStep: null,
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

      // Place the link BEFORE sourcing coal — a rail link's coal must come from
      // a mine connected "after it is placed" (rules p.7, L116/L308). Anchoring
      // at both endpoints also makes the mine pick independent of from/to.
      const playersWithLink = updatePlayerInList(
        context.players,
        context.currentPlayerIndex,
        { ...currentPlayer, links: [...currentPlayer.links, newLink] },
      )
      const contextWithLink = { ...context, players: playersWithLink }

      let coalCost = 0
      let coalResult: ReturnType<typeof consumeCoalFromSources> | null = null
      const updatedCoalMarket = context.coalMarket.map((level) => ({
        ...level,
      }))
      let logMessage = `${currentPlayer.name} built a ${context.era} link between ${context.selectedLink.from} and ${context.selectedLink.to}`

      // Consume coal if rail era
      if (context.era === 'rail') {
        coalResult = consumeCoalFromSources(
          contextWithLink,
          [context.selectedLink.from, context.selectedLink.to],
          1,
          context.chosenCoalSources ?? [],
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

        logMessage += ` (consumed ${coalResult.logDetails.join(', ')})`
      }

      const totalCost = linkCost + coalCost

      if (currentPlayer.money < totalCost) {
        return {
          lastError: `Insufficient funds. Cost: £${totalCost}, Available: £${currentPlayer.money}`,
          errorContext: 'network' as const,
        }
      }

      // Coal consumption already drained mines against the placed link, so the
      // returned players carry both the new link and the spent cubes.
      const playersAfterCoal = coalResult
        ? coalResult.updatedPlayers
        : playersWithLink
      const playerAfterCoal = playersAfterCoal[context.currentPlayerIndex]!

      const updatedPlayer = {
        ...playerAfterCoal,
        hand: updatedHand,
        money: playerAfterCoal.money - totalCost,
      }

      // Track money spent
      const currentSpending = context.playerSpending[currentPlayer.id] || 0

      debugLog('executeNetworkAction', context)
      return {
        players: updatePlayerInList(
          playersAfterCoal,
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
        chosenCoalSources: [],
        pendingCoalStep: null,
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
      // The double-link barrel + coal belong to this second link; drop any
      // picks so a re-selected link asks again rather than inheriting stale ones.
      chosenBeerSources: [],
      chosenCoalSources: [],
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

      // Coal tie picks are ordered first-link then second-link (the order
      // pendingCoalChoice walked the demands). The first consumption reports
      // how many it used so the second gets the rest.
      const coalPicks = context.chosenCoalSources ?? []

      // Consume first coal (closest to first link, over both its endpoints)
      const firstCoalResult = consumeCoalFromSources(
        {
          ...context,
          players: updatedPlayersAfterCoal,
          coalMarket: updatedCoalMarket,
        },
        [context.selectedLink.from, context.selectedLink.to],
        1,
        coalPicks,
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

      // Consume second coal (closest to second link's endpoints, with both
      // links now on the board)
      const secondCoalResult = consumeCoalFromSources(
        {
          ...context,
          players: updatedPlayersAfterCoal,
          coalMarket: updatedCoalMarket,
        },
        [context.selectedSecondLink.from, context.selectedSecondLink.to],
        1,
        coalPicks.slice(firstCoalResult.picksUsed),
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

      // Journal what was ACTUALLY consumed: the two coal sources (incl. any
      // mine that flipped) AND the beer source + any brewery that flipped
      // draining its last barrel — beerResult.logDetails carries both.
      const consumedDetails = [...coalLogDetails, ...beerResult.logDetails]
      const logMessage = `${currentPlayer.name} built 2 rail links (${context.selectedLink.from}-${context.selectedLink.to}, ${context.selectedSecondLink.from}-${context.selectedSecondLink.to}) for £${linkCost} + 1 beer + 2 coal (£${coalCost}) (consumed ${consumedDetails.join(', ')})`

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
        chosenCoalSources: [],
        pendingCoalStep: null,
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

      // A develop bonus with a genuine choice (2+ developable tracks) is
      // deferred to the choosingDevelopTile step; a single option is applied
      // here so the common case never stops. Extra journal lines from that
      // auto-apply ride along in this bucket.
      let pendingDevelopChoice: GameState['pendingDevelopChoice'] = null
      const bonusLogs: LogEntry[] = []

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
          case 'develop': {
            // Remove one of the LOWEST-level tiles of ANY industry track (rules
            // p.6/p.7), for no iron cost. The player chooses which track when
            // more than one is developable; a single option is auto-applied so
            // the flow never stops needlessly. A track whose lowest tile is a
            // lightbulb Pottery is never developable (getDevelopBonusOptions).
            const options = getDevelopBonusOptions(
              updatedPlayer.industryTilesOnMat,
            )
            if (options.length === 0) {
              // Nothing on the mat can be developed — the bonus is forfeit.
              bonusLogs.push(
                createLogEntry(
                  `${currentPlayer.name}'s merchant develop bonus was forfeit — no tile can be developed`,
                  'info',
                ),
              )
              break
            }
            if (options.length === 1) {
              const only = options[0]!
              updatedPlayer.industryTilesOnMat = {
                ...updatedPlayer.industryTilesOnMat,
                [only.industryType]: decrementTileQuantity(
                  updatedPlayer.industryTilesOnMat[only.industryType]!,
                  only.tile,
                ),
              }
              bonusLogs.push(
                createLogEntry(
                  `${currentPlayer.name} developed a level ${only.tile.level} ${only.industryType} tile (merchant develop bonus)`,
                  'action',
                ),
              )
              break
            }
            // A real choice — defer to the choosingDevelopTile step. Gloucester
            // grants one tile (bonus.value), but keep it general.
            pendingDevelopChoice = {
              remaining: bonus.value,
              merchant: bonus.merchantLocation,
            }
            break
          }
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
        // A merchant develop bonus needing a choice pauses at choosingDevelopTile.
        pendingDevelopChoice,
        lastError: null,
        errorContext: null,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} sold ${industryToSell.type} at ${event.location} to merchant at ${event.merchant} (flipped, income +${incomeAdvancement}, ${beerResult.logDetails.join(', ')})`,
            'action',
          ),
          ...bonusLogs,
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
        pendingDevelopChoice: null,
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
      const newDrawPile = context.drawPile.slice(cardsNeeded)

      // The deck can only reach empty here (refill is the sole draw within an
      // era, and it just decreases). This branch runs on the single >0 → 0
      // transition, so the notice logs exactly once per era; from here hands
      // shrink each round (rules l.33).
      const justExhausted = newDrawPile.length === 0

      debugLog('refillPlayerHand', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          { hand: updatedHand },
        ),
        drawPile: newDrawPile,
        ...(justExhausted
          ? {
              logs: [
                ...context.logs,
                createLogEntry(
                  'Draw deck exhausted — hands shrink each round from here',
                  'system',
                ),
              ],
            }
          : {}),
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

        // Announce the turn order the spending just decided (least spender
        // leads). Skipped on the game's final round — there is no next turn.
        if (!isFinalGameRound) {
          const orderLine = newTurnOrder
            .map((playerId) => {
              const p = updatedPlayers.find((pl) => pl.id === playerId)
              return `${p?.name ?? playerId} £${context.playerSpending[playerId] || 0}`
            })
            .join(', ')
          logs.push(
            createLogEntry(
              `Turn order set by spending, least first: ${orderLine}`,
              'info',
            ),
          )
        }

        // Money before settlement, so the summary can report the income
        // delta the players actually experienced (a shortfall pays only
        // what it can) rather than the nominal income figure.
        const moneyBefore = new Map(
          updatedPlayers.map((player) => [player.id, player.money]),
        )

        // 2. Collect income (if not final round of the game). Settle each
        // player in the NEW turn order so the journal reads top-to-bottom in
        // the order players will act next round; the players array itself
        // keeps its original order (indices are load-bearing elsewhere).
        if (!isFinalGameRound) {
          const settledById = new Map<string, Player>()
          for (const settleId of newTurnOrder) {
            const player = updatedPlayers.find((p) => p.id === settleId)
            if (!player) continue
            const updatedPlayer = { ...player }

            if (player.income >= 0) {
              // Positive income: collect money
              updatedPlayer.money += player.income
              logs.push(
                createLogEntry(
                  `${player.name} collected £${player.income} income (income level ${player.income})`,
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
                    `${player.name} paid £${amountOwed} negative income (income level ${player.income})`,
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
                    `${player.name} paid £${amountOwed} negative income (income level ${player.income}, shortfall: £${shortfall})`,
                    'info',
                  ),
                )
              }
            }

            settledById.set(settleId, updatedPlayer)
          }
          updatedPlayers = updatedPlayers.map((p) => settledById.get(p.id) ?? p)
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
      chosenCoalSources: [],
      pendingIronStep: null,
      pendingCoalStep: null,
      pendingDevelopChoice: null,
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

    // Entered from build / single link / double link — record which, so
    // pendingCoalChoice knows the demands, and start the picks fresh (a
    // cancelled-and-reselected action must re-ask, mirror of the iron steps).
    enterBuildCoalStep: assign({
      pendingCoalStep: 'build' as const,
      chosenCoalSources: [],
    }),
    enterLinkCoalStep: assign({
      pendingCoalStep: 'link' as const,
      chosenCoalSources: [],
    }),
    enterDoubleLinkCoalStep: assign({
      pendingCoalStep: 'doubleLink' as const,
      chosenCoalSources: [],
    }),

    /**
     * Drain one tied mine. Unlike beer/iron this never restarts the
     * allocation: a coal action can span several tie cubes (a shortfall
     * crossing into a farther tied tier, or the two rails of a double link),
     * and pendingCoalChoice advances through them in order — the `always`
     * auto-advances the moment the last tie is resolved.
     */
    chooseCoalSource: assign(({ context, event }) => {
      if (event.type !== 'SELECT_COAL_SOURCE') return {}
      const picks = context.chosenCoalSources ?? []
      return { chosenCoalSources: [...picks, event.source] }
    }),

    clearCoalChoice: assign({ chosenCoalSources: [], pendingCoalStep: null }),

    /**
     * Apply one merchant develop-bonus pick: remove the chosen track's lowest
     * tile from the mat (no iron), decrement what is owed, and clear the
     * pending choice once satisfied. The guard `canChooseDevelopTile` has
     * already checked the track is a legal, developable option.
     */
    chooseDevelopTile: assign(({ context, event }) => {
      if (event.type !== 'SELECT_DEVELOP_TILE') return {}
      const pending = context.pendingDevelopChoice
      if (!pending) return {}
      const player = getCurrentPlayer(context)
      const chosen = getDevelopBonusOptions(player.industryTilesOnMat).find(
        (o) => o.industryType === event.industryType,
      )
      if (!chosen) return {}
      const updatedMat = {
        ...player.industryTilesOnMat,
        [event.industryType]: decrementTileQuantity(
          player.industryTilesOnMat[event.industryType]!,
          chosen.tile,
        ),
      }
      const remaining = pending.remaining - 1
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          { industryTilesOnMat: updatedMat },
        ),
        pendingDevelopChoice: remaining > 0 ? { ...pending, remaining } : null,
        logs: [
          ...context.logs,
          createLogEntry(
            `${player.name} developed a level ${chosen.tile.level} ${chosen.industryType} tile (merchant develop bonus)`,
            'action',
          ),
        ],
      }
    }),

    clearDevelopChoice: assign({ pendingDevelopChoice: null }),

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
        ...(event.links !== undefined && { links: event.links }),
        ...(event.industryTilesOnMat !== undefined && {
          industryTilesOnMat: event.industryTilesOnMat,
        }),
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

      // Reset merchant beer - place 1 beer on each beer barrel space beside a
      // (non-blank) Merchant tile (rules p.9). Blank tiles have no barrel
      // space, so they never hold beer — same gate as setup (`goods.length`).
      const updatedMerchants = context.merchants.map((merchant) => ({
        ...merchant,
        hasBeer: merchant.industryIcons.length > 0,
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
    // Mid-action "change my mind": clicking a DIFFERENT hand card while an
    // action is in progress cancels it and re-holds the new card. Only fires
    // when a card is already committed (`selectedCard` set), the click is a
    // different card, and nothing has irreversibly committed — a Sell that has
    // already flipped an industry (`salesMadeThisAction > 0`) cannot be
    // abandoned, so the switch is refused there and the player must close the
    // sale. The card-pick steps define their own SELECT_CARD and override this.
    canSwitchHeldCard: ({ context, event }) => {
      if (event.type !== 'SELECT_CARD') return false
      if (context.selectedCard === null) return false
      if (context.selectedCard.id === event.cardId) return false
      if (context.salesMadeThisAction > 0) return false
      const player = getCurrentPlayer(context)
      return findCardInHand(player, event.cardId) !== null
    },
    // Card-first BUILD routing — the same split isLocationCard/isIndustryCard
    // make on the SELECT_CARD event, but read from the already-held card.
    isSelectedCardLocationKind: ({ context }) =>
      context.selectedCard?.type === 'location' ||
      context.selectedCard?.type === 'wild_location',
    isSelectedCardIndustry: ({ context }) =>
      context.selectedCard?.type === 'industry',
    canCompleteBuild: ({ context }) => {
      if (context.selectedCard === null || context.selectedLocation === null) {
        return false
      }

      // Whenever a tile is chosen (every real flow — location, wild-location and
      // industry cards all settle a tile before confirm) the build must be fully
      // completable: slot/overbuild, coal + iron reach, AND affordability. This
      // matches canSelectLocation so a selected site is always confirmable, and
      // closes the dead-confirm gap for location-card builds (which previously
      // returned true here without any resource/funds check).
      if (context.selectedIndustryTile) {
        return buildCompletionAt(
          context,
          context.selectedLocation,
          context.selectedIndustryTile,
        ).ok
      }

      // Location-card fallback with no tile settled — nothing to price.
      return context.selectedCard.type === 'location'
    },
    /**
     * The source question this step asks is answered (or there was none).
     * One guard for both resources: which one is a PARAMETER of the transition
     * (`guard: { type: 'choiceSatisfied', params: { resource: 'beer' } }`),
     * mirroring how resourceSources.ts already pairs its selectors.
     */
    choiceSatisfied: ({ context }, params: { resource: Resource }) => {
      if (params.resource === 'beer') return beerChoiceSatisfied(context)
      if (params.resource === 'iron') return ironChoiceSatisfied(context)
      return coalChoiceSatisfied(context)
    },

    /** Only a source this step actually offers may be picked. */
    canChooseSource: ({ context, event }, params: { resource: Resource }) => {
      if (params.resource === 'beer') {
        return (
          event.type === 'SELECT_BEER_SOURCE' &&
          canChooseBeerSource(context, event.source)
        )
      }
      if (params.resource === 'iron') {
        return (
          event.type === 'SELECT_IRON_SOURCE' &&
          canChooseIronSource(context, event.source)
        )
      }
      return (
        event.type === 'SELECT_COAL_SOURCE' &&
        canChooseCoalSource(context, event.source)
      )
    },

    canExecuteSale: ({ context, event }) => {
      if (event.type !== 'SELECT_SALE') return false
      return validateSale(context, event).isValid
    },

    /**
     * The merchant develop bonus is fully resolved (or there is nothing left
     * to develop) — the choosingDevelopTile step auto-advances. Never blocks
     * the flow: a mat with no developable track drains straight through.
     */
    developBonusSatisfied: ({ context }) => {
      const pending = context.pendingDevelopChoice
      if (!pending || pending.remaining <= 0) return true
      return (
        getDevelopBonusOptions(getCurrentPlayer(context).industryTilesOnMat)
          .length === 0
      )
    },

    /** Only a track this bonus actually offers may be developed. */
    canChooseDevelopTile: ({ context, event }) => {
      if (event.type !== 'SELECT_DEVELOP_TILE') return false
      const pending = context.pendingDevelopChoice
      if (!pending || pending.remaining <= 0) return false
      return getDevelopBonusOptions(
        getCurrentPlayer(context).industryTilesOnMat,
      ).some((o) => o.industryType === event.industryType)
    },

    // You cannot take a loan if it would take your income level below -10
    loanKeepsIncomeLegal: ({ context }) =>
      getCurrentPlayer(context).income - GAME_CONSTANTS.LOAN_INCOME_PENALTY >=
      GAME_CONSTANTS.MIN_INCOME,
    canTakeLoan: and(['hasSelectedCard', 'loanKeepsIncomeLegal']),

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
      if (context.era === 'rail') {
        return railNetworkPayable(context)
      }
      // Brass has no debt: the player must be able to pay the full cost
      return getCurrentPlayer(context).money >= GAME_CONSTANTS.CANAL_LINK_COST
    },
    canBuildLink: ({ context, event }) => {
      if (event.type !== 'SELECT_LINK' && event.type !== 'SELECT_SECOND_LINK') {
        return false
      }

      // The connection must be a real board edge that carries the current era.
      // (Was a documented rules gap the UI/AI each backfilled with their own
      // era filter — now the machine owns it, so every caller collapses to
      // can().)
      const connection = connections.find(
        (c) =>
          (c.from === event.from && c.to === event.to) ||
          (c.from === event.to && c.to === event.from),
      )
      if (!connection) {
        return false
      }
      if (!(connection.types as readonly string[]).includes(context.era)) {
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

      // Brass has no debt. The base cost is a fast reject before the network
      // and (rail) coal checks; the full cost incl. coal is enforced below.
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

      // The second link of a double Network action may build off the FIRST
      // link's new network extension: each link is placed separately, so the
      // first link's connected locations are part of the network the second
      // link is judged against (rules p.9 diagram — link B off link A's far
      // end). The first link is only staged in context.selectedLink until
      // execution, so fold it in provisionally when judging the second link's
      // adjacency. (`withProvisionalLink` is a no-op for a first/single link,
      // where selectedLink is still null.)
      if (event.type === 'SELECT_SECOND_LINK') {
        if (!context.selectedLink) {
          return false
        }
      }
      const networkPlayer =
        event.type === 'SELECT_SECOND_LINK'
          ? getCurrentPlayer(withProvisionalLink(context))
          : currentPlayer

      // Check if link is adjacent to player's network
      // A location is part of your network if:
      // 1. It contains one or more of your industry tiles
      // 2. It is adjacent to one or more of your link tiles

      const playerLocations = new Set<CityId>()

      // Add locations with player's industries
      networkPlayer.industries.forEach((industry) => {
        playerLocations.add(industry.location)
      })

      // Add locations adjacent to player's links (incl. farm breweries)
      networkPlayer.links.forEach((link) => {
        for (const loc of linkConnectedLocations(link.from, link.to)) {
          playerLocations.add(loc)
        }
      })

      // Check if either end of the new link is part of player's network
      const isAdjacent =
        playerLocations.has(event.from) || playerLocations.has(event.to)
      if (!isAdjacent) {
        return false
      }

      // A rail link must also reach coal once placed and be fully affordable
      // (rules L116/L308). The event carries the concrete route, so coal is
      // computable here — folding it in makes an offered route always
      // confirmable (no coal-dead spur pulses as selectable). Canal links need
      // no coal, so the adjacency + base-cost checks above suffice.
      if (context.era === 'rail') {
        const candidate = { from: event.from, to: event.to }
        return event.type === 'SELECT_SECOND_LINK'
          ? railNetworkPayable({ ...context, selectedSecondLink: candidate })
          : railNetworkPayable({ ...context, selectedLink: candidate })
      }
      return true
    },
    canSelectLocation: ({ context, event }) => {
      if (event.type !== 'SELECT_LOCATION') return false
      if (!context.selectedCard) return false

      // The tile is always settled by now (an industry card auto-picks it at
      // SELECT_CARD; location/wild cards pass through selectingIndustryType).
      // The build must be COMPLETABLE here — compatible slot/overbuild, coal +
      // iron within reach, affordable — so a slot-legal-but-dead city is never
      // offered on either surface (audit F2).
      if (context.selectedIndustryTile) {
        return canBuildIndustryAt(
          context,
          context.selectedCard,
          context.selectedIndustryTile,
          event.cityId,
        ).ok
      }

      // No tile settled: fall back to the card/network checks alone.
      if (
        FARM_BREWERIES.has(event.cityId) &&
        (context.selectedCard.type === 'location' ||
          context.selectedCard.type === 'wild_location')
      ) {
        return false
      }
      if (
        !validateIndustryBuildLocation(
          context,
          getCurrentPlayer(context),
          context.selectedCard,
          event.cityId,
        )
      ) {
        return false
      }
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        return locationCard.location === event.cityId
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

      // The industry must have somewhere it can actually be built. A location
      // card fixes the site, so that one city is the whole question; a
      // wild-location or industry card is viable while ANY city still completes.
      // Rejecting here means the wizard never offers an industry whose only
      // outcome is a dead confirm (audit F3).
      if (context.selectedCard.type === 'location') {
        const locationCard = context.selectedCard as LocationCard
        return canBuildIndustryAt(
          context,
          context.selectedCard,
          buildableTile,
          locationCard.location as CityId,
        ).ok
      }

      return hasBuildableSite(context, context.selectedCard, buildableTile)
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
    eraEndPending: ({ context }) => context.eraEndPending,
    isEra: ({ context }, params: { era: 'canal' | 'rail' }) =>
      context.era === params.era,
    isCanalEraEnd: and([
      'eraEndPending',
      { type: 'isEra', params: { era: 'canal' as const } },
    ]),
    isRailEraEnd: and([
      'eraEndPending',
      { type: 'isEra', params: { era: 'rail' as const } },
    ]),

    // A player may only keep taking actions while they have actions left AND
    // cards to discard for them (hands shrink once the draw deck is empty)
    canContinueTurn: and([
      'hasActionsRemaining',
      not('currentPlayerHandEmpty'),
    ]),

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

      // Brass has no debt: £15 plus the coal for both links must be payable.
      // Each link sources coal after it is placed (rules L116/L308).
      return railNetworkPayable(context)
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
    chosenCoalSources: [],
    pendingIronStep: null,
    pendingCoalStep: null,
    pendingDevelopChoice: null,
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
          on: {
            // Clicking a DIFFERENT hand card mid-action is a shortcut for
            // "cancel this, I want to play that instead": unwind the whole
            // action (the same `clearSelections` cleanup the top-level CANCELs
            // use) and land back in cardSelected holding the new card. The
            // card-pick steps (cardSelected / *.selectingCard / scouting) each
            // declare their own SELECT_CARD, which takes precedence, so this
            // only fires from the deeper flow steps. `canSwitchHeldCard`
            // refuses it once a Sell has irreversibly flipped an industry.
            SELECT_CARD: {
              target: '.cardSelected',
              actions: ['clearSelections', 'selectCard'],
              guard: 'canSwitchHeldCard',
            },
          },
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
                    {
                      guard: {
                        type: 'choiceSatisfied',
                        params: { resource: 'iron' },
                      },
                      target: 'choosingCoalSource',
                    },
                  ],
                  on: {
                    SELECT_IRON_SOURCE: {
                      actions: 'chooseIronSource',
                      guard: {
                        type: 'canChooseSource',
                        params: { resource: 'iron' },
                      },
                    },
                    CANCEL: {
                      target: 'selectingLocation',
                      actions: 'clearLocation',
                    },
                  },
                },
                /**
                 * Which mine pays for this build's coal — only when two or more
                 * connected mines tie at the nearest distance. Auto-skipped
                 * whenever the tile needs no coal or one nearest mine covers it.
                 */
                choosingCoalSource: {
                  entry: 'enterBuildCoalStep',
                  always: [
                    {
                      guard: {
                        type: 'choiceSatisfied',
                        params: { resource: 'coal' },
                      },
                      target: 'confirmingBuild',
                    },
                  ],
                  on: {
                    SELECT_COAL_SOURCE: {
                      actions: 'chooseCoalSource',
                      guard: {
                        type: 'canChooseSource',
                        params: { resource: 'coal' },
                      },
                    },
                    CANCEL: {
                      target: 'selectingLocation',
                      actions: ['clearLocation', 'clearCoalChoice'],
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
                      guard: {
                        type: 'choiceSatisfied',
                        params: { resource: 'iron' },
                      },
                      target: 'confirmingDevelop',
                    },
                  ],
                  on: {
                    SELECT_IRON_SOURCE: {
                      actions: 'chooseIronSource',
                      guard: {
                        type: 'canChooseSource',
                        params: { resource: 'iron' },
                      },
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
                      guard: {
                        type: 'choiceSatisfied',
                        params: { resource: 'beer' },
                      },
                      target: 'choosingDevelopTile',
                      actions: 'executeStagedSale',
                    },
                  ],
                  on: {
                    SELECT_BEER_SOURCE: {
                      actions: 'chooseBeerSource',
                      guard: {
                        type: 'canChooseSource',
                        params: { resource: 'beer' },
                      },
                    },
                    CANCEL: {
                      // Nothing was flipped yet — the staged sale is free to drop
                      target: 'selectingSale',
                      actions: 'clearStagedSale',
                    },
                  },
                },
                /**
                 * Which industry track a Gloucester merchant develop bonus
                 * removes its lowest tile from — only when 2+ tracks are
                 * developable. Auto-skipped when the sale grants no develop
                 * bonus, or a single option was already applied at sale time.
                 * The sale is irreversible by now, so there is no CANCEL: the
                 * bonus resolves (or drains when nothing is developable) and
                 * the flow returns to selectingSale for the next sale/CONFIRM.
                 */
                choosingDevelopTile: {
                  always: [
                    {
                      guard: 'developBonusSatisfied',
                      target: 'selectingSale',
                      actions: 'clearDevelopChoice',
                    },
                  ],
                  on: {
                    SELECT_DEVELOP_TILE: {
                      actions: 'chooseDevelopTile',
                      guard: 'canChooseDevelopTile',
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
                      // A rail link burns 1 coal; when two connected mines tie
                      // at the nearest distance the player picks which. The
                      // coal step auto-skips (and executes straight through)
                      // for canal links and single-nearest-mine rail links.
                      target: 'choosingLinkCoal',
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
                choosingLinkCoal: {
                  entry: 'enterLinkCoalStep',
                  always: [
                    {
                      guard: {
                        type: 'choiceSatisfied',
                        params: { resource: 'coal' },
                      },
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeNetworkAction',
                    },
                  ],
                  on: {
                    SELECT_COAL_SOURCE: {
                      actions: 'chooseCoalSource',
                      guard: {
                        type: 'canChooseSource',
                        params: { resource: 'coal' },
                      },
                    },
                    CANCEL: {
                      target: 'confirmingLink',
                      actions: 'clearCoalChoice',
                    },
                  },
                },
                selectingSecondLink: {
                  on: {
                    SELECT_SECOND_LINK: {
                      target: 'choosingDoubleLinkCoal',
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
                 * The two rails each burn 1 coal (nearest mine, judged after
                 * each is placed). This step asks the player to break any
                 * equal-distance tie — first link's coal, then the second's —
                 * then falls through to the beer step. Auto-skipped when
                 * neither link's coal has a tie.
                 */
                choosingDoubleLinkCoal: {
                  entry: 'enterDoubleLinkCoalStep',
                  always: [
                    {
                      guard: {
                        type: 'choiceSatisfied',
                        params: { resource: 'coal' },
                      },
                      target: 'choosingDoubleLinkBeer',
                    },
                  ],
                  on: {
                    SELECT_COAL_SOURCE: {
                      actions: 'chooseCoalSource',
                      guard: {
                        type: 'canChooseSource',
                        params: { resource: 'coal' },
                      },
                    },
                    CANCEL: {
                      target: 'selectingSecondLink',
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
                      guard: {
                        type: 'choiceSatisfied',
                        params: { resource: 'beer' },
                      },
                      target: 'confirmingDoubleLink',
                    },
                  ],
                  on: {
                    SELECT_BEER_SOURCE: {
                      actions: 'chooseBeerSource',
                      guard: {
                        type: 'canChooseSource',
                        params: { resource: 'beer' },
                      },
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
