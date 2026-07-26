// Where a built link's boat/locomotive marker sits on its route.
//
// Routes run city-centre to city-centre, so a route's midpoint can land on
// (or under) a neighbouring city plate — the marker then paints before the
// plates and disappears (Stoke-on-Trent, playtest 2026-07-22). Two layers fix
// it, and both live here so they cannot drift apart:
//   1. `linkMarkerAnchor` slides the marker along its own curve to the point
//      nearest the midpoint that clears every plate and name ribbon;
//   2. `board-map.tsx` paints the marker layer AFTER the plates, so even a
//      route with no clear point (short hops between two big plates) stays
//      visible. SVG z-order is document order, not CSS z-index.
import {
  type CityId,
  FARM_BREWERIES,
  cities,
  cityIndustrySlots,
} from '~/data/board'
import { cityPos, linkKey, routeBow } from './board-data'

export const SLOT = 52
export const SLOT_GAP = 4
export const PLATE_PAD = 6

/**
 * Height of the beer-socket row a merchant plate carries under its tile row.
 * Lives here with the other plate metrics — `plateRect` needs it to size the
 * obstacle box and `merchant-beer.ts` divides it into the socket and its
 * clearance, so the two cannot drift.
 */
export const MERCHANT_BEER_ROW_H = 34

/** Height of any merchant plate: tile row plus beer-socket row. */
export const MERCHANT_PLATE_H = SLOT + MERCHANT_BEER_ROW_H + PLATE_PAD * 2

/**
 * A merchant plate's top edge relative to its city point. The plate hangs its
 * BOTTOM edge half a tile row below the point and reaches upward for the rest,
 * so the extra height lands in empty board: the name ribbon keeps its baseline
 * and the routes arriving from below keep the gap a link marker needs. Only
 * merchant plates are anchored this way; city plates centre on their point.
 */
export const MERCHANT_PLATE_TOP = (SLOT + PLATE_PAD * 2) / 2 - MERCHANT_PLATE_H

/** Plates whose slots stack into a grid instead of one row. */
export const PLATE_GRIDS: Partial<Record<CityId, Array<[number, number]>>> = {
  birmingham: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  coventry: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  stoke: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  coalbrookdale: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
}

export function plateGrid(
  cityId: CityId,
  slotCount: number,
): Array<[number, number]> {
  return (
    PLATE_GRIDS[cityId] ??
    Array.from({ length: Math.max(slotCount, 1) }, (_, i) => [i, 0])
  )
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Pt {
  x: number
  y: number
}

/**
 * The plate's own box, in board coordinates. Merchant plates are sized from
 * the merchant entries they hold at render time; the pool never seats more
 * than two per location, so the widest case is used here.
 */
export function plateRect(cityId: CityId): Rect {
  const pos = cityPos[cityId]
  let w: number
  let h: number
  if (cities[cityId].type === 'merchant') {
    w = 2 * SLOT + SLOT_GAP + PLATE_PAD * 2
    h = MERCHANT_PLATE_H
  } else {
    const grid = plateGrid(cityId, (cityIndustrySlots[cityId] ?? []).length)
    const cols = Math.max(...grid.map(([c]) => c)) + 1
    const rows = Math.max(...grid.map(([, r]) => r)) + 1
    w = cols * SLOT + (cols - 1) * SLOT_GAP + PLATE_PAD * 2
    h = rows * SLOT + (rows - 1) * SLOT_GAP + PLATE_PAD * 2
  }
  const y =
    cities[cityId].type === 'merchant'
      ? pos.y + MERCHANT_PLATE_TOP
      : pos.y - h / 2
  return { x: pos.x - w / 2, y, w, h }
}

// The name ribbon hangs under every plate (baseline at plateH + 13) and is
// routinely wider than the plate itself — it hid half the Stoke marker. SVG
// gives no text metrics outside the DOM, so the box is estimated from the
// glyph count at the ribbon's own type size (generous on purpose: a slightly
// fat obstacle only nudges the marker a little further along the route).
function labelRect(cityId: CityId): Rect {
  const plate = plateRect(cityId)
  const isFarm = FARM_BREWERIES.has(cityId)
  const fontSize = isFarm ? 13 : 14.5
  // uppercase + 0.1em tracking on city ribbons; italic lowercase on farms
  const perChar = isFarm ? fontSize * 0.5 : fontSize * 0.68
  const w = Math.max(cities[cityId].name.length * perChar, plate.w)
  const baseline = plate.y + plate.h + 13
  return {
    x: plate.x + plate.w / 2 - w / 2,
    y: baseline - fontSize * 0.8,
    w,
    h: fontSize * 1.15,
  }
}

let obstacleCache: Rect[] | null = null

/** Every box a link marker should try to keep clear of. */
export function plateObstacles(): Rect[] {
  if (obstacleCache) return obstacleCache
  const out: Rect[] = []
  for (const id of Object.keys(cities) as CityId[]) {
    out.push(plateRect(id), labelRect(id))
  }
  obstacleCache = out
  return out
}

/** Quadratic-bezier route from city centre to city centre. */
export function routeCurve(
  from: CityId,
  to: CityId,
): { a: Pt; c: Pt; b: Pt; d: string } {
  const a = cityPos[from]
  const b = cityPos[to]
  const bow = routeBow[linkKey(from, to)] ?? 0
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const c = { x: mx + (-dy / len) * bow, y: my + (dx / len) * bow }
  return { a, c, b, d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}` }
}

export function pointAt(from: CityId, to: CityId, t: number): Pt {
  const { a, c, b } = routeCurve(from, to)
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  }
}

// The marker plate is 32x20; keep a little air around it so it never kisses
// a plate edge.
const MARKER_W = 38
const MARKER_H = 26

function overlapArea(box: Rect, rects: Rect[]): number {
  let total = 0
  for (const r of rects) {
    const ox = Math.min(box.x + box.w, r.x + r.w) - Math.max(box.x, r.x)
    const oy = Math.min(box.y + box.h, r.y + r.h) - Math.max(box.y, r.y)
    if (ox > 0 && oy > 0) total += ox * oy
  }
  return total
}

export function markerBoxAt(p: Pt): Rect {
  return {
    x: p.x - MARKER_W / 2,
    y: p.y - MARKER_H / 2,
    w: MARKER_W,
    h: MARKER_H,
  }
}

// Search window around the midpoint. Beyond ~0.35 the marker reads as
// belonging to a city rather than to the route.
const MAX_SHIFT = 0.34
const STEP = 0.01

const anchorCache = new Map<string, Pt>()

/**
 * The point on the route where the built-link marker is drawn: the sample
 * nearest the midpoint that clears every plate and ribbon, or — when the two
 * plates leave no gap — the least-occluded sample. Board geometry is static,
 * so results are cached.
 */
export function linkMarkerAnchor(from: CityId, to: CityId): Pt {
  const key = linkKey(from, to)
  const cached = anchorCache.get(key)
  if (cached) return cached

  const obstacles = plateObstacles()
  let best: Pt = pointAt(from, to, 0.5)
  let bestOverlap = Number.POSITIVE_INFINITY

  for (let shift = 0; shift <= MAX_SHIFT + 1e-9; shift += STEP) {
    for (const t of shift === 0 ? [0.5] : [0.5 - shift, 0.5 + shift]) {
      const p = pointAt(from, to, t)
      const overlap = overlapArea(markerBoxAt(p), obstacles)
      if (overlap === 0) {
        anchorCache.set(key, p)
        return p
      }
      if (overlap < bestOverlap) {
        bestOverlap = overlap
        best = p
      }
    }
  }
  anchorCache.set(key, best)
  return best
}
