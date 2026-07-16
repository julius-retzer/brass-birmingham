// Pins what the acting client puts on screen when the server refuses a move.
// The reason must reach the player verbatim — a refusal that says only "that
// failed" is the bug this plumbing exists to fix (captain, 2026-07-16).
import { describe, expect, it } from 'vitest'
import { FALLBACK_REFUSAL, refusalToShow } from './refusal'

describe('refusalToShow', () => {
  it('renders the server reason verbatim, whatever is missing', () => {
    // The four refusal classes the server is required to explain.
    const reasons = [
      'Not enough money: you have £2, a canal link costs £3.',
      'Needs 1 beer — no connected brewery has beer.',
      'No canal connection to wolverhampton: neither walsall nor wolverhampton is in your network.',
      'Not your turn — waiting on Ada.',
    ]
    for (const error of reasons) {
      expect(refusalToShow({ ok: false, error }, 'SELECT_LINK')).toBe(error)
    }
  })

  it('shows nothing when the move was accepted', () => {
    expect(refusalToShow({ ok: true }, 'SELECT_LINK')).toBeNull()
  })

  it('falls back when the server refuses without a reason', () => {
    expect(refusalToShow({ ok: false }, 'BUILD')).toBe(FALLBACK_REFUSAL)
    expect(refusalToShow({ ok: false, error: '   ' }, 'BUILD')).toBe(
      FALLBACK_REFUSAL,
    )
  })

  it('stays silent about CLEAR_ERROR, which the player never asked for', () => {
    expect(
      refusalToShow({ ok: false, error: 'boom' }, 'CLEAR_ERROR'),
    ).toBeNull()
  })
})
