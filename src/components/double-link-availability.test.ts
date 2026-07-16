import { describe, expect, it } from 'vitest'
import type { GameState } from '~/store/gameStore'
import {
  DOUBLE_LINK_GENERIC_REASON,
  doubleLinkDisabledReason,
  explainDoubleLinkUnavailable,
  showsDoubleLinkOption,
} from './double-link-availability'

const brewery = (beerBarrelsOnTile: number, flipped = false) => ({
  type: 'brewery',
  flipped,
  beerBarrelsOnTile,
})

const state = (over: Record<string, unknown>): GameState =>
  ({
    era: 'rail',
    selectedLink: { from: 'birmingham', to: 'coventry' },
    players: [{ id: 'p1', industries: [brewery(1)] }],
    ...over,
  }) as unknown as GameState

describe('showsDoubleLinkOption', () => {
  it('shows the option in the rail era', () => {
    expect(showsDoubleLinkOption(state({}))).toBe(true)
  })

  it('hides it in the canal era, where double rail does not exist', () => {
    expect(showsDoubleLinkOption(state({ era: 'canal' }))).toBe(false)
  })
})

describe('explainDoubleLinkUnavailable', () => {
  it('has nothing to explain when a brewery with beer stands on the board', () => {
    expect(explainDoubleLinkUnavailable(state({}))).toBeNull()
  })

  it('accepts an opponent brewery as the beer source, like the engine guard', () => {
    const reason = explainDoubleLinkUnavailable(
      state({
        players: [
          { id: 'p1', industries: [] },
          { id: 'p2', industries: [brewery(2)] },
        ],
      }),
    )
    expect(reason).toBeNull()
  })

  it('names beer as the missing requirement when no brewery has a barrel', () => {
    const reason = explainDoubleLinkUnavailable(
      state({ players: [{ id: 'p1', industries: [brewery(0)] }] }),
    )
    expect(reason).toContain('1 beer')
  })

  it('ignores flipped breweries, which hold no beer', () => {
    const reason = explainDoubleLinkUnavailable(
      state({ players: [{ id: 'p1', industries: [brewery(1, true)] }] }),
    )
    expect(reason).toContain('1 beer')
  })

  it('explains the era when asked outside the rail era', () => {
    expect(explainDoubleLinkUnavailable(state({ era: 'canal' }))).toContain(
      'Rail Era',
    )
  })

  it('explains the missing first route', () => {
    expect(
      explainDoubleLinkUnavailable(state({ selectedLink: null })),
    ).toContain('first route')
  })
})

describe('doubleLinkDisabledReason', () => {
  it('names the missing requirement when it knows one', () => {
    expect(
      doubleLinkDisabledReason(
        state({ players: [{ id: 'p1', industries: [brewery(0)] }] }),
      ),
    ).toContain('1 beer')
  })

  it('falls back to the full price rather than guessing a cause', () => {
    // Beer is on the board, so this module knows of nothing missing — the
    // machine refused for a reason it cannot see (money, coal, reach).
    expect(doubleLinkDisabledReason(state({}))).toBe(DOUBLE_LINK_GENERIC_REASON)
  })

  it('always yields a sentence to print under the disabled button', () => {
    for (const s of [
      state({}),
      state({ era: 'canal' }),
      state({ selectedLink: null }),
      state({ players: [{ id: 'p1', industries: [brewery(0)] }] }),
    ]) {
      expect(doubleLinkDisabledReason(s).length).toBeGreaterThan(0)
    }
  })
})
