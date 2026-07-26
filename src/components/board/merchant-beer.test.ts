import { describe, expect, it } from 'vitest'
import {
  MERCHANT_BEER_ROW_H,
  MERCHANT_PLATE_H,
  PLATE_PAD,
  SLOT,
} from './marker-anchor'
import {
  BARREL_H,
  BARREL_ICON,
  BARREL_INK,
  BARREL_INK_R,
  BARREL_RIM_CLEARANCE,
  BARREL_SCALE,
  BARREL_W,
  BEER_ROW_GAP,
  BEER_SOCKET_CX,
  BEER_SOCKET_CY,
  BEER_SOCKET_D,
  BEER_SOCKET_INNER_R,
  BEER_SOCKET_R,
  ICON_SIZE_GRID,
  ICON_SIZE_SINGLE,
  MAX_ICONS,
  barrelTransform,
  merchantIconCells,
} from './merchant-beer'

/**
 * The board is a 1600×1150 viewBox letterboxed into its frame, which measures
 * out at these scales — so a marker's board units convert straight to the CSS
 * pixels a player looks at. `e2e/merchant-beer.spec.ts` reads the live
 * `getScreenCTM` at both widths and fails if the frame drifts off them.
 */
const PHONE_SCALE = 0.221
const DESKTOP_SCALE = 0.489

describe('beer socket', () => {
  it('sits in its own row under the tile, not inside it', () => {
    expect(BEER_SOCKET_CY - BEER_SOCKET_R).toBeGreaterThanOrEqual(SLOT)
    expect(BEER_SOCKET_CX).toBe(SLOT / 2)
  })

  it('fits the row the merchant plate reserves for it', () => {
    expect(BEER_SOCKET_D + BEER_ROW_GAP).toBe(MERCHANT_BEER_ROW_H)
    // Slot-local y, so both of the plate's pads count.
    expect(PLATE_PAD + BEER_SOCKET_CY + BEER_SOCKET_R + PLATE_PAD).toBe(
      MERCHANT_PLATE_H,
    )
  })

  it('holds the whole barrel silhouette clear of its rim', () => {
    // The socket is ROUND, so fitting the cask's width and height inside the rim
    // proves nothing: its corners reach a fifth further out than either axis and
    // that is where it overran. Measure the silhouette's own radius.
    expect(BARREL_INK_R * BARREL_SCALE).toBeLessThan(BEER_SOCKET_INNER_R)
    // And leave enough dark well showing that the containment is obvious rather
    // than tangent.
    expect(BARREL_RIM_CLEARANCE).toBeGreaterThan(1.8)
    expect(BARREL_W / 2).toBeLessThan(BEER_SOCKET_INNER_R)
    expect(BARREL_H / 2).toBeLessThan(BEER_SOCKET_INNER_R)
  })

  it('never crosses into the neighbouring slot', () => {
    expect(BEER_SOCKET_D).toBeLessThanOrEqual(SLOT)
  })

  it('shows air above itself at both render scales', () => {
    // A gap only reads once it is worth about a screen pixel and a half; on a
    // phone a couple of board units is under half of one.
    expect(BEER_ROW_GAP * PHONE_SCALE).toBeGreaterThan(1.4)
    expect(BEER_ROW_GAP * DESKTOP_SCALE).toBeGreaterThan(3)
  })
})

describe('barrel', () => {
  it('is one of the vendored game-icons glyphs', () => {
    expect(BARREL_ICON.name).toBe('barrel')
    expect(BARREL_ICON.author).toBe('Delapouite')
    expect(BARREL_ICON.d.length).toBeGreaterThan(100)
  })

  it('is placed with a single scale factor, never one per axis', () => {
    // The transform string is the thing that could distort the art, so assert
    // its shape: one scale argument, no comma.
    const t = barrelTransform()
    expect(t).toMatch(/^translate\([^)]*\) scale\([\d.]+\) translate\([^)]*\)$/)
    expect(t).toContain(`scale(${BARREL_SCALE})`)
    expect(BARREL_W / BARREL_H).toBeCloseTo(BARREL_INK.w / BARREL_INK.h, 10)
  })

  it('reads as a cask: its ink is taller than it is wide', () => {
    expect(BARREL_INK.h).toBeGreaterThan(BARREL_INK.w)
    expect(BARREL_INK.w / BARREL_INK.h).toBeGreaterThan(0.6)
  })

  it('is centred on the socket', () => {
    const t = barrelTransform()
    expect(t.startsWith(`translate(${-BARREL_W / 2}, ${-BARREL_H / 2})`)).toBe(
      true,
    )
    expect(t.endsWith(`translate(${-BARREL_INK.x}, ${-BARREL_INK.y})`)).toBe(
      true,
    )
  })

  it('keeps a legible bright mass at phone scale', () => {
    // At 390px the socket is barely 6px across, so nothing cask-shaped can read
    // there at any size that fits inside it — what carries is the amber mass
    // against the dark well. Hold that mass above the point where antialiasing
    // dissolves it into the rim.
    expect(BARREL_W * PHONE_SCALE).toBeGreaterThan(3.5)
    expect(BARREL_H * PHONE_SCALE).toBeGreaterThan(4.5)
    // At desk scale the cask shape itself has room to read.
    expect(BARREL_H * DESKTOP_SCALE).toBeGreaterThan(10)
    // Whatever the size, the barrel is the majority of the well it stands in —
    // a token rattling around inside the rim reads as debris, not as stock.
    expect(BARREL_H / BEER_SOCKET_D).toBeGreaterThan(0.65)
  })
})

describe('merchantIconCells', () => {
  it('draws nothing for a blank merchant tile', () => {
    expect(merchantIconCells(0)).toEqual([])
  })

  it('draws a lone glyph large and shares a grid from two up', () => {
    expect(merchantIconCells(1)[0]?.size).toBe(ICON_SIZE_SINGLE)
    for (const n of [2, 3]) {
      for (const cell of merchantIconCells(n)) {
        expect(cell.size).toBe(ICON_SIZE_GRID)
      }
    }
  })

  it('uses the whole tile, which is the socket-free area', () => {
    for (const n of [1, 2, 3]) {
      for (const cell of merchantIconCells(n)) {
        expect(cell.x).toBeGreaterThanOrEqual(0)
        expect(cell.y).toBeGreaterThanOrEqual(0)
        expect(cell.x + cell.size).toBeLessThanOrEqual(SLOT)
        expect(cell.y + cell.size).toBeLessThanOrEqual(SLOT)
      }
    }
  })

  it('centres the glyph block in the tile', () => {
    for (const n of [1, 2, 3]) {
      const cells = merchantIconCells(n)
      const top = Math.min(...cells.map((c) => c.y))
      const bottom = Math.max(...cells.map((c) => c.y + c.size))
      expect(top).toBeCloseTo(SLOT - bottom, 6)
    }
  })

  it('never overlaps two glyphs', () => {
    for (const n of [2, 3]) {
      const cells = merchantIconCells(n)
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!
          const b = cells[j]!
          const apart =
            a.x + a.size <= b.x ||
            b.x + b.size <= a.x ||
            a.y + a.size <= b.y ||
            b.y + b.size <= a.y
          expect(apart).toBe(true)
        }
      }
    }
  })

  it('puts an odd third glyph under the first', () => {
    const cells = merchantIconCells(3)
    expect(cells[2]?.x).toBe(cells[0]?.x)
    expect(cells[2]?.y).toBeGreaterThan(cells[0]!.y)
  })

  it('caps at the printed icon count', () => {
    expect(merchantIconCells(9)).toHaveLength(MAX_ICONS)
  })
})
