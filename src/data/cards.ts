import { type CityId } from './board'

export type IndustryType =
  | 'cotton'
  | 'coal'
  | 'iron'
  | 'manufacturer'
  | 'pottery'
  | 'brewery'
export type CardType =
  | 'location'
  | 'industry'
  | 'wild_location'
  | 'wild_industry'
export type LocationColor = 'blue' | 'teal' | 'other'

export interface BaseCard {
  id: string
  type: CardType
}

export interface LocationCard extends BaseCard {
  type: 'location'
  location: CityId
  color: LocationColor
}

export interface IndustryCard extends BaseCard {
  type: 'industry'
  industries: IndustryType[]
}

export interface WildLocationCard extends BaseCard {
  type: 'wild_location'
}

export interface WildIndustryCard extends BaseCard {
  type: 'wild_industry'
}

export type Card =
  | LocationCard
  | IndustryCard
  | WildLocationCard
  | WildIndustryCard

interface LocationDefinition {
  type: 'location'
  location: CityId
  color: LocationColor
  twoPlayers: number
  threePlayers: number
  fourPlayers: number
}

interface IndustryDefinition {
  type: 'industry'
  industries: IndustryType[]
  twoPlayers: number
  threePlayers: number
  fourPlayers: number
}

// Base definitions for all cards
const locations: Record<string, LocationDefinition> = {
  // Derbyshire (White)
  tesin: {
    type: 'location',
    location: 'tesin',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 0,
    fourPlayers: 2,
  },
  bielsko: {
    type: 'location',
    location: 'bielsko',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 0,
    fourPlayers: 3,
  },
  // North Staffordshire (Blue)
  liberec: {
    type: 'location',
    location: 'liberec',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 2,
    fourPlayers: 2,
  },
  teplice: {
    type: 'location',
    location: 'teplice',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 3,
    fourPlayers: 3,
  },
  pardubice: {
    type: 'location',
    location: 'pardubice',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 2,
    fourPlayers: 2,
  },
  sumperk: {
    type: 'location',
    location: 'sumperk',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 1,
    fourPlayers: 2,
  },
  // Staffordshire (Pink)
  jihlava: {
    type: 'location',
    location: 'jihlava',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  prerov: {
    type: 'location',
    location: 'prerov',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  rosice: {
    type: 'location',
    location: 'rosice',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  prostejov: {
    type: 'location',
    location: 'prostejov',
    color: 'other',
    twoPlayers: 1,
    threePlayers: 1,
    fourPlayers: 1,
  },
  blansko: {
    type: 'location',
    location: 'blansko',
    color: 'other',
    twoPlayers: 1,
    threePlayers: 1,
    fourPlayers: 1,
  },
  // Black Country (Yellow)
  ostrava: {
    type: 'location',
    location: 'ostrava',
    color: 'other',
    twoPlayers: 3,
    threePlayers: 3,
    fourPlayers: 3,
  },
  karvina: {
    type: 'location',
    location: 'karvina',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  frydekmistek: {
    type: 'location',
    location: 'frydekmistek',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  novyjicin: {
    type: 'location',
    location: 'novyjicin',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  zilina: {
    type: 'location',
    location: 'zilina',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  // Birmingham Area (Purple)
  brno: {
    type: 'location',
    location: 'brno',
    color: 'other',
    twoPlayers: 3,
    threePlayers: 3,
    fourPlayers: 3,
  },
  znojmo: {
    type: 'location',
    location: 'znojmo',
    color: 'other',
    twoPlayers: 3,
    threePlayers: 3,
    fourPlayers: 3,
  },
  olomouc: {
    type: 'location',
    location: 'olomouc',
    color: 'other',
    twoPlayers: 1,
    threePlayers: 1,
    fourPlayers: 1,
  },
  bratislava: {
    type: 'location',
    location: 'bratislava',
    color: 'other',
    twoPlayers: 1,
    threePlayers: 1,
    fourPlayers: 1,
  },
}

const industries: Record<string, IndustryDefinition> = {
  iron: {
    type: 'industry',
    industries: ['iron'],
    twoPlayers: 4,
    threePlayers: 4,
    fourPlayers: 4,
  },
  coal: {
    type: 'industry',
    industries: ['coal'],
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 3,
  },
  // The physical game has combined "Cotton Mill / Manufacturer" cards;
  // none are in the 2-player deck
  cotton_manufacturer: {
    type: 'industry',
    industries: ['cotton', 'manufacturer'],
    twoPlayers: 0,
    threePlayers: 6,
    fourPlayers: 8,
  },
  pottery: {
    type: 'industry',
    industries: ['pottery'],
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 3,
  },
  brewery: {
    type: 'industry',
    industries: ['brewery'],
    twoPlayers: 5,
    threePlayers: 5,
    fourPlayers: 5,
  },
}

// Function to create cards based on player count
export interface CardDecks {
  regularCards: Card[]
  wildLocationCards: WildLocationCard[]
  wildIndustryCards: WildIndustryCard[]
}

export function getInitialCards(playerCount: number): CardDecks {
  const regularCards: Card[] = []
  const wildLocationCards: WildLocationCard[] = []
  const wildIndustryCards: WildIndustryCard[] = []

  // Create location cards
  Object.entries(locations).forEach(([name, data]) => {
    const count =
      playerCount === 2
        ? data.twoPlayers
        : playerCount === 3
          ? data.threePlayers
          : data.fourPlayers

    for (let i = 0; i < count; i++) {
      regularCards.push({
        id: `${name}_${i + 1}`,
        type: data.type,
        location: data.location,
        color: data.color,
      })
    }
  })

  // Create industry cards
  Object.entries(industries).forEach(([name, data]) => {
    const count =
      playerCount === 2
        ? data.twoPlayers
        : playerCount === 3
          ? data.threePlayers
          : data.fourPlayers

    for (let i = 0; i < count; i++) {
      regularCards.push({
        id: `${name}_${i + 1}`,
        type: data.type,
        industries: data.industries,
      })
    }
  })

  // Create wild cards (2 of each type)
  for (let i = 0; i < 2; i++) {
    wildLocationCards.push({
      id: `wild_location_${i + 1}`,
      type: 'wild_location',
    })
    wildIndustryCards.push({
      id: `wild_industry_${i + 1}`,
      type: 'wild_industry',
    })
  }

  return {
    regularCards,
    wildLocationCards,
    wildIndustryCards,
  }
}
