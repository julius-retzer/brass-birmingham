// The enumerator must mirror the machine's own guards: every listed move is
// accepted by can(), and the moves a player obviously has are all listed.
import { beforeEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { type GameStoreActor, gameStore } from '../../store/gameStore'
import { enumerateLegalMoves } from './legal-moves'

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

let actor: GameStoreActor

beforeEach(() => {
  actor = createActor(gameStore)
  actor.start()
  actor.send({ type: 'START_GAME', players: startPlayers })
})

describe('enumerateLegalMoves', () => {
  test('at action selection: top-level actions, never TEST/lifecycle events', () => {
    const moves = enumerateLegalMoves(actor.getSnapshot())
    const types = moves.map((m) => m.event.type)
    for (const t of [
      'BUILD',
      'NETWORK',
      'DEVELOP',
      'SCOUT',
      'TAKE_LOAN',
      'PASS',
    ]) {
      expect(types).toContain(t)
    }
    // SELL is machine-legal even with nothing to sell (the guard sits on
    // SELECT_SALE) — the enumerator stays faithful to the machine and the
    // driver unwinds dead ends via CANCEL
    expect(types).toContain('SELL')
    // no selection events are legal before an action starts
    expect(types).not.toContain('SELECT_CARD')
    expect(types).not.toContain('CONFIRM')
    expect(types.filter((t) => t.startsWith('TEST_'))).toHaveLength(0)
    expect(types).not.toContain('START_GAME')
  })

  test('every enumerated move is accepted by the machine', () => {
    actor.send({ type: 'BUILD' })
    const snap = actor.getSnapshot()
    const moves = enumerateLegalMoves(snap)
    for (const move of moves) {
      expect(snap.can(move.event as never)).toBe(true)
    }
  })

  test('inside BUILD: one card option per hand card, plus cancel', () => {
    actor.send({ type: 'BUILD' })
    const snap = actor.getSnapshot()
    const hand = snap.context.players[snap.context.currentPlayerIndex]!.hand
    const moves = enumerateLegalMoves(snap)
    const cardMoves = moves.filter((m) => m.event.type === 'SELECT_CARD')
    expect(cardMoves).toHaveLength(hand.length)
    expect(moves.some((m) => m.event.type === 'CANCEL')).toBe(true)
    // labels describe the card, not just its id
    expect(cardMoves[0]!.label).toMatch(/Play card: /)
  })

  test('canal era never offers rail-only links', () => {
    actor.send({ type: 'NETWORK' })
    const snap = actor.getSnapshot()
    const hand = snap.context.players[snap.context.currentPlayerIndex]!.hand
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    const linkMoves = enumerateLegalMoves(actor.getSnapshot()).filter(
      (m) => m.event.type === 'SELECT_LINK',
    )
    expect(linkMoves.length).toBeGreaterThan(0)
    for (const m of linkMoves) {
      expect(m.label).toContain('canal link')
    }
  })

  test('loan flow: card select then confirm', () => {
    actor.send({ type: 'TAKE_LOAN' })
    let moves = enumerateLegalMoves(actor.getSnapshot())
    expect(moves.some((m) => m.event.type === 'SELECT_CARD')).toBe(true)
    const card = moves.find((m) => m.event.type === 'SELECT_CARD')!
    actor.send(card.event)
    moves = enumerateLegalMoves(actor.getSnapshot())
    const types = moves.map((m) => m.event.type)
    expect(types).toContain('CONFIRM')
    expect(types).toContain('CANCEL')
  })
})
