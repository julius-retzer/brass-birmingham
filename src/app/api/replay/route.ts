import { NextResponse } from 'next/server'
import { buildHotseatReplaySnapshot } from '~/server/mp/hotseatReplay'
import { loadIntentLog } from '~/server/mp/store'

export const runtime = 'nodejs'
// Depends on live DB rows for the requested token — never build-time cached.
export const dynamic = 'force-dynamic'

/**
 * Dev/support bridge: reconstruct the snapshot for a PAST MOMENT of a game and
 * hand it to the fully-local hotseat surface (`src/components/game.tsx`,
 * `?replay=<token>&cutoff=<seq>`).
 *
 * Read-only: it loads the source game's durable intent log (`loadIntentLog`)
 * and replays the prefix BEFORE `cutoff` through the real engine seam
 * (`buildHotseatReplaySnapshot` → `replayIntentLog`). It writes NOTHING — no
 * game row is created or touched — and the reconstructed snapshot needs no DB
 * to play once it lands in the browser's hotseat save.
 *
 * `cutoff` is EXCLUSIVE: the board comes back as it stood the instant BEFORE
 * the event logged at that seq. Omit `cutoff` (or pass a value past the last
 * seq) to reconstruct the whole game up to its final logged move.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const cutoffParam = url.searchParams.get('cutoff')
  // Default to the whole game: Infinity keeps every logged intent (< cutoff).
  const cutoff =
    cutoffParam === null || cutoffParam === '' ? Infinity : Number(cutoffParam)
  if (!Number.isFinite(cutoff) && cutoff !== Infinity) {
    return NextResponse.json({ error: 'Malformed cutoff' }, { status: 400 })
  }

  const rows = await loadIntentLog(token)
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No intent log for that token (unknown or unlogged game)' },
      { status: 404 },
    )
  }

  try {
    const { snapshot, steps } = buildHotseatReplaySnapshot(rows, cutoff)
    return NextResponse.json(
      { snapshot, steps },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    // Replay refused the prefix (no leading setup, or a logged event no longer
    // applies) — surface it; it is the interesting bug-report signal.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Replay failed' },
      { status: 422 },
    )
  }
}
