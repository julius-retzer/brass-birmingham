import { describe, expect, it } from 'vitest'
import { cities, cityIndustrySlots } from '~/data/board'
import {
  type PaletteEntry,
  locationsWithIndustry,
  matchPaletteEntries,
  normalizeQuery,
  paletteEntries,
} from './palette-search'

const ALL = paletteEntries()

function find(kind: PaletteEntry['kind'], id: string): PaletteEntry {
  const entry = ALL.find((e) => e.kind === kind && e.id === id)
  if (!entry) throw new Error(`no ${kind} entry ${id}`)
  return entry
}

function ids(entries: PaletteEntry[]): string[] {
  return entries.map((e) => `${e.kind}:${e.id}`)
}

describe('paletteEntries (the index)', () => {
  it('lists every board location plus the six industries', () => {
    const cityIds = Object.keys(cities)
    expect(ALL.filter((e) => e.kind === 'city')).toHaveLength(cityIds.length)
    expect(ALL.filter((e) => e.kind === 'industry')).toHaveLength(6)
  })

  it('a city entry spotlights only itself', () => {
    expect(find('city', 'derby').cities).toEqual(['derby'])
    expect(find('city', 'derby').label).toBe('Derby')
  })

  it('marks merchants and the two farm breweries apart', () => {
    expect(find('city', 'oxford').detail).toBe('Merchant')
    expect(find('city', 'farmBrewery1').detail).toContain('north')
    expect(find('city', 'farmBrewery2').detail).toContain('south')
  })

  it('an industry entry spotlights every location with that slot', () => {
    const coal = find('industry', 'coal')
    expect(coal.cities).toEqual(locationsWithIndustry('coal'))
    expect(coal.cities).toContain('dudley')
    expect(coal.cities).not.toContain('worcester') // two cotton slots only
    expect(coal.detail).toBe(`${coal.cities.length} locations`)
  })

  it('reads the industry locations off the printed slots', () => {
    for (const id of locationsWithIndustry('pottery')) {
      expect(cityIndustrySlots[id].some((s) => s.includes('pottery'))).toBe(
        true,
      )
    }
    expect(locationsWithIndustry('pottery')).toEqual([
      'coventry',
      'stafford',
      'stoke',
      'belper',
    ])
  })

  it('never offers a merchant as an industry location', () => {
    for (const entry of ALL.filter((e) => e.kind === 'industry')) {
      for (const id of entry.cities) {
        expect(cities[id as keyof typeof cities].type).toBe('city')
      }
    }
  })
})

describe('normalizeQuery', () => {
  it('lowercases and turns punctuation into word breaks', () => {
    expect(normalizeQuery('Stoke-on-Trent')).toBe('stoke on trent')
    expect(normalizeQuery('  Iron   Works ')).toBe('iron works')
    expect(normalizeQuery('')).toBe('')
    expect(normalizeQuery('   ')).toBe('')
  })
})

describe('matchPaletteEntries', () => {
  it('an empty query lists everything, index order', () => {
    expect(matchPaletteEntries('', ALL)).toEqual(ALL)
    expect(matchPaletteEntries('   ', ALL)).toEqual(ALL)
  })

  it('matches a city by display name, prefix first', () => {
    const hits = matchPaletteEntries('birm', ALL)
    expect(hits[0]).toBe(find('city', 'birmingham'))
  })

  it('matches a hyphenated name by any of its words', () => {
    expect(ids(matchPaletteEntries('trent', ALL))).toEqual(
      expect.arrayContaining(['city:stoke', 'city:burton']),
    )
    expect(matchPaletteEntries('stoke on', ALL)[0]).toBe(find('city', 'stoke'))
  })

  it('matches an industry by label and by alias', () => {
    expect(matchPaletteEntries('coal', ALL)[0]).toBe(find('industry', 'coal'))
    expect(matchPaletteEntries('mine', ALL)[0]).toBe(find('industry', 'coal'))
    expect(matchPaletteEntries('beer', ALL)[0]).toBe(
      find('industry', 'brewery'),
    )
  })

  it('matches a city by its raw id too', () => {
    expect(ids(matchPaletteEntries('farmbrewery1', ALL))).toEqual([
      'city:farmBrewery1',
    ])
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(matchPaletteEntries('zzzz', ALL)).toEqual([])
  })

  it('is deterministic: same query, same order', () => {
    expect(ids(matchPaletteEntries('co', ALL))).toEqual(
      ids(matchPaletteEntries('CO', ALL)),
    )
  })

  it('puts an exact industry ahead of a merely-containing city', () => {
    const hits = matchPaletteEntries('iron', ALL)
    expect(hits[0]).toBe(find('industry', 'iron'))
  })
})
