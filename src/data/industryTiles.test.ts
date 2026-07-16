// Pinning tests for every industry tile stat, audited 2026-07-14.
//
// Authoritative source: the RETAIL player board — official Roxley
// production component, photographed flat (BoardGameGeek image 4231622 /
// 4231621, July 2018; archived in ai-docs/reference/), read tile-by-tile.
// Corroborated 100% by the independent TTS-derived transcription
// (npow/brass-brno js/gameData.js). Rulebook rules text confirms the
// mechanics these stats feed: breweries consume IRON to build (p.7
// "4b. If you built a brewery"), develop consumes 1 iron per tile,
// lightbulb pottery may not be developed (p.8), brewery barrels are 1 in
// the Canal Era / 2 in the Rail Era at build time.
//
// CAUTION: the 2018 rulebook PDF's player-mat PHOTOS show a prototype
// board; its Manufacturer IV (£14 / income 7) deviates from the retail
// component (£8 / income 6). The retail board wins.
//
// If any of these pins fails, the tile DATA changed — do not update a pin
// without re-verifying against the physical component.
import { describe, expect, it } from 'vitest'
import { industryTileDefinitions } from './industryTiles'

// [level, cost, vp, income, linkIcons, coal, iron, beerToSell, quantity,
//  canalEra, railEra, lightbulb]
type Pin = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  boolean,
  boolean,
  boolean,
]

const PINS: Record<string, Pin[]> = {
  cotton: [
    [1, 12, 5, 5, 1, 0, 0, 1, 3, true, false, false],
    [2, 14, 5, 4, 2, 1, 0, 1, 2, true, true, false],
    [3, 16, 9, 3, 1, 1, 1, 1, 3, true, true, false],
    [4, 18, 12, 2, 1, 1, 1, 1, 3, true, true, false],
  ],
  coal: [
    [1, 5, 1, 4, 2, 0, 0, 0, 1, true, false, false],
    [2, 7, 2, 7, 1, 0, 0, 0, 2, true, true, false],
    [3, 8, 3, 6, 1, 0, 1, 0, 2, true, true, false],
    [4, 10, 4, 5, 1, 0, 1, 0, 2, true, true, false],
  ],
  iron: [
    [1, 5, 3, 3, 1, 1, 0, 0, 1, true, false, false],
    [2, 7, 5, 3, 1, 1, 0, 0, 1, true, true, false],
    [3, 9, 7, 2, 1, 1, 0, 0, 1, true, true, false],
    [4, 12, 9, 1, 1, 1, 0, 0, 1, true, true, false],
  ],
  manufacturer: [
    [1, 8, 3, 5, 2, 1, 0, 1, 1, true, false, false],
    [2, 10, 5, 1, 1, 0, 1, 1, 2, true, true, false],
    [3, 12, 4, 4, 0, 2, 0, 0, 1, true, true, false],
    [4, 8, 3, 6, 1, 0, 1, 1, 1, true, true, false],
    [5, 16, 8, 2, 2, 1, 0, 2, 2, true, true, false],
    [6, 20, 7, 6, 1, 0, 0, 1, 1, true, true, false],
    [7, 16, 9, 4, 0, 1, 1, 0, 1, true, true, false],
    [8, 20, 11, 1, 1, 0, 2, 1, 2, true, true, false],
  ],
  pottery: [
    [1, 17, 10, 5, 1, 0, 1, 1, 1, true, true, true],
    [2, 0, 1, 1, 1, 1, 0, 1, 1, true, true, false],
    [3, 22, 11, 5, 1, 2, 0, 2, 1, true, true, true],
    [4, 0, 1, 1, 1, 1, 0, 1, 1, true, true, false],
    [5, 24, 20, 5, 1, 2, 0, 2, 1, false, true, false],
  ],
  brewery: [
    [1, 5, 4, 4, 2, 0, 1, 0, 2, true, false, false],
    [2, 7, 5, 5, 2, 0, 1, 0, 2, true, true, false],
    [3, 9, 7, 5, 2, 0, 1, 0, 2, true, true, false],
    [4, 9, 10, 5, 2, 0, 1, 0, 1, false, true, false],
  ],
}

// Physical tile counts per player: 11 cotton, 7 coal, 4 iron,
// 11 manufacturer, 5 pottery, 7 brewery (retail component).
const PHYSICAL_TOTALS: Record<string, number> = {
  cotton: 11,
  coal: 7,
  iron: 4,
  manufacturer: 11,
  pottery: 5,
  brewery: 7,
}

describe('industry tile stats — pinned to the retail player board', () => {
  for (const [industry, pins] of Object.entries(PINS)) {
    describe(industry, () => {
      it(`has exactly ${pins.length} levels`, () => {
        expect(industryTileDefinitions[industry]).toHaveLength(pins.length)
      })

      for (const pin of pins) {
        const [
          level,
          cost,
          vp,
          income,
          links,
          coal,
          iron,
          beer,
          quantity,
          canal,
          rail,
          bulb,
        ] = pin
        it(`level ${level}: £${cost}, ${vp} VP, income ${income}, ${links} link icon(s), ${coal} coal + ${iron} iron to build`, () => {
          const tile = industryTileDefinitions[industry]?.find(
            (t) => t.level === level,
          )
          expect(tile).toBeDefined()
          expect(tile!.cost).toBe(cost)
          expect(tile!.victoryPoints).toBe(vp)
          expect(tile!.incomeAdvancement).toBe(income)
          expect(tile!.incomeSpaces).toBe(income)
          expect(tile!.linkScoringIcons).toBe(links)
          expect(tile!.coalRequired).toBe(coal)
          expect(tile!.ironRequired).toBe(iron)
          expect(tile!.beerRequired).toBe(beer)
          expect(tile!.quantity).toBe(quantity)
          expect(tile!.canBuildInCanalEra).toBe(canal)
          expect(tile!.canBuildInRailEra).toBe(rail)
          expect(tile!.hasLightbulbIcon).toBe(bulb)
        })
      }

      it('matches the physical tile count', () => {
        const total = industryTileDefinitions[industry]!.reduce(
          (n, t) => n + t.quantity,
          0,
        )
        expect(total).toBe(PHYSICAL_TOTALS[industry])
      })
    })
  }

  it('breweries contribute 2 link-scoring icons at every level (captain bug report 2026-07-14)', () => {
    for (const tile of industryTileDefinitions.brewery!) {
      expect(tile.linkScoringIcons).toBe(2)
    }
  })

  it('breweries consume iron, never coal, to build (rulebook p.7 §4b)', () => {
    for (const tile of industryTileDefinitions.brewery!) {
      expect(tile.ironRequired).toBe(1)
      expect(tile.coalRequired).toBe(0)
    }
  })

  it('resource production: coal mines 2/3/4/5, iron works 4/4/5/6', () => {
    expect(
      industryTileDefinitions.coal!.map((t) => t.coalProduced),
    ).toStrictEqual([2, 3, 4, 5])
    expect(
      industryTileDefinitions.iron!.map((t) => t.ironProduced),
    ).toStrictEqual([4, 4, 5, 6])
  })

  it('breweries place 1 barrel (engine doubles in the Rail Era)', () => {
    for (const tile of industryTileDefinitions.brewery!) {
      expect(tile.beerProduced).toBe(1)
    }
  })
})
