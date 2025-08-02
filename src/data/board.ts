// Cities in Brass Birmingham
export const cities = {
  // Cities
  birmingham: { name: 'Birmingham', type: 'city' },
  coventry: { name: 'Coventry', type: 'city' },
  dudley: { name: 'Dudley', type: 'city' },
  wolverhampton: { name: 'Wolverhampton', type: 'city' },
  walsall: { name: 'Walsall', type: 'city' },
  redditch: { name: 'Redditch', type: 'city' },
  worcester: { name: 'Worcester', type: 'city' },
  kidderminster: { name: 'Kidderminster', type: 'city' },
  cannock: { name: 'Cannock', type: 'city' },
  tamworth: { name: 'Tamworth', type: 'city' },
  nuneaton: { name: 'Nuneaton', type: 'city' },
  coalbrookdale: { name: 'Coalbrookdale', type: 'city' },
  stone: { name: 'Stone', type: 'city' },
  stafford: { name: 'Stafford', type: 'city' },
  stoke: { name: 'Stoke-on-Trent', type: 'city' },
  leek: { name: 'Leek', type: 'city' },
  uttoxeter: { name: 'Uttoxeter', type: 'city' },
  burton: { name: 'Burton upon Trent', type: 'city' },
  derby: { name: 'Derby', type: 'city' },
  belper: { name: 'Belper', type: 'city' },

  // External Markets (Merchants)
  warrington: { name: 'Warrington', type: 'merchant' },
  gloucester: { name: 'Gloucester', type: 'merchant' },
  oxford: { name: 'Oxford', type: 'merchant' },
  nottingham: { name: 'Nottingham', type: 'merchant' },
  shrewsbury: { name: 'Shrewsbury', type: 'merchant' },
} as const

// Connections between cities
// Each connection can be either 'canal' (Canal Era) or 'rail' (Rail Era) or both
export const connections = [
  // Birmingham Area
  { from: 'birmingham', to: 'redditch', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'dudley', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'walsall', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'tamworth', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'coventry', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'worcester', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'nuneaton', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'oxford', types: ['canal', 'rail'] },
  { from: 'dudley', to: 'wolverhampton', types: ['canal', 'rail'] },
  { from: 'dudley', to: 'kidderminster', types: ['canal', 'rail'] },
  { from: 'wolverhampton', to: 'walsall', types: ['canal', 'rail'] },
  { from: 'wolverhampton', to: 'cannock', types: ['canal', 'rail'] },
  { from: 'wolverhampton', to: 'dudley', types: ['canal', 'rail'] },
  { from: 'wolverhampton', to: 'coalbrookdale', types: ['canal', 'rail'] },

  // Northern Area
  { from: 'stone', to: 'stoke', types: ['canal', 'rail'] },
  { from: 'stoke', to: 'leek', types: ['canal', 'rail'] },
  { from: 'stone', to: 'stafford', types: ['canal', 'rail'] },
  { from: 'stafford', to: 'cannock', types: ['canal', 'rail'] },
  { from: 'uttoxeter', to: 'stoke', types: ['rail'] },
  { from: 'uttoxeter', to: 'derby', types: ['rail'] },
  { from: 'burton', to: 'derby', types: ['canal', 'rail'] },
  { from: 'burton', to: 'stone', types: ['canal', 'rail'] },
  { from: 'burton', to: 'cannock', types: ['canal', 'rail'] },
  { from: 'derby', to: 'belper', types: ['canal', 'rail'] },

  // Eastern Area
  { from: 'tamworth', to: 'burton', types: ['canal', 'rail'] },
  { from: 'tamworth', to: 'nuneaton', types: ['rail'] },
  { from: 'coventry', to: 'nuneaton', types: ['canal', 'rail'] },
  { from: 'walsall', to: 'tamworth', types: ['canal', 'rail'] },
  { from: 'walsall', to: 'cannock', types: ['canal', 'rail'] },
  { from: 'walsall', to: 'burton', types: ['canal', 'rail'] },

  // Southern Area
  { from: 'redditch', to: 'worcester', types: ['rail'] },
  { from: 'worcester', to: 'kidderminster', types: ['canal', 'rail'] },
  { from: 'kidderminster', to: 'dudley', types: ['canal', 'rail'] },
  { from: 'kidderminster', to: 'coalbrookdale', types: ['canal', 'rail'] },

  // Merchant Connections
  { from: 'coalbrookdale', to: 'shrewsbury', types: ['canal', 'rail'] },
  { from: 'stoke', to: 'warrington', types: ['canal', 'rail'] },
  { from: 'worcester', to: 'gloucester', types: ['canal', 'rail'] },
  { from: 'coventry', to: 'oxford', types: ['canal', 'rail'] },
  { from: 'belper', to: 'nottingham', types: ['rail'] },
  { from: 'gloucester', to: 'redditch', types: ['canal', 'rail'] },
  { from: 'gloucester', to: 'oxford', types: ['canal', 'rail'] },
  { from: 'redditch', to: 'oxford', types: ['canal', 'rail'] },
] as const

// Types for type safety
export type CityId = keyof typeof cities
export type CityType = 'city' | 'merchant'
export type ConnectionType = 'canal' | 'rail'

export interface City {
  name: string
  type: CityType
}

export interface Connection {
  from: CityId
  to: CityId
  types: ConnectionType[]
}

// Industry slots available in each city
// Each city has specific slots, and each slot can accept multiple industry types
// Based on the official Brass Birmingham board layout
export const cityIndustrySlots: Record<CityId, string[][]> = {
  // Central Industrial Cities
  birmingham: [
    ['cotton', 'iron'], // Slot 1: Cotton or Iron
    ['manufacturer', 'pottery'], // Slot 2: Manufacturer or Pottery
    ['brewery'], // Slot 3: Brewery only
    ['cotton', 'manufacturer'], // Slot 4: Cotton or Manufacturer
  ],
  coventry: [
    ['cotton', 'manufacturer'], // Slot 1: Cotton or Manufacturer
    ['pottery'], // Slot 2: Pottery only
  ],
  dudley: [
    ['coal'], // Slot 1: Coal only
    ['iron'], // Slot 2: Iron only
    ['brewery'], // Slot 3: Brewery only
  ],
  wolverhampton: [
    ['coal'], // Slot 1: Coal only
    ['iron'], // Slot 2: Iron only
    ['manufacturer'], // Slot 3: Manufacturer only
  ],
  walsall: [
    ['coal'], // Slot 1: Coal only
    ['iron'], // Slot 2: Iron only
  ],

  // Northern Industrial Cities
  stone: [
    ['coal'], // Slot 1: Coal only
    ['pottery', 'brewery'], // Slot 2: Pottery or Brewery
  ],
  stafford: [
    ['coal'], // Slot 1: Coal only
    ['pottery'], // Slot 2: Pottery only
  ],
  stoke: [
    ['coal'], // Slot 1: Coal only
    ['pottery'], // Slot 2: Pottery only
    ['brewery'], // Slot 3: Brewery only
  ],
  leek: [
    ['cotton', 'manufacturer'], // Slot 1: Cotton or Manufacturer
  ],
  uttoxeter: [
    ['brewery'], // Slot 1: Brewery only
  ],
  burton: [
    ['brewery'], // Slot 1: Brewery only
    ['brewery'], // Slot 2: Brewery only (Burton has 2 brewery slots)
  ],
  derby: [
    ['cotton', 'manufacturer'], // Slot 1: Cotton or Manufacturer
    ['iron'], // Slot 2: Iron only
  ],
  belper: [
    ['cotton', 'manufacturer'], // Slot 1: Cotton or Manufacturer
  ],

  // Southern Cities
  redditch: [
    ['cotton', 'manufacturer'], // Slot 1: Cotton or Manufacturer
  ],
  worcester: [
    ['cotton'], // Slot 1: Cotton only
    ['pottery'], // Slot 2: Pottery only
  ],
  kidderminster: [
    ['cotton'], // Slot 1: Cotton only
    ['pottery'], // Slot 2: Pottery only
  ],
  cannock: [
    ['coal'], // Slot 1: Coal only
  ],
  tamworth: [
    ['coal'], // Slot 1: Coal only
    ['iron'], // Slot 2: Iron only
  ],
  nuneaton: [
    ['cotton', 'manufacturer'], // Slot 1: Cotton or Manufacturer
  ],
  coalbrookdale: [
    ['coal'], // Slot 1: Coal only
    ['iron'], // Slot 2: Iron only
  ],

  // Merchants (no industries can be built)
  warrington: [],
  gloucester: [],
  oxford: [],
  nottingham: [],
  shrewsbury: [],
} as const
