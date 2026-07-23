import { SLOT } from './marker-anchor'

/**
 * Geometry for the resource cubes printed on a built industry tile
 * (`BuiltTile` in `board-map.tsx`).
 *
 * Pure on purpose: the cubes share the tile's narrow right gutter with the
 * roman level numeral above them and the owner ribbon below, and the old
 * single column both TOUCHED the numeral (cube top y = numeral baseline) and
 * could not physically hold the biggest stacks — a column needs
 * `6.2 * 5 = 31px` for Coal Mine III's five cubes while the clear band between
 * numeral and ribbon is only ~28.5px, which is why six (Iron Works IV) used to
 * collapse into a `×6` numeral. Two left-aligned columns fit all six with real
 * clearance at both ends, so every cube is drawn.
 */

/** Side of one cube (the 1px parchment keyline sits centred on this edge). */
export const CUBE = 6.2
/** Gap between cubes, both axes. */
export const CUBE_GAP = 1.8
/** Cubes fill left-to-right across this many columns, then wrap down. */
export const CUBE_COLS = 2

/** Baseline of the roman level numeral — the cubes must clear it. */
export const NUMERAL_BASELINE = 13
/** Top edge of the owner ribbon — the cubes must clear it too. */
export const RIBBON_TOP = SLOT - 6

const BLOCK_W = CUBE_COLS * CUBE + (CUBE_COLS - 1) * CUBE_GAP

/**
 * The block's right edge lines up with the level numeral's right edge
 * (`x = SLOT - 5`), and cubes fill FROM THE LEFT inside it — so an odd cube
 * always sits in the left column with the spare space on the right, never
 * centred.
 */
export const CUBE_ORIGIN_X = SLOT - 5 - BLOCK_W
/** Clear air between the numeral's baseline and the first cube row. */
export const CUBE_ORIGIN_Y = NUMERAL_BASELINE + 3.5

/** The largest stack the tile data can produce (Iron Works IV). */
export const MAX_TILE_CUBES = 6

export interface CubeCell {
  x: number
  y: number
}

/** Top-left corner of each cube, in tile-local units, filling left-to-right. */
export function cubeCells(n: number): CubeCell[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => ({
    x: CUBE_ORIGIN_X + (i % CUBE_COLS) * (CUBE + CUBE_GAP),
    y: CUBE_ORIGIN_Y + Math.floor(i / CUBE_COLS) * (CUBE + CUBE_GAP),
  }))
}
