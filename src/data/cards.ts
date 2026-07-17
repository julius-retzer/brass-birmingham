import { type CityId, cities } from './board'

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
  belper: {
    type: 'location',
    location: 'belper',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 0,
    fourPlayers: 2,
  },
  derby: {
    type: 'location',
    location: 'derby',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 0,
    fourPlayers: 3,
  },
  // North Staffordshire (Blue)
  leek: {
    type: 'location',
    location: 'leek',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 2,
    fourPlayers: 2,
  },
  stoke: {
    type: 'location',
    location: 'stoke',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 3,
    fourPlayers: 3,
  },
  stone: {
    type: 'location',
    location: 'stone',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 2,
    fourPlayers: 2,
  },
  uttoxeter: {
    type: 'location',
    location: 'uttoxeter',
    color: 'other',
    twoPlayers: 0,
    threePlayers: 1,
    fourPlayers: 2,
  },
  // Staffordshire (Pink)
  stafford: {
    type: 'location',
    location: 'stafford',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  burton: {
    type: 'location',
    location: 'burton',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  cannock: {
    type: 'location',
    location: 'cannock',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  tamworth: {
    type: 'location',
    location: 'tamworth',
    color: 'other',
    twoPlayers: 1,
    threePlayers: 1,
    fourPlayers: 1,
  },
  walsall: {
    type: 'location',
    location: 'walsall',
    color: 'other',
    twoPlayers: 1,
    threePlayers: 1,
    fourPlayers: 1,
  },
  // Black Country (Yellow)
  coalbrookdale: {
    type: 'location',
    location: 'coalbrookdale',
    color: 'other',
    twoPlayers: 3,
    threePlayers: 3,
    fourPlayers: 3,
  },
  dudley: {
    type: 'location',
    location: 'dudley',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  kidderminster: {
    type: 'location',
    location: 'kidderminster',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  wolverhampton: {
    type: 'location',
    location: 'wolverhampton',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  worcester: {
    type: 'location',
    location: 'worcester',
    color: 'other',
    twoPlayers: 2,
    threePlayers: 2,
    fourPlayers: 2,
  },
  // Birmingham Area (Purple)
  birmingham: {
    type: 'location',
    location: 'birmingham',
    color: 'other',
    twoPlayers: 3,
    threePlayers: 3,
    fourPlayers: 3,
  },
  coventry: {
    type: 'location',
    location: 'coventry',
    color: 'other',
    twoPlayers: 3,
    threePlayers: 3,
    fourPlayers: 3,
  },
  nuneaton: {
    type: 'location',
    location: 'nuneaton',
    color: 'other',
    twoPlayers: 1,
    threePlayers: 1,
    fourPlayers: 1,
  },
  redditch: {
    type: 'location',
    location: 'redditch',
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

// Human label for a raw card/slot id — "coventry_1" -> "Coventry",
// "cotton_manufacturer_6" -> "cotton/manufacturer industry",
// "wild_location_2" -> "wild location". A presentation-only fallback so raw
// slot ids can never leak into player-facing text; it reuses the SAME `cities`
// and `industries` sources getCardDescription draws on, so there is one
// canonical id->name mapping. Returns null for anything it doesn't recognise
// (callers keep the raw token verbatim rather than guess).
export function describeCardId(id: string): string | null {
  const wild = /^wild_(location|industry)_\d+$/.exec(id)
  if (wild) return `wild ${wild[1]}`
  const m = /^(.+)_\d+$/.exec(id)
  if (!m) return null
  const slug = m[1]!
  if (slug in cities) return cities[slug as keyof typeof cities].name
  const industry = industries[slug]
  if (industry) return `${industry.industries.join('/')} industry`
  return null
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
