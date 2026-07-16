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
// linkConnectedLocations, GAME_CONSTANTS costs) — it never re-implements a
// rule. If a guard changes, the explainer changes with it, because both read
// the same helper. Where an explainer cannot pin the cause it returns null and
// the caller falls back to a generic string; a wrong reason is worse than a
// vague one.
//
// CONTRACT: only call this when `can(event)` is already false. It answers "why
// would this be refused", not "is this legal" — the machine owns legality.
import { type CityId, connections, linkConnectedLocations } from '../data/board'
import { GAME_CONSTANTS } from './constants'
import { type GameEvent, type GameState, validateSale } from './gameStore'
import { consumeCoalFromSources } from './market/marketActions'
import { getCurrentPlayer } from './shared/gameUtils'

/** £ amounts read better without a trailing `.00`. */
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

/**
 * Explain a refused event. Returns null when the cause cannot be pinned —
 * callers should fall back to a generic message rather than guess.
 */
export function explainRefusal(
  context: GameState,
  event: GameEvent,
  /** true when the machine is parked on a link confirm step */
  atLinkConfirm = false,
): string | null {
  switch (event.type) {
    case 'SELECT_LINK':
    case 'SELECT_SECOND_LINK':
      return explainLink(context, event)

    case 'SELECT_SALE':
      // validateSale already produces the exact reason (missing beer, no
      // merchant, not connected) — the guard just throws it away.
      return validateSale(context, event).error ?? null

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
      return atLinkConfirm ? explainSelectedLink(context) : null

    default:
      return null
  }
}
