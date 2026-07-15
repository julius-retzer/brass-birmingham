// The serializer must be complete (all strategy-relevant facts), honest
// about hidden information (opponent hands as counts only) and stable
// (deterministic output for the same snapshot).
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
import { serializeGameState } from './serialize'

const startPlayers = [
  {
    id: '1',
    name: 'Ada',
    color: 'red' as const,
    character: 'Eliza Tinsley' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
  {
    id: '2',
    name: 'Brunel',
    color: 'blue' as const,
    character: 'Isambard Kingdom Brunel' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
]

function freshSnapshot() {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({ type: 'START_GAME', players: startPlayers })
  return actor.getSnapshot()
}

describe('serializeGameState', () => {
  test('contains the core game facts', () => {
    const snap = freshSnapshot()
    const text = serializeGameState(snap, 0)
    expect(text).toContain('CANAL ERA, round 1')
    expect(text).toContain('== YOU (Ada) ==')
    expect(text).toContain('Money £17 | income 0 | victory points 0')
    expect(text).toContain('== OPPONENT: Brunel ==')
    expect(text).toContain('== MARKETS ==')
    expect(text).toMatch(/Coal: next cube costs £\d/)
    expect(text).toContain('== MERCHANTS')
    expect(text).toContain('== ACTION IN PROGRESS ==')
  })

  test('shows my real hand but only the count of opponent hands', () => {
    const snap = freshSnapshot()
    const meText = serializeGameState(snap, 0)
    const myHand = snap.context.players[0]!.hand
    const oppHand = snap.context.players[1]!.hand
    expect(myHand.length).toBe(8)
    expect(meText).toContain(`Your hand (${myHand.length}):`)
    expect(meText).toContain(`${oppHand.length} cards in hand`)
    // no opponent card ids anywhere in my serialization
    for (const card of oppHand) {
      expect(meText).not.toContain(card.id)
    }
  })

  test('is deterministic for the same snapshot', () => {
    const snap = freshSnapshot()
    expect(serializeGameState(snap, 0)).toBe(serializeGameState(snap, 0))
  })

  test('reflects an in-flight action with its selections', () => {
    const actor = createActor(gameStore)
    actor.start()
    actor.send({ type: 'START_GAME', players: startPlayers })
    actor.send({ type: 'TAKE_LOAN' })
    const hand = actor.getSnapshot().context.players[0]!.hand
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    const text = serializeGameState(actor.getSnapshot(), 0)
    expect(text).toContain('Machine state:')
    expect(text).toContain('takingLoan')
    expect(text).toContain('Selected card:')
  })

  test('stays compact — a fresh game serializes to well under 4000 chars', () => {
    const text = serializeGameState(freshSnapshot(), 0)
    expect(text.length).toBeLessThan(4000)
  })
})
