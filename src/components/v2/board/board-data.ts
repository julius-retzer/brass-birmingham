// Hand-tuned survey-map geometry for the v2 board.
// Coordinates live in a 1600x1150 viewBox, laid out to match the physical
// board's geography (Stoke in the north, Gloucester in the south-west,
// Oxford in the south-east) while giving every city plate breathing room.
import type { CityId } from '~/data/board'

export const VIEW_W = 1600
export const VIEW_H = 1150

export const cityPos: Record<CityId, { x: number; y: number }> = {
  // North
  warrington: { x: 545, y: 78 },
  stoke: { x: 548, y: 226 },
  leek: { x: 780, y: 110 },
  belper: { x: 1165, y: 100 },
  derby: { x: 1110, y: 248 },
  nottingham: { x: 1395, y: 175 },
  stone: { x: 500, y: 352 },
  uttoxeter: { x: 820, y: 292 },

  // Midlands
  stafford: { x: 405, y: 490 },
  burton: { x: 985, y: 400 },
  cannock: { x: 490, y: 610 },
  tamworth: { x: 905, y: 545 },
  walsall: { x: 665, y: 672 },
  wolverhampton: { x: 385, y: 728 },
  coalbrookdale: { x: 158, y: 615 },
  shrewsbury: { x: 128, y: 432 },

  // Farm breweries — unnamed countryside spots "to the left" of their
  // cities on the physical board
  farmBrewery1: { x: 318, y: 575 },
  farmBrewery2: { x: 132, y: 1030 },

  // South
  dudley: { x: 445, y: 852 },
  birmingham: { x: 795, y: 810 },
  nuneaton: { x: 1105, y: 640 },
  coventry: { x: 1185, y: 810 },
  kidderminster: { x: 275, y: 942 },
  worcester: { x: 545, y: 972 },
  redditch: { x: 895, y: 942 },
  gloucester: { x: 390, y: 1068 },
  oxford: { x: 1210, y: 1025 },
}

// Perpendicular bow (px) applied to a connection's midpoint so long routes
// arc gracefully around city plates instead of slicing through them.
// Key is `${from}|${to}` in the order the connection appears in board data.
export const routeBow: Record<string, number> = {
  'belper|leek': -46,
  'stone|burton': -60,
  'burton|cannock': 60,
  'burton|walsall': -40,
  'derby|uttoxeter': 28,
  'stone|uttoxeter': 26,
  'burton|tamworth': -20,
  'tamworth|walsall': 40,
  'birmingham|worcester': 46,
  'birmingham|oxford': -40,
  'birmingham|tamworth': -26,
  'birmingham|walsall': -18,
  'redditch|gloucester': 36,
  'redditch|oxford': 26,
  'wolverhampton|coalbrookdale': -26,
  'coalbrookdale|kidderminster': -40,
  'burton|derby': 18,
  'walsall|wolverhampton': 16,
  'cannock|wolverhampton': -14,
  'cannock|farmBrewery1': -12,
  'birmingham|nuneaton': -22,
  'tamworth|nuneaton': 22,
}

export const linkKey = (from: string, to: string) => `${from}|${to}`
