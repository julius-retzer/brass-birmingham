import { describe, expect, test } from 'vitest'
import { type CityId, cityIndustrySlots } from '../data/board'
import type {
  IndustryCard,
  LocationCard,
  WildIndustryCard,
  WildLocationCard,
} from '../data/cards'
import { computeHoverCities } from './hover-highlight'

const locationCard = (location: CityId): LocationCard => ({
  id: `loc-${location}`,
  type: 'location',
  location,
  color: 'other',
})

const industryCard = (
  ...industries: IndustryCard['industries']
): IndustryCard => ({
  id: `ind-${industries.join('-')}`,
  type: 'industry',
  industries,
})

describe('computeHoverCities', () => {
  test('no card hovered → null (nothing to preview)', () => {
    expect(computeHoverCities(null, null)).toBeNull()
  })

  test('wild cards preview nothing (they can go anywhere)', () => {
    const wildLoc: WildLocationCard = { id: 'wl', type: 'wild_location' }
    const wildInd: WildIndustryCard = { id: 'wi', type: 'wild_industry' }
    expect(computeHoverCities(wildLoc, null)).toBeNull()
    expect(computeHoverCities(wildInd, new Set(['brno']))).toBeNull()
  })

  test('location card spotlights exactly its printed city', () => {
    // Independent of the player network — a location card names one city.
    const set = computeHoverCities(locationCard('bielsko'), null)
    expect(set).toEqual(new Set(['bielsko']))

    const withNetwork = computeHoverCities(
      locationCard('bielsko'),
      new Set(['brno']),
    )
    expect(withNetwork).toEqual(new Set(['bielsko']))
  })

  test('industry card with no presence highlights every matching slot (anywhere)', () => {
    // Empty network → "anywhere": all cities whose slots accept coal.
    const set = computeHoverCities(industryCard('coal'), new Set())!
    const expected = Object.entries(cityIndustrySlots)
      .filter(([, slots]) => slots.some((slot) => slot.includes('coal')))
      .map(([city]) => city)
    expect(set).toEqual(new Set(expected))
    // Sanity: ostrava has a coal slot; zilina (cotton-only) does not.
    expect(set.has('ostrava')).toBe(true)
    expect(set.has('zilina')).toBe(false)
  })

  test('industry card is scoped to the network once the player has presence', () => {
    // brno has an iron slot; ostrava also has iron but is out of
    // network, so it must NOT be highlighted.
    const network = new Set<CityId>(['brno', 'zilina'])
    const set = computeHoverCities(industryCard('iron'), network)!
    expect(set.has('brno')).toBe(true) // in network + has iron slot
    expect(set.has('ostrava')).toBe(false) // has iron slot but out of network
    expect(set.has('zilina')).toBe(false) // in network but cotton-only, no iron slot
  })

  test('a card naming several industries matches a slot accepting any of them', () => {
    // zilina slots are cotton-only; a cotton/manufacturer card still hits it.
    const set = computeHoverCities(
      industryCard('cotton', 'manufacturer'),
      new Set<CityId>(['zilina']),
    )!
    expect(set).toEqual(new Set(['zilina']))
  })

  test('null network is treated as no presence (anywhere)', () => {
    const anywhere = computeHoverCities(industryCard('pottery'), null)!
    const viaEmpty = computeHoverCities(industryCard('pottery'), new Set())!
    expect(anywhere).toEqual(viaEmpty)
  })
})
