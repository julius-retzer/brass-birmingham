import { describe, expect, it } from 'vitest'
import {
  type RecoveryWindowLike,
  buildRecoveryLink,
  consumeRecoveryLink,
  parseRecoveryHash,
} from './recovery-link'

const TOKEN = 'Ab3xY_9zQw-token01'
const SECRET = 'sQ7v_Kd2mE9pLr4TnW1xYg'

/** A stand-in for `window` under vitest's node environment: records the
 *  replaceState calls so the test can prove the fragment is scrubbed. */
function fakeWindow(
  hash: string,
  search = '',
): RecoveryWindowLike & {
  replaced: string[]
} {
  const win = {
    location: { pathname: `/g/${TOKEN}`, search, hash },
    history: {
      replaceState(_data: unknown, _unused: string, url: string) {
        win.replaced.push(url)
        // mirror the browser: the URL really changes
        const [path, frag = ''] = url.split('#')
        const [pathname, qs = ''] = path!.split('?')
        win.location.pathname = pathname!
        win.location.search = qs ? `?${qs}` : ''
        win.location.hash = frag ? `#${frag}` : ''
      },
    },
    replaced: [] as string[],
  }
  return win
}

describe('recovery link — round trip', () => {
  it('a link built for a seat parses back to the same credentials', () => {
    const link = buildRecoveryLink('https://brass.example', TOKEN, {
      seatId: 2,
      seatSecret: SECRET,
    })
    expect(link).toBe(
      `https://brass.example/g/${TOKEN}#seat=2&secret=${SECRET}`,
    )
    expect(parseRecoveryHash(new URL(link).hash)).toEqual({
      seatId: 2,
      seatSecret: SECRET,
    })
  })

  it('keeps the secret in the FRAGMENT, never the path or query', () => {
    const link = buildRecoveryLink('https://brass.example', TOKEN, {
      seatId: 0,
      seatSecret: SECRET,
    })
    const url = new URL(link)
    // the fragment is never sent to the origin — no request log, no Referer
    expect(url.pathname).not.toContain(SECRET)
    expect(url.search).toBe('')
    expect(url.hash).toContain(SECRET)
  })

  it('survives secrets containing URL-significant characters', () => {
    const awkward = 'a+b/c=d&e?f#g'
    const link = buildRecoveryLink('https://brass.example', TOKEN, {
      seatId: 1,
      seatSecret: awkward,
    })
    expect(parseRecoveryHash(new URL(link).hash)).toEqual({
      seatId: 1,
      seatSecret: awkward,
    })
  })

  it('a trailing slash on the origin does not double up', () => {
    const link = buildRecoveryLink('https://brass.example/', TOKEN, {
      seatId: 0,
      seatSecret: SECRET,
    })
    expect(link.startsWith(`https://brass.example/g/${TOKEN}#`)).toBe(true)
  })

  it('consuming a link returns THAT seat WITHOUT persisting it', () => {
    const win = fakeWindow(`#seat=3&secret=${SECRET}`)
    const creds = consumeRecoveryLink(win)
    expect(creds).toEqual({ seatId: 3, seatSecret: SECRET })
    // Persisting is the caller's job, and only once the server authenticates
    // the seat — a bad or stale link must never clobber a working seat's
    // stored secret. Nothing here writes storage.
  })
})

describe('recovery link — the URL is scrubbed after consumption', () => {
  it('strips the fragment via replaceState, keeping the path', () => {
    const win = fakeWindow(`#seat=1&secret=${SECRET}`)
    consumeRecoveryLink(win)
    expect(win.replaced).toEqual([`/g/${TOKEN}`])
    expect(win.location.hash).toBe('')
    // nothing anywhere in the visible location still holds the secret
    const visible =
      win.location.pathname + win.location.search + win.location.hash
    expect(visible).not.toContain(SECRET)
  })

  it('preserves an unrelated query string while dropping the fragment', () => {
    const win = fakeWindow(`#seat=1&secret=${SECRET}`, '?ref=discord')
    consumeRecoveryLink(win)
    expect(win.replaced).toEqual([`/g/${TOKEN}?ref=discord`])
  })

  it('uses replaceState, so Back cannot return to the secret-bearing entry', () => {
    // pushState would leave the credential in session history; the module must
    // only ever call replaceState (asserted by the fake exposing no pushState).
    const win = fakeWindow(`#seat=0&secret=${SECRET}`)
    expect(() => consumeRecoveryLink(win)).not.toThrow()
    expect(win.replaced).toHaveLength(1)
  })

  it('strips a MALFORMED secret-bearing fragment too, so it cannot leak', () => {
    // `#seat=one&secret=…` fails to parse (bad seat) but still carries the
    // secret. It must be scrubbed from the address bar all the same — otherwise
    // the invite affordance would read it straight back out of `location`.
    const win = fakeWindow(`#seat=one&secret=${SECRET}`)
    expect(consumeRecoveryLink(win)).toBeNull()
    expect(win.replaced).toEqual([`/g/${TOKEN}`])
    expect(win.location.hash).toBe('')
    const visible =
      win.location.pathname + win.location.search + win.location.hash
    expect(visible).not.toContain(SECRET)
  })
})

describe('recovery link — malformed input is refused without a hint', () => {
  // A tampered link must be indistinguishable in its handling from a garbage
  // one: parse returns the SAME null for every bad shape, so nothing here can
  // tell an attacker which half they got wrong. Whether a well-formed secret
  // is the RIGHT one is the server's ordinary seat-secret check.
  const bad = [
    ['empty', ''],
    ['bare hash', '#'],
    ['missing secret', '#seat=1'],
    ['empty secret', '#seat=1&secret='],
    ['empty seat', `#seat=&secret=${SECRET}`],
    ['missing seat', `#secret=${SECRET}`],
    ['non-numeric seat', `#seat=zero&secret=${SECRET}`],
    ['negative seat', `#seat=-1&secret=${SECRET}`],
    ['fractional seat', `#seat=1.5&secret=${SECRET}`],
    ['unrelated fragment', '#chat'],
  ] as const

  for (const [label, hash] of bad) {
    it(`refuses ${label}`, () => {
      expect(parseRecoveryHash(hash)).toBeNull()
    })
  }

  it('a refused fragment yields no creds but is still stripped', () => {
    const win = fakeWindow('#seat=1')
    expect(consumeRecoveryLink(win)).toBeNull()
    expect(win.location.hash).toBe('')
  })
})

describe('invite link vs recovery link', () => {
  const inviteLink = `https://brass.example/g/${TOKEN}`

  it('an invite link carries NO credential — it cannot restore a seat', () => {
    expect(inviteLink).not.toContain('secret')
    expect(parseRecoveryHash(new URL(inviteLink).hash)).toBeNull()
  })

  it('opening an invite link consumes nothing and falls through to joining', () => {
    const win = fakeWindow('')
    expect(consumeRecoveryLink(win)).toBeNull()
    expect(win.replaced).toEqual([]) // no needless history rewrite
  })

  it('the recovery link is a strict superset of the invite link', () => {
    // Same game URL + a fragment: sharing the recovery link accidentally
    // shares the invite too, which is why the UI must make the recovery one
    // hard to grab (SeatKeyModal) rather than showing both as bare URLs.
    const recovery = buildRecoveryLink('https://brass.example', TOKEN, {
      seatId: 0,
      seatSecret: SECRET,
    })
    expect(recovery.startsWith(`${inviteLink}#`)).toBe(true)
  })
})

describe('the fragment format stays covered by the Sentry scrubber', () => {
  // sentry-scrub.ts redacts `secret=<value>` ANYWHERE in a string (scrubText)
  // and the `secret` query param by name (scrubQueryString). The fragment is
  // written in exactly that shape so the existing gate covers it with no
  // second scrubbing path here. Mirrors the scrubber's own pattern; if that
  // module's pattern changes, this fails and the format must be revisited.
  const SENTRY_TEXT_PATTERN =
    /((?:seat|host)?secret|authorization|api[-_]?key|password)(["']?\s*[=:]\s*["']?)([^\s"'&,}]+)/gi

  it('a recovery URL is redacted by the scrubber pattern', () => {
    const link = buildRecoveryLink('https://brass.example', TOKEN, {
      seatId: 1,
      seatSecret: SECRET,
    })
    const scrubbed = link.replace(SENTRY_TEXT_PATTERN, '$1$2[Filtered]')
    expect(scrubbed).not.toContain(SECRET)
    // the game token survives — it is the identifier, not a credential
    expect(scrubbed).toContain(TOKEN)
  })
})
