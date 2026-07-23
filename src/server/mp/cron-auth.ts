// Auth for the Vercel-Cron sweep endpoint.
//
// Vercel Cron invokes the endpoint with `Authorization: Bearer <CRON_SECRET>`
// when the `CRON_SECRET` env var is set on the project (the documented,
// vendor-native pattern — no extra service). We REQUIRE the secret: if the
// server has no `CRON_SECRET` configured, every request is refused, so the
// sweep can never be triggered unauthenticated. The check is a pure function so
// it can be unit-tested without a request or a DB.
import { timingSafeEqual } from 'node:crypto'

export interface CronAuthResult {
  ok: boolean
  /** HTTP status to return when not ok (401 unauthorized / 500 misconfigured) */
  status?: number
  error?: string
}

/** Constant-time compare of two strings (length-safe). */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/**
 * Decide whether a cron request is authorized.
 *  - No `CRON_SECRET` on the server → 500 misconfigured, never run.
 *  - Header must be exactly `Bearer <CRON_SECRET>` (constant-time compared).
 *  - Anything else → 401.
 */
export function authorizeCron(
  authHeader: string | null | undefined,
  cronSecret: string | undefined,
): CronAuthResult {
  if (!cronSecret) {
    return {
      ok: false,
      status: 500,
      error: 'Sweep endpoint is not configured (no CRON_SECRET on the server).',
    }
  }
  const expected = `Bearer ${cronSecret}`
  if (!authHeader || !secretsMatch(authHeader, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}
