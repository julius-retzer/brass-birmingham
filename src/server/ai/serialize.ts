// Compact, complete text view of the game for the model.
//
// Design constraints (design contract): complete enough to reason about
// strategy (money, income, era, board, markets, hands-as-counts for
// opponents), compact enough that one AI decision costs a fraction of a
// cent. Deterministic output — the serializer is unit-tested for stability.
import { type CityId, cities } from '../../data/board'
import { type GameStoreSnapshot } from '../../store/gameStore'
import { describeCard } from './legal-moves'

const cityName = (id: CityId): string => cities[id]?.name ?? id

type Ctx = GameStoreSnapshot['context']
type PlayerT = Ctx['players'][number]

function marketLine(
  name: string,
  market: Array<{ price: number; cubes: number; maxCubes: number }>,
): string {
  const cheapest = market.find((row) => row.cubes > 0)
  const total = market.reduce((n, row) => n + row.cubes, 0)
  return `${name}: next cube costs £${cheapest ? cheapest.price : '?'} (${total} cubes on the market)`
}

function playerIndustries(p: PlayerT): string {
  if (p.industries.length === 0) return 'none'
  return p.industries
    .map(
      (i) =>
        `${i.type} L${i.level} at ${cityName(i.location)}${i.flipped ? ' [flipped]' : ''}` +
        (i.coalCubesOnTile > 0 ? ` coal:${i.coalCubesOnTile}` : '') +
        (i.ironCubesOnTile > 0 ? ` iron:${i.ironCubesOnTile}` : '') +
        (i.beerBarrelsOnTile > 0 ? ` beer:${i.beerBarrelsOnTile}` : ''),
    )
    .join('; ')
}

function playerLinks(p: PlayerT): string {
  if (p.links.length === 0) return 'none'
  return p.links
    .map((l) => `${cityName(l.from)}–${cityName(l.to)} (${l.type})`)
    .join('; ')
}

// Next buildable tile per industry WITH its economics — the model must be
// able to judge affordability before starting a Build (playtest finding:
// without costs it walked into unaffordable builds and looped).
function matSummary(p: PlayerT): string {
  const parts: string[] = []
  for (const [type, tiles] of Object.entries(p.industryTilesOnMat)) {
    if (!tiles || tiles.length === 0) continue
    const next = tiles.reduce(
      (best, t) => (t.tile.level < best.tile.level ? t : best),
      tiles[0]!,
    ).tile
    const needs = [
      next.coalRequired > 0 ? `${next.coalRequired} coal` : null,
      next.ironRequired > 0 ? `${next.ironRequired} iron` : null,
    ]
      .filter(Boolean)
      .join(' + ')
    parts.push(
      `${type} L${next.level}: £${next.cost}${needs ? ` + ${needs}` : ''}, flips for ${next.victoryPoints}VP/+${next.incomeSpaces} income`,
    )
  }
  return parts.length > 0 ? parts.join('; ') : 'empty'
}

/** Cities in the player's network (own tiles + own link endpoints). */
function networkCities(p: PlayerT): string {
  const set = new Set<CityId>()
  for (const ind of p.industries) set.add(ind.location)
  for (const link of p.links) {
    set.add(link.from)
    set.add(link.to)
  }
  if (set.size === 0) {
    return 'none yet — your industry cards may build anywhere with a free slot'
  }
  return [...set].map((c) => cityName(c)).join(', ')
}

/** Which multi-step action is in flight, and what has been picked so far. */
function pendingAction(snapshot: GameStoreSnapshot): string[] {
  const ctx = snapshot.context
  const lines: string[] = []
  const stateValue = JSON.stringify(snapshot.value)
  lines.push(`Machine state: ${stateValue}`)
  if (ctx.selectedCard) {
    lines.push(`Selected card: ${describeCard(ctx.selectedCard)}`)
  }
  if (ctx.selectedCardsForScout.length > 0) {
    lines.push(
      `Cards marked for scout: ${ctx.selectedCardsForScout
        .map((c) => describeCard(c))
        .join(', ')}`,
    )
  }
  if (ctx.selectedIndustryTile) {
    lines.push(
      `Selected industry tile: ${ctx.selectedIndustryTile.type} L${ctx.selectedIndustryTile.level}`,
    )
  }
  if (ctx.selectedLocation) {
    lines.push(`Selected site: ${cityName(ctx.selectedLocation)}`)
  }
  if (ctx.selectedLink) {
    lines.push(
      `Selected link: ${cityName(ctx.selectedLink.from)}–${cityName(ctx.selectedLink.to)}`,
    )
  }
  if (ctx.selectedSecondLink) {
    lines.push(
      `Selected second link: ${cityName(ctx.selectedSecondLink.from)}–${cityName(ctx.selectedSecondLink.to)}`,
    )
  }
  if (ctx.selectedTilesForDevelop.length > 0) {
    lines.push(`Tiles to develop: ${ctx.selectedTilesForDevelop.join(', ')}`)
  }
  if (ctx.salesMadeThisAction > 0) {
    lines.push(`Sales already made this action: ${ctx.salesMadeThisAction}`)
  }
  return lines
}

/**
 * Serialize the full game as seen from `seatIndex`'s chair: their hand is
 * real, opponents are visible-state only (hand counts, board presence).
 */
export function serializeGameState(
  snapshot: GameStoreSnapshot,
  seatIndex: number,
): string {
  const ctx = snapshot.context
  const me = ctx.players[seatIndex]
  if (!me) return 'No such player.'

  const out: string[] = []
  out.push(
    `== GAME == ${ctx.era.toUpperCase()} ERA, round ${ctx.round}${ctx.isFinalRound ? ' (FINAL round of the game)' : ''}`,
  )
  out.push(
    `Actions remaining this turn: ${ctx.actionsRemaining}. Draw pile: ${ctx.drawPile.length} cards. ` +
      `Turn order this round: ${ctx.turnOrder
        .map((id) => ctx.players.find((p) => p.id === id)?.name ?? id)
        .join(' → ')}.`,
  )
  out.push(
    'Turn order next round: least money spent this round goes first. ' +
      `Spent so far: ${ctx.players
        .map((p) => `${p.name} £${ctx.playerSpending[p.id] ?? 0}`)
        .join(', ')}.`,
  )

  out.push(`\n== YOU (${me.name}) ==`)
  out.push(
    `Money £${me.money} | income ${me.income} | victory points ${me.victoryPoints}`,
  )
  out.push(
    `Your hand (${me.hand.length}): ${
      me.hand.length > 0
        ? me.hand.map((c) => describeCard(c)).join(', ')
        : 'empty'
    }`,
  )
  out.push(`Your mat (next buildable tile per industry): ${matSummary(me)}`)
  out.push(
    `Your network cities (where your industry cards can build): ${networkCities(me)}`,
  )
  out.push(`Your industries on the board: ${playerIndustries(me)}`)
  out.push(`Your links: ${playerLinks(me)}`)

  for (let i = 0; i < ctx.players.length; i++) {
    if (i === seatIndex) continue
    const p = ctx.players[i]!
    out.push(`\n== OPPONENT: ${p.name} ==`)
    out.push(
      `Money £${p.money} | income ${p.income} | victory points ${p.victoryPoints} | ${p.hand.length} cards in hand`,
    )
    out.push(`Industries: ${playerIndustries(p)}`)
    out.push(`Links: ${playerLinks(p)}`)
  }

  out.push('\n== MARKETS ==')
  out.push(marketLine('Coal', ctx.coalMarket))
  out.push(marketLine('Iron', ctx.ironMarket))

  out.push('\n== MERCHANTS (external sale outlets) ==')
  for (const m of ctx.merchants) {
    out.push(
      `${cityName(m.location)}: buys ${
        m.industryIcons.length > 0 ? m.industryIcons.join('/') : 'nothing'
      }${m.hasBeer ? ', beer barrel available' : ', no beer'} — bonus: ${m.bonusType} +${m.bonusValue}`,
    )
  }

  out.push('\n== ACTION IN PROGRESS ==')
  out.push(...pendingAction(snapshot))

  if (ctx.logs.length > 0) {
    out.push('\n== RECENT EVENTS ==')
    for (const log of ctx.logs.slice(-6)) {
      out.push(`- ${log.message}`)
    }
  }

  return out.join('\n')
}
