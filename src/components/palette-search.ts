// The command palette's searchable index and its matcher — the pure half of
// `command-palette.tsx` (which owns only the overlay, the keys and focus).
//
// Two kinds of entry, both derived from BOARD DATA only:
//  - a city (or merchant) — spotlights that one location;
//  - an industry — spotlights EVERY location whose printed slots can take it
//    (`cityIndustrySlots`), i.e. "where can a coal mine go?".
// Nothing here reads game state: the palette is a navigation aid and must
// never see, let alone touch, the machine.

import { type CityId, cities, cityIndustrySlots } from '~/data/board'
import type { IndustryType } from '~/data/cards'

export interface PaletteEntry {
  kind: 'city' | 'industry'
  /** CityId for a city entry, IndustryType for an industry entry. */
  id: string
  label: string
  /** Secondary line: the location's kind, or how many locations an industry has. */
  detail: string
  /** Cities to spotlight when this entry is chosen (first = pan anchor). */
  cities: readonly string[]
  /** Everything the query is matched against (raw; normalized on compare). */
  keywords: readonly string[]
}

/** Full industry names as they read on the board (the mat says "Coal Mine"). */
const INDUSTRY_LABEL: Record<IndustryType, string> = {
  cotton: 'Cotton Mill',
  coal: 'Coal Mine',
  iron: 'Iron Works',
  manufacturer: 'Manufacturer',
  pottery: 'Pottery',
  brewery: 'Brewery',
}

const INDUSTRY_ORDER: IndustryType[] = [
  'coal',
  'iron',
  'cotton',
  'manufacturer',
  'pottery',
  'brewery',
]

/** Extra words a player may reach for that the label does not contain. */
const INDUSTRY_ALIASES: Record<IndustryType, string[]> = {
  cotton: ['mill'],
  coal: ['mine'],
  iron: ['works', 'foundry'],
  manufacturer: ['manufactured goods', 'goods'],
  pottery: ['potteries', 'kiln'],
  brewery: ['beer', 'barrel'],
}

/** Locations whose printed slots can take `type`, in board order. */
export function locationsWithIndustry(type: IndustryType): CityId[] {
  return (Object.keys(cityIndustrySlots) as CityId[]).filter((id) =>
    cityIndustrySlots[id].some((slot) => slot.includes(type)),
  )
}

function cityDetail(id: CityId): string {
  if (cities[id].type === 'merchant') return 'Merchant'
  // The two Farm Breweries share a display name — say which is which, since
  // the palette lists them as two separate rows.
  if (id === 'farmBrewery1') return 'Farm Brewery · north'
  if (id === 'farmBrewery2') return 'Farm Brewery · south'
  return 'City'
}

/** The full index: every industry, then every location. */
export function paletteEntries(): PaletteEntry[] {
  const industries: PaletteEntry[] = INDUSTRY_ORDER.map((type) => {
    const locations = locationsWithIndustry(type)
    return {
      kind: 'industry',
      id: type,
      label: INDUSTRY_LABEL[type],
      detail: `${locations.length} locations`,
      cities: locations,
      keywords: [INDUSTRY_LABEL[type], type, ...INDUSTRY_ALIASES[type]],
    }
  })
  const places: PaletteEntry[] = (Object.keys(cities) as CityId[]).map(
    (id) => ({
      kind: 'city',
      id,
      label: cities[id].name,
      detail: cityDetail(id),
      cities: [id],
      keywords: [cities[id].name, id, cityDetail(id)],
    }),
  )
  return [...industries, ...places]
}

/** Lowercase, punctuation to spaces — "Stoke-on-Trent" → "stoke on trent". */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** 3 = keyword starts with the query, 2 = a later word does, 1 = anywhere. */
function scoreKeyword(keyword: string, query: string): number {
  if (keyword.startsWith(query)) return 3
  if (keyword.includes(` ${query}`)) return 2
  return keyword.includes(query) ? 1 : 0
}

function scoreEntry(entry: PaletteEntry, query: string): number {
  let best = 0
  for (const keyword of entry.keywords) {
    best = Math.max(best, scoreKeyword(normalizeQuery(keyword), query))
    if (best === 3) break
  }
  return best
}

/**
 * Entries matching `query`, best first. An empty query lists everything in
 * index order (industries, then locations); otherwise ties break on kind
 * (industries first — there are only six and they are the coarser filter)
 * and then alphabetically, so the order never depends on the input's history.
 */
export function matchPaletteEntries(
  query: string,
  entries: readonly PaletteEntry[] = paletteEntries(),
): PaletteEntry[] {
  const q = normalizeQuery(query)
  if (!q) return [...entries]
  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, q) }))
    .filter((row) => row.score > 0)
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    if (a.entry.kind !== b.entry.kind)
      return a.entry.kind === 'industry' ? -1 : 1
    return a.entry.label.localeCompare(b.entry.label)
  })
  return scored.map((row) => row.entry)
}
