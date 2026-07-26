import { describe, expect, it } from 'vitest'
import {
  MERCHANT_BEER_ROW_H,
  MERCHANT_PLATE_H,
  PLATE_PAD,
  SLOT,
} from './marker-anchor'
import {
  BARREL_ART_H,
  BARREL_ART_W,
  BARREL_H,
  BARREL_SCALE,
  BARREL_W,
  BASE_CY,
  BASE_RX,
  BASE_RY,
  BEER_ROW_GAP,
  BEER_SOCKET_CX,
  BEER_SOCKET_CY,
  BEER_SOCKET_D,
  BEER_SOCKET_R,
  HEAD_CX,
  HEAD_CY,
  HEAD_RX,
  HEAD_RY,
  HOOP_W,
  ICON_SIZE_GRID,
  ICON_SIZE_SINGLE,
  MAX_ICONS,
  barrelBodyPath,
  barrelHoops,
  merchantIconCells,
} from './merchant-beer'

/**
 * The board is a 1600×1150 viewBox letterboxed into its frame, which measures
 * out at these scales — so a marker's board units convert straight to the CSS
 * pixels a player actually looks at.
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

  it('holds the barrel clear of its rim', () => {
    expect(BARREL_W / 2).toBeLessThan(BEER_SOCKET_R)
    expect(BARREL_H / 2).toBeLessThan(BEER_SOCKET_R)
  })

  it('never crosses into the neighbouring slot', () => {
    expect(BEER_SOCKET_D).toBeLessThanOrEqual(SLOT)
  })
})

describe('barrel', () => {
  it('is only ever scaled uniformly', () => {
    // One scalar drives both axes, so the art can never be stretched to fit.
    expect(BARREL_W / BARREL_H).toBeCloseTo(BARREL_ART_W / BARREL_ART_H, 10)
    expect(BARREL_SCALE).toBeCloseTo(BARREL_W / BARREL_ART_W, 10)
    expect(BARREL_SCALE).toBeCloseTo(BARREL_H / BARREL_ART_H, 10)
  })

  it('is authored taller than it is wide, like a cask', () => {
    expect(BARREL_ART_H).toBeGreaterThan(BARREL_ART_W)
    expect(BARREL_ART_W / BARREL_ART_H).toBeGreaterThan(0.6)
  })

  it('keeps a legible bright mass at phone scale', () => {
    // The socket puts the whole barrel on its own patch of plate, so both axes
    // survive: a marker squeezed into the glyph grid gave ~2px each way.
    expect(BARREL_W * PHONE_SCALE).toBeGreaterThan(4.5)
    expect(BARREL_H * PHONE_SCALE).toBeGreaterThan(5.5)
    // And at desk scale there is room for the cask detail to read.
    expect(BARREL_H * DESKTOP_SCALE).toBeGreaterThan(12)
  })

  it('draws a closed silhouette springing from the head', () => {
    const d = barrelBodyPath()
    expect(d.startsWith(`M${HEAD_CX - HEAD_RX} ${HEAD_CY}`)).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('tapers: both heads are narrower than the bilge', () => {
    expect(HEAD_RX).toBeLessThan(BARREL_ART_W / 2)
    expect(BASE_RX).toBeLessThan(BARREL_ART_W / 2)
    expect(HEAD_RX / (BARREL_ART_W / 2)).toBeLessThan(0.75)
  })

  it('keeps both heads inside the art box', () => {
    expect(HEAD_CY - HEAD_RY).toBeGreaterThanOrEqual(0)
    expect(BASE_CY + BASE_RY).toBeLessThanOrEqual(BARREL_ART_H)
    expect(HEAD_CY + HEAD_RY).toBeLessThan(BASE_CY - BASE_RY)
  })

  it('keeps both hoops inside the silhouette', () => {
    const hoops = barrelHoops()
    expect(hoops).toHaveLength(2)
    for (const h of hoops) {
      expect(h.x1).toBeGreaterThan(0)
      expect(h.x2).toBeLessThan(BARREL_ART_W)
      expect(h.y).toBeGreaterThan(HEAD_CY + HEAD_RY)
      expect(h.y).toBeLessThan(BASE_CY - BASE_RY)
      expect(HOOP_W).toBeLessThan(BARREL_ART_H / 20)
    }
    expect(hoops[0]!.y).toBeLessThan(hoops[1]!.y)
  })
})

describe('merchantIconCells', () => {
  it('draws nothing for a blank merchant tile', () => {
    expect(merchantIconCells(0)).toEqual([])
  })

  it('keeps the shipped glyph sizes', () => {
    expect(merchantIconCells(1)[0]?.size).toBe(ICON_SIZE_SINGLE)
    for (const n of [2, 3]) {
      for (const cell of merchantIconCells(n)) {
        expect(cell.size).toBe(ICON_SIZE_GRID)
      }
    }
  })

  it('uses the whole tile, which the socket no longer shares', () => {
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
