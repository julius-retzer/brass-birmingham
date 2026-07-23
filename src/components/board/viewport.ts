// Board pan/zoom maths — the PURE half of the map's gesture handling, so the
// awkward parts (letterboxing, zoom bounds, pinch about a MOVING midpoint) are
// unit-testable without a DOM. The event plumbing lives in `board-map.tsx`.
//
// The one non-obvious thing here is the CONTENT BOX. The svg is drawn with the
// default `preserveAspectRatio="xMidYMid meet"`, so the board is letterboxed
// inside its element whenever the element's aspect differs from the board's —
// on a phone that is ~68px of empty bar above and below a 391px-tall frame.
// Client→board maths must measure against that content box, not the element
// rect: measuring against the rect made vertical panning ~1.5x too slow on a
// phone and slid the pinch focal point away from the fingers.

import { VIEW_H, VIEW_W } from './board-data'

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Deepest zoom-in, as a viewBox width. 1600/6 ⇒ ~69px city slots at 390px. */
export const MIN_VIEW_W = VIEW_W / 6
/** Furthest zoom-out — a little wider than the board, for context. */
export const MAX_VIEW_W = VIEW_W * 1.3
/** Every view keeps the board's aspect, so the map never distorts. */
export const VIEW_ASPECT = VIEW_W / VIEW_H

/** The whole-board view — what the reset/home control returns to. */
export const FULL_VIEW: ViewBox = { x: 0, y: 0, w: VIEW_W, h: VIEW_H }

/**
 * Clamp a viewBox origin so the view stays over the board. When the view is
 * WIDER than the board the valid range inverts — the board then floats with
 * void on both sides, so the clamp centres rather than fights it.
 */
export function clampAxis(v: number, size: number, boundSize: number): number {
  const lo = Math.min(0, boundSize - size)
  const hi = Math.max(0, boundSize - size)
  return Math.min(Math.max(v, lo), hi)
}

/** Size a view from a requested width: board aspect kept, zoom bounds applied. */
export function sizeForWidth(w: number): { w: number; h: number } {
  const cw = Math.min(Math.max(w, MIN_VIEW_W), MAX_VIEW_W)
  return { w: cw, h: cw / VIEW_ASPECT }
}

/** Keep the view over the board (both axes). */
export function clampView(v: ViewBox): ViewBox {
  return {
    x: clampAxis(v.x, v.w, VIEW_W),
    y: clampAxis(v.y, v.h, VIEW_H),
    w: v.w,
    h: v.h,
  }
}

/**
 * The letterboxed content box of the board inside its element — where the
 * board is ACTUALLY painted under `preserveAspectRatio="xMidYMid meet"`.
 */
export function contentBox(rect: Box): Box {
  if (rect.width <= 0 || rect.height <= 0) return rect
  const boxAspect = rect.width / rect.height
  const width = boxAspect > VIEW_ASPECT ? rect.height * VIEW_ASPECT : rect.width
  const height =
    boxAspect > VIEW_ASPECT ? rect.height : rect.width / VIEW_ASPECT
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  }
}

/**
 * Where a client point sits inside the content box, as a 0..1 fraction.
 * Points in the letterbox bars fall outside 0..1 — deliberately not clamped,
 * so a zoom anchored there still leans the right way.
 */
export function pointFraction(
  rect: Box,
  clientX: number,
  clientY: number,
): { fx: number; fy: number } {
  const c = contentBox(rect)
  if (c.width <= 0 || c.height <= 0) return { fx: 0.5, fy: 0.5 }
  return {
    fx: (clientX - c.left) / c.width,
    fy: (clientY - c.top) / c.height,
  }
}

/**
 * Zoom by `factor` (>1 zooms OUT — it scales the viewBox) while the board
 * point under the content-box fraction (fx, fy) stays put.
 */
export function zoomAtFraction(
  v: ViewBox,
  factor: number,
  fx: number,
  fy: number,
): ViewBox {
  const { w, h } = sizeForWidth(v.w * factor)
  return clampView({
    x: v.x + (v.w - w) * fx,
    y: v.y + (v.h - h) * fy,
    w,
    h,
  })
}

/** Pan by a client-pixel delta measured on the element `rect`. */
export function panByPixels(
  v: ViewBox,
  rect: Box,
  dxPx: number,
  dyPx: number,
): ViewBox {
  const c = contentBox(rect)
  if (c.width <= 0 || c.height <= 0) return v
  return clampView({
    x: v.x - (dxPx / c.width) * v.w,
    y: v.y - (dyPx / c.height) * v.h,
    w: v.w,
    h: v.h,
  })
}

/** Everything a pinch needs to remember from the moment it began. */
export interface PinchStart {
  view: ViewBox
  /** Content-box fraction of the two fingers' midpoint at gesture start. */
  fx: number
  fy: number
  /** Distance between the fingers at gesture start, in client px. */
  dist: number
}

/**
 * One pinch frame: scale about the midpoint AND follow it, so two fingers
 * moving together pan the board (a phone player expects both from one
 * gesture). Falls back to the start view for a degenerate distance.
 */
export function pinchView(
  start: PinchStart,
  dist: number,
  fx: number,
  fy: number,
): ViewBox {
  if (dist <= 0 || start.dist <= 0) return start.view
  const { w, h } = sizeForWidth(start.view.w * (start.dist / dist))
  // The board point the fingers grabbed, now placed under where they are.
  const wx = start.view.x + start.view.w * start.fx
  const wy = start.view.y + start.view.h * start.fy
  return clampView({ x: wx - w * fx, y: wy - h * fy, w, h })
}
