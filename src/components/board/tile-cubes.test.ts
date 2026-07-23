import { describe, expect, it } from 'vitest'
import { SLOT } from './marker-anchor'
import {
  CUBE,
  CUBE_COLS,
  CUBE_ORIGIN_X,
  MAX_TILE_CUBES,
  NUMERAL_BASELINE,
  RIBBON_TOP,
  cubeCells,
} from './tile-cubes'

/** The keyline is 1px centred on the cube edge, so it bleeds 0.5 each way. */
const KEYLINE = 0.5
/** The counts the tile data can actually produce (see industryTiles.ts). */
const COUNTS = [1, 2, 3, 4, 5, 6]

describe('cubeCells', () => {
  it('draws every cube — nothing collapses into a count numeral', () => {
    for (const n of COUNTS) expect(cubeCells(n)).toHaveLength(n)
    expect(cubeCells(0)).toEqual([])
  })

  it('never touches the roman level numeral', () => {
    for (const n of COUNTS) {
      const top = Math.min(...cubeCells(n).map((c) => c.y)) - KEYLINE
      expect(top).toBeGreaterThan(NUMERAL_BASELINE)
    }
  })

  it('never touches the owner ribbon and stays inside the tile face', () => {
    for (const n of COUNTS) {
      const cells = cubeCells(n)
      expect(Math.max(...cells.map((c) => c.y)) + CUBE + KEYLINE).toBeLessThan(
        RIBBON_TOP,
      )
      expect(Math.min(...cells.map((c) => c.x)) - KEYLINE).toBeGreaterThan(0)
      expect(Math.max(...cells.map((c) => c.x)) + CUBE + KEYLINE).toBeLessThan(
        SLOT,
      )
    }
  })

  it('clears the industry glyph, which occupies x 5..29', () => {
    for (const n of COUNTS) {
      expect(
        Math.min(...cubeCells(n).map((c) => c.x)) - KEYLINE,
      ).toBeGreaterThan(29)
    }
  })

  it('left-aligns every count — an odd cube sits in the left column', () => {
    for (const n of COUNTS) {
      const cells = cubeCells(n)
      // first cube of every row is flush with the block's left edge
      for (let i = 0; i < n; i += CUBE_COLS) {
        expect(cells[i]!.x).toBe(CUBE_ORIGIN_X)
      }
      // a lone trailing cube is never nudged towards the centre
      if (n % CUBE_COLS === 1) expect(cells[n - 1]!.x).toBe(CUBE_ORIGIN_X)
    }
  })

  it('never overlaps another cube', () => {
    for (const n of COUNTS) {
      const cells = cubeCells(n)
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!
          const b = cells[j]!
          const apart =
            Math.abs(a.x - b.x) >= CUBE + 1 || Math.abs(a.y - b.y) >= CUBE + 1
          expect(apart).toBe(true)
        }
      }
    }
  })

  it('wraps in reading order across CUBE_COLS columns', () => {
    const cells = cubeCells(MAX_TILE_CUBES)
    expect(new Set(cells.map((c) => c.x)).size).toBe(CUBE_COLS)
    expect(new Set(cells.map((c) => c.y)).size).toBe(MAX_TILE_CUBES / CUBE_COLS)
  })
})
