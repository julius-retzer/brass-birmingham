import { type IndustryType } from './cards'

export interface IndustryTile {
  id: string
  type: IndustryType
  level: number
  cost: number
  victoryPoints: number
  incomeSpaces: number // Income spaces gained when flipped
  linkScoringIcons: number // Number of link scoring icons (•—•) when flipped (0, 1, or 2)
  coalRequired: number // Coal required to build (0 if none)
  ironRequired: number // Iron required to build (0 if none)
  beerRequired: number // Beer required to sell (0 if none, only for Cotton Mills, Manufacturers, Pottery)
  beerProduced: number // Beer barrels placed on tile when built (Breweries only)
  coalProduced: number // Coal cubes placed on tile when built (Coal Mines only)
  ironProduced: number // Iron cubes placed on tile when built (Iron Works only)
  canBuildInCanalEra: boolean
  canBuildInRailEra: boolean
  hasLightbulbIcon: boolean // For pottery tiles that cannot be developed
  incomeAdvancement: number // Income advancement when tile flips
  quantity: number // Number of identical tiles available at this level
}

// Industry tile stats audited 2026-07-14 against the retail player board
// (official Roxley production photo, BGG image 4231621) and corroborated by
// the TTS-derived transcription in npow/brass-brno. Note: the photos
// in the 2018 rulebook PDF show a PROTOTYPE mat whose Manufacturer IV
// (£14 / income 7) differs from the production board (£8 / income 6).
// Every value below is pinned by src/data/industryTiles.test.ts.
export const industryTileDefinitions: Record<string, IndustryTile[]> = {
  cotton: [
    {
      id: 'cotton_1', // canal era only
      type: 'cotton',
      level: 1,
      cost: 12,
      victoryPoints: 5,
      incomeSpaces: 5,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      incomeAdvancement: 5,
      quantity: 3,
    },
    {
      id: 'cotton_2',
      type: 'cotton',
      level: 2,
      cost: 14,
      victoryPoints: 5,
      incomeSpaces: 4,
      linkScoringIcons: 2,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 4,
      quantity: 2,
    },
    {
      id: 'cotton_3',
      type: 'cotton',
      level: 3,
      cost: 16,
      victoryPoints: 9,
      incomeSpaces: 3,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 1,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 3,
      quantity: 3,
    },
    {
      id: 'cotton_4',
      type: 'cotton',
      level: 4,
      cost: 18,
      victoryPoints: 12,
      incomeSpaces: 2,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 1,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 2,
      quantity: 3,
    },
  ],
  coal: [
    {
      id: 'coal_1', // canal era only
      type: 'coal',
      level: 1,
      cost: 5,
      victoryPoints: 1,
      incomeSpaces: 4,
      linkScoringIcons: 2,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 2,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      incomeAdvancement: 4,
      quantity: 1,
    },
    {
      id: 'coal_2',
      type: 'coal',
      level: 2,
      cost: 7,
      victoryPoints: 2,
      incomeSpaces: 7,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 3,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 7,
      quantity: 2,
    },
    {
      id: 'coal_3',
      type: 'coal',
      level: 3,
      cost: 8,
      victoryPoints: 3,
      incomeSpaces: 6,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 4,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 6,
      quantity: 2,
    },
    {
      id: 'coal_4',
      type: 'coal',
      level: 4,
      cost: 10,
      victoryPoints: 4,
      incomeSpaces: 5,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 5,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 5,
      quantity: 2,
    },
  ],
  iron: [
    {
      id: 'iron_1', // canal era only
      type: 'iron',
      level: 1,
      cost: 5,
      victoryPoints: 3,
      incomeSpaces: 3,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 4,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      incomeAdvancement: 3,
      quantity: 1,
    },
    {
      id: 'iron_2',
      type: 'iron',
      level: 2,
      cost: 7,
      victoryPoints: 5,
      incomeSpaces: 3,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 4,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 3,
      quantity: 1,
    },
    {
      id: 'iron_3',
      type: 'iron',
      level: 3,
      cost: 9,
      victoryPoints: 7,
      incomeSpaces: 2,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 5,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 2,
      quantity: 1,
    },
    {
      id: 'iron_4',
      type: 'iron',
      level: 4,
      cost: 12,
      victoryPoints: 9,
      incomeSpaces: 1,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 6,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 1,
      quantity: 1,
    },
  ],
  manufacturer: [
    {
      id: 'manufacturer_1', // canal era only
      type: 'manufacturer',
      level: 1,
      cost: 8,
      victoryPoints: 3,
      incomeSpaces: 5,
      linkScoringIcons: 2,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      incomeAdvancement: 5,
      quantity: 1,
    },
    {
      id: 'manufacturer_2',
      type: 'manufacturer',
      level: 2,
      cost: 10,
      victoryPoints: 5,
      incomeSpaces: 1,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 1,
      quantity: 2,
    },
    {
      id: 'manufacturer_3',
      type: 'manufacturer',
      level: 3,
      cost: 12,
      victoryPoints: 4,
      incomeSpaces: 4,
      linkScoringIcons: 0,
      coalRequired: 2,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 4,
      quantity: 1,
    },
    {
      id: 'manufacturer_4',
      type: 'manufacturer',
      level: 4,
      cost: 8,
      victoryPoints: 3,
      incomeSpaces: 6,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 6,
      quantity: 1,
    },
    {
      id: 'manufacturer_5',
      type: 'manufacturer',
      level: 5,
      cost: 16,
      victoryPoints: 8,
      incomeSpaces: 2,
      linkScoringIcons: 2,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 2,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 2,
      quantity: 2,
    },
    {
      id: 'manufacturer_6',
      type: 'manufacturer',
      level: 6,
      cost: 20,
      victoryPoints: 7,
      incomeSpaces: 6,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 6,
      quantity: 1,
    },
    {
      id: 'manufacturer_7',
      type: 'manufacturer',
      level: 7,
      cost: 16,
      victoryPoints: 9,
      incomeSpaces: 4,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 4,
      quantity: 1,
    },
    {
      id: 'manufacturer_8',
      type: 'manufacturer',
      level: 8,
      cost: 20,
      victoryPoints: 11,
      incomeSpaces: 1,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 2,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 1,
      quantity: 2,
    },
  ],
  pottery: [
    {
      id: 'pottery_1', // lightbulb — may not be developed
      type: 'pottery',
      level: 1,
      cost: 17,
      victoryPoints: 10,
      incomeSpaces: 5,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: true,
      incomeAdvancement: 5,
      quantity: 1,
    },
    {
      id: 'pottery_2',
      type: 'pottery',
      level: 2,
      cost: 0,
      victoryPoints: 1,
      incomeSpaces: 1,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 1,
      quantity: 1,
    },
    {
      id: 'pottery_3', // lightbulb — may not be developed
      type: 'pottery',
      level: 3,
      cost: 22,
      victoryPoints: 11,
      incomeSpaces: 5,
      linkScoringIcons: 1,
      coalRequired: 2,
      ironRequired: 0,
      beerRequired: 2,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: true,
      incomeAdvancement: 5,
      quantity: 1,
    },
    {
      id: 'pottery_4',
      type: 'pottery',
      level: 4,
      cost: 0,
      victoryPoints: 1,
      incomeSpaces: 1,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 1,
      quantity: 1,
    },
    {
      id: 'pottery_5', // rail era only
      type: 'pottery',
      level: 5,
      cost: 24,
      victoryPoints: 20,
      incomeSpaces: 5,
      linkScoringIcons: 1,
      coalRequired: 2,
      ironRequired: 0,
      beerRequired: 2,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: false,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 5,
      quantity: 1,
    },
  ],
  brewery: [
    {
      id: 'brewery_1', // canal era only
      type: 'brewery',
      level: 1,
      cost: 5,
      victoryPoints: 4,
      incomeSpaces: 4,
      linkScoringIcons: 2,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 1, // engine doubles to 2 when built in the Rail Era
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false,
      hasLightbulbIcon: false,
      incomeAdvancement: 4,
      quantity: 2,
    },
    {
      id: 'brewery_2',
      type: 'brewery',
      level: 2,
      cost: 7,
      victoryPoints: 5,
      incomeSpaces: 5,
      linkScoringIcons: 2,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 1,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 5,
      quantity: 2,
    },
    {
      id: 'brewery_3',
      type: 'brewery',
      level: 3,
      cost: 9,
      victoryPoints: 7,
      incomeSpaces: 5,
      linkScoringIcons: 2,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 1,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 5,
      quantity: 2,
    },
    {
      id: 'brewery_4', // rail era only
      type: 'brewery',
      level: 4,
      cost: 9,
      victoryPoints: 10,
      incomeSpaces: 5,
      linkScoringIcons: 2,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 1,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: false,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
      incomeAdvancement: 5,
      quantity: 1,
    },
  ],
}

// Interface for tiles with quantity tracking
export interface IndustryTileWithQuantity {
  tile: IndustryTile
  quantityAvailable: number
}

// Utility functions for industry tiles
export function getInitialPlayerIndustryTiles(): Record<
  IndustryType,
  IndustryTile[]
> {
  const tiles: Record<IndustryType, IndustryTile[]> = {
    cotton: industryTileDefinitions.cotton
      ? [...industryTileDefinitions.cotton]
      : [],
    coal: industryTileDefinitions.coal ? [...industryTileDefinitions.coal] : [],
    iron: industryTileDefinitions.iron ? [...industryTileDefinitions.iron] : [],
    manufacturer: industryTileDefinitions.manufacturer
      ? [...industryTileDefinitions.manufacturer]
      : [],
    pottery: industryTileDefinitions.pottery
      ? [...industryTileDefinitions.pottery]
      : [],
    brewery: industryTileDefinitions.brewery
      ? [...industryTileDefinitions.brewery]
      : [],
  }
  return tiles
}

// New function that returns tiles with quantities
export function getInitialPlayerIndustryTilesWithQuantities(): Record<
  IndustryType,
  IndustryTileWithQuantity[]
> {
  const tilesWithQuantity: Record<IndustryType, IndustryTileWithQuantity[]> = {
    cotton: [],
    coal: [],
    iron: [],
    manufacturer: [],
    pottery: [],
    brewery: [],
  }

  // Convert each tile definition to include its quantity
  for (const [industryType, tiles] of Object.entries(industryTileDefinitions)) {
    if (tiles) {
      tilesWithQuantity[industryType as IndustryType] = tiles.map((tile) => ({
        tile,
        quantityAvailable: tile.quantity,
      }))
    }
  }

  return tilesWithQuantity
}

export function getLowestLevelTile(tiles: IndustryTile[]): IndustryTile | null {
  if (tiles.length === 0) return null
  return tiles.reduce((lowest, current) =>
    current.level < lowest.level ? current : lowest,
  )
}

// Get lowest level tile considering quantities
export function getLowestAvailableTile(
  tilesWithQuantity: IndustryTileWithQuantity[],
): IndustryTile | null {
  // Filter to only tiles with quantity > 0
  const availableTiles = tilesWithQuantity
    .filter((t) => t.quantityAvailable > 0)
    .map((t) => t.tile)

  if (availableTiles.length === 0) return null

  // Return the lowest level available tile
  return availableTiles.reduce((lowest, current) =>
    current.level < lowest.level ? current : lowest,
  )
}

// Decrement quantity of a specific tile
export function decrementTileQuantity(
  tilesWithQuantity: IndustryTileWithQuantity[],
  tileToDecrement: IndustryTile,
): IndustryTileWithQuantity[] {
  return tilesWithQuantity.map((tileWithQty) => {
    if (tileWithQty.tile.id === tileToDecrement.id) {
      return {
        ...tileWithQty,
        quantityAvailable: Math.max(0, tileWithQty.quantityAvailable - 1),
      }
    }
    return tileWithQty
  })
}

export function canBuildTileInEra(
  tile: IndustryTile,
  era: 'canal' | 'rail',
): boolean {
  return era === 'canal' ? tile.canBuildInCanalEra : tile.canBuildInRailEra
}

export function canDevelopTile(tile: IndustryTile): boolean {
  return !tile.hasLightbulbIcon
}
