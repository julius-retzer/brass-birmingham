import { describe, expect, it } from 'vitest'
import type { IndustryTileWithQuantity } from '~/data/industryTiles'
import {
  POTTERY_LIGHTBULB_REASON,
  blockedIndustries,
  developableIndustries,
  type IndustryMat,
} from './develop-block'

const tile = (
  over: Partial<IndustryTileWithQuantity['tile']> & {
    quantityAvailable?: number
  },
): IndustryTileWithQuantity => {
  const { quantityAvailable = 1, ...tileOver } = over
  return {
    quantityAvailable,
    tile: {
      type: 'coal',
      level: 1,
      hasLightbulbIcon: false,
      ...tileOver,
    },
  } as unknown as IndustryTileWithQuantity
}

const potteryLightbulb = (quantityAvailable = 1) =>
  tile({ type: 'pottery', level: 1, hasLightbulbIcon: true, quantityAvailable })
const potteryPlain = (quantityAvailable = 1) =>
  tile({
    type: 'pottery',
    level: 2,
    hasLightbulbIcon: false,
    quantityAvailable,
  })

const mat = (over: IndustryMat): IndustryMat => ({
  cotton: [],
  coal: [],
  iron: [],
  manufacturer: [],
  pottery: [],
  brewery: [],
  ...over,
})

describe('developableIndustries', () => {
  it('lists an industry with a developable tile on the mat', () => {
    expect(
      developableIndustries(mat({ coal: [tile({ type: 'coal' })] })),
    ).toEqual(['coal'])
  })

  it('lists pottery while a non-lightbulb tile remains', () => {
    expect(
      developableIndustries(
        mat({ pottery: [potteryLightbulb(), potteryPlain()] }),
      ),
    ).toEqual(['pottery'])
  })

  it('omits an industry whose only tiles are non-developable', () => {
    expect(
      developableIndustries(mat({ pottery: [potteryLightbulb()] })),
    ).toEqual([])
  })

  it('omits an industry with nothing left on the mat', () => {
    expect(
      developableIndustries(
        mat({ coal: [tile({ type: 'coal', quantityAvailable: 0 })] }),
      ),
    ).toEqual([])
  })
})

describe('blockedIndustries', () => {
  it('blocks pottery when only lightbulb tiles remain, with the rulebook reason', () => {
    expect(blockedIndustries(mat({ pottery: [potteryLightbulb()] }))).toEqual([
      { type: 'pottery', reason: POTTERY_LIGHTBULB_REASON },
    ])
  })

  it('does not block pottery while a developable tile remains', () => {
    expect(
      blockedIndustries(mat({ pottery: [potteryLightbulb(), potteryPlain()] })),
    ).toEqual([])
  })

  it('does not block an industry the player no longer holds', () => {
    expect(blockedIndustries(mat({ pottery: [potteryLightbulb(0)] }))).toEqual(
      [],
    )
  })

  it('ignores developable industries', () => {
    expect(blockedIndustries(mat({ coal: [tile({ type: 'coal' })] }))).toEqual(
      [],
    )
  })
})
