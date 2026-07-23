// Board candidates for the two game surfaces.
//
// These functions ENUMERATE candidates and ask the machine — they re-derive no
// rule. Era, board graph, coal, funds and slot legality all live in the
// `gameStore` guards (`canBuildLink` / `canSelectLocation`), and a rejected
// candidate is explained by `explainRefusal`. Sharing the enumeration is what
// stops the hotseat and multiplayer shells drifting apart, which they did while
// each wrote its own filters.
import { type CityId, cities, connections } from '~/data/board'
import { linkKey } from './board/board-data'

/** Anything that can answer the machine's `can(...)` — a live or rebuilt snapshot. */
interface Askable {
  can: (event: never) => boolean
}

/** Cities where the in-flight build may be sited. */
export function legalCityTargets(state: Askable): Set<string> {
  const legal = new Set<string>()
  for (const cityId of Object.keys(cities) as CityId[]) {
    if (state.can({ type: 'SELECT_LOCATION', cityId } as never)) {
      legal.add(cityId)
    }
  }
  return legal
}

/**
 * Routes the in-flight network action may claim, keyed both ways round so a
 * lookup is orientation-independent.
 */
export function legalLinkTargets(
  state: Askable,
  pickingSecondLink: boolean,
): Set<string> {
  const legal = new Set<string>()
  for (const conn of connections) {
    const event = pickingSecondLink
      ? { type: 'SELECT_SECOND_LINK', from: conn.from, to: conn.to }
      : { type: 'SELECT_LINK', from: conn.from, to: conn.to }
    if (state.can(event as never)) {
      legal.add(linkKey(conn.from, conn.to))
      legal.add(linkKey(conn.to, conn.from))
    }
  }
  return legal
}
