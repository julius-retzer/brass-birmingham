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
  prague: { x: 430, y: 130 },
  krakow: { x: 1010, y: 110 },
  lemberg: { x: 1470, y: 155 },

  // North / East Bohemia + the Ostrava basin (Austrian Silesia)
  teplice: { x: 235, y: 300 },
  liberec: { x: 475, y: 290 },
  ostrava: { x: 1000, y: 300 },
  karvina: { x: 1235, y: 285 },
  bielsko: { x: 1465, y: 365 },

  // Upper-mid
  pardubice: { x: 305, y: 468 },
  sumperk: { x: 565, y: 460 },
  frydekmistek: { x: 1095, y: 485 },
  tesin: { x: 1345, y: 470 },

  // Central Moravia / Haná
  jihlava: { x: 235, y: 628 },
  olomouc: { x: 760, y: 620 },
  novyjicin: { x: 1005, y: 620 },
  zilina: { x: 1270, y: 675 },
  blansko: { x: 565, y: 778 },
  prostejov: { x: 795, y: 772 },
  prerov: { x: 1015, y: 778 },
  rosice: { x: 255, y: 772 },

  // Farm breweries — manor breweries "to the left" of their cities
  farmBrewery1: { x: 405, y: 768 }, // Černá Hora, off Rosice
  farmBrewery2: { x: 1160, y: 575 }, // Bytča, on the Frýdek-Místek–Žilina link

  // South — Brno hub + Danube corridor
  brno: { x: 640, y: 920 },
  znojmo: { x: 350, y: 1058 },
  vienna: { x: 610, y: 1068 },
  bratislava: { x: 930, y: 1008 },
  budapest: { x: 1240, y: 1072 },
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
