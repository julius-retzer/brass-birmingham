import { describe, expect, it } from 'vitest'
import {
  CARD_H,
  CARD_W,
  FAN_SPACING,
  LENS_COARSE,
  LENS_FINE,
  LENS_SELECTED,
  MIN_SPACING,
  cardIndexAtX,
  dockShift,
  fanLayout,
  lensReach,
  lensShiftX,
  moveHandleLayout,
  moveHandleShiftX,
} from './hand-tray-layout'

describe('fanLayout', () => {
  it('keeps the classic fan when the width is unknown (SSR / first paint)', () => {
    expect(fanLayout(8, null)).toEqual({ spacing: FAN_SPACING, marginX: -17 })
  })

  it('keeps the classic fan when there is room', () => {
    // 768px tray (desktop max) holds 8 cards at full spacing: 108 + 7·74 = 626.
    expect(fanLayout(8, 768).spacing).toBe(FAN_SPACING)
  })

  it('compresses the overlap so a full hand fits a phone-width tray', () => {
    // 375px viewport at scale .72 → ~520 layout px.
    const { spacing, marginX } = fanLayout(8, 520)
    expect(spacing).toBeLessThan(FAN_SPACING)
    // Total row width n·spacing must fit.
    expect(8 * spacing).toBeLessThanOrEqual(520)
    // marginX always reconstructs the spacing: card + 2·margin = spacing.
    expect(CARD_W + 2 * marginX).toBeCloseTo(spacing)
  })

  it('accounts for the rotated overhang of the outermost cards', () => {
    // 414px viewport at scale .72 → 575 layout px. The naive fit would be
    // (575 − 108 − 12) / 7 ≈ 65px, but the edge cards rotate ±14° around a
    // pivot below the card, swinging their top corners ~45px outward — the
    // spacing must shrink to keep those corners on screen (regression: the
    // fan visibly overflowed at 414×896 with 8 cards).
    const { spacing } = fanLayout(8, 575)
    expect(spacing).toBeGreaterThan(45)
    expect(spacing).toBeLessThan(55)
  })

  it('never packs tighter than the minimum tappable slice', () => {
    expect(fanLayout(30, 200).spacing).toBe(MIN_SPACING)
  })

  it('a single card needs no compression', () => {
    expect(fanLayout(1, 100).spacing).toBe(FAN_SPACING)
  })
})

describe('dockShift', () => {
  it('is zero with nothing raised', () => {
    expect(dockShift(3, null, LENS_FINE.scale)).toBe(0)
  })

  it('is zero for the raised card itself', () => {
    expect(dockShift(3, 3, LENS_FINE.scale)).toBe(0)
  })

  it('pushes immediate neighbours apart, symmetric around the raised card', () => {
    const left = dockShift(2, 3, LENS_FINE.scale)
    const right = dockShift(4, 3, LENS_FINE.scale)
    expect(left).toBeLessThan(0)
    expect(right).toBeGreaterThan(0)
    expect(left).toBe(-right)
  })

  it('falls off with distance and stops after two seats', () => {
    const d1 = dockShift(4, 3, LENS_FINE.scale)
    const d2 = dockShift(5, 3, LENS_FINE.scale)
    expect(d2).toBeGreaterThan(0)
    expect(d2).toBeLessThan(d1)
    expect(dockShift(6, 3, LENS_FINE.scale)).toBe(0)
  })

  it('shifts further for the larger touch magnification', () => {
    expect(dockShift(4, 3, LENS_COARSE.scale)).toBeGreaterThan(
      dockShift(4, 3, LENS_FINE.scale),
    )
  })
})

describe('lensShiftX', () => {
  const spacing = 60
  const width = 520

  it('leaves centre cards alone', () => {
    expect(lensShiftX(3, 8, spacing, width, LENS_COARSE.scale)).toBe(0)
  })

  it('pulls the leftmost card right so the magnified visual stays on screen', () => {
    const shift = lensShiftX(0, 8, spacing, width, LENS_COARSE.scale)
    expect(shift).toBeGreaterThan(0)
    // After shifting, the visual's left edge sits at the pad.
    const centerX = width / 2 + (0 - 3.5) * spacing + shift
    expect(centerX - (CARD_W * LENS_COARSE.scale) / 2).toBeCloseTo(8)
  })

  it('pulls the rightmost card left, mirroring the leftmost', () => {
    const left = lensShiftX(0, 8, spacing, width, LENS_COARSE.scale)
    const right = lensShiftX(7, 8, spacing, width, LENS_COARSE.scale)
    expect(right).toBeCloseTo(-left)
  })

  it('does nothing when the width is unknown', () => {
    expect(lensShiftX(0, 8, spacing, null, LENS_COARSE.scale)).toBe(0)
  })
})

describe('lensReach', () => {
  it('covers the full magnified visual above the seat', () => {
    // rise + the extra height gained by scaling from the bottom edge.
    expect(lensReach(LENS_FINE)).toBeCloseTo(40 + 156 * 0.6)
    expect(lensReach(LENS_COARSE)).toBeGreaterThan(lensReach(LENS_FINE))
  })
})

describe('LENS_SELECTED (persistent selected-card lens)', () => {
  it('is smaller than both transient lenses so it cannot occlude the dock', () => {
    expect(LENS_SELECTED.scale).toBeLessThan(LENS_FINE.scale)
    expect(LENS_SELECTED.scale).toBeLessThan(LENS_COARSE.scale)
    expect(lensReach(LENS_SELECTED)).toBeLessThan(lensReach(LENS_FINE))
  })

  it('still visibly magnifies and lifts the card', () => {
    expect(LENS_SELECTED.scale).toBeGreaterThan(1)
    expect(LENS_SELECTED.rise).toBeGreaterThan(0)
  })
})

describe('cardIndexAtX (drag-to-browse)', () => {
  const width = 520
  const spacing = 60

  it('maps the fan centre to the middle card', () => {
    // 8 cards: centres at width/2 + (i − 3.5)·spacing; x = width/2 sits
    // between cards 3 and 4 — rounding picks one of the two, stably.
    expect([3, 4]).toContain(cardIndexAtX(width / 2, 8, spacing, width))
  })

  it('maps each seat centre to its own card', () => {
    for (let i = 0; i < 8; i++) {
      const centerX = width / 2 + (i - 3.5) * spacing
      expect(cardIndexAtX(centerX, 8, spacing, width)).toBe(i)
    }
  })

  it('clamps sweeps past the fan ends to the edge cards', () => {
    expect(cardIndexAtX(-100, 8, spacing, width)).toBe(0)
    expect(cardIndexAtX(width + 100, 8, spacing, width)).toBe(7)
  })

  it('a single card owns the whole tray', () => {
    expect(cardIndexAtX(0, 1, spacing, width)).toBe(0)
    expect(cardIndexAtX(width, 1, spacing, width)).toBe(0)
  })
})

describe('moveHandleLayout', () => {
  it('hangs the handles clear of the magnified card on both sides', () => {
    const { size, width } = moveHandleLayout(LENS_FINE, false)
    const lensWidth = CARD_W * LENS_FINE.scale
    // Each handle sits entirely outside the card it belongs to — that is what
    // keeps the card's own tap point (second tap = select) free.
    expect((width - lensWidth) / 2).toBeGreaterThanOrEqual(size)
  })

  it('is thumb sized on a coarse pointer, and still clears the bigger lens', () => {
    const fine = moveHandleLayout(LENS_FINE, false)
    const coarse = moveHandleLayout(LENS_COARSE, true)
    expect(coarse.size).toBeGreaterThanOrEqual(44)
    expect(coarse.size).toBeGreaterThan(fine.size)
    expect(
      (coarse.width - CARD_W * LENS_COARSE.scale) / 2,
    ).toBeGreaterThanOrEqual(coarse.size)
  })

  it('centres the strip on the magnified card, not on the seat', () => {
    for (const lens of [LENS_FINE, LENS_COARSE]) {
      const { size, bottom } = moveHandleLayout(lens, lens === LENS_COARSE)
      // Handle centre === lens centre: rise + half the magnified height.
      expect(bottom + size / 2).toBeCloseTo(
        lens.rise + (CARD_H * lens.scale) / 2,
      )
    }
  })
})

describe('moveHandleShiftX', () => {
  const handles = moveHandleLayout(LENS_COARSE, true)

  it("pulls an edge card's strip back inside the tray", () => {
    // The phone fan: 541 layout px (390 / 0.72), 5 cards at full spacing.
    // Without a clamp the outer handle of card 3 runs off the right edge.
    const width = 541
    const shift = moveHandleShiftX(3, 5, FAN_SPACING, width, handles)
    expect(shift).toBeLessThan(0)
    // The clamp folds the rotation term in, so the seat-relative right edge
    // is what has to fit — and it now does.
    expect(
      width / 2 + (3 - 2) * FAN_SPACING + shift + handles.width / 2,
    ).toBeLessThanOrEqual(width)
  })

  it('leaves a middle card alone', () => {
    expect(moveHandleShiftX(2, 5, FAN_SPACING, 1600, handles)).toBe(0)
  })

  it('is a no-op before the tray has been measured', () => {
    expect(moveHandleShiftX(0, 5, FAN_SPACING, null, handles)).toBe(0)
  })

  it('accounts for the fan rotation, unlike the lens clamp', () => {
    // Same card, same tray: the strip's clamp is stricter than the lens's
    // because the strip is wider AND rides higher above the rotation pivot.
    const width = 541
    const lensOnly = lensShiftX(4, 5, FAN_SPACING, width, LENS_COARSE.scale)
    const strip = moveHandleShiftX(4, 5, FAN_SPACING, width, handles)
    expect(Math.abs(strip)).toBeGreaterThan(Math.abs(lensOnly))
  })
})
