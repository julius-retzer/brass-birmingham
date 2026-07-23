// Which thrown MP errors are ORDINARY, and which are worth waking someone for.
//
// The multiplayer service reports user-facing refusals by throwing — 'No open
// seats', 'Game not found', '2–4 players'. Those are the product working as
// designed; sending each one to Sentry would bury a real crash under lobby
// noise (and burn the free tier). Anything NOT listed here is treated as
// unexpected and captured: over-reporting a new refusal string once is the
// safe side of that trade, silently swallowing a crash is not.
//
// Pure + unit-tested (expected-errors.test.ts) — no DB, no Sentry.

/** Exact messages the service throws as a normal, user-visible refusal. */
export const EXPECTED_MP_ERRORS: readonly string[] = [
  'Game not found',
  'No such seat',
  'No open seats',
  'Not your seat',
  'The game has not started',
  'The game has already started',
  'That seat is already open',
  'AI seats cannot be released',
  'You are not seated at this table',
  'Only the host can start the game',
  'Every seat must be filled to start',
  'Every player must be ready to start',
  '2–4 players',
  'Missing event',
  'Malformed game token',
  'Concurrent write: the game changed under this save',
]

/** Prefixes for the same, where the message carries a variable tail. */
const EXPECTED_PREFIXES: readonly string[] = [
  // this table is gone / archived (GAME_GONE_ERROR and friends)
  'This game no longer exists',
  // AI seating misconfiguration is a setup problem, not a crash
  'AI opponents are not available',
  'That AI rival is served by a model gateway',
  // a malformed client body reaching JSON.parse
  'Unexpected token',
  'Unexpected end of JSON input',
]

export function isExpectedMpError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (EXPECTED_MP_ERRORS.includes(message)) return true
  return EXPECTED_PREFIXES.some((p) => message.startsWith(p))
}
