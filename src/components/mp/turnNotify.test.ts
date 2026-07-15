// Pins for the turn-change detection driving multiplayer notifications.
import { describe, expect, it } from 'vitest'
import { didBecomeMyTurn, titleForTurn } from './turnNotify'

describe('didBecomeMyTurn', () => {
  const YOU = 1

  it('fires when the turn transfers to you', () => {
    expect(didBecomeMyTurn(0, 1, YOU)).toBe(true)
    expect(didBecomeMyTurn(2, 1, YOU)).toBe(true)
  })

  it('does not fire while it stays your turn (second action, re-renders)', () => {
    expect(didBecomeMyTurn(1, 1, YOU)).toBe(false)
  })

  it('does not fire when the turn moves to someone else', () => {
    expect(didBecomeMyTurn(1, 0, YOU)).toBe(false)
    expect(didBecomeMyTurn(0, 2, YOU)).toBe(false)
  })

  it('does not fire on the FIRST frame (opening a game mid-turn)', () => {
    expect(didBecomeMyTurn(null, 1, YOU)).toBe(false)
  })

  it('does not fire on frames with no engine state', () => {
    expect(didBecomeMyTurn(0, null, YOU)).toBe(false)
  })
})

describe('titleForTurn', () => {
  it('prefixes the tab title on your turn and restores it after', () => {
    expect(titleForTurn('Brass: Birmingham', true)).toBe(
      '● Your turn — Brass: Birmingham',
    )
    expect(titleForTurn('Brass: Birmingham', false)).toBe('Brass: Birmingham')
  })
})
