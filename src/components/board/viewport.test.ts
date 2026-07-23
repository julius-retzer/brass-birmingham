import { describe, expect, it } from 'vitest'
import { VIEW_H, VIEW_W } from './board-data'
import {
  FULL_VIEW,
  MAX_VIEW_W,
  MIN_VIEW_W,
  type ViewBox,
  clampView,
  contentBox,
  panByPixels,
  pinchView,
  pointFraction,
  sizeForWidth,
  zoomAtFraction,
} from './viewport'

/** A phone-shaped board frame: taller than the board, so it letterboxes. */
const PHONE = { left: 18, top: 260, width: 354, height: 391 }
/** A desktop-shaped frame: wider than the board — letterboxes sideways. */
const DESKTOP = { left: 0, top: 0, width: 1200, height: 700 }

describe('contentBox', () => {
  it('letterboxes vertically in a frame taller than the board', () => {
    const c = contentBox(PHONE)
    expect(c.width).toBeCloseTo(354, 5)
    expect(c.height).toBeCloseTo(354 / (VIEW_W / VIEW_H), 5)
    // centred: equal bars top and bottom
    expect(c.top - PHONE.top).toBeCloseTo(
      PHONE.top + PHONE.height - (c.top + c.height),
      5,
    )
    expect(c.height).toBeLessThan(PHONE.height)
  })

  it('letterboxes horizontally in a frame wider than the board', () => {
    const c = contentBox(DESKTOP)
    expect(c.height).toBeCloseTo(700, 5)
    expect(c.width).toBeCloseTo(700 * (VIEW_W / VIEW_H), 5)
    expect(c.width).toBeLessThan(DESKTOP.width)
  })

  it('is the rect itself when the aspects match', () => {
    const exact = { left: 5, top: 7, width: VIEW_W, height: VIEW_H }
    const c = contentBox(exact)
    expect(c).toEqual(exact)
  })

  it('survives a zero-sized rect (pre-layout render)', () => {
    const zero = { left: 0, top: 0, width: 0, height: 0 }
    expect(contentBox(zero)).toEqual(zero)
    expect(pointFraction(zero, 10, 10)).toEqual({ fx: 0.5, fy: 0.5 })
  })
})

describe('pointFraction', () => {
  it('measures against the content box, not the element rect', () => {
    const c = contentBox(PHONE)
    // The top of the PAINTED board — inside the element, below its top edge.
    expect(pointFraction(PHONE, c.left, c.top).fy).toBeCloseTo(0, 5)
    // Measuring against the raw rect would have said ~0.17 here.
    expect((c.top - PHONE.top) / PHONE.height).toBeGreaterThan(0.15)
    expect(pointFraction(PHONE, c.left + c.width, c.top + c.height)).toEqual({
      fx: 1,
      fy: 1,
    })
    expect(
      pointFraction(PHONE, c.left + c.width / 2, c.top + c.height / 2),
    ).toEqual({ fx: 0.5, fy: 0.5 })
  })
})

describe('sizeForWidth', () => {
  it('keeps the board aspect', () => {
    const s = sizeForWidth(800)
    expect(s.w / s.h).toBeCloseTo(VIEW_W / VIEW_H, 10)
  })

  it('clamps both zoom bounds', () => {
    expect(sizeForWidth(1).w).toBe(MIN_VIEW_W)
    expect(sizeForWidth(999_999).w).toBe(MAX_VIEW_W)
  })
})

describe('clampView', () => {
  it('keeps a zoomed-in view over the board', () => {
    const v: ViewBox = { x: -900, y: -900, w: 400, h: 400 / (VIEW_W / VIEW_H) }
    const c = clampView(v)
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
    const far = clampView({ ...v, x: 9999, y: 9999 })
    expect(far.x).toBe(VIEW_W - v.w)
    expect(far.y).toBe(VIEW_H - v.h)
  })

  it('leaves the full-board view alone', () => {
    expect(clampView(FULL_VIEW)).toEqual(FULL_VIEW)
  })

  it('centres a view wider than the board instead of fighting it', () => {
    const wide = {
      x: 5000,
      y: 5000,
      w: MAX_VIEW_W,
      h: MAX_VIEW_W / (VIEW_W / VIEW_H),
    }
    const c = clampView(wide)
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
    const under = clampView({ ...wide, x: -5000, y: -5000 })
    expect(under.x).toBe(VIEW_W - wide.w)
    expect(under.y).toBe(VIEW_H - wide.h)
  })
})

describe('zoomAtFraction', () => {
  it('holds the anchored board point still while zooming in', () => {
    const v = FULL_VIEW
    const fx = 0.3
    const fy = 0.7
    const before = { x: v.x + v.w * fx, y: v.y + v.h * fy }
    const z = zoomAtFraction(v, 1 / 2, fx, fy)
    expect(z.w).toBeCloseTo(VIEW_W / 2, 5)
    expect(z.x + z.w * fx).toBeCloseTo(before.x, 5)
    expect(z.y + z.h * fy).toBeCloseTo(before.y, 5)
  })

  it('matches the centre-anchored maths the +/- buttons use', () => {
    const v = { x: 100, y: 50, w: 800, h: 800 / (VIEW_W / VIEW_H) }
    const z = zoomAtFraction(v, 1 / 1.3, 0.5, 0.5)
    const w = v.w / 1.3
    const h = w / (VIEW_W / VIEW_H)
    expect(z).toEqual(
      clampView({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h }),
    )
  })

  it('never zooms past the bounds', () => {
    let v: ViewBox = FULL_VIEW
    for (let i = 0; i < 40; i++) v = zoomAtFraction(v, 1 / 1.3, 0.5, 0.5)
    expect(v.w).toBe(MIN_VIEW_W)
    for (let i = 0; i < 40; i++) v = zoomAtFraction(v, 1.3, 0.5, 0.5)
    expect(v.w).toBe(MAX_VIEW_W)
  })
})

describe('panByPixels', () => {
  it('moves the board with the finger, in both axes', () => {
    const v = { x: 400, y: 300, w: 400, h: 400 / (VIEW_W / VIEW_H) }
    const c = contentBox(PHONE)
    const p = panByPixels(v, PHONE, 20, 20)
    // Dragging right/down moves the viewBox left/up by the same board distance.
    expect(v.x - p.x).toBeCloseTo((20 / c.width) * v.w, 5)
    expect(v.y - p.y).toBeCloseTo((20 / c.height) * v.h, 5)
    // Both axes share the same px→board scale (the letterbox bug made the
    // vertical one ~1.5x too slow on a phone).
    expect((v.x - p.x) / (v.y - p.y)).toBeCloseTo(1, 5)
  })

  it('cannot pan the board out of view', () => {
    const v = { x: 0, y: 0, w: 400, h: 400 / (VIEW_W / VIEW_H) }
    const p = panByPixels(v, PHONE, 100_000, 100_000)
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
  })
})

describe('pinchView', () => {
  const start = { view: FULL_VIEW, fx: 0.5, fy: 0.5, dist: 100 }

  it('zooms in as the fingers spread, about their midpoint', () => {
    const v = pinchView(start, 200, 0.5, 0.5)
    expect(v.w).toBeCloseTo(VIEW_W / 2, 5)
    // The grabbed board point stays under the midpoint.
    expect(v.x + v.w * 0.5).toBeCloseTo(VIEW_W / 2, 5)
    expect(v.y + v.h * 0.5).toBeCloseTo(VIEW_H / 2, 5)
  })

  it('zooms out as the fingers close', () => {
    const inner = { ...start, view: { x: 600, y: 400, w: 400, h: 287.5 } }
    expect(pinchView(inner, 50, 0.5, 0.5).w).toBeCloseTo(800, 5)
  })

  it('pans when both fingers move together (no distance change)', () => {
    const inner = {
      view: { x: 600, y: 400, w: 400, h: 287.5 },
      fx: 0.5,
      fy: 0.5,
      dist: 100,
    }
    const v = pinchView(inner, 100, 0.75, 0.75)
    expect(v.w).toBeCloseTo(400, 5)
    // Midpoint moved a quarter-viewport right/down ⇒ the board follows it.
    expect(v.x).toBeCloseTo(600 - 0.25 * 400, 5)
    expect(v.y).toBeCloseTo(400 - 0.25 * 287.5, 5)
  })

  it('holds still on a degenerate distance', () => {
    expect(pinchView(start, 0, 0.5, 0.5)).toEqual(start.view)
    expect(pinchView({ ...start, dist: 0 }, 100, 0.5, 0.5)).toEqual(start.view)
  })

  it('respects the zoom bounds and the board edges', () => {
    const v = pinchView(start, 100_000, 0.5, 0.5)
    expect(v.w).toBe(MIN_VIEW_W)
    const out = pinchView(start, 0.0001, 0.5, 0.5)
    expect(out.w).toBe(MAX_VIEW_W)
    const edge = pinchView(start, 400, 0, 0)
    expect(edge.x).toBeGreaterThanOrEqual(0)
    expect(edge.y).toBeGreaterThanOrEqual(0)
  })
})
