// Why did the engine refuse this event?
//
// The machine's guards are booleans: `can(event) === false` tells a caller a
// move is illegal but never WHAT is missing. Every can()-gated caller (the
// multiplayer server, the AI driver, the UI) then has to invent a message,
// and they all landed on the same useless one — "that action is not legal
// right now". The captain's requirement (2026-07-16) is that a refusal says
// exactly what is missing.
//
// This module re-derives the reason by calling the SAME validators and probes
// the guards themselves call (validateSale, consumeCoalFromSources,
// consumeBeerFromSources, consumeIronFromSources, GAME_CONSTANTS costs). Where
// an explainer cannot pin the cause it returns null and the caller falls back
// to a generic string; a wrong reason is worse than a vague one.
//
// DRIFT WARNING: the link explainers below are the one place that re-states a
// guard's structure rather than calling it (`canBuildLink` is a boolean
// cascade with no shared helper to borrow). They mirror its rejection ORDER so
// the named cause is the one that actually blocks. If `canBuildLink` grows a
// check — the documented era/board-graph gap, say — update `explainLink` in
// the same commit, or it will silently answer with a stale reason.
//
// CONTRACT: only call this when `can(event)` is already false. It answers "why
// would this be refused", not "is this legal" — the machine owns legality.
import { type CityId, connections, linkConnectedLocations } from '../data/board'
import { GAME_CONSTANTS } from './constants'
import {
  type GameEvent,
  type GameState,
  type GameStoreSnapshot,
  validateSale,
} from './gameStore'
import {
  consumeBeerFromSources,
  consumeCoalFromSources,
  consumeIronFromSources,
} from './market/marketActions'
import { getCurrentPlayer } from './shared/gameUtils'
import {
  beerSourceKey,
  ironSourceKey,
  pendingBeerChoice,
  pendingIronChoice,
} from './shared/resourceSources'

const money = (amount: number) => `£${amount}`

const linkCostFor = (context: GameState) =>
  context.era === 'canal'
    ? GAME_CONSTANTS.CANAL_LINK_COST
    : GAME_CONSTANTS.RAIL_LINK_COST

/** The set of locations the player's network reaches (mirrors canBuildLink). */
const networkLocations = (context: GameState) => {
  const player = getCurrentPlayer(context)
  const locations = new Set<string>()
  player.industries.forEach((industry) => locations.add(industry.location))
  player.links.forEach((link) => {
    for (const loc of linkConnectedLocations(link.from, link.to)) {
      locations.add(loc)
    }
  })
  return locations
}

/**
 * SELECT_LINK / SELECT_SECOND_LINK. Mirrors canBuildLink's rejection order so
 * the reason names the FIRST thing that actually blocks the player.
 */
const explainLink = (
  context: GameState,
  event: Extract<GameEvent, { type: 'SELECT_LINK' | 'SELECT_SECOND_LINK' }>,
): string | null => {
  const player = getCurrentPlayer(context)
  const era = context.era === 'canal' ? 'canal' : 'rail'

  const exists = connections.some(
    (c) =>
      (c.from === event.from && c.to === event.to) ||
      (c.from === event.to && c.to === event.from),
  )
  if (!exists) return `There is no route between ${event.from} and ${event.to}.`

  const taken = context.players.some((p) =>
    p.links.some(
      (link) =>
        (link.from === event.from && link.to === event.to) ||
        (link.from === event.to && link.to === event.from),
    ),
  )
  if (taken) {
    return `A link already connects ${event.from} and ${event.to}.`
  }

  const cost = linkCostFor(context)
  if (player.money < cost) {
    return `Not enough money: you have ${money(player.money)}, a ${era} link costs ${money(cost)}.`
  }

  // Virgin board: a player with nothing on the board may build anywhere.
  if (player.industries.length === 0 && player.links.length === 0) return null

  if (event.type === 'SELECT_SECOND_LINK' && !context.selectedLink) {
    return 'Select the first link before the second.'
  }

  const reachable = networkLocations(context)
  if (!reachable.has(event.from) && !reachable.has(event.to)) {
    return `No ${era} connection to ${event.to}: neither ${event.from} nor ${event.to} is in your network.`
  }

  return null
}

/**
 * CONFIRM on a selected link — the seam canBuildLink cannot see, because coal
 * cost is only known once the link is picked (hasSelectedLink's check).
 */
const explainSelectedLink = (context: GameState): string | null => {
  const link = context.selectedLink
  if (!link) return 'No link selected.'
  const player = getCurrentPlayer(context)
  const cost = linkCostFor(context)

  if (context.era === 'rail') {
    // Probe coal exactly as hasSelectedLink does — a rail link burns 1 coal.
    const coal = consumeCoalFromSources(context, link.from as CityId, 1)
    if (!coal.success) {
      return `No coal reachable from ${link.from} — a rail link needs 1 coal.`
    }
    const total = cost + coal.coalCost
    if (player.money < total) {
      return `Not enough money: you have ${money(player.money)}, this rail link costs ${money(total)} (${money(cost)} + ${money(coal.coalCost)} coal).`
    }
    return null
  }

  if (player.money < cost) {
    return `Not enough money: you have ${money(player.money)}, a canal link costs ${money(cost)}.`
  }
  return null
}

/** CONFIRM on a build — canCompleteBuild's coal-reachability check. */
const explainBuildConfirm = (context: GameState): string | null => {
  const tile = context.selectedIndustryTile
  const location = context.selectedLocation
  if (!tile || !location) return null
  if (tile.coalRequired > 0) {
    const coal = consumeCoalFromSources(context, location, tile.coalRequired)
    if (!coal.success) {
      return `No coal reachable from ${location} — this ${tile.type} needs ${tile.coalRequired} coal.`
    }
  }
  return null
}

/** CONFIRM on a develop — hasSelectedTilesForDevelop's iron affordability. */
const explainDevelopConfirm = (context: GameState): string | null => {
  const count = context.selectedTilesForDevelop.length
  if (count === 0) return 'No tiles selected to develop.'
  const player = getCurrentPlayer(context)
  const { ironCost } = consumeIronFromSources(context, count)
  if (player.money < ironCost) {
    return `Not enough money: you have ${money(player.money)}, the iron to develop ${count === 1 ? 'this tile' : `these ${count} tiles`} costs ${money(ironCost)}.`
  }
  return null
}

/** CHOOSE_DOUBLE_LINK_BUILD — canBuildSecondLink's era + beer-supply check. */
const explainSecondLinkOffer = (context: GameState): string | null => {
  if (context.era !== 'rail') {
    return 'Two links at once is a Rail Era action.'
  }
  if (!context.selectedLink) return 'Select the first link first.'
  const hasAnyBeer = context.players.some((p) =>
    p.industries.some(
      (i) => i.type === 'brewery' && !i.flipped && i.beerBarrelsOnTile > 0,
    ),
  )
  if (!hasAnyBeer) {
    return 'Two rails needs 1 beer — no brewery on the board has any.'
  }
  return null
}

/**
 * EXECUTE_DOUBLE_NETWORK_ACTION — canCompleteDoubleLink: beer, then coal for
 * both links, then £15. Probed in the guard's own order.
 */
const explainDoubleLink = (context: GameState): string | null => {
  const first = context.selectedLink
  const second = context.selectedSecondLink
  if (context.era !== 'rail') return 'Two links at once is a Rail Era action.'
  if (!first || !second) return 'Select both links first.'

  const beer = consumeBeerFromSources(context, second.to as CityId, 1)
  if (!beer.success) {
    return (
      beer.errorMessage ??
      'Two rails needs 1 beer — none is reachable from your network.'
    )
  }
  const coal = consumeCoalFromSources(context, first.from as CityId, 1)
  if (!coal.success) {
    return `No coal reachable from ${first.from} — each rail link needs 1 coal.`
  }
  const player = getCurrentPlayer(context)
  const cost = GAME_CONSTANTS.RAIL_DOUBLE_LINK_COST
  if (player.money < cost) {
    return `Not enough money: you have ${money(player.money)}, two rails cost ${money(cost)} plus coal.`
  }
  return null
}

/**
 * Explain a refused event. Returns null when the cause cannot be pinned —
 * callers should fall back to a generic message rather than guess.
 *
 * Takes the SNAPSHOT (not just context) because a CONFIRM means something
 * different at each confirm step, and only the state tells them apart.
 */
export function explainRefusal(
  snapshot: GameStoreSnapshot,
  event: GameEvent,
): string | null {
  const context = snapshot.context
  const at = (path: unknown) => snapshot.matches(path as never)

  switch (event.type) {
    case 'SELECT_LINK':
    case 'SELECT_SECOND_LINK':
      return explainLink(context, event)

    case 'SELECT_SALE':
      // validateSale already produces the exact reason (missing beer, no
      // merchant, not connected) — the guard just throws it away.
      return validateSale(context, event).error ?? null

    case 'SELECT_BEER_SOURCE': {
      // canChooseBeerSource refuses a source this step never offered.
      const choice = pendingBeerChoice(context)
      if (!choice?.hasChoice) return 'There is no beer source to choose here.'
      const offered = choice.options.some(
        (o) => beerSourceKey(o.source) === beerSourceKey(event.source),
      )
      return offered
        ? null
        : 'That beer source is not available for this action.'
    }

    case 'SELECT_IRON_SOURCE': {
      const choice = pendingIronChoice(context)
      if (!choice?.hasChoice) return 'There is no iron source to choose here.'
      const offered = choice.options.some(
        (o) => ironSourceKey(o.source) === ironSourceKey(event.source),
      )
      return offered
        ? null
        : 'That iron source is not available for this action.'
    }

    case 'CHOOSE_DOUBLE_LINK_BUILD':
      return explainSecondLinkOffer(context)

    case 'EXECUTE_DOUBLE_NETWORK_ACTION':
      return explainDoubleLink(context)

    case 'TAKE_LOAN': {
      if (context.selectedCard === null) return 'No card selected for the loan.'
      const player = getCurrentPlayer(context)
      const after = player.income - GAME_CONSTANTS.LOAN_INCOME_PENALTY
      if (after < GAME_CONSTANTS.MIN_INCOME) {
        return `A loan drops your income ${GAME_CONSTANTS.LOAN_INCOME_PENALTY} levels to ${after}, below the minimum of ${GAME_CONSTANTS.MIN_INCOME}.`
      }
      return null
    }

    case 'SCOUT': {
      const player = getCurrentPlayer(context)
      if (
        player.hand.some(
          (c) => c.type === 'wild_location' || c.type === 'wild_industry',
        )
      ) {
        return 'You cannot Scout while holding a wild card.'
      }
      if (
        context.wildLocationPile.length === 0 ||
        context.wildIndustryPile.length === 0
      ) {
        return 'No wild cards are left to Scout for.'
      }
      if (
        context.selectedCardsForScout.length !==
        GAME_CONSTANTS.SCOUT_CARDS_REQUIRED
      ) {
        return `Scout needs exactly ${GAME_CONSTANTS.SCOUT_CARDS_REQUIRED} cards discarded.`
      }
      return null
    }

    case 'CONFIRM':
      if (at({ playing: { action: { networking: 'confirmingLink' } } })) {
        return explainSelectedLink(context)
      }
      if (at({ playing: { action: { building: 'confirmingBuild' } } })) {
        return explainBuildConfirm(context)
      }
      if (at({ playing: { action: { developing: 'confirmingDevelop' } } })) {
        return explainDevelopConfirm(context)
      }
      return null

    default:
      return null
  }
}
