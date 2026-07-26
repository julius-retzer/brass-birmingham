import { describe, expect, test } from 'vitest'
import type { Card, LocationCard } from '../data/cards'
import type { GameStoreSnapshot } from '../store/gameStore'
import { getHandSelection } from './action-dock'

// getHandSelection only reads snapshot.matches(path) and two context fields,
// so a light fake stands in for a driven actor (same approach as the other
// pure-logic component tests). matches() follows xstate semantics: an
// ancestor path matches a deeper active state ('playing.action' matches
// 'playing.action.networking.selectingLink').
function snap(
  statePath: string,
  context: { selectedCard?: Card | null; selectedCardsForScout?: Card[] } = {},
): GameStoreSnapshot {
  return {
    matches: (path: string) =>
      statePath === path || statePath.startsWith(`${path}.`),
    context: {
      selectedCard: context.selectedCard ?? null,
      selectedCardsForScout: context.selectedCardsForScout ?? [],
    },
  } as unknown as GameStoreSnapshot
}

const wolverhampton: LocationCard = {
  id: 'loc-wolverhampton-1',
  type: 'location',
  location: 'wolverhampton',
  color: 'other',
}

const dudley: LocationCard = {
  id: 'loc-dudley-1',
  type: 'location',
  location: 'dudley',
  color: 'other',
}

/** Every state the hand is live in, plus the two that end it. */
const IN_FLOW = [
  'playing.action.selectingAction',
  'playing.action.cardSelected',
  'playing.action.building.selectingCard',
  'playing.action.building.selectingIndustryType',
  'playing.action.building.selectingLocation',
  'playing.action.building.confirmingBuild',
  'playing.action.building.choosingIronSource',
  'playing.action.networking.selectingCard',
  'playing.action.networking.selectingLink',
  'playing.action.networking.confirmingLink',
  'playing.action.networking.choosingDoubleLinkBeer',
  'playing.action.developing.selectingCard',
  'playing.action.developing.selectingTiles',
  'playing.action.selling.selectingCard',
  'playing.action.selling.selectingSale',
  'playing.action.selling.choosingBeerSource',
  'playing.action.takingLoan.selectingCard',
  'playing.action.scouting.selectingCards',
]

describe('getHandSelection — held card persists through the whole flow', () => {
  test('card-first idle: hand live, nothing lifted', () => {
    expect(getHandSelection(snap('playing.action.selectingAction'))).toEqual({
      selectedIds: [],
    })
  })

  test('cardSelected: held card lifted (put back / switch handled by machine)', () => {
    expect(
      getHandSelection(
        snap('playing.action.cardSelected', { selectedCard: wolverhampton }),
      ),
    ).toEqual({ selectedIds: ['loc-wolverhampton-1'] })
  })

  test('deeper Network step keeps the card lifted', () => {
    expect(
      getHandSelection(
        snap('playing.action.networking.selectingLink', {
          selectedCard: wolverhampton,
        }),
      ),
    ).toEqual({ selectedIds: ['loc-wolverhampton-1'] })
  })

  test('the lift persists across every deeper step of a flow', () => {
    for (const path of [
      'playing.action.building.selectingIndustryType',
      'playing.action.building.selectingLocation',
      'playing.action.building.confirmingBuild',
      'playing.action.building.choosingIronSource',
      'playing.action.networking.selectingLink',
      'playing.action.networking.confirmingLink',
      'playing.action.networking.choosingDoubleLinkBeer',
      'playing.action.developing.selectingTiles',
      'playing.action.selling.selectingSale',
      'playing.action.selling.choosingBeerSource',
    ]) {
      const sel = getHandSelection(snap(path, { selectedCard: wolverhampton }))
      expect(sel, path).not.toBeNull()
      expect(sel?.selectedIds, path).toEqual(['loc-wolverhampton-1'])
    }
  })

  test('an action-first discard step lifts nothing until a card is played', () => {
    expect(
      getHandSelection(snap('playing.action.networking.selectingCard')),
    ).toEqual({ selectedIds: [] })
  })

  test("Scout lifts every card picked so far, in the machine's own order", () => {
    expect(
      getHandSelection(
        snap('playing.action.scouting.selectingCards', {
          selectedCardsForScout: [wolverhampton, dudley],
        }),
      ),
    ).toEqual({ selectedIds: ['loc-wolverhampton-1', 'loc-dudley-1'] })
  })

  test('the tray contributes no words in any state', () => {
    // The fixed tray floats over whichever panel is beneath it, so it carries
    // no narration of its own: each surface names its own step in its own
    // panel. A label added back here would be a string on this contract.
    for (const path of IN_FLOW) {
      const sel = getHandSelection(
        snap(path, {
          selectedCard: wolverhampton,
          selectedCardsForScout: [wolverhampton],
        }),
      )
      expect(Object.keys(sel ?? {}), path).toEqual(['selectedIds'])
    }
  })

  test('the lift is order-independent: a deep step reached action-first reads identically', () => {
    // getHandSelection keys off the current state + selectedCard only — never
    // how the state was reached — so action-first and card-first converge on
    // the same lifted card the instant one is committed.
    const cardFirst = getHandSelection(
      snap('playing.action.networking.selectingLink', {
        selectedCard: wolverhampton,
      }),
    )
    const actionFirst = getHandSelection(
      snap('playing.action.networking.confirmingLink', {
        selectedCard: wolverhampton,
      }),
    )
    expect(cardFirst).toEqual({ selectedIds: ['loc-wolverhampton-1'] })
    expect(actionFirst).toEqual(cardFirst)
  })

  test('outside any action flow → null', () => {
    expect(getHandSelection(snap('playing.turnComplete'))).toBeNull()
    expect(getHandSelection(snap('setup'))).toBeNull()
  })
})
