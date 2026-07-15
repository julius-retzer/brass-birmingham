// Saves made before the 2026-07-14 tile audit embed old tile stats —
// refreshEmbeddedTileStats() must bring them onto the corrected print run
// (captain report: a resumed game still showed breweries with one link
// icon after the audit).
import { describe, expect, it } from 'vitest'
import { industryTileDefinitions } from '../data/industryTiles'
import { refreshEmbeddedTileStats } from './saveMigration'

const OLD_BREWERY_1 = {
  // pre-audit stats: 1 link icon, no iron, wrong quantity
  id: 'brewery_1',
  type: 'brewery',
  level: 1,
  cost: 5,
  victoryPoints: 4,
  incomeSpaces: 4,
  linkScoringIcons: 1,
  coalRequired: 0,
  ironRequired: 0,
  beerRequired: 0,
  beerProduced: 1,
  coalProduced: 0,
  ironProduced: 0,
  canBuildInCanalEra: true,
  canBuildInRailEra: false,
  hasLightbulbIcon: false,
  incomeAdvancement: 4,
  quantity: 2,
}

const oldSave = () => ({
  context: {
    players: [
      {
        income: 10, // pre-audit saves have no incomeSpace

        industries: [
          {
            location: 'uttoxeter',
            type: 'brewery',
            tile: { ...OLD_BREWERY_1 },
          },
        ],
        industryTilesOnMat: {
          brewery: [{ tile: { ...OLD_BREWERY_1 }, quantityAvailable: 1 }],
          // old data had 8× manufacturer level 1
          manufacturer: [
            {
              tile: {
                ...OLD_BREWERY_1,
                id: 'manufacturer_1',
                type: 'manufacturer',
              },
              quantityAvailable: 8,
            },
          ],
          pottery: [
            {
              tile: { ...OLD_BREWERY_1, id: 'pottery_1', type: 'pottery' },
              quantityAvailable: 1,
            },
          ],
        },
      },
    ],
    selectedIndustryTile: { ...OLD_BREWERY_1 },
  },
})

describe('refreshEmbeddedTileStats', () => {
  it('refreshes built industries to the audited stats', () => {
    const save = oldSave()
    refreshEmbeddedTileStats(save)
    const built = save.context.players[0]!.industries[0]!
    expect(built.tile.linkScoringIcons).toBe(2)
    expect(built.tile.ironRequired).toBe(1)
  })

  it('derives the income-track marker for saves that predate it', () => {
    const save = oldSave()
    refreshEmbeddedTileStats(save)
    // level 10 sits on space 30 (highest space of the level)
    expect(
      (save.context.players[0] as { incomeSpace?: number }).incomeSpace,
    ).toBe(30)
  })

  it('refreshes mat tiles and caps quantities at the corrected print run', () => {
    const save = oldSave()
    refreshEmbeddedTileStats(save)
    const mat = save.context.players[0]!.industryTilesOnMat
    expect(mat.brewery![0]!.tile.linkScoringIcons).toBe(2)
    // manufacturer_1 print run is 1, the old save claimed 8 available
    expect(mat.manufacturer![0]!.quantityAvailable).toBe(1)
  })

  it('appends tiles the audit added (pottery level 5)', () => {
    const save = oldSave()
    refreshEmbeddedTileStats(save)
    const pottery = save.context.players[0]!.industryTilesOnMat.pottery!
    const five = pottery.find((r) => r.tile.id === 'pottery_5')
    expect(five).toBeDefined()
    expect(five!.quantityAvailable).toBe(1)
  })

  it('refreshes an in-flight build selection', () => {
    const save = oldSave()
    refreshEmbeddedTileStats(save)
    expect(
      (save.context.selectedIndustryTile as { linkScoringIcons: number })
        .linkScoringIcons,
    ).toBe(2)
  })

  it('is a no-op on current data and tolerates odd shapes', () => {
    const brewery1 = industryTileDefinitions.brewery![0]!
    const current = {
      context: {
        players: [
          {
            industries: [{ tile: { ...brewery1 } }],
            industryTilesOnMat: {
              brewery: [{ tile: { ...brewery1 }, quantityAvailable: 2 }],
            },
          },
        ],
      },
    }
    refreshEmbeddedTileStats(current)
    expect(current.context.players[0]!.industries[0]!.tile).toStrictEqual(
      brewery1,
    )
    expect(refreshEmbeddedTileStats({})).toStrictEqual({})
    expect(refreshEmbeddedTileStats({ context: {} })).toStrictEqual({
      context: {},
    })
  })
})
