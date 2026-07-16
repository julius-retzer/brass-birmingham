import { type CityId } from './board'
import { type IndustryType } from './cards'

export interface MerchantBonus {
  type: 'develop' | 'income' | 'victoryPoints' | 'money'
  value: number
  description: string
}

export interface Merchant {
  id: CityId
  name: string
  industries: IndustryType[] // Which industries can be sold here
  bonus: MerchantBonus
  victoryPointsGranted?: number // For Lemberg and Krakow
}

export const merchants: Record<string, Merchant> = {
  prague: {
    id: 'prague',
    name: 'Prague',
    industries: ['cotton', 'manufacturer', 'pottery'], // Markets can accept multiple industries
    bonus: {
      type: 'money',
      value: 5,
      description: 'Receive £5 from the Bank',
    },
  },
  budapest: {
    id: 'budapest',
    name: 'Budapest',
    industries: ['cotton', 'manufacturer', 'pottery'],
    bonus: {
      type: 'develop',
      value: 1,
      description: 'Remove 1 lowest level tile from Player Mat (no iron cost)',
    },
  },
  vienna: {
    id: 'vienna',
    name: 'Vienna',
    industries: ['cotton', 'manufacturer', 'pottery'],
    bonus: {
      type: 'income',
      value: 2,
      description: 'Advance Income Marker 2 spaces',
    },
  },
  lemberg: {
    id: 'lemberg',
    name: 'Lemberg',
    industries: ['cotton', 'manufacturer', 'pottery'],
    bonus: {
      type: 'victoryPoints',
      value: 2, // This could vary by player count
      description: 'Advance VP Marker by indicated spaces',
    },
    victoryPointsGranted: 2,
  },
  krakow: {
    id: 'krakow',
    name: 'Krakow',
    industries: ['cotton', 'manufacturer', 'pottery'],
    bonus: {
      type: 'victoryPoints',
      value: 2, // This could vary by player count
      description: 'Advance VP Marker by indicated spaces',
    },
    victoryPointsGranted: 2,
  },
}

export type MerchantId = keyof typeof merchants
