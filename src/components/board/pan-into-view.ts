// Card-hover map sync: when the player hovers a hand card whose city sits
// outside the current map viewport, the map pans (and zooms out slightly)
// to bring that city into view. This module is the PURE decision half —
// given the current SVG viewBox and the city's board position it answers
// "should the map move, and to where?" so the trigger logic is unit-testable
// without a DOM. The animated application lives in `board-map.tsx`.
//
// Hysteresis by design: a city counts as "already visible" inside a slim
// TRIGGER margin, but when we do move, the city is placed inside a deeper
// SETTLE margin — so the destination never sits on the trigger boundary and
// a re-hover of the same card is a no-op.

import { clampAxis } from './viewport'

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

/** Fraction of the viewport treated as edge — inside it a city is "off view". */
const TRIGGER_MARGIN_FRAC = 0.08
/** Where a panned-to city lands, measured from the viewport edge. */
const SETTLE_MARGIN_FRAC = 0.22
/** Slight zoom-out applied when panning, so arrival keeps some context. */
const ZOOM_OUT_FACTOR = 1.25

/** Debounce before a hovered card may move the map (rapid tray sweeps). */
export const FOCUS_PAN_DEBOUNCE_MS = 220
/** Duration of the animated pan. */
export const FOCUS_PAN_ANIMATION_MS = 450

/** Ease-in-out cubic — gentle start and stop for the animated pan. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** True when `pt` sits comfortably inside `vb` (outside the edge margin). */
export function isComfortablyVisible(vb: ViewBox, pt: Point): boolean {
  const mx = vb.w * TRIGGER_MARGIN_FRAC
  const my = vb.h * TRIGGER_MARGIN_FRAC
  return (
    pt.x >= vb.x + mx &&
    pt.x <= vb.x + vb.w - mx &&
    pt.y >= vb.y + my &&
    pt.y <= vb.y + vb.h - my
  )
}

/**
 * Plan the viewBox that brings `pt` comfortably into view, or `null` when no
 * move is needed (already visible). The plan:
 *  - zooms out slightly (never past the full-board size `bounds`, and never
 *    zooms IN — an already-wide view only pans),
 *  - then pans the MINIMUM distance that lands the city inside the settle
 *    margin — it does not recentre, so the view stays near where the player
 *    left it.
 */
export function planPanToCity(
  vb: ViewBox,
  pt: Point,
  bounds: { w: number; h: number },
): ViewBox | null {
  if (isComfortablyVisible(vb, pt)) return null

  // Slight zoom-out about the viewport centre, clamped to full-board width.
  const w = vb.w < bounds.w ? Math.min(vb.w * ZOOM_OUT_FACTOR, bounds.w) : vb.w
  const h = (w / vb.w) * vb.h
  let x = vb.x - (w - vb.w) / 2
  let y = vb.y - (h - vb.h) / 2

  // Minimal pan: shift each axis only as far as needed to place the city
  // inside the settle margin.
  const mx = w * SETTLE_MARGIN_FRAC
  const my = h * SETTLE_MARGIN_FRAC
  if (pt.x < x + mx) x = pt.x - mx
  else if (pt.x > x + w - mx) x = pt.x - w + mx
  if (pt.y < y + my) y = pt.y - my
  else if (pt.y > y + h - my) y = pt.y - h + my

  // Never pan past the board edge into void: a city that LIVES inside the
  // settle margin (board-edge cities) is served by the nearest in-bounds
  // view, not by overshooting. When the view is wider than the board the
  // valid range inverts — the board then floats with void on both sides.
  x = clampAxis(x, w, bounds.w)
  y = clampAxis(y, h, bounds.h)

  // Clamping can collapse the plan to where we already are (an edge city
  // hovered at the full-board view) — that is "no move", not a pan.
  if (
    Math.abs(x - vb.x) < 0.5 &&
    Math.abs(y - vb.y) < 0.5 &&
    Math.abs(w - vb.w) < 0.5
  ) {
    return null
  }

  return { x, y, w, h }
}
