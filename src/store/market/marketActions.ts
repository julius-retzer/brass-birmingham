import type { CityId } from '../../data/board'
import type { IndustryType } from '../../data/cards'
import { GAME_CONSTANTS } from '../constants'
import type { GameState, Player } from '../gameStore'
import {
  calculateNetworkDistance,
  checkAndFlipIndustryTilesLogic,
  getCurrentPlayer,
  updatePlayerInList,
} from '../shared/gameUtils'
import {
  type BeerSource,
  type CoalSource,
  type IronSource,
  beerSourceKey,
  describeBeerSource,
  describeIronSource,
  getBeerSourceOptions,
  getIronSourceOptions,
  ironSourceKey,
  planResourceSources,
  runCoalAllocation,
  withProvisionalLink,
} from '../shared/resourceSources'

export function consumeCoalFromSources(
  context: GameState,
  // A single city, or — for a rail link — both of its endpoints. Coal is
  // sourced from the mine closest to any anchor, and market connection is
  // judged from any anchor too.
  location: CityId | CityId[],
  coalRequired: number,
  // The player's choice of WHICH mine each tie cube drains, in order. Omit it
  // and the engine keeps its historic auto-pick (nearest mine, discovery order
  // within a tie). Only equal-distance ties are ever a choice — coal must come
  // from the closest connected mine (rules L119-121).
  preferredSources?: CoalSource[],
): {
  success: boolean
  updatedPlayers: Player[]
  updatedCoalMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  coalCost: number
  logDetails: string[]
  errorMessage?: string
  /** How many of `preferredSources` this consumption used (rest belong to a
   * following demand, e.g. the second rail link). */
  picksUsed: number
} {
  let coalConsumed = 0
  let coalCost = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  const updatedCoalMarket = context.coalMarket.map((level) => ({ ...level }))

  // Walk the mines cube-by-cube through the shared allocator so an explicit
  // tie pick is honoured and a naming of a mine that is NOT the closest is
  // refused (never silently re-pointed).
  const alloc = runCoalAllocation(
    [{ context, anchor: location, required: coalRequired }],
    preferredSources,
  )
  if (alloc.error) {
    return {
      success: false,
      updatedPlayers: context.players,
      updatedCoalMarket: context.coalMarket,
      coalCost: 0,
      logDetails: [],
      errorMessage: alloc.error,
      picksUsed: 0,
    }
  }

  // Apply the free-mine drains, aggregating consecutive cubes from the same
  // mine into one journal line (owner + city, matching PR#51's named audit
  // trail) — "N coal from X's coal mine at LOC (free)".
  const drainByMine = new Map<string, number>()
  const mineOrder: Array<{ ownerId: string; location: CityId }> = []
  for (const cube of alloc.fromMines) {
    const key = `${cube.ownerId}:${cube.location}`
    if (!drainByMine.has(key)) mineOrder.push(cube)
    drainByMine.set(key, (drainByMine.get(key) ?? 0) + 1)
  }
  if (drainByMine.size > 0) {
    updatedPlayers = updatedPlayers.map((player) => ({
      ...player,
      industries: player.industries.map((industry) => {
        if (industry.type !== 'coal') return industry
        const take = drainByMine.get(`${player.id}:${industry.location}`) ?? 0
        if (take <= 0 || industry.coalCubesOnTile <= 0) return industry
        return {
          ...industry,
          coalCubesOnTile:
            industry.coalCubesOnTile - Math.min(take, industry.coalCubesOnTile),
        }
      }),
    }))
  }
  coalConsumed += alloc.fromMines.length
  for (const cube of mineOrder) {
    const owner = context.players.find((player) => player.id === cube.ownerId)
    const ownerLabel = owner ? `${owner.name}'s` : 'a'
    logDetails.push(
      `${drainByMine.get(`${cube.ownerId}:${cube.location}`)} coal from ${ownerLabel} coal mine at ${cube.location} (free)`,
    )
  }

  // If still need coal, consume from coal market (cheapest first)
  // RULE: All coal market access requires connection to merchant locations
  const { connected: isConnectedToMarket } = isLocationConnectedToMerchant(
    context,
    location,
  )

  if (isConnectedToMarket) {
    while (coalConsumed < coalRequired) {
      let foundCoal = false

      // Find cheapest available coal (price levels in order)
      for (const level of updatedCoalMarket) {
        if (level.cubes > 0) {
          level.cubes--
          coalCost += level.price
          coalConsumed++
          logDetails.push(`1 coal from connected market for £${level.price}`)
          foundCoal = true
          break
        }
      }

      // If market is empty, use fallback price (still requires market connection)
      if (!foundCoal) {
        const fallbackLevel = updatedCoalMarket.find(
          (l) => l.price === GAME_CONSTANTS.COAL_FALLBACK_PRICE,
        )
        if (fallbackLevel) {
          // Don't decrement cubes for infinite capacity level
          coalCost += GAME_CONSTANTS.COAL_FALLBACK_PRICE
          coalConsumed++
          logDetails.push(
            `1 coal from connected market for £${GAME_CONSTANTS.COAL_FALLBACK_PRICE}`,
          )
          foundCoal = true
        }
      }

      // If no coal found in market, exit loop
      if (!foundCoal) {
        break
      }
    }
  }

  // If still insufficient coal after all sources, the action should fail
  if (coalConsumed < coalRequired) {
    const shortfall = coalRequired - coalConsumed
    const availableSources = []

    if (alloc.fromMines.length > 0) {
      availableSources.push('connected coal mines (exhausted)')
    }

    const { connected: isConnectedToMarket } = isLocationConnectedToMerchant(
      context,
      location,
    )
    if (isConnectedToMarket) {
      availableSources.push('coal markets')
    }

    const locationLabel = (
      Array.isArray(location) ? location : [location]
    ).join('/')
    if (availableSources.length === 0) {
      logDetails.push(
        `Coal consumption failed: need ${shortfall} more coal. No coal mines or market connection available from ${locationLabel}.`,
      )
    } else {
      logDetails.push(
        `Coal consumption failed: need ${shortfall} more coal. Available sources: ${availableSources.join(', ')} but insufficient supply.`,
      )
    }
  }

  // Check for auto-flipping after coal consumption
  const contextAfterCoalConsumption = { ...context, players: updatedPlayers }
  const autoFlipResult = checkAndFlipIndustryTilesLogic(
    contextAfterCoalConsumption,
  )

  if (autoFlipResult.players) {
    updatedPlayers = autoFlipResult.players
  }

  if (autoFlipResult.logs) {
    logDetails.push(...autoFlipResult.logs.map((log) => log.message))
  }

  // Determine if coal consumption was successful
  const success = coalConsumed >= coalRequired
  const errorMessage = success
    ? undefined
    : `Insufficient coal available. Required: ${coalRequired}, available: ${coalConsumed}. Need connection to coal mines or markets.`

  return {
    success,
    updatedPlayers: success ? updatedPlayers : context.players, // Return original state on failure
    updatedCoalMarket: success ? updatedCoalMarket : context.coalMarket, // Return original state on failure
    coalCost: success ? coalCost : 0, // No cost on failure
    logDetails,
    errorMessage,
    picksUsed: alloc.picksUsed,
  }
}

/**
 * Consume iron for a build or develop.
 *
 * `preferredSources` is the player's choice of WHICH iron works (or the
 * market) each cube comes from — the rules let iron come from any unflipped
 * works. Omit it and the engine keeps its historic auto-pick: every works in
 * turn, then the market cheapest-first.
 */
export function consumeIronFromSources(
  context: GameState,
  ironRequired: number,
  preferredSources?: IronSource[],
): {
  success: boolean
  updatedPlayers: Player[]
  updatedIronMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  ironCost: number
  logDetails: string[]
  errorMessage?: string
} {
  let ironCost = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  const updatedIronMarket = context.ironMarket.map((level) => ({ ...level }))

  const currentPlayer = getCurrentPlayer(context)
  const options = getIronSourceOptions(context, currentPlayer)
  const { plan, error } = planResourceSources(
    options,
    ironRequired,
    preferredSources,
    ironSourceKey,
    (source) => describeIronSource(source, context),
  )

  if (error) {
    return {
      success: false,
      updatedPlayers: context.players,
      updatedIronMarket: context.ironMarket,
      ironCost: 0,
      logDetails,
      errorMessage: error,
    }
  }

  for (const { option, count } of plan) {
    if (option.source.kind === 'market') {
      // Cheapest cube first — the rules price the market, not the player
      for (let cube = 0; cube < count; cube++) {
        const level = updatedIronMarket.find((l) => l.cubes > 0)
        if (level) {
          level.cubes--
          ironCost += level.price
          logDetails.push(`1 iron from market for £${level.price}`)
          continue
        }
        // An empty market still sells, at the fallback price, forever
        ironCost += GAME_CONSTANTS.IRON_FALLBACK_PRICE
        logDetails.push(
          `1 iron from general supply for £${GAME_CONSTANTS.IRON_FALLBACK_PRICE}`,
        )
      }
      continue
    }

    const { ownerId, location: worksLocation } = option.source
    let cubesLeftToTake = count
    updatedPlayers = updatedPlayers.map((player) =>
      player.id !== ownerId
        ? player
        : {
            ...player,
            industries: player.industries.map((industry) => {
              if (
                cubesLeftToTake <= 0 ||
                industry.type !== 'iron' ||
                industry.flipped ||
                industry.location !== worksLocation ||
                industry.ironCubesOnTile <= 0
              ) {
                return industry
              }
              const taken = Math.min(industry.ironCubesOnTile, cubesLeftToTake)
              cubesLeftToTake -= taken
              return {
                ...industry,
                ironCubesOnTile: industry.ironCubesOnTile - taken,
              }
            }),
          },
    )
    logDetails.push(`${count} iron from iron works (free)`)
  }

  // Check for auto-flipping after iron consumption
  const contextAfterIronConsumption = { ...context, players: updatedPlayers }
  const autoFlipResult = checkAndFlipIndustryTilesLogic(
    contextAfterIronConsumption,
  )

  if (autoFlipResult.players) {
    updatedPlayers = autoFlipResult.players
  }

  if (autoFlipResult.logs) {
    logDetails.push(...autoFlipResult.logs.map((log) => log.message))
  }

  return {
    success: true,
    updatedPlayers,
    updatedIronMarket,
    ironCost,
    logDetails,
  }
}

// Helper function to check if a location is connected to any merchant.
// `location` may be a single city or, for a rail link, both endpoints —
// connection from ANY anchor counts.
export function isLocationConnectedToMerchant(
  context: GameState,
  location: CityId | CityId[],
): { connected: boolean; connectedMerchants: CityId[] } {
  const merchantLocations: CityId[] = [
    'warrington',
    'gloucester',
    'oxford',
    'nottingham',
    'shrewsbury',
  ]

  const anchors = Array.isArray(location) ? location : [location]
  const connectedMerchants: CityId[] = []

  for (const merchantLocation of merchantLocations) {
    const reachable = anchors.some(
      (anchor) =>
        calculateNetworkDistance(context, anchor, merchantLocation) !==
        Infinity,
    )
    if (reachable) {
      connectedMerchants.push(merchantLocation)
    }
  }

  return {
    connected: connectedMerchants.length > 0,
    connectedMerchants,
  }
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

/**
 * Consume beer for a sale or a double rail link.
 *
 * `preferredSources` is the player's choice of WHERE each barrel comes from —
 * the rules make that a choice, and it matters: draining your own brewery
 * flips it and advances your income, draining an opponent's does the same for
 * them, and taking the merchant's barrel is the only way to collect its bonus.
 * Omit it and the engine keeps its historic auto-pick: own breweries, then
 * connected opponent breweries, then merchant beer.
 */
export function consumeBeerFromSources(
  context: GameState,
  location: CityId,
  beerRequired: number,
  // Merchant beer may only be consumed as part of a Sell action, and only
  // from the beer space beside the merchant tile being sold to (identified
  // by its location and, when given, the good it buys)
  merchantBeerLocation?: CityId,
  merchantGoodsType?: IndustryType,
  preferredSources?: BeerSource[],
): {
  success: boolean
  updatedPlayers: Player[]
  updatedResources: GameState['resources']
  updatedMerchants?: Array<{
    location: CityId
    industryIcons: IndustryType[]
    bonusType: 'develop' | 'income' | 'victoryPoints' | 'money'
    bonusValue: number
    hasBeer: boolean
  }>
  merchantBonusesCollected: Array<{
    type: 'develop' | 'income' | 'victoryPoints' | 'money'
    value: number
    /** The merchant the bonus came from — named by the VP ledger. */
    merchantLocation: CityId
  }>
  logDetails: string[]
  errorMessage?: string
} {
  let beerConsumed = 0
  const logDetails: string[] = []
  let updatedPlayers = [...context.players]
  const updatedResources = { ...context.resources }
  let updatedMerchants = context.merchants ? [...context.merchants] : undefined
  const merchantBonusesCollected: Array<{
    type: 'develop' | 'income' | 'victoryPoints' | 'money'
    value: number
    merchantLocation: CityId
  }> = []

  const currentPlayer = getCurrentPlayer(context)
  const options = getBeerSourceOptions(
    context,
    location,
    currentPlayer,
    merchantBeerLocation,
    merchantGoodsType,
  )
  const {
    plan,
    allocated,
    error: planError,
  } = planResourceSources(
    options,
    beerRequired,
    preferredSources,
    beerSourceKey,
    (source) => describeBeerSource(source, context),
  )

  if (planError) {
    return {
      success: false,
      updatedPlayers: context.players,
      updatedResources: context.resources,
      updatedMerchants: context.merchants,
      merchantBonusesCollected: [],
      logDetails,
      errorMessage: planError,
    }
  }

  for (const { option, count } of plan) {
    if (option.source.kind === 'merchant') {
      const merchantIndex = (updatedMerchants ?? []).findIndex(
        (merchant) =>
          merchant.location === option.source.location &&
          merchant.hasBeer &&
          (!merchantGoodsType ||
            merchant.industryIcons.includes(merchantGoodsType)),
      )
      if (merchantIndex === -1 || !updatedMerchants) continue

      const merchant = updatedMerchants[merchantIndex]!
      updatedMerchants = updatedMerchants.map((m, index) =>
        index === merchantIndex ? { ...m, hasBeer: false } : m,
      )
      beerConsumed++
      merchantBonusesCollected.push({
        type: merchant.bonusType,
        value: merchant.bonusValue,
        merchantLocation: merchant.location,
      })
      logDetails.push(
        `1 beer from merchant at ${merchant.location} (${merchant.bonusType} +${merchant.bonusValue})`,
      )
      continue
    }

    const { ownerId, location: breweryLocation } = option.source
    let barrelsLeftToTake = count
    updatedPlayers = updatedPlayers.map((player) =>
      player.id !== ownerId
        ? player
        : {
            ...player,
            industries: player.industries.map((industry) => {
              if (
                barrelsLeftToTake <= 0 ||
                industry.type !== 'brewery' ||
                industry.flipped ||
                industry.location !== breweryLocation ||
                industry.beerBarrelsOnTile <= 0
              ) {
                return industry
              }
              const taken = Math.min(
                industry.beerBarrelsOnTile,
                barrelsLeftToTake,
              )
              barrelsLeftToTake -= taken
              return {
                ...industry,
                beerBarrelsOnTile: industry.beerBarrelsOnTile - taken,
              }
            }),
          },
    )

    beerConsumed += count
    logDetails.push(
      option.own
        ? `${count} beer from own brewery at ${breweryLocation} (free)`
        : `${count} beer from connected opponent brewery at ${breweryLocation} (free)`,
    )
  }

  // If still need beer, action fails - cannot consume beer from general supply
  if (beerConsumed < beerRequired || allocated < beerRequired) {
    return {
      success: false,
      updatedPlayers: context.players, // Return original state
      updatedResources: context.resources,
      updatedMerchants: context.merchants,
      merchantBonusesCollected: [],
      logDetails,
      // Name what is missing, not just that something is (captain, 2026-07-16):
      // this string is surfaced verbatim to the refused player. The partial
      // case stays source-agnostic — `beerConsumed` may include merchant beer
      // on a sale path, not only breweries.
      errorMessage:
        beerConsumed === 0
          ? `Needs ${beerRequired} beer — no connected brewery has beer.`
          : `Needs ${beerRequired} beer — only ${beerConsumed} within reach.`,
    }
  }

  // Check for auto-flipping after beer consumption
  const contextAfterBeerConsumption = { ...context, players: updatedPlayers }
  const autoFlipResult = checkAndFlipIndustryTilesLogic(
    contextAfterBeerConsumption,
  )

  if (autoFlipResult.players) {
    updatedPlayers = autoFlipResult.players
  }

  if (autoFlipResult.logs) {
    logDetails.push(...autoFlipResult.logs.map((log) => log.message))
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

// A rail link burns exactly 1 coal, sourced from the nearest connected mine or,
// failing that, the coal market (rules L116/L308). Names where that cube comes
// from and its price, engine-truthfully.
export interface RailCoalSourceView {
  kind: 'mine' | 'market'
  // Mine location, or the connected merchant that opens the market.
  location?: CityId
  ownerName?: string
  own?: boolean
  cost: number
}

export interface RailLinkCostView {
  from: CityId
  to: CityId
  coal: RailCoalSourceView | null
}

// The full cost of the rail Network action the machine is holding: one link
// (context.selectedLink alone) or a double (both links set). Coal is judged
// after each link is placed, matching consumption. `ok` is false when a link
// cannot reach coal or the whole action is unaffordable — the single source of
// truth for both the SELECT/CONFIRM guards and the dock's cost preview.
export interface RailNetworkCostView {
  ok: boolean
  double: boolean
  baseCost: number
  coalTotal: number
  total: number
  links: RailLinkCostView[]
}

// Where the one cube for a link at `anchor` (both endpoints) comes from, in the
// board state `ctx` (link already provisionally placed). `picks` honours the
// player's tie choices, if any.
function railCoalCubeView(
  ctx: GameState,
  anchor: CityId[],
  picks: CoalSource[],
): { view: RailCoalSourceView | null; cost: number; ok: boolean } {
  const consume = consumeCoalFromSources(ctx, anchor, 1, picks)
  if (!consume.success) return { view: null, cost: 0, ok: false }
  const alloc = runCoalAllocation(
    [{ context: ctx, anchor, required: 1 }],
    picks,
  )
  if (alloc.fromMines.length > 0) {
    const mine = alloc.fromMines[0]!
    const owner = ctx.players.find((p) => p.id === mine.ownerId)
    return {
      view: {
        kind: 'mine',
        location: mine.location,
        ownerName: owner?.name,
        own: mine.ownerId === getCurrentPlayer(ctx)?.id,
        cost: 0,
      },
      cost: 0,
      ok: true,
    }
  }
  const [merchant] = isLocationConnectedToMerchant(
    ctx,
    anchor,
  ).connectedMerchants
  return {
    view: { kind: 'market', location: merchant, cost: consume.coalCost },
    cost: consume.coalCost,
    ok: true,
  }
}

export function railNetworkCostView(
  context: GameState,
): RailNetworkCostView | null {
  if (context.era !== 'rail' || context.selectedLink === null) return null
  const idx = context.currentPlayerIndex
  const picks = context.chosenCoalSources ?? []
  const link1 = context.selectedLink

  const ctx1 = withProvisionalLink(context)
  const c1 = railCoalCubeView(ctx1, [link1.from, link1.to], picks)

  if (context.selectedSecondLink === null) {
    const total = GAME_CONSTANTS.RAIL_LINK_COST + c1.cost
    return {
      ok: c1.ok,
      double: false,
      baseCost: GAME_CONSTANTS.RAIL_LINK_COST,
      coalTotal: c1.cost,
      total,
      links: [{ from: link1.from, to: link1.to, coal: c1.view }],
    }
  }

  // Double: the second link's coal is judged with the first placed AND drained,
  // matching execution (the first link is on the board before its coal, then
  // both are before the second's).
  const link2 = context.selectedSecondLink
  const firstConsume = consumeCoalFromSources(
    ctx1,
    [link1.from, link1.to],
    1,
    picks,
  )
  const playerWithLinks = firstConsume.updatedPlayers[idx]!
  const ctx2: GameState = {
    ...context,
    players: updatePlayerInList(firstConsume.updatedPlayers, idx, {
      ...playerWithLinks,
      links: [...playerWithLinks.links, { ...link2, type: 'rail' as const }],
    }),
    coalMarket: firstConsume.updatedCoalMarket,
  }
  const c2 = railCoalCubeView(
    ctx2,
    [link2.from, link2.to],
    picks.slice(firstConsume.picksUsed),
  )
  const coalTotal = c1.cost + c2.cost
  return {
    ok: c1.ok && c2.ok,
    double: true,
    baseCost: GAME_CONSTANTS.RAIL_DOUBLE_LINK_COST,
    coalTotal,
    total: GAME_CONSTANTS.RAIL_DOUBLE_LINK_COST + coalTotal,
    links: [
      { from: link1.from, to: link1.to, coal: c1.view },
      { from: link2.from, to: link2.to, coal: c2.view },
    ],
  }
}
