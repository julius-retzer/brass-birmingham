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

describe('getHandSelection — held card persists through the whole flow', () => {
  test('card-first idle: nothing held, hand live', () => {
    expect(getHandSelection(snap('playing.action.selectingAction'))).toEqual({
      hint: 'Pick an action — or play a card first',
      selectedIds: [],
    })
  })

  test('cardSelected: held card highlighted (put back / switch handled by machine)', () => {
    const sel = getHandSelection(
      snap('playing.action.cardSelected', { selectedCard: wolverhampton }),
    )
    expect(sel?.selectedIds).toEqual(['loc-wolverhampton-1'])
  })

  test('deeper Network step keeps the card lifted and names it', () => {
    expect(
      getHandSelection(
        snap('playing.action.networking.selectingLink', {
          selectedCard: wolverhampton,
        }),
      ),
    ).toEqual({
      hint: 'Holding Wolverhampton',
      selectedIds: ['loc-wolverhampton-1'],
    })
  })

  test('the indicator persists across every deeper step of a flow', () => {
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
      expect(sel?.hint, path).toBe('Holding Wolverhampton')
    }
  })

  test('an action-first discard step names the action, nothing held yet', () => {
    expect(
      getHandSelection(snap('playing.action.networking.selectingCard')),
    ).toEqual({ hint: 'Network — discard a card', selectedIds: [] })
  })

  test('outside any action flow → null', () => {
    expect(getHandSelection(snap('playing.turnComplete'))).toBeNull()
    expect(getHandSelection(snap('setup'))).toBeNull()
  })
})
