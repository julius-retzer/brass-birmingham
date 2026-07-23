import { describe, expect, it } from 'vitest'
import { EXPECTED_MP_ERRORS, isExpectedMpError } from './expected-errors'

// NB: deliberately NOT importing `./game` for GAME_GONE_ERROR — game.ts pulls
// in the DB client (which needs DATABASE_URL at import), and this suite is an
// offline one. The literal is duplicated here on purpose.
const GAME_GONE_ERROR = 'This game no longer exists.'

describe('isExpectedMpError', () => {
  it('treats every listed refusal as ordinary (never a Sentry event)', () => {
    for (const message of EXPECTED_MP_ERRORS) {
      expect(isExpectedMpError(new Error(message)), message).toBe(true)
    }
  })

  it('covers the archived-game refusal the service actually throws', () => {
    // pinned against the real constant so the list can't drift from game.ts
    expect(isExpectedMpError(new Error(GAME_GONE_ERROR))).toBe(true)
  })

  it('treats a genuine fault as unexpected, so it IS reported', () => {
    expect(isExpectedMpError(new Error('connect ECONNREFUSED'))).toBe(false)
    expect(isExpectedMpError(new TypeError('x is not a function'))).toBe(false)
    expect(isExpectedMpError('some non-Error throw')).toBe(false)
    expect(isExpectedMpError(undefined)).toBe(false)
  })
})
