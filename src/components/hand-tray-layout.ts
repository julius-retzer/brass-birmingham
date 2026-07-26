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

/**
 * A selected card keeps a persistent, smaller lens until it is deselected or
 * the action completes. Deliberately modest: it must not bury neighbours
 * (no dock shifts in the persistent state) nor occlude the dock's controls,
 * which sit right above the tray on phones.
 */
export const LENS_SELECTED: LensPreset = { scale: 1.3, rise: 18 }

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

/** Reorder-handle diameter, layout px — thumb sized on a coarse pointer. */
const MOVE_HANDLE_FINE = 30
const MOVE_HANDLE_COARSE = 52
/** Gap between a handle and the edge of the magnified card. */
const MOVE_HANDLE_GAP = 10

export interface MoveHandleLayout {
  /** Button diameter. */
  size: number
  /** Width of the strip that carries both buttons, one at each end. */
  width: number
  /** Offset of the strip above the seat's bottom edge. */
  bottom: number
}

/**
 * Where the ◀ ▶ reorder handles sit: FLANKING the magnified card, vertically
 * centred on it, never over it. Two reasons they hang outside rather than on
 * top: the card's own tap point must stay clear (the second tap on a peeked
 * card is how touch selects it), and a control over the face buries the card
 * the player is trying to read.
 */
export function moveHandleLayout(
  lens: LensPreset,
  coarse: boolean,
): MoveHandleLayout {
  const size = coarse ? MOVE_HANDLE_COARSE : MOVE_HANDLE_FINE
  return {
    size,
    width: CARD_W * lens.scale + 2 * (size + MOVE_HANDLE_GAP),
    bottom: lens.rise + (CARD_H * lens.scale) / 2 - size / 2,
  }
}

/**
 * Horizontal correction that keeps the handle strip inside the tray. Same job
 * as lensShiftX, but it cannot reuse it: the strip is far wider than a card
 * AND it rides high above the seat, where the fan's rotation about the
 * 50% 120% pivot has swung it sideways by a visible amount (the lens is low
 * and narrow enough that lensShiftX can ignore that term; the strip is not).
 */
export function moveHandleShiftX(
  index: number,
  count: number,
  spacing: number,
  width: number | null,
  handles: MoveHandleLayout,
): number {
  if (width === null) return 0
  const pad = 8
  const theta = (fanAngle(index, count) * Math.PI) / 180
  // Height of the strip's centre above the rotation pivot (which sits
  // PIVOT_Y below the seat's TOP, i.e. PIVOT_Y − CARD_H below its bottom).
  const above = handles.bottom + handles.size / 2 + PIVOT_Y - CARD_H
  const centerX =
    width / 2 + (index - (count - 1) / 2) * spacing + above * Math.sin(theta)
  const half = handles.width / 2
  if (centerX - half < pad) return pad + half - centerX
  if (centerX + half > width - pad) return width - pad - half - centerX
  return 0
}

/** Smallest comfortable touch target, CSS px. */
const TOUCH_MIN_PX = 44
/** Tray scale on a phone — mirrors --bb-hand-scale in theme.css. */
export const PHONE_HAND_SCALE = 0.72
/**
 * Height of the act tab on a peeked card, LAYOUT px. Everything in this module
 * is measured before the tray scales itself down, so a tab sized to the touch
 * minimum directly would land at 30 real px on a phone.
 */
const ACT_TAB_H = Math.ceil(TOUCH_MIN_PX / PHONE_HAND_SCALE)
/** Side margin between the tab and the edges of the card's hitbox. */
const ACT_TAB_INSET_X = 4
/** How far the tab sits inside the magnified visual's lower edge. */
const ACT_TAB_INSET_Y = 14

export interface ActTabLayout {
  /** Tab height. */
  height: number
  /** Tab width. */
  width: number
  /** Offset of the tab's bottom edge above the seat's bottom edge. */
  bottom: number
}

/**
 * Where the act tab sits on a peeked card — the label that says what a second
 * tap will do, because touch has no hover to reveal it. It rides just inside
 * the LOWER edge of the magnified visual: on the card, so it plainly belongs
 * to it, but below the centred artwork and clear of the ◀ ▶ reorder handles,
 * which flank the card's middle. Low is deliberate — it keeps the tab under the
 * thumb that just tapped — but not so low that it lands on the screen edge the
 * tray already overhangs.
 *
 * It stays INSIDE the card's own 108-wide hitbox, because the card is what
 * takes the tap: the tab is the target the finger aims at, and the button
 * beneath it is the one that acts.
 */
export function actTabLayout(lens: LensPreset): ActTabLayout {
  return {
    height: ACT_TAB_H,
    width: CARD_W - 2 * ACT_TAB_INSET_X,
    bottom: lens.rise + ACT_TAB_INSET_Y,
  }
}

/**
 * Horizontal placement of the act tab, from the shift its lens already took.
 * It follows that clamp only as far as its own side margin allows: the lens can
 * slide a long way inward on an edge card, while the hitbox that takes the tap
 * neither moves nor grows sideways — so a tab carried the whole way would hang
 * over the seat next door, and a finger aiming at the label would land on the
 * wrong card.
 */
export function actTabShiftX(lensShift: number, tab: ActTabLayout): number {
  const slack = (CARD_W - tab.width) / 2
  return Math.max(-slack, Math.min(slack, lensShift))
}

/** How far above its seat the magnified visual reaches, layout px. */
export function lensReach(lens: LensPreset): number {
  return lens.rise + CARD_H * (lens.scale - 1)
}

/**
 * Which card of the fan sits under layout-x position `x` — the drag-to-browse
 * mapping. Uses the resting seat centres (width/2 + (i − (n−1)/2)·spacing),
 * NOT the live DOM boxes: dock shifts move seats while browsing, and mapping
 * against moving targets makes the highlight jitter under a still finger.
 * Positions beyond the outermost centres clamp to the edge cards, so a sweep
 * past the fan's end stays on the last card instead of dropping the raise.
 */
export function cardIndexAtX(
  x: number,
  count: number,
  spacing: number,
  width: number,
): number {
  if (count <= 1) return 0
  const i = Math.round((x - width / 2) / spacing + (count - 1) / 2)
  return Math.max(0, Math.min(count - 1, i))
}
