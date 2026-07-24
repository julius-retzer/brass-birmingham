// Phone-only step-change scrolling: when a wizard step changes, the surface
// that owns the NEXT tap may sit off-viewport (the board while you were
// reading the dock, the dock's confirm while you were panning the map). The
// fix is not to pin any text over the game — it is to bring the tap target
// itself on screen. This module is the pure decision half; the shells apply
// it with scrollIntoView.
//
// One rule guards it: never fight the player. A scroll or board pan inside
// SCROLL_SUPPRESS_MS means they went somewhere on purpose — the step change
// yields, the same hysteresis idea pan-into-view.ts encodes for hover-pan.

/** Which surface owns the step's next tap. */
export type StepSurface = 'board' | 'dock'

/** Recent user scroll/pan wins over the auto-scroll for this long. */
export const SCROLL_SUPPRESS_MS = 2000

const BOARD_STEPS = [
  'playing.action.building.selectingLocation',
  'playing.action.networking.selectingLink',
  'playing.action.networking.selectingSecondLink',
  // Source picks are board taps too — the map spotlights the candidates.
  'playing.action.selling.choosingBeerSource',
  'playing.action.networking.choosingDoubleLinkBeer',
  'playing.action.building.choosingIronSource',
  'playing.action.developing.choosingIronSource',
  'playing.action.building.choosingCoalSource',
  'playing.action.networking.choosingLinkCoal',
  'playing.action.networking.choosingDoubleLinkCoal',
]

// Confirm and sale steps live in the dock. Card-pick steps deliberately map
// to nothing: the hand tray is bottom-fixed and always on screen, and the
// develop steps open a full-screen modal that needs no scrolling.
const DOCK_STEPS = [
  'playing.action.building.confirmingBuild',
  'playing.action.networking.confirmingLink',
  'playing.action.networking.confirmingDoubleLink',
  'playing.action.takingLoan.confirmingLoan',
  'playing.action.selling.selectingSale',
]

/** Serialize the step the state is parked in, for change detection. */
export function stepKey(matches: (path: never) => boolean): string | null {
  for (const path of [...BOARD_STEPS, ...DOCK_STEPS]) {
    if (matches(path as never)) return path
  }
  return null
}

/** The surface a step's next tap lives on, or null when nothing should move. */
export function stepScrollTarget(
  matches: (path: never) => boolean,
): StepSurface | null {
  if (BOARD_STEPS.some((p) => matches(p as never))) return 'board'
  if (DOCK_STEPS.some((p) => matches(p as never))) return 'dock'
  return null
}

/**
 * Should this step change scroll? Only when the step actually changed, only
 * on a scrolling layout (phone — desktop is viewport-locked), and only when
 * the player hasn't just scrolled or panned somewhere themselves.
 */
export function shouldStepScroll(args: {
  prevStep: string | null
  step: string | null
  isPhone: boolean
  now: number
  lastUserScrollAt: number | null
}): boolean {
  const { prevStep, step, isPhone, now, lastUserScrollAt } = args
  if (!isPhone || step === null || step === prevStep) return false
  if (lastUserScrollAt !== null && now - lastUserScrollAt < SCROLL_SUPPRESS_MS)
    return false
  return true
}
