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
// Verified against the physical board layout
export const connections = [
  // Derbyshire
  { from: 'belper', to: 'derby', types: ['canal', 'rail'] },
  { from: 'belper', to: 'leek', types: ['rail'] },
  { from: 'derby', to: 'nottingham', types: ['canal', 'rail'] },
  { from: 'derby', to: 'uttoxeter', types: ['rail'] },
  { from: 'derby', to: 'burton', types: ['canal', 'rail'] },

  // North Staffordshire
  { from: 'leek', to: 'stoke', types: ['canal', 'rail'] },
  { from: 'stoke', to: 'stone', types: ['canal', 'rail'] },
  { from: 'stoke', to: 'warrington', types: ['canal', 'rail'] },
  { from: 'stone', to: 'stafford', types: ['canal', 'rail'] },
  { from: 'stone', to: 'uttoxeter', types: ['rail'] },
  { from: 'stone', to: 'burton', types: ['canal', 'rail'] },

  // Staffordshire / Midlands
  { from: 'stafford', to: 'cannock', types: ['canal', 'rail'] },
  { from: 'burton', to: 'cannock', types: ['rail'] },
  { from: 'burton', to: 'tamworth', types: ['canal', 'rail'] },
  { from: 'burton', to: 'walsall', types: ['canal'] },
  { from: 'cannock', to: 'walsall', types: ['canal', 'rail'] },
  { from: 'cannock', to: 'wolverhampton', types: ['canal', 'rail'] },
  { from: 'tamworth', to: 'walsall', types: ['rail'] },
  { from: 'tamworth', to: 'nuneaton', types: ['canal', 'rail'] },
  { from: 'walsall', to: 'wolverhampton', types: ['canal', 'rail'] },

  // Black Country
  { from: 'wolverhampton', to: 'coalbrookdale', types: ['canal', 'rail'] },
  { from: 'wolverhampton', to: 'dudley', types: ['canal', 'rail'] },
  { from: 'coalbrookdale', to: 'kidderminster', types: ['canal', 'rail'] },
  { from: 'coalbrookdale', to: 'shrewsbury', types: ['canal', 'rail'] },
  { from: 'dudley', to: 'kidderminster', types: ['canal', 'rail'] },
  { from: 'kidderminster', to: 'worcester', types: ['canal', 'rail'] },
  { from: 'worcester', to: 'gloucester', types: ['canal', 'rail'] },

  // Birmingham Area
  { from: 'birmingham', to: 'coventry', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'dudley', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'nuneaton', types: ['rail'] },
  { from: 'birmingham', to: 'oxford', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'redditch', types: ['rail'] },
  { from: 'birmingham', to: 'tamworth', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'walsall', types: ['canal', 'rail'] },
  { from: 'birmingham', to: 'worcester', types: ['canal', 'rail'] },
  { from: 'coventry', to: 'nuneaton', types: ['rail'] },
  { from: 'redditch', to: 'gloucester', types: ['canal', 'rail'] },
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
// Verified against the physical board layout
export const cityIndustrySlots: Record<CityId, string[][]> = {
  // Birmingham Area
  birmingham: [
    ['cotton', 'manufacturer'],
    ['manufacturer'],
    ['iron'],
    ['manufacturer'],
  ],
  coventry: [['pottery'], ['manufacturer', 'coal'], ['iron', 'manufacturer']],
  nuneaton: [
    ['manufacturer', 'brewery'],
    ['cotton', 'coal'],
  ],
  redditch: [['manufacturer', 'coal'], ['iron']],

  // Black Country
  wolverhampton: [['manufacturer'], ['manufacturer', 'coal']],
  coalbrookdale: [['iron', 'brewery'], ['iron'], ['coal']],
  dudley: [['coal'], ['iron']],
  kidderminster: [['cotton', 'coal'], ['cotton']],
  worcester: [['cotton'], ['cotton']],

  // Staffordshire / Midlands
  stafford: [['manufacturer', 'brewery'], ['pottery']],
  burton: [['manufacturer', 'coal'], ['brewery']],
  cannock: [['manufacturer', 'coal'], ['coal']],
  tamworth: [
    ['cotton', 'coal'],
    ['cotton', 'coal'],
  ],
  walsall: [
    ['iron', 'manufacturer'],
    ['manufacturer', 'brewery'],
  ],

  // North Staffordshire
  leek: [
    ['cotton', 'manufacturer'],
    ['cotton', 'coal'],
  ],
  stoke: [['cotton', 'manufacturer'], ['pottery', 'iron'], ['manufacturer']],
  stone: [
    ['cotton', 'brewery'],
    ['manufacturer', 'coal'],
  ],
  uttoxeter: [
    ['manufacturer', 'brewery'],
    ['cotton', 'brewery'],
  ],

  // Derbyshire
  belper: [['cotton', 'manufacturer'], ['coal'], ['pottery']],
  derby: [['cotton', 'brewery'], ['cotton', 'manufacturer'], ['iron']],

  // Merchants (no industries can be built)
  warrington: [],
  gloucester: [],
  oxford: [],
  nottingham: [],
  shrewsbury: [],
} as const
