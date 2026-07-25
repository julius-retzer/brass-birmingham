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
// Consumption is STRIP-then-VERIFY-then-WRITE. `consumeRecoveryLink` removes the
// fragment from the address bar synchronously — for ANY fragment, valid or not,
// BEFORE any fetch/EventSource/navigation could carry it onward — and returns
// the parsed credentials WITHOUT persisting them. Persisting is the caller's
// job, and only after the server has authenticated the seat: a bad or stale
// link must never overwrite a working seat's stored secret. See
// `consumeRecoveryLink` and its caller in `mp-game.tsx`.

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
  // An empty seat must be refused explicitly: `Number('')` is 0, which would
  // otherwise pass the integer check and masquerade as seat 0.
  if (!seat || !secret) return null
  const seatId = Number(seat)
  if (!Number.isInteger(seatId) || seatId < 0) return null
  return { seatId, seatSecret: secret }
}

/**
 * Consume a recovery link found in the current URL: scrub any fragment out of
 * the address bar and session history, and return the parsed credentials.
 *
 * Returns the credentials when the fragment was a well-formed recovery link,
 * else null (the plain invite-link case, which must fall through to the normal
 * join screen).
 *
 * STRIPPING IS UNCONDITIONAL and comes FIRST. `replaceState` runs whenever the
 * URL carries any fragment — even a malformed, secret-bearing one that
 * `parseRecoveryHash` rejects — before the caller opens the SSE stream, so a
 * mangled paste can never leave the secret in the URL for the invite affordance
 * to read back or for a later request to carry. `replaceState` (not pushState)
 * REPLACES the secret-bearing entry rather than adding one: pressing Back
 * cannot return to it.
 *
 * The credentials are NOT persisted here. Whether to store them is the caller's
 * decision, and only once the server has authenticated the seat — otherwise a
 * bad or stale link would clobber a working seat's stored secret.
 */
export function consumeRecoveryLink(
  win: RecoveryWindowLike,
): RecoveryCreds | null {
  const hadFragment = win.location.hash.replace(/^#/, '').length > 0
  const creds = parseRecoveryHash(win.location.hash)
  if (hadFragment) {
    win.history.replaceState(
      null,
      '',
      `${win.location.pathname}${win.location.search}`,
    )
  }
  return creds
}
