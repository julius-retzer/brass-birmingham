// Enumerate the machine's legal events at the current decision point.
//
// The engine's own guards are the single source of truth: we generate a
// deterministic candidate list and keep what `snapshot.can(...)` accepts. No
// rule is re-derived here — era and board-graph legality for links, and build
// completability for sites, are the guards' own business.
import { type CityId, cities, connections } from '../../data/board'
import { type Card, type IndustryType } from '../../data/cards'
import { type GameEvent, type GameStoreSnapshot } from '../../store/gameStore'
import { pendingDevelopBonusChoice } from '../../store/shared/developBonus'
import {
  type BeerSourceOption,
  type CoalSourceOption,
  type IronSourceOption,
  pendingBeerChoice,
  pendingCoalChoice,
  pendingIronChoice,
} from '../../store/shared/resourceSources'

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

/** Names a source the way a player would think of it, bonus and all. */
function describeBeerOption(option: BeerSourceOption): string {
  if (option.source.kind === 'merchant') {
    const bonus = option.merchantBonus
    return `the ${cityName(option.source.location)} merchant's barrel${
      bonus ? ` (bonus: ${bonus.type} +${bonus.value})` : ''
    }`
  }
  const where = `the brewery at ${cityName(option.source.location)}`
  return option.own ? `your own ${where}` : `${option.ownerName}'s ${where}`
}

function describeIronOption(option: IronSourceOption): string {
  if (option.source.kind === 'market') {
    return option.price ? `the market (£${option.price}/cube)` : 'the market'
  }
  const where = `the iron works at ${cityName(option.source.location)}`
  return option.own ? `your own ${where}` : `${option.ownerName}'s ${where}`
}

function describeCoalOption(option: CoalSourceOption): string {
  const where = `the coal mine at ${cityName(option.source.location)}`
  return option.own ? `your own ${where}` : `${option.ownerName}'s ${where}`
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
 * Every event worth OFFERING at this decision point, payloads and all, in a
 * deterministic order — before any legality filtering. TEST/TRIGGER/lifecycle
 * events are never candidates.
 *
 * Split out from `enumerateLegalMoves` so the statechart-shape graph sweep
 * (`gameStore.graph.test.ts`) can drive the machine with the same concretely
 * payloaded alphabet the AI sees, rather than a hand-maintained copy of it.
 * Legality is deliberately NOT applied here: the graph traversal filters with
 * its own `filterEvents: (s, e) => s.can(e)` against each state it reaches.
 */
export function candidateMoves(snapshot: GameStoreSnapshot): LegalMove[] {
  const ctx = snapshot.context
  const me = ctx.players[ctx.currentPlayerIndex]
  if (!me) return []

  const candidates: LegalMove[] = []
  const push = (event: GameEvent, label: string) =>
    candidates.push({ event, label })

  for (const c of TOP_LEVEL) push(c.event, c.label)

  for (const card of me.hand) {
    push(
      { type: 'SELECT_CARD', cardId: card.id },
      `Play card: ${describeCard(card)}`,
    )
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

  // The source steps: the machine only stops here when the answer could
  // differ, and only offers sources it considers legal — so enumerate what it
  // offers and let can() do the filtering, exactly like every other step.
  const beerChoice = pendingBeerChoice(ctx)
  if (beerChoice?.hasChoice) {
    for (const option of beerChoice.options) {
      push(
        { type: 'SELECT_BEER_SOURCE', source: option.source },
        `Take a beer from ${describeBeerOption(option)}`,
      )
    }
  }
  const ironChoice = pendingIronChoice(ctx)
  if (ironChoice?.hasChoice) {
    for (const option of ironChoice.options) {
      push(
        { type: 'SELECT_IRON_SOURCE', source: option.source },
        `Take an iron from ${describeIronOption(option)}`,
      )
    }
  }
  const coalChoice = pendingCoalChoice(ctx)
  if (coalChoice?.hasChoice) {
    for (const option of coalChoice.options) {
      push(
        { type: 'SELECT_COAL_SOURCE', source: option.source },
        `Take the coal from ${describeCoalOption(option)}`,
      )
    }
  }
  const developChoice = pendingDevelopBonusChoice(
    me.industryTilesOnMat,
    ctx.pendingDevelopChoice?.remaining,
  )
  if (developChoice?.hasChoice) {
    for (const option of developChoice.options) {
      push(
        { type: 'SELECT_DEVELOP_TILE', industryType: option.industryType },
        `Develop a level ${option.tile.level} ${option.industryType} tile (merchant bonus)`,
      )
    }
  }

  push(
    { type: 'CHOOSE_DOUBLE_LINK_BUILD' },
    'Build a second rail this action (£15 total + beer)',
  )
  push(
    { type: 'EXECUTE_DOUBLE_NETWORK_ACTION' },
    'Confirm the double rail build',
  )
  push({ type: 'CONFIRM' }, 'Confirm this action')
  push({ type: 'CANCEL' }, 'Cancel and choose a different action')

  return candidates
}

/**
 * All events the machine will accept right now — the candidate alphabet minus
 * the moves the AI should not be offered, filtered by the engine's own guards.
 */
export function enumerateLegalMoves(snapshot: GameStoreSnapshot): LegalMove[] {
  // The card-first entry (SELECT_CARD from idle → cardSelected) is a human
  // ergonomics flow: every move it reaches is also reachable action-first,
  // so offering it to the model would only widen the decision surface with
  // a redundant path — and the deterministic fallback (which ranks
  // SELECT_CARD high for the mid-flow discard steps) would loop through it
  // instead of taking a turn-consuming action. It stays in `candidateMoves`
  // because it IS part of the machine's real shape — only the AI declines it.
  const atActionChoice = snapshot.matches({
    playing: { action: 'selectingAction' },
  } as never)
  // A card already committed means any SELECT_CARD now is the human-only
  // mid-flow switch shortcut (cancel this action, hold another card). It is
  // redundant for the AI — every card it reaches action-first is reachable
  // without it — and offering it would let the deterministic fallback loop
  // cancelling and re-holding instead of taking a turn-consuming action.
  const cardHeld = snapshot.context.selectedCard !== null
  return candidateMoves(snapshot)
    .filter(
      (c) => !((atActionChoice || cardHeld) && c.event.type === 'SELECT_CARD'),
    )
    .filter((c) => snapshot.can(c.event as never))
}
