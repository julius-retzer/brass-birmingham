// Turns a player's engine-emitted VP ledger (`vpAwards`) into the shape the
// end-game screen renders: grouped sections for the panel, and per-city /
// per-route totals for the map overlay.
//
// This module deliberately does NOT know the scoring rules — it only groups
// what the engine already decided. If `reconciles` is false, the engine's
// ledger disagrees with its own `victoryPoints` total; the UI surfaces that
// rather than hiding it.
import { cities } from '~/data/board'
import type { CityId } from '~/data/board'
import type { IndustryType } from '~/data/cards'
import type { Player, VpAward, VpAwardSource } from '~/store/gameStore'

const INDUSTRY_LABEL: Record<IndustryType, string> = {
  cotton: 'Cotton Mill',
  coal: 'Coal Mine',
  iron: 'Iron Works',
  manufacturer: 'Manufacturer',
  pottery: 'Pottery',
  brewery: 'Brewery',
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const SECTION_TITLE: Record<VpAwardSource, string> = {
  industry: 'Industry tiles',
  link: 'Links',
  merchantBonus: 'Merchant bonuses',
  incomeShortfall: 'Income shortfall',
  carriedForward: 'Scored earlier',
}

// Panel order — positives first, penalties last.
const SECTION_ORDER: VpAwardSource[] = [
  'industry',
  'link',
  'merchantBonus',
  'carriedForward',
  'incomeShortfall',
]

export interface BreakdownLine {
  key: string
  label: string
  detail: string
  era: 'canal' | 'rail'
  vp: number
}

export interface BreakdownSection {
  source: VpAwardSource
  title: string
  subtotal: number
  lines: BreakdownLine[]
}

export interface PlayerBreakdown {
  sections: BreakdownSection[]
  /** Sum of every section subtotal. */
  total: number
  /** The player's authoritative score. */
  scoreboardTotal: number
  /** False when the ledger disagrees with the scoreboard — a scoring bug. */
  reconciles: boolean
}

const cityName = (id: CityId | string | undefined) =>
  (id && cities[id as CityId]?.name) || String(id ?? '—')

const lineFor = (award: VpAward, index: number): BreakdownLine => {
  const era = award.era
  switch (award.source) {
    case 'industry':
      return {
        key: `i${index}`,
        label: `${INDUSTRY_LABEL[award.industryType as IndustryType] ?? award.industryType} ${
          ROMAN[award.level ?? 0] ?? award.level
        }`,
        detail: cityName(award.location),
        era,
        vp: award.vp,
      }
    case 'link':
      return {
        key: `l${index}`,
        label: award.link?.type === 'rail' ? 'Rail link' : 'Canal link',
        detail: `${cityName(award.link?.from)} – ${cityName(award.link?.to)}`,
        era,
        vp: award.vp,
      }
    case 'merchantBonus':
      return {
        key: `m${index}`,
        label: 'Merchant bonus',
        detail: cityName(award.location),
        era,
        vp: award.vp,
      }
    case 'incomeShortfall':
      return {
        key: `s${index}`,
        label: 'Income shortfall',
        detail: 'Could not pay income',
        era,
        vp: award.vp,
      }
    case 'carriedForward':
      return {
        key: `c${index}`,
        label: 'Carried forward',
        detail: 'Scored before this game was upgraded',
        era,
        vp: award.vp,
      }
  }
}

/** Group a player's awards into the sections the end screen renders. */
export function buildBreakdown(player: Player): PlayerBreakdown {
  const awards = player.vpAwards ?? []
  const lines = awards.map(lineFor)

  const sections: BreakdownSection[] = SECTION_ORDER.map((source) => {
    const own = awards
      .map((a, i) => ({ a, line: lines[i]! }))
      .filter((e) => e.a.source === source)
    return {
      source,
      title: SECTION_TITLE[source],
      subtotal: own.reduce((t, e) => t + e.a.vp, 0),
      lines: own.map((e) => e.line),
    }
  }).filter((s) => s.lines.length > 0)

  const total = sections.reduce((t, s) => t + s.subtotal, 0)
  return {
    sections,
    total,
    scoreboardTotal: player.victoryPoints,
    reconciles: total === player.victoryPoints,
  }
}

export interface VpAnnotations {
  /** cityId -> VP earned there (industry tiles + merchant bonuses). */
  cities: ReadonlyMap<string, number>
  /** `from|to` (both orders) -> VP earned by that link. */
  links: ReadonlyMap<string, number>
}

/**
 * Per-location / per-route VP totals for one player, for the map overlay.
 * Zero-VP awards are omitted — an annotation reading "0" is noise.
 */
export function annotationsFor(player: Player): VpAnnotations {
  const cityTotals = new Map<string, number>()
  const linkTotals = new Map<string, number>()

  for (const award of player.vpAwards ?? []) {
    if (award.vp === 0) continue
    if (award.source === 'link' && award.link) {
      const { from, to } = award.link
      linkTotals.set(
        `${from}|${to}`,
        (linkTotals.get(`${from}|${to}`) ?? 0) + award.vp,
      )
      linkTotals.set(
        `${to}|${from}`,
        (linkTotals.get(`${to}|${from}`) ?? 0) + award.vp,
      )
    } else if (award.location) {
      cityTotals.set(
        award.location,
        (cityTotals.get(award.location) ?? 0) + award.vp,
      )
    }
  }

  return { cities: cityTotals, links: linkTotals }
}
