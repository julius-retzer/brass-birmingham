// What the acting client shows when an intent comes back refused.
//
// The server answers every rejected intent with the EXACT reason (see
// src/server/mp/intent.ts) — "Not enough money: you have £2, a canal link
// costs £3." rather than a generic failure. This module decides what to put
// on screen for a given response, kept pure so it can be pinned without a DOM
// (same shape as turnNotify.ts).
//
// Only the acting player ever sees a refusal: a refusal is the POST's own
// response body, never persisted and never broadcast, so it cannot reach
// another seat's frame.

/** The `/api/mp/act` response, as far as surfacing a refusal cares. */
export interface ActResponse {
  ok: boolean
  error?: string
}

/** Shown when the server refused but gave no reason (older server, or a
 *  refusal path that has not been taught to explain itself). */
export const FALLBACK_REFUSAL = 'That action was refused.'

/** Shown when the POST itself never landed — distinct from a refusal. */
export const UNREACHABLE = 'Could not reach the game server'

/**
 * The refusal message to surface for `response`, or null to show nothing.
 *
 * `eventType` is needed because CLEAR_ERROR is bookkeeping the player never
 * asked for — toasting its refusal would be noise about a move they made.
 */
export function refusalToShow(
  response: ActResponse,
  eventType: string,
): string | null {
  if (response.ok) return null
  if (eventType === 'CLEAR_ERROR') return null
  return response.error?.trim() ? response.error : FALLBACK_REFUSAL
}
