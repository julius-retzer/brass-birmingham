// Where a resource is consumed FROM is a player choice under the rules:
//   beer  — "any" of: your unflipped breweries (no connection needed), a
//           CONNECTED opponent's unflipped brewery, or the barrel beside the
//           merchant you are selling to (rules p.5, "Consuming beer")
//   iron  — "any unflipped Iron Works (owned by any player); it does not have
//           to be the closest" (rules p.5, "Consuming iron")
// This module enumerates those legal sources so the engine can validate a
// player's preference, and so the UI and the AI driver can offer the choice
// without re-implementing the rules.
//
// Coal is deliberately absent: coal must come from the CLOSEST connected mine,
// which is not a free choice (the equal-distance tie-break is tracked
// separately).
import type { CityId } from '../../data/board'
import type { IndustryType } from '../../data/cards'
import { GAME_CONSTANTS } from '../constants'
import type { GameState, Player } from '../gameStore'
import { calculateNetworkDistance, getCurrentPlayer } from './gameUtils'

/**
 * The two resources whose source the player gets to choose. Coal is
 * deliberately absent: it comes from the closest connected mine by rule, so
 * there is never a question to ask. Every selector in this module comes in a
 * beer/iron pair keyed on this, and the machine's guards take it as a param.
 */
export type Resource = 'beer' | 'iron'

/**
 * A brewery source names a player's brewery tiles at a location. Two tiles of
 * the same owner in the same city are interchangeable for every rule that
 * matters (both flip, both advance the same owner's income), so they share one
 * source and are drained in tile order.
 */
export type BeerSource =
  | { kind: 'brewery'; ownerId: string; location: CityId }
  | { kind: 'merchant'; location: CityId }

export type IronSource =
  | { kind: 'ironworks'; ownerId: string; location: CityId }
  | { kind: 'market' }

/**
 * A source on offer, with the consequences of taking from it. The engine owns
 * these facts — a caller renders them, and must never re-derive them from the
 * rules itself.
 */
export interface BeerSourceOption {
  source: BeerSource
  /** Barrels this source can supply right now. */
  available: number
  /** True when the source is the acting player's own brewery. */
  own: boolean
  /** Owner display name — absent for merchant beer. */
  ownerName?: string
  /** The bonus collected by taking this merchant's barrel. */
  merchantBonus?: {
    type: 'develop' | 'income' | 'victoryPoints' | 'money'
    value: number
  }
  /**
   * Taking this source's LAST barrel flips its tile, advancing its owner's
   * income. False for merchant beer, which flips nothing.
   */
  flipsOwnerTile: boolean
}

export interface IronSourceOption {
  source: IronSource
  available: number
  own: boolean
  ownerName?: string
  /** Price of the next cube — market only; works iron is free. */
  price?: number
  /** Taking this works' LAST cube flips it, advancing its owner's income. */
  flipsOwnerTile: boolean
  /**
   * The source may only be reached by the automatic fallback, never by an
   * explicit pick. Rules p.5: the market opens only when NO unflipped iron
   * works has iron — while one does, the market is not an alternative.
   */
  fallbackOnly?: boolean
}

/**
 * The source question a step is asking: which resource, how many units, and
 * every legal answer. `required` and the options both come from the engine —
 * a caller never counts a tile's iron or a merchant's barrels itself.
 */
export interface BeerChoice {
  resource: 'beer'
  required: number
  options: BeerSourceOption[]
  /** True when the sources materially differ (below that, do not ask). */
  hasChoice: boolean
}

export interface IronChoice {
  resource: 'iron'
  required: number
  options: IronSourceOption[]
  hasChoice: boolean
}

export const beerSourceKey = (source: BeerSource): string =>
  source.kind === 'merchant'
    ? `merchant:${source.location}`
    : `brewery:${source.ownerId}:${source.location}`

export const ironSourceKey = (source: IronSource): string =>
  source.kind === 'market'
    ? 'market'
    : `ironworks:${source.ownerId}:${source.location}`

const isUsableBrewery = (industry: Player['industries'][number]) =>
  industry.type === 'brewery' &&
  !industry.flipped &&
  industry.beerBarrelsOnTile > 0

const isUsableIronWorks = (industry: Player['industries'][number]) =>
  industry.type === 'iron' && !industry.flipped && industry.ironCubesOnTile > 0

/**
 * Every beer source the acting player may legally draw from, in the engine's
 * default (auto-pick) priority: own breweries, then connected opponent
 * breweries, then the merchant barrel.
 *
 * Merchant beer is only ever legal as part of a Sell action, which is why the
 * caller must name the merchant being sold to (and the good it buys).
 */
export function getBeerSourceOptions(
  context: GameState,
  location: CityId,
  currentPlayer: Player,
  merchantBeerLocation?: CityId,
  merchantGoodsType?: IndustryType,
): BeerSourceOption[] {
  const options: BeerSourceOption[] = []
  const addBrewery = (
    owner: Player,
    industry: Player['industries'][number],
  ) => {
    const existing = options.find(
      (option) =>
        option.source.kind === 'brewery' &&
        option.source.ownerId === owner.id &&
        option.source.location === industry.location,
    )
    if (existing) {
      existing.available += industry.beerBarrelsOnTile
      return
    }
    options.push({
      source: {
        kind: 'brewery',
        ownerId: owner.id,
        location: industry.location,
      },
      available: industry.beerBarrelsOnTile,
      own: owner.id === currentPlayer.id,
      ownerName: owner.name,
      flipsOwnerTile: true,
    })
  }

  // Own breweries need no connection to the location where the beer is used
  for (const industry of currentPlayer.industries) {
    if (isUsableBrewery(industry)) addBrewery(currentPlayer, industry)
  }

  // An opponent's brewery must be connected to that location
  for (const player of context.players) {
    if (player.id === currentPlayer.id) continue
    for (const industry of player.industries) {
      if (!isUsableBrewery(industry)) continue
      if (
        calculateNetworkDistance(context, location, industry.location) ===
        Infinity
      ) {
        continue
      }
      addBrewery(player, industry)
    }
  }

  if (merchantBeerLocation && context.merchants) {
    const merchant = context.merchants.find(
      (m) =>
        m.location === merchantBeerLocation &&
        m.hasBeer &&
        (!merchantGoodsType || m.industryIcons.includes(merchantGoodsType)),
    )
    if (
      merchant &&
      calculateNetworkDistance(context, location, merchantBeerLocation) !==
        Infinity
    ) {
      options.push({
        source: { kind: 'merchant', location: merchant.location },
        available: 1,
        own: false,
        merchantBonus: { type: merchant.bonusType, value: merchant.bonusValue },
        flipsOwnerTile: false,
      })
    }
  }

  return options
}

/**
 * Every iron source, in the engine's default priority: unflipped iron works
 * (any owner, no connection needed), then the market.
 */
export function getIronSourceOptions(
  context: GameState,
  currentPlayer: Player,
): IronSourceOption[] {
  const options: IronSourceOption[] = []

  for (const player of context.players) {
    for (const industry of player.industries) {
      if (!isUsableIronWorks(industry)) continue
      const existing = options.find(
        (option) =>
          option.source.kind === 'ironworks' &&
          option.source.ownerId === player.id &&
          option.source.location === industry.location,
      )
      if (existing) {
        existing.available += industry.ironCubesOnTile
        continue
      }
      options.push({
        source: {
          kind: 'ironworks',
          ownerId: player.id,
          location: industry.location,
        },
        available: industry.ironCubesOnTile,
        own: player.id === currentPlayer.id,
        ownerName: player.name,
        flipsOwnerTile: true,
      })
    }
  }

  // The iron market is always reachable (no merchant connection required) and
  // never runs dry — the top level sells at a fallback price forever. But it
  // is fallback-ONLY while any unflipped works holds iron (rules p.5): the
  // planner may spill into it, an explicit pick of it must be refused.
  const cheapest = context.ironMarket.find((level) => level.cubes > 0)
  options.push({
    source: { kind: 'market' },
    available: Number.POSITIVE_INFINITY,
    own: false,
    // Empty finite rows still cost the fallback price, so the picker/AI label
    // always names the market's real cost rather than showing it as free.
    price: cheapest?.price ?? GAME_CONSTANTS.IRON_FALLBACK_PRICE,
    flipsOwnerTile: false,
    fallbackOnly: options.length > 0,
  })

  return options
}

/** Names a source the way engine logs name places — by raw location id. */
export function describeBeerSource(
  source: BeerSource,
  context: GameState,
): string {
  if (source.kind === 'merchant')
    return `the merchant beer at ${source.location}`
  const owner = context.players.find((player) => player.id === source.ownerId)
  return `${owner?.name ?? `player ${source.ownerId}`}'s brewery at ${source.location}`
}

export function describeIronSource(
  source: IronSource,
  context: GameState,
): string {
  if (source.kind === 'market') return 'the iron market'
  const owner = context.players.find((player) => player.id === source.ownerId)
  return `${owner?.name ?? `player ${source.ownerId}`}'s iron works at ${source.location}`
}

/**
 * Turn a player's source preference into an ordered consumption plan.
 *
 * Each preference entry spends one unit from that source; entries beyond the
 * requirement are ignored, and anything the preference leaves unmet falls back
 * to the engine's default priority (so no preference at all == the historic
 * auto-pick, unit for unit and log line for log line).
 *
 * A preference naming a source that is not legal here — or that has already
 * been drained, or that only the fallback may reach — is refused rather than
 * silently re-pointed: the player asked for something specific.
 */
export function planResourceSources<
  S,
  O extends { source: S; available: number; fallbackOnly?: boolean },
>(
  options: O[],
  required: number,
  preferred: S[] | undefined,
  keyOf: (source: S) => string,
  describe: (source: S) => string,
): {
  plan: Array<{ option: O; count: number }>
  allocated: number
  error?: string
} {
  const byKey = new Map<string, O>()
  const remaining = new Map<string, number>()
  for (const option of options) {
    const key = keyOf(option.source)
    byKey.set(key, option)
    remaining.set(key, option.available)
  }

  const counts = new Map<string, number>()
  const order: string[] = []
  let allocated = 0

  const take = (key: string) => {
    if (!counts.has(key)) order.push(key)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    remaining.set(key, (remaining.get(key) ?? 0) - 1)
    allocated++
  }

  for (const source of preferred ?? []) {
    if (allocated >= required) break
    const key = keyOf(source)
    if (!byKey.has(key)) {
      return {
        plan: [],
        allocated: 0,
        error: `${describe(source)} is not a legal source here.`,
      }
    }
    if (byKey.get(key)!.fallbackOnly) {
      return {
        plan: [],
        allocated: 0,
        error: `${describe(source)} is only a fallback here — it cannot be chosen while another source can still supply this.`,
      }
    }
    if ((remaining.get(key) ?? 0) <= 0) {
      return {
        plan: [],
        allocated: 0,
        error: `${describe(source)} has nothing left to give.`,
      }
    }
    take(key)
  }

  // Default priority covers whatever the preference did not
  for (const option of options) {
    const key = keyOf(option.source)
    while (allocated < required && (remaining.get(key) ?? 0) > 0) take(key)
  }

  return {
    plan: order.map((key) => ({
      option: byKey.get(key)!,
      count: counts.get(key)!,
    })),
    allocated,
  }
}

/**
 * True when the player has a real decision to make. Two sources are no choice
 * at all when the requirement drains both anyway, and one source is never a
 * choice — a picker in either case is noise.
 */
export const hasSourceChoice = (
  options: Array<BeerSourceOption | IronSourceOption>,
  required: number,
): boolean => {
  if (required <= 0 || options.length < 2) return false
  const total = options.reduce((sum, option) => sum + option.available, 0)
  return total > required
}

/* ----- what the current step is asking ----- */

/**
 * The beer question for a sale the player is staging: how many barrels the
 * tile needs and every source that could supply them. The caller names the
 * sale (the machine has not been told about it yet); everything else — the
 * barrel count, connectivity, merchant eligibility — comes from the engine.
 *
 * Returns null when the sale is not one the player holds.
 */
export function beerChoiceForSale(
  context: GameState,
  currentPlayer: Player,
  sale: { location: CityId; industryType: IndustryType; merchant: CityId },
): BeerChoice | null {
  const industry = currentPlayer.industries.find(
    (i) =>
      i.location === sale.location &&
      i.type === sale.industryType &&
      !i.flipped,
  )
  if (!industry) return null

  const required = industry.tile.beerRequired
  const options = getBeerSourceOptions(
    context,
    sale.location,
    currentPlayer,
    sale.merchant,
    sale.industryType,
  )
  return {
    resource: 'beer',
    required,
    options,
    hasChoice: hasSourceChoice(options, required),
  }
}

/**
 * A copy of `context` with the single selected link provisionally on the
 * current player's board. A rail link's coal is sourced from a mine connected
 * "after it is placed" (rules p.7, L116/L308) — so the guard, execution and
 * refusal explainer all judge coal against this post-placement network, never
 * the raw pre-placement one (which hides a mine reachable only through the new
 * link). Returns `context` unchanged when no link is selected.
 */
export function withProvisionalLink(context: GameState): GameState {
  if (!context.selectedLink) return context
  const me = context.players[context.currentPlayerIndex]
  if (!me) return context
  const updated = {
    ...me,
    links: [
      ...me.links,
      {
        from: context.selectedLink.from,
        to: context.selectedLink.to,
        type: context.era,
      },
    ],
  }
  return {
    ...context,
    players: context.players.map((p, i) =>
      i === context.currentPlayerIndex ? updated : p,
    ),
  }
}

/**
 * A copy of `context` with both selected rail links provisionally on the
 * current player's board. The rules judge the double link's beer reachability
 * "after placement" (p.9), and execution consumes beer with both rails built —
 * so enumeration and the guard must see the same post-placement network, or an
 * opponent brewery reachable only via the new rails would be offered at
 * execution yet hidden at the choice (and vice versa).
 */
export function withProvisionalDoubleLink(context: GameState): GameState {
  if (!context.selectedLink || !context.selectedSecondLink) return context
  const me = context.players[context.currentPlayerIndex]
  if (!me) return context
  const type = context.era
  const updated = {
    ...me,
    links: [
      ...me.links,
      { from: context.selectedLink.from, to: context.selectedLink.to, type },
      {
        from: context.selectedSecondLink.from,
        to: context.selectedSecondLink.to,
        type,
      },
    ],
  }
  return {
    ...context,
    players: context.players.map((p, i) =>
      i === context.currentPlayerIndex ? updated : p,
    ),
  }
}

/**
 * The beer question for the double rail link the machine is holding: one
 * barrel, reachable from the second link, never merchant beer (rules p.9).
 * Reachability is judged against the post-placement network so it matches
 * execution. Returns null when no second link is selected.
 */
export function beerChoiceForDoubleLink(
  context: GameState,
  currentPlayer: Player,
): BeerChoice | null {
  if (!context.selectedSecondLink) return null
  const options = getBeerSourceOptions(
    withProvisionalDoubleLink(context),
    context.selectedSecondLink.to,
    currentPlayer,
  )
  return {
    resource: 'beer',
    required: 1,
    options,
    hasChoice: hasSourceChoice(options, 1),
  }
}

/**
 * The iron question for an action the machine is holding at its confirm step:
 * a build spends its tile's iron, a develop one cube per scrapped tile.
 * `step` names which confirm is open — the caller reads that off the machine,
 * the engine decides what it costs. Returns null when no iron is spent.
 */
export function ironChoiceForConfirm(
  context: GameState,
  currentPlayer: Player,
  step: 'build' | 'develop',
): IronChoice | null {
  const required =
    step === 'build'
      ? (context.selectedIndustryTile?.ironRequired ?? 0)
      : // A develop removes the tiles the player picked, or exactly one when
        // they took the auto-select ("develop lowest") path (empty selection).
        context.selectedTilesForDevelop.length || 1
  if (required <= 0) return null

  // RULE (p.5): the market is a FALLBACK, not an alternative — "if there are
  // NO unflipped Iron Works, you can purchase iron from the Iron Market". So
  // it is never something the player may pick over a works. Consumption still
  // falls back to it for any cubes the works cannot cover (at that moment
  // there are no unflipped works left, which is exactly when the rule allows
  // it) — that fallback lives in the planner, not in this choice.
  // getIronSourceOptions stamps the market `fallbackOnly` whenever a works
  // exists; both this filter and the planner's refusal key off that one flag.
  const all = getIronSourceOptions(context, currentPlayer)
  const options = all.filter((option) => !option.fallbackOnly)
  return {
    resource: 'iron',
    required,
    options,
    hasChoice: hasSourceChoice(options, required),
  }
}

/* ----- the choice the machine is holding right now ----- */

/**
 * The beer question implied by the machine's own context: a staged sale, or a
 * double rail link awaiting its barrel. Null when this step spends no beer.
 * Guards and UI both read this — neither decides which step it is by hand.
 */
export function pendingBeerChoice(context: GameState): BeerChoice | null {
  const currentPlayer = getCurrentPlayer(context)
  if (!currentPlayer) return null
  if (context.pendingSale) {
    return beerChoiceForSale(context, currentPlayer, context.pendingSale)
  }
  if (context.selectedSecondLink) {
    return beerChoiceForDoubleLink(context, currentPlayer)
  }
  return null
}

/** The iron question implied by context: a pending build, or a develop. */
export function pendingIronChoice(context: GameState): IronChoice | null {
  // The build/develop step is set on entry to the choosing state — never
  // inferred from context fields, which collide: `selectCard` auto-sets
  // `selectedIndustryTile` for an industry card even on a Develop.
  if (!context.pendingIronStep) return null
  const currentPlayer = getCurrentPlayer(context)
  return ironChoiceForConfirm(context, currentPlayer, context.pendingIronStep)
}

/**
 * Has the player answered the source question this step asks? True when there
 * is nothing to ask (no choice, or none needed) — which is what auto-skips the
 * choosing step — and true once every unit has been assigned.
 */
export function beerChoiceSatisfied(context: GameState): boolean {
  const choice = pendingBeerChoice(context)
  if (!choice || !choice.hasChoice) return true
  // A snapshot persisted before this field existed rehydrates without it —
  // treat that as "nothing chosen yet", never crash the guard.
  return (context.chosenBeerSources ?? []).length >= choice.required
}

export function ironChoiceSatisfied(context: GameState): boolean {
  const choice = pendingIronChoice(context)
  if (!choice || !choice.hasChoice) return true
  return (context.chosenIronSources ?? []).length >= choice.required
}

/* ----- is this pick legal? ----- */

/**
 * May the player take one more unit from this source right now? The source
 * must be one this step offers, and must still have something to give after
 * the picks already made. Guards call this so `can()` refuses an illegal pick
 * outright rather than letting it fail later in execution.
 */
export function canChooseBeerSource(
  context: GameState,
  source: BeerSource,
): boolean {
  const choice = pendingBeerChoice(context)
  if (!choice?.hasChoice) return false
  const option = choice.options.find(
    (o) => beerSourceKey(o.source) === beerSourceKey(source),
  )
  if (!option) return false
  // Re-picking once every unit is assigned restarts the allocation
  const chosen = context.chosenBeerSources ?? []
  if (chosen.length >= choice.required) return true
  const taken = chosen.filter(
    (s) => beerSourceKey(s) === beerSourceKey(source),
  ).length
  return taken < option.available
}

export function canChooseIronSource(
  context: GameState,
  source: IronSource,
): boolean {
  const choice = pendingIronChoice(context)
  if (!choice?.hasChoice) return false
  const option = choice.options.find(
    (o) => ironSourceKey(o.source) === ironSourceKey(source),
  )
  if (!option) return false
  const chosen = context.chosenIronSources ?? []
  if (chosen.length >= choice.required) return true
  const taken = chosen.filter(
    (s) => ironSourceKey(s) === ironSourceKey(source),
  ).length
  return taken < option.available
}
