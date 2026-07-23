// Personal SEAT RECOVERY LINK — how a player restores their seat on another
// device or after clearing their browser.
//
// THE TWO LINKS, AND WHY THEY MUST NEVER BE CONFUSED:
//
//   invite link    /g/<token>                       PUBLIC.  Lets a stranger
//                                                   take an OPEN seat.
//   recovery link  /g/<token>#seat=N&secret=<s>     A CREDENTIAL. Whoever
//                                                   holds it plays THAT seat.
//
// No new credential scheme is invented here: the recovery link simply carries
// the EXISTING per-seat secret (the same one already sitting in localStorage
// under `bb-mp-<token>`, minted by joinGame and verified by `secretMatches`).
// The server therefore needs no new endpoint, no new column, and — crucially —
// never sees or logs the secret at all, because:
//
//   THE SECRET RIDES IN THE URL FRAGMENT, NEVER THE QUERY STRING.
//   A fragment is never sent to the origin, never reaches a request log, and
//   is stripped from the `Referer` header by the URL spec. A `?secret=` link
//   would land in Vercel's access log for `/g/<token>` on the very first hit.
//
// The fragment is nevertheless written in `secret=…` form ON PURPOSE: that is
// the shape `sentry-scrub.ts` already redacts (its `scrubText` pattern matches
// `(seat|host)?secret[=:]<value>` anywhere in a string, and `scrubQueryString`
// matches the `secret` param name), so a client-side event carrying
// `location.href` is scrubbed by the existing gate with nothing added here.
//
// Consumption is deliberately WRITE-THEN-STRIP and fully synchronous: the
// credentials go to localStorage and `history.replaceState` removes them from
// the address bar in the same tick, BEFORE any fetch/EventSource/navigation
// could carry them onward. See `consumeRecoveryLink`.

export interface RecoveryCreds {
  seatId: number
  seatSecret: string
}

/** localStorage key holding a seat's credentials for one game. */
export const credsKey = (token: string) => `bb-mp-${token}`

/** Minimal structural slice of `window` — a real Window satisfies it, and a
 *  plain object stands in under vitest's `environment: 'node'`. */
export interface RecoveryWindowLike {
  location: { pathname: string; search: string; hash: string }
  history: { replaceState(data: unknown, unused: string, url: string): void }
  localStorage: { setItem(key: string, value: string): void }
}

/**
 * The player's own recovery URL. `origin` is normally `window.location.origin`.
 * NEVER render this next to the invite link, and never without the
 * "anyone holding this can play as you" warning — see SeatKeyModal.
 */
export function buildRecoveryLink(
  origin: string,
  token: string,
  creds: RecoveryCreds,
): string {
  const params = new URLSearchParams({
    seat: String(creds.seatId),
    secret: creds.seatSecret,
  })
  return `${origin.replace(/\/$/, '')}/g/${encodeURIComponent(token)}#${params.toString()}`
}

/**
 * Read credentials out of a URL fragment. Returns null for anything that is
 * not a well-formed recovery fragment — an invite link (no fragment), a
 * truncated paste, a fragment missing either half.
 *
 * This is a SHAPE check only. Whether the secret is the RIGHT one is decided
 * by the server through the ordinary seat-secret path (`secretMatches`), which
 * answers with an unauthenticated view and no hint about which half was wrong.
 */
export function parseRecoveryHash(hash: string): RecoveryCreds | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const seat = params.get('seat')
  const secret = params.get('secret')
  if (seat === null || !secret) return null
  const seatId = Number(seat)
  if (!Number.isInteger(seatId) || seatId < 0) return null
  return { seatId, seatSecret: secret }
}

/**
 * Consume a recovery link found in the current URL: persist the credentials
 * for this game and scrub them out of the address bar and session history.
 *
 * Returns the credentials when a fragment was consumed, else null (the plain
 * invite-link case, which must fall through to the normal join screen).
 *
 * ORDER IS LOAD-BEARING — store, then strip, both synchronously, before the
 * caller opens the SSE stream. `replaceState` (not pushState) is used so the
 * secret-bearing entry is REPLACED rather than added: pressing Back cannot
 * return to it.
 */
export function consumeRecoveryLink(
  token: string,
  win: RecoveryWindowLike,
): RecoveryCreds | null {
  const creds = parseRecoveryHash(win.location.hash)
  if (!creds) return null
  try {
    win.localStorage.setItem(credsKey(token), JSON.stringify(creds))
  } catch {
    // Private-mode storage can refuse writes. The seat still works for this
    // page load (the caller holds the creds in memory); losing persistence is
    // strictly better than leaving the secret in the URL, so carry on and
    // strip regardless.
  }
  win.history.replaceState(
    null,
    '',
    `${win.location.pathname}${win.location.search}`,
  )
  return creds
}
