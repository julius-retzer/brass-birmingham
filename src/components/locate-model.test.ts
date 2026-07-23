import { describe, expect, it } from 'vitest'
import {
  NO_SPOTLIGHT,
  SPOTLIGHT_MS,
  mergeLocated,
  spotlightFor,
} from './locate-model'

describe('spotlightFor', () => {
  it('nothing to spotlight is the idle state itself', () => {
    expect(spotlightFor([])).toBe(NO_SPOTLIGHT)
  })

  it('a single city spotlights and anchors the pan on itself', () => {
    const s = spotlightFor(['derby'])
    expect([...s.cities]).toEqual(['derby'])
    expect(s.focus).toBe('derby')
  })

  it('many cities all spotlight; the first is the pan anchor', () => {
    const s = spotlightFor(['dudley', 'cannock', 'belper'])
    expect(s.cities.has('cannock')).toBe(true)
    expect(s.cities.size).toBe(3)
    expect(s.focus).toBe('dudley')
  })

  it('clears back to idle by returning NO_SPOTLIGHT', () => {
    expect(NO_SPOTLIGHT.cities.size).toBe(0)
    expect(NO_SPOTLIGHT.focus).toBeNull()
  })

  it('holds the spotlight for about five seconds', () => {
    expect(SPOTLIGHT_MS).toBe(5000)
  })
})

describe('mergeLocated (hover ∪ spotlight)', () => {
  it('nothing hovered, nothing spotlit → an empty, identity-stable set', () => {
    const a = mergeLocated(null, NO_SPOTLIGHT.cities)
    const b = mergeLocated(null, NO_SPOTLIGHT.cities)
    expect(a.size).toBe(0)
    expect(a).toBe(b)
  })

  it('hover alone still marks exactly one city (unchanged behaviour)', () => {
    expect([...mergeLocated('leek', NO_SPOTLIGHT.cities)]).toEqual(['leek'])
  })

  it('spotlight alone passes straight through', () => {
    const spot = spotlightFor(['dudley', 'cannock'])
    expect(mergeLocated(null, spot.cities)).toBe(spot.cities)
  })

  it('a hover during a spotlight adds to it', () => {
    const spot = spotlightFor(['dudley'])
    const merged = mergeLocated('leek', spot.cities)
    expect([...merged].sort()).toEqual(['dudley', 'leek'])
    expect(spot.cities.has('leek')).toBe(false) // the spotlight is untouched
  })

  it('hovering a city already spotlit changes nothing', () => {
    const spot = spotlightFor(['dudley', 'cannock'])
    expect(mergeLocated('dudley', spot.cities)).toBe(spot.cities)
  })
})
