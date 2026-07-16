// Cities on the Austria-Hungary board (a strict 1:1 reskin of Brass:
// Birmingham — same graph, same slots, same card counts; only the names
// move to the monarchy). The original English counterpart is noted per
// entry. See ai-docs / the design report for the full mapping.
export const cities = {
  // Cities (id => original counterpart)
  brno: { name: 'Brno', type: 'city' }, // Birmingham (the hub)
  znojmo: { name: 'Znojmo', type: 'city' }, // Coventry
  karvina: { name: 'Karviná', type: 'city' }, // Dudley
  novyjicin: { name: 'Nový Jičín', type: 'city' }, // Wolverhampton
  blansko: { name: 'Blansko', type: 'city' }, // Walsall
  bratislava: { name: 'Bratislava', type: 'city' }, // Redditch
  zilina: { name: 'Žilina', type: 'city' }, // Worcester
  frydekmistek: { name: 'Frýdek-Místek', type: 'city' }, // Kidderminster
  rosice: { name: 'Rosice', type: 'city' }, // Cannock
  prostejov: { name: 'Prostějov', type: 'city' }, // Tamworth
  olomouc: { name: 'Olomouc', type: 'city' }, // Nuneaton
  ostrava: { name: 'Ostrava', type: 'city' }, // Coalbrookdale
  pardubice: { name: 'Pardubice', type: 'city' }, // Stone
  jihlava: { name: 'Jihlava', type: 'city' }, // Stafford
  teplice: { name: 'Teplice', type: 'city' }, // Stoke-on-Trent
  liberec: { name: 'Liberec', type: 'city' }, // Leek
  sumperk: { name: 'Šumperk', type: 'city' }, // Uttoxeter
  prerov: { name: 'Přerov', type: 'city' }, // Burton upon Trent
  bielsko: { name: 'Bielsko-Biała', type: 'city' }, // Derby
  tesin: { name: 'Těšín', type: 'city' }, // Belper

  // Farm Breweries — the two brewery-only locations (rules p.5). Modelled as
  // Moravian/Slovak manor breweries. Not reachable by location/wild-location
  // cards; brewery-industry and wild-industry cards only.
  farmBrewery1: { name: 'Černá Hora', type: 'city' }, // off Rosice (own link)
  farmBrewery2: { name: 'Bytča', type: 'city' }, // on the Frýdek-Místek–Žilina link

  // External Markets (Merchants) (id => original counterpart)
  prague: { name: 'Prague', type: 'merchant' }, // Warrington
  budapest: { name: 'Budapest', type: 'merchant' }, // Gloucester
  vienna: { name: 'Vienna', type: 'merchant' }, // Oxford
  lemberg: { name: 'Lemberg', type: 'merchant' }, // Nottingham
  krakow: { name: 'Krakow', type: 'merchant' }, // Shrewsbury
} as const

// Connections between cities
// Each connection can be either 'canal' (Canal Era) or 'rail' (Rail Era) or both
// Verified against the physical board layout
export const connections = [
  // Silesia-Galicia
  { from: 'tesin', to: 'bielsko', types: ['canal', 'rail'] },
  { from: 'tesin', to: 'liberec', types: ['rail'] },
  { from: 'bielsko', to: 'lemberg', types: ['canal', 'rail'] },
  { from: 'bielsko', to: 'sumperk', types: ['rail'] },
  { from: 'bielsko', to: 'prerov', types: ['canal', 'rail'] },

  // North / East Bohemia
  { from: 'liberec', to: 'teplice', types: ['canal', 'rail'] },
  { from: 'teplice', to: 'pardubice', types: ['canal', 'rail'] },
  { from: 'teplice', to: 'prague', types: ['canal', 'rail'] },
  { from: 'pardubice', to: 'jihlava', types: ['canal', 'rail'] },
  { from: 'pardubice', to: 'sumperk', types: ['rail'] },
  { from: 'pardubice', to: 'prerov', types: ['canal', 'rail'] },

  // Central Moravia / Haná
  { from: 'jihlava', to: 'rosice', types: ['canal', 'rail'] },
  { from: 'prerov', to: 'rosice', types: ['rail'] },
  { from: 'prerov', to: 'prostejov', types: ['canal', 'rail'] },
  { from: 'prerov', to: 'blansko', types: ['canal'] },
  { from: 'rosice', to: 'blansko', types: ['canal', 'rail'] },
  // "A Link tile is required to connect Rosice (Cannock) to the Farm Brewery to its
  // left" (rules p.5). The southern Farm Brewery has NO connection of its
  // own: the frydekmistek-zilina (Kidderminster-Worcester) link also connects it (see
  // linkConnectedLocations below) and a second tile may not be placed.
  { from: 'rosice', to: 'farmBrewery1', types: ['canal', 'rail'] },
  { from: 'rosice', to: 'novyjicin', types: ['canal', 'rail'] },
  { from: 'prostejov', to: 'blansko', types: ['rail'] },
  { from: 'prostejov', to: 'olomouc', types: ['canal', 'rail'] },
  { from: 'blansko', to: 'novyjicin', types: ['canal', 'rail'] },

  // Ostrava basin (Austrian Silesia)
  { from: 'novyjicin', to: 'ostrava', types: ['canal', 'rail'] },
  { from: 'novyjicin', to: 'karvina', types: ['canal', 'rail'] },
  { from: 'ostrava', to: 'frydekmistek', types: ['canal', 'rail'] },
  { from: 'ostrava', to: 'krakow', types: ['canal', 'rail'] },
  { from: 'karvina', to: 'frydekmistek', types: ['canal', 'rail'] },
  { from: 'frydekmistek', to: 'zilina', types: ['canal', 'rail'] },
  { from: 'zilina', to: 'budapest', types: ['canal', 'rail'] },

  // Brno cluster + Danube corridor
  { from: 'brno', to: 'znojmo', types: ['canal', 'rail'] },
  { from: 'brno', to: 'karvina', types: ['canal', 'rail'] },
  { from: 'brno', to: 'olomouc', types: ['rail'] },
  { from: 'brno', to: 'vienna', types: ['canal', 'rail'] },
  { from: 'brno', to: 'bratislava', types: ['rail'] },
  { from: 'brno', to: 'prostejov', types: ['canal', 'rail'] },
  { from: 'brno', to: 'blansko', types: ['canal', 'rail'] },
  { from: 'brno', to: 'zilina', types: ['canal', 'rail'] },
  { from: 'znojmo', to: 'olomouc', types: ['rail'] },
  { from: 'bratislava', to: 'budapest', types: ['canal', 'rail'] },
  { from: 'bratislava', to: 'vienna', types: ['canal', 'rail'] },
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
// Based on the official Brass: Birmingham board layout (1:1 reskin)
// Verified against the physical board layout
export const cityIndustrySlots: Record<CityId, string[][]> = {
  // Brno cluster + Danube corridor
  brno: [
    ['cotton', 'manufacturer'],
    ['manufacturer'],
    ['iron'],
    ['manufacturer'],
  ],
  znojmo: [['pottery'], ['manufacturer', 'coal'], ['iron', 'manufacturer']],
  olomouc: [
    ['manufacturer', 'brewery'],
    ['cotton', 'coal'],
  ],
  bratislava: [['manufacturer', 'coal'], ['iron']],

  // Ostrava basin (Austrian Silesia)
  novyjicin: [['manufacturer'], ['manufacturer', 'coal']],
  ostrava: [['iron', 'brewery'], ['iron'], ['coal']],
  karvina: [['coal'], ['iron']],
  frydekmistek: [['cotton', 'coal'], ['cotton']],
  zilina: [['cotton'], ['cotton']],

  // Central Moravia / Haná
  jihlava: [['manufacturer', 'brewery'], ['pottery']],
  prerov: [['manufacturer', 'coal'], ['brewery']],
  rosice: [['manufacturer', 'coal'], ['coal']],
  prostejov: [
    ['cotton', 'coal'],
    ['cotton', 'coal'],
  ],
  blansko: [
    ['iron', 'manufacturer'],
    ['manufacturer', 'brewery'],
  ],

  // North / East Bohemia
  liberec: [
    ['cotton', 'manufacturer'],
    ['cotton', 'coal'],
  ],
  teplice: [['cotton', 'manufacturer'], ['pottery', 'iron'], ['manufacturer']],
  pardubice: [
    ['cotton', 'brewery'],
    ['manufacturer', 'coal'],
  ],
  sumperk: [
    ['manufacturer', 'brewery'],
    ['cotton', 'brewery'],
  ],

  // Silesia-Galicia
  tesin: [['cotton', 'manufacturer'], ['coal'], ['pottery']],
  bielsko: [['cotton', 'brewery'], ['cotton', 'manufacturer'], ['iron']],

  // Farm Breweries: exactly one brewery slot each
  farmBrewery1: [['brewery']],
  farmBrewery2: [['brewery']],

  // Merchants (no industries can be built)
  prague: [],
  budapest: [],
  vienna: [],
  lemberg: [],
  krakow: [],
} as const

// The two unnamed Farm Brewery locations (brewery-only, industry-card-only)
export const FARM_BREWERIES: ReadonlySet<CityId> = new Set([
  'farmBrewery1',
  'farmBrewery2',
])

// Locations a built link connects. Almost always its two endpoints — but
// the frydekmistek-zilina tile ALSO connects the southern Farm Brewery
// (rules p.5: "A Link tile placed between Kidderminster and Worcester also
// connects both locations to the Farm Brewery to their left").
export function linkConnectedLocations(from: CityId, to: CityId): CityId[] {
  if (
    (from === 'frydekmistek' && to === 'zilina') ||
    (from === 'zilina' && to === 'frydekmistek')
  ) {
    return [from, to, 'farmBrewery2']
  }
  return [from, to]
}
