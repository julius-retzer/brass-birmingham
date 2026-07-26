import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import type { Card } from '../data/cards'
import { getInitialPlayerIndustryTilesWithQuantities } from '../data/industryTiles'
import { gameStore } from '../store/gameStore'
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
  ])('%s is a board tap', (step) => {
    expect(stepScrollTarget(matchesOnly(step))).toBe('board')
  })

  it('a committed card is a dock step — the action list is the next tap', () => {
    expect(stepScrollTarget(matchesOnly('playing.action.cardSelected'))).toBe(
      'dock',
    )
  })

  it.each([
    'playing.action.building.confirmingBuild',
    'playing.action.networking.confirmingLink',
    'playing.action.networking.confirmingDoubleLink',
    'playing.action.takingLoan.confirmingLoan',
    'playing.action.selling.selectingSale',
    'playing.action.selling.choosingBeerSource',
    'playing.action.networking.choosingDoubleLinkBeer',
    'playing.action.building.choosingIronSource',
    'playing.action.building.choosingCoalSource',
    'playing.action.networking.choosingLinkCoal',
    'playing.action.networking.choosingDoubleLinkCoal',
  ])('%s is a dock step', (step) => {
    expect(stepScrollTarget(matchesOnly(step))).toBe('dock')
  })

  it('card-PICK and develop steps move nothing (tray is fixed, modal covers)', () => {
    for (const step of [
      'playing.action.selectingAction',
      'playing.action.building.selectingCard',
      'playing.action.developing.selectingTiles',
      'playing.action.developing.choosingIronSource',
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

/**
 * The peek/commit split, pinned against the real machine.
 *
 * On touch the first tap only PEEKS a card (`hand-tray.tsx` local state, no
 * event) and the second one plays it. The scroll therefore has to be driven by
 * the machine's state, which is what makes a peek incapable of moving the view:
 * no event, no step change, nothing to scroll to.
 */
describe('the scroll target follows the machine, not a tap', () => {
  const coalCard = {
    id: 'ss_ind_coal',
    type: 'industry',
    industries: ['coal'],
  } as Card

  const targetOf = (snapshot: { matches: (p: never) => boolean }) =>
    stepScrollTarget((p: never) => snapshot.matches(p))

  const startedGame = () => {
    const actor = createActor(gameStore)
    actor.start()
    actor.send({
      type: 'START_GAME',
      players: [
        {
          id: '1',
          name: 'Scroll One',
          money: 30,
          victoryPoints: 0,
          income: 10,
          color: 'red' as const,
          character: 'Richard Arkwright' as const,
          industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
        },
        {
          id: '2',
          name: 'Scroll Two',
          money: 30,
          victoryPoints: 0,
          income: 10,
          color: 'green' as const,
          character: 'Eliza Tinsley' as const,
          industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
        },
      ],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: actor.getSnapshot().context.currentPlayerIndex,
      hand: [coalCard],
    })
    return actor
  }

  it('holding a card lands on the dock; a peek sends nothing so nothing moves', () => {
    const actor = startedGame()

    // Idle — and a peek leaves the machine exactly here.
    const idle = actor.getSnapshot()
    expect(idle.matches({ playing: { action: 'selectingAction' } })).toBe(true)
    expect(targetOf(idle)).toBeNull()
    expect(stepKey((p: never) => idle.matches(p))).toBeNull()

    // The committing tap.
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    const held = actor.getSnapshot()
    expect(held.matches({ playing: { action: 'cardSelected' } })).toBe(true)
    expect(targetOf(held)).toBe('dock')
    expect(stepKey((p: never) => held.matches(p))).toBe(
      'playing.action.cardSelected',
    )

    // Putting the card back is a step change too — back to nothing to scroll.
    actor.send({ type: 'CANCEL' })
    expect(targetOf(actor.getSnapshot())).toBeNull()
  })

  it('the dock scroll fires once per hold, and yields to a player scroll', () => {
    const actor = startedGame()
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    const step = stepKey((p: never) => actor.getSnapshot().matches(p))

    expect(
      shouldStepScroll({
        prevStep: null,
        step,
        isPhone: true,
        now: 10_000,
        lastUserScrollAt: null,
      }),
    ).toBe(true)
    // Parked in the hold (a re-render, a peek of another card): no re-scroll.
    expect(
      shouldStepScroll({
        prevStep: step,
        step,
        isPhone: true,
        now: 10_000,
        lastUserScrollAt: null,
      }),
    ).toBe(false)
    // The player scrolled somewhere on purpose a moment ago: they keep it.
    expect(
      shouldStepScroll({
        prevStep: null,
        step,
        isPhone: true,
        now: 10_000,
        lastUserScrollAt: 9_500,
      }),
    ).toBe(false)
  })
})
