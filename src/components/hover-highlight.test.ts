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
    expect(computeHoverCities(wildInd, new Set(['birmingham']))).toBeNull()
  })

  test('location card spotlights exactly its printed city', () => {
    // Independent of the player network — a location card names one city.
    const set = computeHoverCities(locationCard('derby'), null)
    expect(set).toEqual(new Set(['derby']))

    const withNetwork = computeHoverCities(
      locationCard('derby'),
      new Set(['birmingham']),
    )
    expect(withNetwork).toEqual(new Set(['derby']))
  })

  test('industry card with no presence highlights every matching slot (anywhere)', () => {
    // Empty network → "anywhere": all cities whose slots accept coal.
    const set = computeHoverCities(industryCard('coal'), new Set())!
    const expected = Object.entries(cityIndustrySlots)
      .filter(([, slots]) => slots.some((slot) => slot.includes('coal')))
      .map(([city]) => city)
    expect(set).toEqual(new Set(expected))
    // Sanity: coalbrookdale has a coal slot; worcester (cotton-only) does not.
    expect(set.has('coalbrookdale')).toBe(true)
    expect(set.has('worcester')).toBe(false)
  })

  test('industry card is scoped to the network once the player has presence', () => {
    // birmingham has an iron slot; coalbrookdale also has iron but is out of
    // network, so it must NOT be highlighted.
    const network = new Set<CityId>(['birmingham', 'worcester'])
    const set = computeHoverCities(industryCard('iron'), network)!
    expect(set.has('birmingham')).toBe(true) // in network + has iron slot
    expect(set.has('coalbrookdale')).toBe(false) // has iron slot but out of network
    expect(set.has('worcester')).toBe(false) // in network but cotton-only, no iron slot
  })

  test('a card naming several industries matches a slot accepting any of them', () => {
    // worcester slots are cotton-only; a cotton/manufacturer card still hits it.
    const set = computeHoverCities(
      industryCard('cotton', 'manufacturer'),
      new Set<CityId>(['worcester']),
    )!
    expect(set).toEqual(new Set(['worcester']))
  })

  test('null network is treated as no presence (anywhere)', () => {
    const anywhere = computeHoverCities(industryCard('pottery'), null)!
    const viaEmpty = computeHoverCities(industryCard('pottery'), new Set())!
    expect(anywhere).toEqual(viaEmpty)
  })
})
