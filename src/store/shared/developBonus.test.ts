import { describe, expect, it } from 'vitest'
import type { IndustryType } from '../../data/cards'
import type { IndustryTileWithQuantity } from '../../data/industryTiles'
import {
  getDevelopBonusOptions,
  pendingDevelopBonusChoice,
} from './developBonus'

// Minimal tile factory — only the fields the develop-bonus logic reads.
const tile = (
  type: IndustryType,
  level: number,
  hasLightbulbIcon = false,
): IndustryTileWithQuantity => ({
  quantityAvailable: 1,
  tile: {
    id: `${type}_${level}`,
    type,
    level,
    hasLightbulbIcon,
  } as IndustryTileWithQuantity['tile'],
})

describe('getDevelopBonusOptions', () => {
  it('offers every track, each removing its lowest available tile', () => {
    const options = getDevelopBonusOptions({
      coal: [tile('coal', 2), tile('coal', 1)],
      iron: [tile('iron', 1)],
    })
    expect(options).toHaveLength(2)
    const coal = options.find((o) => o.industryType === 'coal')!
    expect(coal.tile.level).toBe(1)
    expect(options.find((o) => o.industryType === 'iron')!.tile.level).toBe(1)
  })

  it('skips tracks with no tiles left on the mat', () => {
    const options = getDevelopBonusOptions({
      coal: [{ ...tile('coal', 1), quantityAvailable: 0 }],
      iron: [tile('iron', 1)],
    })
    expect(options.map((o) => o.industryType)).toEqual(['iron'])
  })

  it('excludes a track whose lowest tile is a lightbulb Pottery', () => {
    // pottery_1 (level 1) carries the lightbulb icon: pottery cannot be
    // developed while it is the lowest tile, even though pottery_2 is not a
    // lightbulb tile.
    const options = getDevelopBonusOptions({
      pottery: [tile('pottery', 1, true), tile('pottery', 2)],
      cotton: [tile('cotton', 1)],
    })
    expect(options.map((o) => o.industryType)).toEqual(['cotton'])
  })

  it('offers a Pottery track once its lowest lightbulb tile is gone', () => {
    const options = getDevelopBonusOptions({
      pottery: [
        { ...tile('pottery', 1, true), quantityAvailable: 0 },
        tile('pottery', 2),
      ],
    })
    expect(options).toHaveLength(1)
    expect(options[0]!.tile.level).toBe(2)
  })
})

describe('pendingDevelopBonusChoice', () => {
  const mat = { coal: [tile('coal', 1)], iron: [tile('iron', 1)] }

  it('is null when nothing is owed', () => {
    expect(pendingDevelopBonusChoice(mat, 0)).toBeNull()
    expect(pendingDevelopBonusChoice(mat, null)).toBeNull()
    expect(pendingDevelopBonusChoice(mat, undefined)).toBeNull()
  })

  it('is null when the bonus is owed but nothing is developable', () => {
    expect(pendingDevelopBonusChoice({}, 1)).toBeNull()
    expect(
      pendingDevelopBonusChoice({ pottery: [tile('pottery', 1, true)] }, 1),
    ).toBeNull()
  })

  it('reports a real choice when two or more tracks are developable', () => {
    const choice = pendingDevelopBonusChoice(mat, 1)!
    expect(choice.required).toBe(1)
    expect(choice.hasChoice).toBe(true)
    expect(choice.options).toHaveLength(2)
  })

  it('reports no real choice when a single track is developable', () => {
    const choice = pendingDevelopBonusChoice({ coal: [tile('coal', 1)] }, 1)!
    expect(choice.hasChoice).toBe(false)
    expect(choice.options).toHaveLength(1)
  })
})
