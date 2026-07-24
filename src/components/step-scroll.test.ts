import { describe, expect, it } from 'vitest'
import {
  SCROLL_SUPPRESS_MS,
  shouldStepScroll,
  stepKey,
  stepScrollTarget,
} from './step-scroll'

const matchesOnly = (step: string) => (path: never) => (path as string) === step

describe('stepScrollTarget', () => {
  it.each([
    'playing.action.building.selectingLocation',
    'playing.action.networking.selectingLink',
    'playing.action.networking.selectingSecondLink',
    'playing.action.selling.choosingBeerSource',
    'playing.action.building.choosingIronSource',
    'playing.action.building.choosingCoalSource',
  ])('%s is a board tap', (step) => {
    expect(stepScrollTarget(matchesOnly(step))).toBe('board')
  })

  it.each([
    'playing.action.building.confirmingBuild',
    'playing.action.networking.confirmingLink',
    'playing.action.networking.confirmingDoubleLink',
    'playing.action.takingLoan.confirmingLoan',
    'playing.action.selling.selectingSale',
  ])('%s is a dock step', (step) => {
    expect(stepScrollTarget(matchesOnly(step))).toBe('dock')
  })

  it('card-pick and develop steps move nothing (tray is fixed, modal covers)', () => {
    for (const step of [
      'playing.action.selectingAction',
      'playing.action.building.selectingCard',
      'playing.action.developing.selectingTiles',
      'playing.action.developing.confirmingDevelop',
      'playing.action.scouting.selectingCards',
    ]) {
      expect(stepScrollTarget(matchesOnly(step))).toBeNull()
    }
  })
})

describe('stepKey', () => {
  it('names the parked step and returns null off the wizard', () => {
    expect(
      stepKey(matchesOnly('playing.action.building.selectingLocation')),
    ).toBe('playing.action.building.selectingLocation')
    expect(stepKey(matchesOnly('playing.idle'))).toBeNull()
  })
})

describe('shouldStepScroll', () => {
  const base = {
    prevStep: null,
    step: 'playing.action.building.selectingLocation',
    isPhone: true,
    now: 10_000,
    lastUserScrollAt: null,
  }

  it('scrolls on a fresh step change on phone', () => {
    expect(shouldStepScroll(base)).toBe(true)
  })

  it('never scrolls on desktop', () => {
    expect(shouldStepScroll({ ...base, isPhone: false })).toBe(false)
  })

  it('does not re-scroll while parked in the same step', () => {
    expect(shouldStepScroll({ ...base, prevStep: base.step })).toBe(false)
  })

  it('does nothing when the step owns no surface', () => {
    expect(shouldStepScroll({ ...base, step: null })).toBe(false)
  })

  it('yields to a player scroll inside the suppression window', () => {
    expect(
      shouldStepScroll({
        ...base,
        lastUserScrollAt: base.now - SCROLL_SUPPRESS_MS + 1,
      }),
    ).toBe(false)
    expect(
      shouldStepScroll({
        ...base,
        lastUserScrollAt: base.now - SCROLL_SUPPRESS_MS,
      }),
    ).toBe(true)
  })
})
