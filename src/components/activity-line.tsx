'use client'

import { useEffect, useState } from 'react'
import { type ActivityStats, activityLine, fetchActivity } from './activity'

/**
 * "2 tables in progress · 5 industrialists at play" under the charter.
 *
 * Client-side and best-effort by design: the charter screen is fully static
 * otherwise, and a DB hiccup must not cost it a render. Renders nothing until
 * data arrives, and nothing at all when the count is zero or `/api/stats` is
 * unreachable (`activityLine` folds both to null) — so an offline dev/e2e boot
 * sees exactly what it saw before this existed. Fetched once on mount: the
 * number is flavour, not a live meter, and polling it would defeat the
 * endpoint's 30s cache.
 */
export function ActivityLine() {
  const [stats, setStats] = useState<ActivityStats | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    void fetchActivity(fetch, ac.signal).then(setStats)
    return () => ac.abort()
  }, [])

  const line = activityLine(stats)
  if (!line) return null

  return (
    <p
      className="bb2-rise flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em]"
      style={{ color: 'rgba(231,215,177,.45)', animationDelay: '0.2s' }}
      data-testid="activity-line"
    >
      <span
        className="inline-block h-1.5 w-1.5 flex-none rounded-full"
        style={{ background: 'var(--bb-brass)' }}
      />
      {line}
    </p>
  )
}
