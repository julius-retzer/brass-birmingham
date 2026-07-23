// Secret scrubbing for every Sentry event leaving this app.
//
// WHY THIS EXISTS. brass has no accounts: a player IS their credential. The
// per-seat `seatSecret` (and the host's, which is just seat 0's) is a bearer
// token that lets anyone holding it play that seat, and `CRON_SECRET` lets
// anyone holding it drive the sweep endpoint. Those must NEVER reach a
// third-party service, not in a body, a URL, a header, a tag, an `extra`, or
// an exception message.
//
// The GAME TOKEN is deliberately NOT scrubbed — it identifies which game broke
// and is the whole point of the context we attach. It is not a credential on
// its own (acting still needs a seat secret).
//
// Everything here is pure so it can be unit-tested without a DSN or a network
// (see sentry-scrub.test.ts) — that test IS the proof that the secrets do not
// escape, since there is no Sentry project to send a probe event to yet.

/** Placeholder written over any redacted value. */
export const FILTERED = '[Filtered]'

/**
 * Key names whose VALUE is a credential. Matched case-insensitively as a
 * SUBSTRING of the key, so `seatSecret`, `secretHash`, `hostSecret`,
 * `SENTRY_AUTH_TOKEN` and `authorization` are all covered by a short list.
 *
 * NOTE the deliberate omission of a bare `token` — `token` is the game token
 * (public, and the identifier we want). `authToken`/`auth_token` are caught by
 * the `auth` entry.
 */
const SECRET_KEY_PARTS = [
  'secret',
  'authorization',
  'auth',
  'password',
  'passwd',
  'apikey',
  'api_key',
  'cookie',
  'credential',
  'session',
]

/** Query parameters whose value is a credential (the SSE stream takes
 *  `?token=…&seat=…&secret=…`, so URLs leak too if left alone). */
const SECRET_QUERY_PARAMS = [
  'secret',
  'seatsecret',
  'hostsecret',
  'authorization',
  'auth',
  'apikey',
  'api_key',
  'key',
]

/** `secret=abc`, `seatSecret: "abc"`, `Bearer abc` embedded in free text
 *  (exception messages, log breadcrumbs, stringified request lines). Each
 *  entry replaces its LAST capture group with the placeholder, keeping the
 *  key name visible so the event still reads sensibly. */
const SECRET_TEXT_PATTERNS: [RegExp, string][] = [
  [
    /((?:seat|host)?secret|authorization|api[-_]?key|password)(["']?\s*[=:]\s*["']?)([^\s"'&,}]+)/gi,
    `$1$2${FILTERED}`,
  ],
  [/(bearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi, `$1${FILTERED}`],
]

export function isSecretKey(key: string): boolean {
  const k = key.toLowerCase()
  return SECRET_KEY_PARTS.some((part) => k.includes(part))
}

/** Redact `secret=…`-style fragments inside an arbitrary string. */
export function scrubText(value: string): string {
  let out = value
  for (const [re, replacement] of SECRET_TEXT_PATTERNS) {
    out = out.replace(re, replacement)
  }
  return out
}

/**
 * Strip credential-bearing query params from a URL, preserving everything
 * else (path + the game token) so the event still says WHICH endpoint broke.
 * Works on relative URLs and on strings that don't parse as URLs at all.
 */
export function scrubUrl(url: string): string {
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return scrubText(url)
  const base = url.slice(0, qIndex)
  const query = scrubQueryString(url.slice(qIndex + 1))
  return query ? `${base}?${query}` : base
}

/** Scrub a bare query string (`a=1&secret=x`), no leading `?`. */
export function scrubQueryString(query: string): string {
  return query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=')
      if (eq === -1) return pair
      const name = pair.slice(0, eq)
      return SECRET_QUERY_PARAMS.includes(name.toLowerCase())
        ? `${name}=${FILTERED}`
        : pair
    })
    .join('&')
}

/** Depth beyond which we stop walking and redact rather than risk recursing
 *  through a pathological payload inside `beforeSend`. */
const MAX_DEPTH = 8

/**
 * Deep-walk any JSON-ish value, redacting values under secret-looking keys and
 * scrubbing secret fragments out of every remaining string.
 *
 * Returns a CLONE — the original is never mutated. Cycles are handled by
 * registering each clone before descending, so a self-referencing `extra`
 * (Sentry really does ship those) comes back cyclic and fully scrubbed rather
 * than falling back to the raw, unscrubbed original.
 */
export function scrubValue(
  value: unknown,
  depth = 0,
  seen = new Map<object, unknown>(),
): unknown {
  if (typeof value === 'string') return scrubText(value)
  if (value === null || typeof value !== 'object') return value
  const cached = seen.get(value)
  if (cached !== undefined) return cached
  // Past the depth bound we redact rather than return the raw value: a deep
  // object could still be carrying a credential.
  if (depth > MAX_DEPTH) return FILTERED
  if (Array.isArray(value)) {
    const out: unknown[] = []
    seen.set(value, out)
    for (const v of value) out.push(scrubValue(v, depth + 1, seen))
    return out
  }
  const out: Record<string, unknown> = {}
  seen.set(value, out)
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSecretKey(k) ? FILTERED : scrubValue(v, depth + 1, seen)
  }
  return out
}

/** The subset of a Sentry event this scrubber touches. Typed structurally so
 *  the pure module needs no `@sentry/*` import (and stays unit-testable). The
 *  public `scrubEvent` is generic and casts to this internally, so it accepts
 *  the SDK's own `ErrorEvent`/`TransactionEvent` without fighting their
 *  (index-signature-free) types. */
interface ScrubbableEvent {
  message?: unknown
  request?: {
    url?: string
    query_string?: unknown
    headers?: unknown
    cookies?: unknown
    data?: unknown
    [k: string]: unknown
  }
  exception?: { values?: { value?: string; [k: string]: unknown }[] }
  tags?: Record<string, unknown>
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  breadcrumbs?: {
    message?: string
    data?: unknown
    [k: string]: unknown
  }[]
  user?: Record<string, unknown>
  /** a Breadcrumb's payload — `beforeBreadcrumb` hands one straight to
   *  `scrubEvent`, and a fetch crumb's `data.url` is the SSE stream URL. */
  data?: unknown
  [k: string]: unknown
}

/**
 * `beforeSend` body, shared by the client, server and edge SDK configs.
 *
 * Two rules, both non-negotiable:
 *  1. Request headers, cookies and bodies are DROPPED WHOLESALE — we never
 *     want to reason about whether a particular one carried a secret.
 *  2. Everything that survives (URL, message, exception values, tags, extra,
 *     contexts, breadcrumbs) is deep-scrubbed by key name and by text pattern.
 */
export function scrubEvent<T>(input: T): T {
  const event = input as ScrubbableEvent
  if (event.request) {
    const req = event.request
    if (typeof req.url === 'string') req.url = scrubUrl(req.url)
    if (typeof req.query_string === 'string') {
      req.query_string = scrubQueryString(req.query_string)
    } else if (req.query_string) {
      req.query_string = scrubValue(req.query_string)
    }
    // Never ship raw headers/cookies/bodies — see rule 1 above.
    req.headers = undefined
    req.cookies = undefined
    req.data = undefined
  }
  if (typeof event.message === 'string')
    event.message = scrubText(event.message)
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = scrubText(value.value)
  }
  if (event.tags) event.tags = scrubValue(event.tags) as Record<string, unknown>
  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>
  }
  if (event.contexts) {
    event.contexts = scrubValue(event.contexts) as Record<string, unknown>
  }
  if (event.user) event.user = scrubValue(event.user) as Record<string, unknown>
  if (event.data) event.data = scrubValue(event.data)
  for (const crumb of event.breadcrumbs ?? []) {
    if (typeof crumb.message === 'string')
      crumb.message = scrubText(crumb.message)
    if (crumb.data) crumb.data = scrubValue(crumb.data)
  }
  return input
}
