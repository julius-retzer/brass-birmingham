'use client'

// Dev-only Stately Inspector wiring for the client-side XState machine.
//
// Opt-in: set NEXT_PUBLIC_XSTATE_INSPECT=1 while running locally / on a
// preview. It is HARD-gated off production (both the Node build env and the
// Vercel env), and the heavy @statelyai/inspect package is loaded via a
// dynamic import so it never lands in the production bundle. When disabled
// (the default) this module does nothing and adds no behaviour.

import { useEffect, useState } from 'react'
import type { InspectionEvent, Observer } from 'xstate'

export type InspectFn = Observer<InspectionEvent>

/**
 * True only when the inspector was explicitly opted into AND we are not in a
 * production build. Both checks read compile-time-inlined env vars so the
 * bundler can tree-shake the dynamic import away in prod.
 */
export function xstateInspectEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_XSTATE_INSPECT === '1' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'
  )
}

// One inspector (one browser window) per page load, shared across remounts.
let inspectorPromise: Promise<InspectFn | undefined> | undefined

function loadInspect(): Promise<InspectFn | undefined> {
  if (!xstateInspectEnabled() || typeof window === 'undefined') {
    return Promise.resolve(undefined)
  }
  if (!inspectorPromise) {
    inspectorPromise = import('@statelyai/inspect')
      .then(({ createBrowserInspector }) => createBrowserInspector().inspect)
      .catch((err) => {
        console.error(
          '[xstate-inspect] failed to load the Stately Inspector',
          err,
        )
        return undefined
      })
  }
  return inspectorPromise
}

/**
 * Returns the inspect observer to feed into `useMachine`, plus a `ready` flag
 * telling the caller when it is safe to create the actor.
 *
 * When the inspector is disabled `ready` is `true` from the first render, so
 * the actor mounts synchronously exactly as before — zero behaviour change.
 * When enabled, `ready` flips to `true` only after the inspector window has
 * loaded, so the machine can be created with the observer already attached
 * and the very first transitions are captured.
 */
export function useXstateInspect(): {
  ready: boolean
  inspect: InspectFn | undefined
} {
  const enabled = xstateInspectEnabled()
  const [inspect, setInspect] = useState<InspectFn | undefined>(undefined)
  const [ready, setReady] = useState(!enabled)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    void loadInspect().then((fn) => {
      if (!alive) return
      setInspect(() => fn)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [enabled])

  return { ready, inspect }
}
