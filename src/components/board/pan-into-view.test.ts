import { describe, expect, it } from 'vitest'
import {
  type ViewBox,
  easeInOutCubic,
  isComfortablyVisible,
  planPanToCity,
} from './pan-into-view'

const BOUNDS = { w: 1600, h: 1150 }
const FULL: ViewBox = { x: 0, y: 0, w: 1600, h: 1150 }

/** A zoomed-in view of the top-left quadrant. */
const ZOOMED: ViewBox = { x: 0, y: 0, w: 800, h: 575 }

function assertComfortable(vb: ViewBox, pt: { x: number; y: number }) {
  expect(isComfortablyVisible(vb, pt)).toBe(true)
}

describe('isComfortablyVisible', () => {
  it('a centred city is visible', () => {
    expect(isComfortablyVisible(ZOOMED, { x: 400, y: 287 })).toBe(true)
  })

  it('a city outside the viewBox is not visible', () => {
    expect(isComfortablyVisible(ZOOMED, { x: 1200, y: 900 })).toBe(false)
  })

  it('a city just inside the edge margin counts as off-view', () => {
    // margin = 8% of 800 = 64 → x=30 is inside the box but within the margin
    expect(isComfortablyVisible(ZOOMED, { x: 30, y: 287 })).toBe(false)
  })

  it('every city is visible at the full-board view', () => {
    assertComfortable(FULL, { x: 800, y: 575 })
    assertComfortable(FULL, { x: 150, y: 150 })
    assertComfortable(FULL, { x: 1450, y: 1000 })
  })
})

describe('planPanToCity', () => {
  it('returns null when the city is already comfortably visible (no move)', () => {
    expect(planPanToCity(ZOOMED, { x: 400, y: 287 }, BOUNDS)).toBeNull()
  })

  it('returns null at the default full-board view — nothing can be off it', () => {
    expect(planPanToCity(FULL, { x: 1450, y: 1000 }, BOUNDS)).toBeNull()
  })

  it('a board-EDGE city at the full-board view is a no-move, not an overshoot', () => {
    // Warrington-like: inside the board but within the trigger margin. The
    // bounds clamp collapses the plan back to the current view → null,
    // instead of panning past the board edge into void.
    expect(planPanToCity(FULL, { x: 545, y: 78 }, BOUNDS)).toBeNull()
    expect(planPanToCity(FULL, { x: 40, y: 1120 }, BOUNDS)).toBeNull()
  })

  it('never pans past the board edge when reaching an edge city zoomed in', () => {
    // Coalbrookdale-like far-west city from a zoomed east view: the settle
    // margin would put x at ~-70; the clamp pins it at the board edge.
    const east: ViewBox = { x: 614, y: 193, w: 830, h: 597 }
    const target = planPanToCity(east, { x: 158, y: 615 }, BOUNDS)
    expect(target).not.toBeNull()
    expect(target!.x).toBeGreaterThanOrEqual(0)
    expect(target!.y).toBeGreaterThanOrEqual(0)
    expect(target!.x + target!.w).toBeLessThanOrEqual(BOUNDS.w + 0.001)
    expect(target!.y + target!.h).toBeLessThanOrEqual(BOUNDS.h + 0.001)
    assertComfortable(target!, { x: 158, y: 615 })
  })

  it('pans and slightly zooms out to reach an off-view city', () => {
    const target = planPanToCity(ZOOMED, { x: 1200, y: 900 }, BOUNDS)
    expect(target).not.toBeNull()
    // slight zoom-out: wider than before, but NOT reset to full board
    expect(target!.w).toBeGreaterThan(ZOOMED.w)
    expect(target!.w).toBeLessThan(BOUNDS.w)
    // aspect ratio preserved
    expect(target!.h / target!.w).toBeCloseTo(ZOOMED.h / ZOOMED.w, 5)
    // the city is comfortably visible in the destination
    assertComfortable(target!, { x: 1200, y: 900 })
  })

  it('the destination is stable: re-planning from it is a no-op (hysteresis)', () => {
    const pt = { x: 1200, y: 900 }
    const target = planPanToCity(ZOOMED, pt, BOUNDS)
    expect(target).not.toBeNull()
    expect(planPanToCity(target!, pt, BOUNDS)).toBeNull()
  })

  it('never zooms out past the full-board width', () => {
    const wide: ViewBox = { x: 0, y: 0, w: 1400, h: 1006.25 }
    const target = planPanToCity(wide, { x: 1550, y: 1100 }, BOUNDS)
    expect(target).not.toBeNull()
    expect(target!.w).toBeLessThanOrEqual(BOUNDS.w)
  })

  it('a view panned away at 1:1 zoom pans back without zooming in', () => {
    const pannedAway: ViewBox = { x: 1600, y: 0, w: 1600, h: 1150 }
    const target = planPanToCity(pannedAway, { x: 200, y: 200 }, BOUNDS)
    expect(target).not.toBeNull()
    expect(target!.w).toBe(1600) // no zoom change either way
    assertComfortable(target!, { x: 200, y: 200 })
  })

  it('pans the minimum distance: only the offending axis moves', () => {
    // city is off to the right but vertically centred — y should barely move
    const vb: ViewBox = { x: 100, y: 200, w: 800, h: 575 }
    const pt = { x: 1200, y: 487 }
    const target = planPanToCity(vb, pt, BOUNDS)
    expect(target).not.toBeNull()
    // the zoom-out recentre shifts y by (h' - h)/2 at most; no pan beyond that
    const recentreShift = (target!.h - vb.h) / 2
    expect(Math.abs(target!.y - (vb.y - recentreShift))).toBeLessThan(0.001)
    assertComfortable(target!, pt)
  })
})

describe('easeInOutCubic', () => {
  it('anchors at 0 and 1, midpoint at 0.5, monotonic', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5)
    let prev = 0
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeInOutCubic(Math.min(t, 1))
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})
