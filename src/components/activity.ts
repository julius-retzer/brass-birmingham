// The "N games in progress" line on the charter screen — the pure half.
//
// Kept DOM-free on purpose (same convention as `mp/refusal.ts` and
// `mp/turnNotify.ts`): the fetch-and-swallow policy and the wording are the
// parts worth pinning, and this repo's vitest runs `environment: 'node'` with
// no testing-library. `<ActivityLine>` in `activity-line.tsx` is the thin React
// shell over these two functions.
import type { ActivityStats } from '~/server/mp/store'

export type { ActivityStats }

/**
 * Read `/api/stats`, returning null on ANY failure — offline, DB down, a 500,
 * malformed JSON, an aborted fetch during unmount. This line is decoration on
 * the landing screen: it must never surface an error, and callers render
 * nothing for null. Errors are swallowed silently, not logged, because a
 * console error on every offline dev boot trains people to ignore the console.
 */
export async function fetchActivity(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ActivityStats | null> {
  try {
    const res = await fetchImpl('/api/stats', { signal })
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null) return null
    const { activeGames, activePlayers } = body as Record<string, unknown>
    // Guard the shape rather than trusting it: a proxy/tunnel serving an HTML
    // error page with a 200 would otherwise render "NaN games in progress".
    if (!Number.isFinite(activeGames) || !Number.isFinite(activePlayers)) {
      return null
    }
    return {
      activeGames: activeGames as number,
      activePlayers: activePlayers as number,
    }
  } catch {
    return null
  }
}

/**
 * The rendered sentence, or null when there is nothing worth saying — no data
 * (DB unreachable) and zero games are deliberately the SAME outcome: the line
 * simply is not there. Never renders "0 games in progress".
 */
export function activityLine(stats: ActivityStats | null): string | null {
  if (!stats || stats.activeGames < 1) return null
  const games = `${stats.activeGames} ${stats.activeGames === 1 ? 'table' : 'tables'}`
  // Seat counts can lag the game count (a lobby nobody has claimed yet), so
  // only mention players when there are actually some to mention.
  if (stats.activePlayers < 1) return `${games} in progress`
  const players = `${stats.activePlayers} ${
    stats.activePlayers === 1 ? 'industrialist' : 'industrialists'
  }`
  return `${games} in progress · ${players} at play`
}
