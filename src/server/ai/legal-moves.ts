// Enumerate the machine's legal events at the current decision point.
//
// The engine's own guards are the single source of truth: we generate a
// deterministic candidate list and keep what `snapshot.can(...)` accepts.
// Two engine gotchas shape this module:
//  - `can()` under-validates some flows (a slot-legal build can still fail
//    at CONFIRM execution) — the driver handles that with its
//    execute-validate-retry loop, not here.
//  - `canBuildLink` does not check the era (documented rules gap) — we
//    filter link candidates by era exactly like the UI does.
import { type CityId, cities, connections } from '../../data/board'
import { type Card, type IndustryType } from '../../data/cards'
import { type GameEvent, type GameStoreSnapshot } from '../../store/gameStore'

export interface LegalMove {
  event: GameEvent
  /** Human/model-readable one-liner shown in the numbered choice list. */
  label: string
}

export const INDUSTRY_TYPES: IndustryType[] = [
  'cotton',
  'coal',
  'iron',
  'manufacturer',
  'pottery',
  'brewery',
]

const cityName = (id: CityId): string => cities[id]?.name ?? id

export function describeCard(card: Card): string {
  switch (card.type) {
    case 'location':
      return `${cityName(card.location)} (location)`
    case 'industry':
      return `${card.industries.join('/')} (industry)`
    case 'wild_location':
      return 'Wild location'
    case 'wild_industry':
      return 'Wild industry'
  }
}

const TOP_LEVEL: Array<{ event: GameEvent; label: string }> = [
  { event: { type: 'BUILD' }, label: 'Build — place an industry tile' },
  { event: { type: 'NETWORK' }, label: 'Network — claim a link route' },
  { event: { type: 'DEVELOP' }, label: 'Develop — remove tiles from your mat' },
  { event: { type: 'SELL' }, label: 'Sell — flip cotton/goods/pottery' },
  { event: { type: 'SCOUT' }, label: 'Scout — discard 3 cards for wilds' },
  { event: { type: 'TAKE_LOAN' }, label: 'Take a loan — +£30, -3 income' },
  { event: { type: 'PASS' }, label: 'Pass — do nothing this action' },
]

/** 1- and 2-tile combinations for the develop action. */
function developCombos(): IndustryType[][] {
  const combos: IndustryType[][] = INDUSTRY_TYPES.map((t) => [t])
  for (let i = 0; i < INDUSTRY_TYPES.length; i++) {
    for (let j = i; j < INDUSTRY_TYPES.length; j++) {
      combos.push([INDUSTRY_TYPES[i]!, INDUSTRY_TYPES[j]!])
    }
  }
  return combos
}

/**
 * All events the machine will accept right now, in a deterministic order.
 * TEST/TRIGGER/lifecycle events are never candidates.
 */
export function enumerateLegalMoves(snapshot: GameStoreSnapshot): LegalMove[] {
  const ctx = snapshot.context
  const me = ctx.players[ctx.currentPlayerIndex]
  if (!me) return []

  const candidates: LegalMove[] = []
  const push = (event: GameEvent, label: string) =>
    candidates.push({ event, label })

  for (const c of TOP_LEVEL) push(c.event, c.label)

  // The card-first entry (SELECT_CARD from idle → cardSelected) is a human
  // ergonomics flow: every move it reaches is also reachable action-first,
  // so offering it to the model would only widen the decision surface with
  // a redundant path — and the deterministic fallback (which ranks
  // SELECT_CARD high for the mid-flow discard steps) would loop through it
  // instead of taking a turn-consuming action.
  const atActionChoice = snapshot.matches({
    playing: { action: 'selectingAction' },
  } as never)
  if (!atActionChoice) {
    for (const card of me.hand) {
      push(
        { type: 'SELECT_CARD', cardId: card.id },
        `Play card: ${describeCard(card)}`,
      )
    }
  }

  for (const industryType of INDUSTRY_TYPES) {
    push(
      { type: 'SELECT_INDUSTRY_TYPE', industryType },
      `Choose industry: ${industryType}`,
    )
  }

  for (const cityId of Object.keys(cities) as CityId[]) {
    push(
      { type: 'SELECT_LOCATION', cityId },
      `Choose site: ${cityName(cityId)}`,
    )
  }

  for (const conn of connections) {
    // era filter — the engine guard does not check it (rules gap)
    if (!(conn.types as readonly string[]).includes(ctx.era)) continue
    push(
      { type: 'SELECT_LINK', from: conn.from, to: conn.to },
      `Claim ${ctx.era} link: ${cityName(conn.from)}–${cityName(conn.to)}`,
    )
    push(
      { type: 'SELECT_SECOND_LINK', from: conn.from, to: conn.to },
      `Second rail link: ${cityName(conn.from)}–${cityName(conn.to)}`,
    )
  }

  for (const combo of developCombos()) {
    push(
      { type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: combo },
      `Develop: remove ${combo.join(' + ')}`,
    )
  }

  const merchantLocations = [...new Set(ctx.merchants.map((m) => m.location))]
  for (const ind of me.industries) {
    if (ind.flipped) continue
    for (const merchant of merchantLocations) {
      push(
        {
          type: 'SELECT_SALE',
          location: ind.location,
          industryType: ind.type,
          merchant,
        },
        `Sell ${ind.type} at ${cityName(ind.location)} to the ${cityName(merchant)} merchant`,
      )
    }
  }

  push(
    { type: 'CHOOSE_DOUBLE_LINK_BUILD' },
    'Build a second rail this action (£15 total + beer)',
  )
  push({ type: 'BUILD_SECOND_LINK' }, 'Proceed to choose the second rail')
  push(
    { type: 'EXECUTE_DOUBLE_NETWORK_ACTION' },
    'Confirm the double rail build',
  )
  push({ type: 'CONFIRM' }, 'Confirm this action')
  push({ type: 'CANCEL' }, 'Cancel and choose a different action')

  return candidates.filter((c) => snapshot.can(c.event as never))
}
