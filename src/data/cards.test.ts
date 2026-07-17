import { describe, expect, test } from 'vitest'
import { describeCardId } from './cards'

describe('describeCardId', () => {
  test('location-card slot ids resolve to the city display name', () => {
    // The reported bug: "coventry_1" leaked raw into the journal.
    expect(describeCardId('coventry_1')).toBe('Coventry')
    expect(describeCardId('stafford_1')).toBe('Stafford')
    // Ids whose display name differs from the slug.
    expect(describeCardId('stoke_2')).toBe('Stoke-on-Trent')
    expect(describeCardId('burton_1')).toBe('Burton upon Trent')
  })

  test('industry-card slot ids describe the industry', () => {
    expect(describeCardId('iron_4')).toBe('iron industry')
    expect(describeCardId('pottery_2')).toBe('pottery industry')
    expect(describeCardId('cotton_manufacturer_6')).toBe(
      'cotton/manufacturer industry',
    )
  })

  test('wild-card slot ids read as plain wild labels', () => {
    expect(describeCardId('wild_location_2')).toBe('wild location')
    expect(describeCardId('wild_industry_1')).toBe('wild industry')
  })

  test('unrecognised tokens return null (caller keeps them verbatim)', () => {
    expect(describeCardId('coventry')).toBeNull()
    expect(describeCardId('not_a_card')).toBeNull()
    expect(describeCardId('£30')).toBeNull()
  })
})
