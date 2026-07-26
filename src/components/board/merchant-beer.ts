import { GAME_ICONS } from '../gameicons-data'
import { MERCHANT_BEER_ROW_H, SLOT } from './marker-anchor'

/**
 * Geometry for a merchant slot's contents: the industry glyphs printed on the
 * tile, and the beer socket that sits under it (`MerchantPlate` in
 * `board-map.tsx`).
 *
 * The socket is board furniture in its OWN row, alongside the tile rather than
 * inside its icon area — the arrangement the printed board uses. That is what
 * buys the barrel its size: sharing the tile it would compete with the glyph
 * grid for the same 52 units and could only be made legible by being reshaped,
 * and a barrel is only recognisable at its natural proportions. The art is the
 * project's own vendored `brewery` glyph, placed by `barrelTransform` at one
 * scale factor for both axes.
 */

/**
 * Air between the tile row and the beer socket below it. Sized to read as a gap
 * rather than a hairline at BOTH render scales — a couple of board units is
 * under half a screen pixel on a phone, which is no gap at all.
 */
export const BEER_ROW_GAP = 7
/** Diameter of the recessed socket a merchant's barrel rests in. */
export const BEER_SOCKET_D = MERCHANT_BEER_ROW_H - BEER_ROW_GAP
export const BEER_SOCKET_R = BEER_SOCKET_D / 2
/** Width of the socket's brass rim, centred on `BEER_SOCKET_R`. */
export const BEER_SOCKET_STROKE = 1.2
/** Inside face of that rim — the circle the barrel has to stay within. */
export const BEER_SOCKET_INNER_R = BEER_SOCKET_R - BEER_SOCKET_STROKE / 2
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
 * The barrel is `GAME_ICONS.brewery` — Delapouite's `barrel`, the same glyph the
 * brewery industry wears. Deliberate: a merchant never buys beer, so a barrel
 * can only ever appear here as the commodity, and beer and the industry that
 * makes it are one thing on this board. Measured against `beerStein` at both
 * render scales it also holds together better — a single connected amber mass at
 * every scale and pixel density tested, where a stein's handle and a hand-drawn
 * cask's hoops break the shape into fragments.
 */
export const BARREL_ICON = GAME_ICONS.brewery

/**
 * Ink bounds of that glyph inside its 512-unit box. Read off `getBBox` and
 * hard-coded because the board renders server-side too; `e2e/merchant-beer.spec`
 * measures the live path and fails if the vendored data moves.
 */
export const BARREL_INK = { x: 73, y: 41, w: 366.02, h: 433.94 }

/**
 * Furthest the glyph's ink reaches from the centre of those bounds, in the same
 * 512-unit space. This — not the ink's width or height — is what has to fit a
 * ROUND socket: the cask's silhouette very nearly fills its box, so its corners
 * sit a fifth further out than either axis and an axis-only fit lets them
 * overrun the rim. Sampled off the live path, and re-measured by
 * `e2e/merchant-beer.spec`.
 */
export const BARREL_INK_R = 245.06

/**
 * Height of the placed barrel, in board units: as large as the socket can hold
 * with a ring of well still showing all the way round. Sized up from here the
 * silhouette eats the rim and the well stops reading as one.
 */
export const BARREL_H = 21
/** The ONLY scale factor applied to the art, and it drives both axes. */
export const BARREL_SCALE = BARREL_H / BARREL_INK.h
export const BARREL_W = BARREL_INK.w * BARREL_SCALE
/** Board units of dark well left between the cask's silhouette and the rim. */
export const BARREL_RIM_CLEARANCE =
  BEER_SOCKET_INNER_R - BARREL_INK_R * BARREL_SCALE

/**
 * Places the glyph's ink centred on the socket. One `scale` argument by
 * construction: the barrel may be sized, never reshaped.
 */
export function barrelTransform(): string {
  return (
    `translate(${-BARREL_W / 2}, ${-BARREL_H / 2}) ` +
    `scale(${BARREL_SCALE}) ` +
    `translate(${-BARREL_INK.x}, ${-BARREL_INK.y})`
  )
}
