// Pure geometry for the hand fan: spacing that always fits the tray width,
// macOS-dock style neighbour shifts around a raised card, and the horizontal
// clamp that keeps a magnified edge card on screen. Kept free of React so the
// unit suite can pin the math (see hand-tray-layout.test.ts).

/** Card box in layout px — must match .bb2-card in theme.css. */
export const CARD_W = 108
export const CARD_H = 156

/** Default centre-to-centre distance between fanned cards (108 − 2×17). */
export const FAN_SPACING = 74

/** Tightest packing we allow — the visible slice of a covered card. */
export const MIN_SPACING = 26

/** How a raised card magnifies: visual scale + how far it lifts, per pointer. */
export interface LensPreset {
  scale: number
  rise: number
}
export const LENS_FINE: LensPreset = { scale: 1.6, rise: 40 }
export const LENS_COARSE: LensPreset = { scale: 2.1, rise: 76 }

/** Fan rotation of card `index` in a hand of `count`, degrees. */
export function fanAngle(index: number, count: number): number {
  return (index - (count - 1) / 2) * (count > 6 ? 4 : 5.5)
}

/** How far card `index` sinks toward the table edge, layout px. */
export function fanLift(index: number, count: number): number {
  return Math.abs(index - (count - 1) / 2) * (count > 6 ? 5 : 7)
}

/** Seat rotation pivot: transform-origin 50% 120% (see .bb2-hand in theme.css). */
const PIVOT_Y = 1.2 * CARD_H

/**
 * Horizontal reach of an outermost card beyond its centre once rotated:
 * the top outer corner (PIVOT_Y above the pivot) swings outward by sinθ.
 */
function rotatedReach(count: number): number {
  const theta = (Math.abs(fanAngle(0, count)) * Math.PI) / 180
  return (CARD_W / 2) * Math.cos(theta) + PIVOT_Y * Math.sin(theta)
}

export interface FanLayout {
  /** Centre-to-centre distance between adjacent cards, layout px. */
  spacing: number
  /** Horizontal margin applied to each side of a card seat (negative = overlap). */
  marginX: number
}

/**
 * Spacing that fits `count` cards into `width` layout px — including the
 * horizontal overhang the outermost cards gain from their fan rotation.
 * Falls back to the classic fan when the width is unknown (SSR / first
 * paint) or roomy.
 */
export function fanLayout(count: number, width: number | null): FanLayout {
  let spacing = FAN_SPACING
  if (count > 1 && width !== null) {
    const pad = 8
    const usable = width - 2 * pad - 2 * rotatedReach(count)
    spacing = Math.max(MIN_SPACING, Math.min(FAN_SPACING, usable / (count - 1)))
  }
  return { spacing, marginX: (spacing - CARD_W) / 2 }
}

/**
 * Dock effect: neighbours slide away from the raised card so its magnified
 * visual (which overhangs by CARD_W·(scale−1)/2 per side) doesn't bury them.
 */
export function dockShift(
  index: number,
  raisedIndex: number | null,
  scale: number,
): number {
  if (raisedIndex === null || index === raisedIndex) return 0
  const d = index - raisedIndex
  const falloff = Math.abs(d) === 1 ? 0.8 : Math.abs(d) === 2 ? 0.3 : 0
  const overhang = (CARD_W * (scale - 1)) / 2
  return Math.sign(d) * falloff * overhang
}

/**
 * Horizontal correction for a raised card near the tray edge so the
 * magnified visual stays inside the tray instead of running off screen.
 */
export function lensShiftX(
  index: number,
  count: number,
  spacing: number,
  width: number | null,
  scale: number,
): number {
  if (width === null) return 0
  const pad = 8
  const centerX = width / 2 + (index - (count - 1) / 2) * spacing
  const half = (CARD_W * scale) / 2
  if (centerX - half < pad) return pad + half - centerX
  if (centerX + half > width - pad) return width - pad - half - centerX
  return 0
}

/** How far above its seat the magnified visual reaches, layout px. */
export function lensReach(lens: LensPreset): number {
  return lens.rise + CARD_H * (lens.scale - 1)
}
