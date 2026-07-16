// Hand-tuned survey-map geometry for the Austria-Hungary board.
// Coordinates live in a 1600x1150 viewBox, laid out to match the schematic
// AH layout (Prague/Krakow in the north, Vienna/Budapest in the south,
// the Ostrava basin north-east, Brno the central hub) while giving every
// city plate breathing room. Geometry is deliberately schematic — the graph
// (board.ts connections) is what is exact.
import type { CityId } from '~/data/board'

export const VIEW_W = 1600
export const VIEW_H = 1150

export const cityPos: Record<CityId, { x: number; y: number }> = {
  // North — external markets
  prague: { x: 479, y: 127 },
  krakow: { x: 955, y: 127 },
  lemberg: { x: 1272, y: 201 },

  // North / East Bohemia
  teplice: { x: 363, y: 246 },
  liberec: { x: 546, y: 234 },
  pardubice: { x: 461, y: 392 },
  sumperk: { x: 668, y: 392 },

  // Ostrava basin (Austrian Silesia) + Galicia edge
  ostrava: { x: 961, y: 307 },
  karvina: { x: 1059, y: 295 },
  frydekmistek: { x: 1010, y: 417 },
  tesin: { x: 1132, y: 392 },
  bielsko: { x: 1229, y: 343 },

  // Central Moravia / Haná
  jihlava: { x: 388, y: 551 },
  olomouc: { x: 766, y: 539 },
  prerov: { x: 766, y: 648 },
  prostejov: { x: 693, y: 593 },
  blansko: { x: 583, y: 673 },
  rosice: { x: 424, y: 709 },
  novyjicin: { x: 863, y: 563 },
  zilina: { x: 1059, y: 575 },

  // Farm breweries — manor breweries "to the left" of their cities
  farmBrewery1: { x: 495, y: 689 }, // Černá Hora, off Rosice
  farmBrewery2: { x: 1038, y: 498 }, // Bytča, on the Frýdek-Místek–Žilina link

  // South — Brno hub + Danube corridor
  brno: { x: 607, y: 819 },
  znojmo: { x: 473, y: 953 },
  bratislava: { x: 815, y: 978 },
  vienna: { x: 577, y: 1039 },
  budapest: { x: 1028, y: 1063 },
}

// Perpendicular bow (px) applied to a connection's midpoint so long routes
// arc gracefully around city plates instead of slicing through them.
// Key is `${from}|${to}` in the order the connection appears in board data.
export const routeBow: Record<string, number> = {
  'tesin|liberec': -46,
  'bielsko|sumperk': 28,
  'bielsko|prerov': 18,
  'pardubice|sumperk': 26,
  'pardubice|prerov': -60,
  'prerov|rosice': 60,
  'prerov|prostejov': -20,
  'prerov|blansko': -40,
  'rosice|farmBrewery1': -12,
  'rosice|novyjicin': -14,
  'prostejov|blansko': 40,
  'prostejov|olomouc': 22,
  'blansko|novyjicin': 16,
  'novyjicin|ostrava': -26,
  'ostrava|frydekmistek': -40,
  'brno|olomouc': -22,
  'brno|vienna': -40,
  'brno|prostejov': -26,
  'brno|blansko': -18,
  'brno|zilina': 46,
  'bratislava|budapest': 36,
  'bratislava|vienna': 26,
}

export const linkKey = (from: string, to: string) => `${from}|${to}`
