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
}

// Industry tile definitions based on the rules
export const industryTileDefinitions: Record<string, IndustryTile[]> = {
  cotton: [
    {
      id: 'cotton_1',
      type: 'cotton',
      level: 1,
      cost: 12,
      victoryPoints: 3,
      incomeSpaces: 2,
      linkScoringIcons: 1, // Cotton provides 1 link scoring icon
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false, // Level 1 removed at end of Canal Era
      hasLightbulbIcon: false,
    },
    {
      id: 'cotton_2',
      type: 'cotton',
      level: 2,
      cost: 16,
      victoryPoints: 5,
      incomeSpaces: 3,
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
    },
    {
      id: 'cotton_3',
      type: 'cotton',
      level: 3,
      cost: 20,
      victoryPoints: 9,
      incomeSpaces: 4,
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
    },
    {
      id: 'cotton_4',
      type: 'cotton',
      level: 4,
      cost: 24,
      victoryPoints: 12,
      incomeSpaces: 5,
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
    },
  ],
  coal: [
    {
      id: 'coal_1',
      type: 'coal',
      level: 1,
      cost: 5,
      victoryPoints: 1,
      incomeSpaces: 1,
      linkScoringIcons: 0,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 2, // Produces 2 coal when built
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false, // Level 1 removed at end of Canal Era
      hasLightbulbIcon: false,
    },
    {
      id: 'coal_2',
      type: 'coal',
      level: 2,
      cost: 7,
      victoryPoints: 2,
      incomeSpaces: 1,
      linkScoringIcons: 0,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 3, // Produces 3 coal when built
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
    {
      id: 'coal_3',
      type: 'coal',
      level: 3,
      cost: 10,
      victoryPoints: 3,
      incomeSpaces: 2,
      linkScoringIcons: 0,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 4, // Produces 4 coal when built
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
    {
      id: 'coal_4',
      type: 'coal',
      level: 4,
      cost: 13,
      victoryPoints: 4,
      incomeSpaces: 2,
      linkScoringIcons: 0,
      coalRequired: 0,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 5, // Produces 5 coal when built
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
  ],
  iron: [
    {
      id: 'iron_1',
      type: 'iron',
      level: 1,
      cost: 5,
      victoryPoints: 1,
      incomeSpaces: 1,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 4, // Produces 4 iron when built
      canBuildInCanalEra: true,
      canBuildInRailEra: false, // Level 1 removed at end of Canal Era
      hasLightbulbIcon: false,
    },
    {
      id: 'iron_2',
      type: 'iron',
      level: 2,
      cost: 7,
      victoryPoints: 2,
      incomeSpaces: 1,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 5, // Produces 5 iron when built
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
    {
      id: 'iron_3',
      type: 'iron',
      level: 3,
      cost: 9,
      victoryPoints: 3,
      incomeSpaces: 2,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 6, // Produces 6 iron when built
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
    {
      id: 'iron_4',
      type: 'iron',
      level: 4,
      cost: 12,
      victoryPoints: 5,
      incomeSpaces: 3,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 7, // Produces 7 iron when built
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
  ],
  manufacturer: [
    {
      id: 'manufacturer_1',
      type: 'manufacturer',
      level: 1,
      cost: 8,
      victoryPoints: 1,
      incomeSpaces: 1,
      linkScoringIcons: 1,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 1,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false, // Level 1 removed at end of Canal Era
      hasLightbulbIcon: false,
    },
    {
      id: 'manufacturer_2',
      type: 'manufacturer',
      level: 2,
      cost: 10,
      victoryPoints: 2,
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
    },
    {
      id: 'manufacturer_3',
      type: 'manufacturer',
      level: 3,
      cost: 12,
      victoryPoints: 3,
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
    },
    {
      id: 'manufacturer_4',
      type: 'manufacturer',
      level: 4,
      cost: 16,
      victoryPoints: 6,
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
    },
  ],
  pottery: [
    {
      id: 'pottery_1',
      type: 'pottery',
      level: 1,
      cost: 5,
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
      canBuildInRailEra: true, // Special: Level 1 pottery can be built in Rail Era
      hasLightbulbIcon: true, // Cannot be developed
    },
    {
      id: 'pottery_2',
      type: 'pottery',
      level: 2,
      cost: 7,
      victoryPoints: 2,
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
    },
    {
      id: 'pottery_3',
      type: 'pottery',
      level: 3,
      cost: 10,
      victoryPoints: 5,
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
    },
    {
      id: 'pottery_4',
      type: 'pottery',
      level: 4,
      cost: 12,
      victoryPoints: 8,
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
    },
  ],
  brewery: [
    {
      id: 'brewery_1',
      type: 'brewery',
      level: 1,
      cost: 5,
      victoryPoints: 1,
      incomeSpaces: 1,
      linkScoringIcons: 0,
      coalRequired: 0,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 1, // 1 beer in Canal Era, 2 in Rail Era
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: false, // Level 1 removed at end of Canal Era
      hasLightbulbIcon: false,
    },
    {
      id: 'brewery_2',
      type: 'brewery',
      level: 2,
      cost: 7,
      victoryPoints: 2,
      incomeSpaces: 1,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 1, // 1 beer in Canal Era, 2 in Rail Era
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
    {
      id: 'brewery_3',
      type: 'brewery',
      level: 3,
      cost: 9,
      victoryPoints: 3,
      incomeSpaces: 2,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 1, // 1 beer in Canal Era, 2 in Rail Era
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
    {
      id: 'brewery_4',
      type: 'brewery',
      level: 4,
      cost: 12,
      victoryPoints: 5,
      incomeSpaces: 3,
      linkScoringIcons: 0,
      coalRequired: 1,
      ironRequired: 1,
      beerRequired: 0,
      beerProduced: 1, // 1 beer in Canal Era, 2 in Rail Era
      coalProduced: 0,
      ironProduced: 0,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      hasLightbulbIcon: false,
    },
  ],
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

export function getLowestLevelTile(tiles: IndustryTile[]): IndustryTile | null {
  if (tiles.length === 0) return null
  return tiles.reduce((lowest, current) =>
    current.level < lowest.level ? current : lowest,
  )
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
