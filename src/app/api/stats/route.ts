import { NextResponse } from 'next/server'
import { loadActivityStats } from '~/server/mp/store'

export const runtime = 'nodejs'
// Counts change constantly; never let Next serve a build-time snapshot.
export const dynamic = 'force-dynamic'

/**
 * Public liveness counts for the landing screen: how many tables are running
 * right now. Aggregate ONLY — no tokens, no names — so it needs no auth.
 *
 * Cached at the edge for 30s (`s-maxage`): refresh-spam then costs Vercel's
 * cache, not a Neon query. `stale-while-revalidate` keeps the line rendering
 * during the refresh. A DB failure answers zeroes with a 200 rather than a 500
 * — this is decoration on the charter screen, and the caller (`useActivity`)
 * treats "unreachable" and "no games" identically anyway.
 */
export async function GET() {
  try {
    const stats = await loadActivityStats()
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    })
  } catch {
    return NextResponse.json(
      { activeGames: 0, activePlayers: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
