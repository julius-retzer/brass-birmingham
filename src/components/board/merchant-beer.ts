import { MERCHANT_BEER_ROW_H, SLOT } from './marker-anchor'

/**
 * Geometry for a merchant slot's contents: the industry glyphs printed on the
 * tile, and the beer socket that sits under it (`MerchantPlate` in
 * `board-map.tsx`).
 *
 * The socket is board furniture in its OWN row below the tile, which is where
 * the physical board puts it. That is what buys the barrel its size: inside the
 * slot it would compete with the glyph grid for the same 52 units and could
 * only be legible by being reshaped, and a barrel is only recognisable at its
 * natural proportions. So the barrel art is authored once at cask proportions
 * (`BARREL_ART_W`×`BARREL_ART_H`) and placed with a single uniform
 * `scale(BARREL_SCALE)` — no axis is ever scaled on its own.
 */

/** Air between the tile row and the beer socket below it. */
export const BEER_ROW_GAP = 2
/** Diameter of the recessed socket a merchant's barrel rests in. */
export const BEER_SOCKET_D = MERCHANT_BEER_ROW_H - BEER_ROW_GAP
export const BEER_SOCKET_R = BEER_SOCKET_D / 2
/** Socket centre in slot-local units — under the middle of its own tile. */
export const BEER_SOCKET_CX = SLOT / 2
export const BEER_SOCKET_CY = SLOT + BEER_ROW_GAP + BEER_SOCKET_R

/** A single glyph is drawn large; two or three share a 2-column grid. */
export const ICON_SIZE_SINGLE = 24
export const ICON_SIZE_GRID = 15
export const ICON_GRID_GAP = 4
export const ICON_GRID_COLS = 2
/** A merchant tile prints at most this many industry icons. */
export const MAX_ICONS = 3

export interface IconCell {
  x: number
  y: number
  size: number
}

/**
 * Top-left corner and size of each industry glyph in a merchant slot, in
 * slot-local units. The block is centred in the tile; an odd third glyph sits
 * in the left column, so it lines up under the first.
 */
export function merchantIconCells(count: number): IconCell[] {
  const n = Math.min(Math.max(count, 0), MAX_ICONS)
  if (n === 0) return []
  if (n === 1) {
    const off = (SLOT - ICON_SIZE_SINGLE) / 2
    return [{ x: off, y: off, size: ICON_SIZE_SINGLE }]
  }
  const step = ICON_SIZE_GRID + ICON_GRID_GAP
  const rows = Math.ceil(n / ICON_GRID_COLS)
  const blockW =
    ICON_GRID_COLS * ICON_SIZE_GRID + (ICON_GRID_COLS - 1) * ICON_GRID_GAP
  const blockH = rows * ICON_SIZE_GRID + (rows - 1) * ICON_GRID_GAP
  const x0 = (SLOT - blockW) / 2
  const y0 = (SLOT - blockH) / 2
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + (i % ICON_GRID_COLS) * step,
    y: y0 + Math.floor(i / ICON_GRID_COLS) * step,
    size: ICON_SIZE_GRID,
  }))
}

/* ---------------- the barrel ---------------- */

/**
 * The barrel's own coordinate box, at cask proportions: taller than its bilge is
 * wide, with heads narrower than the bilge. That taper is the whole read — an
 * untapered amber pill is a pill — so it is authored here and never adjusted to
 * fit anything.
 */
export const BARREL_ART_W = 92
export const BARREL_ART_H = 122
/** Height of the placed barrel, in board units. */
export const BARREL_H = 28
/** The ONLY transform applied to the art, and it drives both axes. */
export const BARREL_SCALE = BARREL_H / BARREL_ART_H
export const BARREL_W = BARREL_ART_W * BARREL_SCALE

/** The top head, seen slightly from above. */
export const HEAD_CX = BARREL_ART_W / 2
export const HEAD_CY = 12
export const HEAD_RX = 29
export const HEAD_RY = 9
/** The base, hidden behind the staves except for its front rim. */
export const BASE_CY = BARREL_ART_H - 10
export const BASE_RX = 27
export const BASE_RY = 8
/**
 * How far the stave control points reach past the art box. The bilge is a
 * cubic, which never touches its control points, so overshooting is what gives
 * the cask a bulge wide enough to read against the narrow heads.
 */
export const BILGE_OVERSHOOT = 4

/**
 * Silhouette of the cask: over the top head, down the staves to the bilge, in
 * to the narrower base, across the front of the base rim and back up.
 */
export function barrelBodyPath(): string {
  const right = BARREL_ART_W + BILGE_OVERSHOOT
  const left = -BILGE_OVERSHOOT
  return [
    `M${HEAD_CX - HEAD_RX} ${HEAD_CY}`,
    `A${HEAD_RX} ${HEAD_RY} 0 0 1 ${HEAD_CX + HEAD_RX} ${HEAD_CY}`,
    `C${right} 40 ${right} 84 ${HEAD_CX + BASE_RX} ${BASE_CY}`,
    `A${BASE_RX} ${BASE_RY} 0 0 1 ${HEAD_CX - BASE_RX} ${BASE_CY}`,
    `C${left} 84 ${left} 40 ${HEAD_CX - HEAD_RX} ${HEAD_CY}`,
    'Z',
  ].join(' ')
}

export interface Hoop {
  y: number
  x1: number
  x2: number
}

/**
 * The two iron hoops, in art units. Inset from the silhouette so a hoop can
 * never poke out of the bilge, and thin: they carry identity at desk scale
 * only, being sub-pixel once the board is on a phone.
 */
export const HOOP_W = 4

export function barrelHoops(): Hoop[] {
  return [
    { y: 42, x1: 6, x2: BARREL_ART_W - 6 },
    { y: 86, x1: 7, x2: BARREL_ART_W - 7 },
  ]
}
