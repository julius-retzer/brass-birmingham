'use client'

// Tracks intents in flight to the server so the multiplayer UI can show a
// real "syncing" affordance during the POST→SSE round-trip.
//
// Multiplayer is server-authoritative with NO optimistic update: an intent
// only takes visible effect when the NEXT SSE frame lands (a higher server
// `version`). This hook bridges that gap. `begin()` is called the moment an
// intent POSTs and returns a `settle` you call on an error / network failure;
// the SUCCESS settle is implicit — when a frame arrives with a version past
// the one captured at send time, the engine has advanced and the intent is
// done. A per-intent timeout is the ONLY backstop for a dropped/reconnecting
// stream (it clears the VISUAL, never game state).
import { useCallback, useEffect, useRef, useState } from 'react'

/** Backstop only: if no frame ever settles an intent (SSE dropped and slow to
 *  reconnect), clear its visual after this long. Generous on purpose — a
 *  succeeding-but-slow action must not be cleared early. */
export const INFLIGHT_TIMEOUT_MS = 12_000

interface PendingIntent {
  baseVersion: number
  timer: ReturnType<typeof setTimeout>
}

export interface InFlight {
  /** True while ≥1 intent is pending its settling SSE frame. */
  inFlight: boolean
  /** Call the instant an intent POSTs. Returns a `settle` for the error path. */
  begin: () => () => void
}

export function useInFlight(version: number): InFlight {
  const [count, setCount] = useState(0)
  // Read the freshest version inside the stable `begin` without making it a
  // dependency (which would churn the memoized `send`).
  const versionRef = useRef(version)
  versionRef.current = version
  const pending = useRef<Map<number, PendingIntent>>(new Map())
  const idSeq = useRef(0)

  const settleOne = useCallback((id: number) => {
    const rec = pending.current.get(id)
    if (!rec) return
    clearTimeout(rec.timer)
    pending.current.delete(id)
    setCount(pending.current.size)
  }, [])

  // A new authoritative frame (higher version) settles every intent sent
  // before it — the engine has moved past them.
  useEffect(() => {
    let changed = false
    for (const [id, rec] of pending.current) {
      if (version > rec.baseVersion) {
        clearTimeout(rec.timer)
        pending.current.delete(id)
        changed = true
      }
    }
    if (changed) setCount(pending.current.size)
  }, [version])

  const begin = useCallback(() => {
    const id = idSeq.current++
    const timer = setTimeout(() => settleOne(id), INFLIGHT_TIMEOUT_MS)
    pending.current.set(id, { baseVersion: versionRef.current, timer })
    setCount(pending.current.size)
    return () => settleOne(id)
  }, [settleOne])

  // Clear any dangling timers if the table unmounts mid-flight.
  useEffect(() => {
    const map = pending.current
    return () => {
      for (const rec of map.values()) clearTimeout(rec.timer)
      map.clear()
    }
  }, [])

  return { inFlight: count > 0, begin }
}
