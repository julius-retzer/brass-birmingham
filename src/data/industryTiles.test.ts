import { describe, it, expect } from 'vitest'
import { industryTileDefinitions } from './industryTiles'

function getTile(industry: string, level: number) {
  const tiles = industryTileDefinitions[industry]
  return tiles?.find((t) => t.level === level)
}

describe('industry tile definitions', () => {
  describe('cotton tiles (total 11 per player)', () => {
    it('level 1: quantity 3, linkScoringIcons 1', () => {
      const tile = getTile('cotton', 1)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(3)
      expect(tile.linkScoringIcons).toBe(1)
    })

    it('level 2: quantity 2, linkScoringIcons 2', () => {
      const tile = getTile('cotton', 2)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(2)
      expect(tile.linkScoringIcons).toBe(2)
    })

    it('level 3: quantity 3', () => {
      const tile = getTile('cotton', 3)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(3)
    })

    it('level 4: quantity 3', () => {
      const tile = getTile('cotton', 4)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(3)
    })

    it('total cotton tiles per player is 11', () => {
      const total = industryTileDefinitions.cotton!.reduce(
        (sum, t) => sum + t.quantity,
        0
      )
      expect(total).toBe(11)
    })
  })

  describe('coal tiles (total 7 per player)', () => {
    it('level 1: quantity 1, linkScoringIcons 2', () => {
      const tile = getTile('coal', 1)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(1)
      expect(tile.linkScoringIcons).toBe(2)
    })

    it('level 2: quantity 2', () => {
      const tile = getTile('coal', 2)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(2)
    })

    it('level 3: quantity 2', () => {
      const tile = getTile('coal', 3)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(2)
    })

    it('level 4: quantity 2', () => {
      const tile = getTile('coal', 4)!
      expect(tile).toBeDefined()
      expect(tile.quantity).toBe(2)
    })

    it('total coal tiles per player is 7', () => {
      const total = industryTileDefinitions.coal!.reduce(
        (sum, t) => sum + t.quantity,
        0
      )
      expect(total).toBe(7)
    })
  })

  describe('iron tiles (total 4 per player)', () => {
    it('level 1: ironProduced 4, quantity 1', () => {
      const tile = getTile('iron', 1)!
      expect(tile).toBeDefined()
      expect(tile.ironProduced).toBe(4)
      expect(tile.quantity).toBe(1)
    })

    it('level 2: ironProduced 4, quantity 1', () => {
      const tile = getTile('iron', 2)!
      expect(tile).toBeDefined()
      expect(tile.ironProduced).toBe(4)
      expect(tile.quantity).toBe(1)
    })

    it('level 3: ironProduced 5, incomeAdvancement 2, quantity 1', () => {
      const tile = getTile('iron', 3)!
      expect(tile).toBeDefined()
      expect(tile.ironProduced).toBe(5)
      expect(tile.incomeAdvancement).toBe(2)
      expect(tile.quantity).toBe(1)
    })

    it('level 4: ironProduced 6, incomeAdvancement 1, quantity 1', () => {
      const tile = getTile('iron', 4)!
      expect(tile).toBeDefined()
      expect(tile.ironProduced).toBe(6)
      expect(tile.incomeAdvancement).toBe(1)
      expect(tile.quantity).toBe(1)
    })

    it('total iron tiles per player is 4', () => {
      const total = industryTileDefinitions.iron!.reduce(
        (sum, t) => sum + t.quantity,
        0
      )
      expect(total).toBe(4)
    })
  })

  describe('manufacturer tiles (total 11 per player)', () => {
    it('level 1: coalRequired 1, quantity 1, linkScoringIcons 2', () => {
      const tile = getTile('manufacturer', 1)!
      expect(tile).toBeDefined()
      expect(tile.coalRequired).toBe(1)
      expect(tile.quantity).toBe(1)
      expect(tile.linkScoringIcons).toBe(2)
    })

    it('level 2: coalRequired 0, ironRequired 1, quantity 2, linkScoringIcons 1', () => {
      const tile = getTile('manufacturer', 2)!
      expect(tile).toBeDefined()
      expect(tile.coalRequired).toBe(0)
      expect(tile.ironRequired).toBe(1)
      expect(tile.quantity).toBe(2)
      expect(tile.linkScoringIcons).toBe(1)
    })

    it('level 3: cost 12, VP 4, coalRequired 2, ironRequired 0, beerRequired 0, linkScoringIcons 0, incomeAdvancement 4, quantity 1', () => {
      const tile = getTile('manufacturer', 3)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(12)
      expect(tile.victoryPoints).toBe(4)
      expect(tile.coalRequired).toBe(2)
      expect(tile.ironRequired).toBe(0)
      expect(tile.beerRequired).toBe(0)
      expect(tile.linkScoringIcons).toBe(0)
      expect(tile.incomeAdvancement).toBe(4)
      expect(tile.quantity).toBe(1)
    })

    it('level 4: cost 8, VP 3, coalRequired 0, ironRequired 1, beerRequired 1, linkScoringIcons 1, incomeAdvancement 6, quantity 1', () => {
      const tile = getTile('manufacturer', 4)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(8)
      expect(tile.victoryPoints).toBe(3)
      expect(tile.coalRequired).toBe(0)
      expect(tile.ironRequired).toBe(1)
      expect(tile.beerRequired).toBe(1)
      expect(tile.linkScoringIcons).toBe(1)
      expect(tile.incomeAdvancement).toBe(6)
      expect(tile.quantity).toBe(1)
    })

    it('level 5: cost 16, VP 8, coalRequired 1, ironRequired 0, beerRequired 2, linkScoringIcons 2, incomeAdvancement 2, quantity 2', () => {
      const tile = getTile('manufacturer', 5)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(16)
      expect(tile.victoryPoints).toBe(8)
      expect(tile.coalRequired).toBe(1)
      expect(tile.ironRequired).toBe(0)
      expect(tile.beerRequired).toBe(2)
      expect(tile.linkScoringIcons).toBe(2)
      expect(tile.incomeAdvancement).toBe(2)
      expect(tile.quantity).toBe(2)
    })

    it('level 6: cost 20, VP 7, coalRequired 0, ironRequired 0, beerRequired 1, linkScoringIcons 1, incomeAdvancement 6, quantity 1', () => {
      const tile = getTile('manufacturer', 6)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(20)
      expect(tile.victoryPoints).toBe(7)
      expect(tile.coalRequired).toBe(0)
      expect(tile.ironRequired).toBe(0)
      expect(tile.beerRequired).toBe(1)
      expect(tile.linkScoringIcons).toBe(1)
      expect(tile.incomeAdvancement).toBe(6)
      expect(tile.quantity).toBe(1)
    })

    it('level 7: cost 16, VP 9, coalRequired 1, ironRequired 1, beerRequired 0, linkScoringIcons 0, incomeAdvancement 4, quantity 1', () => {
      const tile = getTile('manufacturer', 7)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(16)
      expect(tile.victoryPoints).toBe(9)
      expect(tile.coalRequired).toBe(1)
      expect(tile.ironRequired).toBe(1)
      expect(tile.beerRequired).toBe(0)
      expect(tile.linkScoringIcons).toBe(0)
      expect(tile.incomeAdvancement).toBe(4)
      expect(tile.quantity).toBe(1)
    })

    it('level 8: cost 20, VP 11, coalRequired 0, ironRequired 2, beerRequired 1, linkScoringIcons 1, incomeAdvancement 1, quantity 2', () => {
      const tile = getTile('manufacturer', 8)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(20)
      expect(tile.victoryPoints).toBe(11)
      expect(tile.coalRequired).toBe(0)
      expect(tile.ironRequired).toBe(2)
      expect(tile.beerRequired).toBe(1)
      expect(tile.linkScoringIcons).toBe(1)
      expect(tile.incomeAdvancement).toBe(1)
      expect(tile.quantity).toBe(2)
    })

    it('total manufacturer tiles per player is 11', () => {
      const total = industryTileDefinitions.manufacturer!.reduce(
        (sum, t) => sum + t.quantity,
        0
      )
      expect(total).toBe(11)
    })
  })

  describe('pottery tiles (total 5 per player)', () => {
    it('level 1: cost 17, VP 10, coalRequired 0, ironRequired 1, hasLightbulbIcon true', () => {
      const tile = getTile('pottery', 1)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(17)
      expect(tile.victoryPoints).toBe(10)
      expect(tile.coalRequired).toBe(0)
      expect(tile.ironRequired).toBe(1)
      expect(tile.hasLightbulbIcon).toBe(true)
    })

    it('level 2: cost 0, VP 1, quantity 1, hasLightbulbIcon false', () => {
      const tile = getTile('pottery', 2)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(0)
      expect(tile.victoryPoints).toBe(1)
      expect(tile.quantity).toBe(1)
      expect(tile.hasLightbulbIcon).toBe(false)
    })

    it('level 3: cost 22, VP 11, coalRequired 2, beerRequired 2, hasLightbulbIcon true', () => {
      const tile = getTile('pottery', 3)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(22)
      expect(tile.victoryPoints).toBe(11)
      expect(tile.coalRequired).toBe(2)
      expect(tile.beerRequired).toBe(2)
      expect(tile.hasLightbulbIcon).toBe(true)
    })

    it('level 4: cost 0, VP 1, hasLightbulbIcon false', () => {
      const tile = getTile('pottery', 4)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(0)
      expect(tile.victoryPoints).toBe(1)
      expect(tile.hasLightbulbIcon).toBe(false)
    })

    it('level 5: cost 24, VP 20, coalRequired 2, beerRequired 2, ironRequired 0, hasLightbulbIcon true, canBuildInCanalEra false, canBuildInRailEra true, quantity 1', () => {
      const tile = getTile('pottery', 5)!
      expect(tile).toBeDefined()
      expect(tile.cost).toBe(24)
      expect(tile.victoryPoints).toBe(20)
      expect(tile.coalRequired).toBe(2)
      expect(tile.beerRequired).toBe(2)
      expect(tile.ironRequired).toBe(0)
      expect(tile.hasLightbulbIcon).toBe(true)
      expect(tile.canBuildInCanalEra).toBe(false)
      expect(tile.canBuildInRailEra).toBe(true)
      expect(tile.quantity).toBe(1)
    })

    it('total pottery tiles per player is 5', () => {
      const total = industryTileDefinitions.pottery!.reduce(
        (sum, t) => sum + t.quantity,
        0
      )
      expect(total).toBe(5)
    })
  })

  describe('brewery tiles (total 7 per player)', () => {
    it('levels 1-3 all have ironRequired 1', () => {
      for (const level of [1, 2, 3]) {
        const tile = getTile('brewery', level)!
        expect(tile).toBeDefined()
        expect(tile.ironRequired).toBe(1)
      }
    })

    it('level 1: linkScoringIcons 2', () => {
      const tile = getTile('brewery', 1)!
      expect(tile.linkScoringIcons).toBe(2)
    })

    it('level 2: linkScoringIcons 2, quantity 2', () => {
      const tile = getTile('brewery', 2)!
      expect(tile.linkScoringIcons).toBe(2)
      expect(tile.quantity).toBe(2)
    })

    it('level 3: linkScoringIcons 2, quantity 2', () => {
      const tile = getTile('brewery', 3)!
      expect(tile.linkScoringIcons).toBe(2)
      expect(tile.quantity).toBe(2)
    })

    it('level 4: canBuildInCanalEra false (rail only), linkScoringIcons 2', () => {
      const tile = getTile('brewery', 4)!
      expect(tile.canBuildInCanalEra).toBe(false)
      expect(tile.linkScoringIcons).toBe(2)
    })

    it('total brewery tiles per player is 7', () => {
      const total = industryTileDefinitions.brewery!.reduce(
        (sum, t) => sum + t.quantity,
        0
      )
      expect(total).toBe(7)
    })
  })
})
