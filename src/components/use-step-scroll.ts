'use client'

// The applied half of step-scroll.ts, shared by both shells: on a wizard
// step change, scroll the surface that owns the next tap into view — phone
// only (desktop is viewport-locked, the scroll is a no-op there and skipped).
// The decision logic (which surface, the don't-fight-the-player window) is
// pure and unit-tested in step-scroll.ts.
import { useEffect, useRef } from 'react'
import { shouldStepScroll, stepKey, stepScrollTarget } from './step-scroll'

interface StepState {
  matches: (path: never) => boolean
}

/** How long our own smooth scroll may emit scroll events without counting
 * as the player scrolling (the suppression window must not eat itself). */
const OWN_SCROLL_MS = 1000

export function useStepScroll(
  state: StepState | null,
  boardRef: React.RefObject<HTMLElement | null>,
  dockRef: React.RefObject<HTMLElement | null>,
): void {
  const lastUserScrollAt = useRef<number | null>(null)
  const ownScrollAt = useRef<number | null>(null)
  const prevStepRef = useRef<string | null>(null)

  useEffect(() => {
    const mark = () => {
      const now = Date.now()
      if (
        ownScrollAt.current !== null &&
        now - ownScrollAt.current < OWN_SCROLL_MS
      )
        return
      lastUserScrollAt.current = now
    }
    // Capture catches the aside's inner scroller as well as the page; the
    // board's pan gesture is pointer-driven, so touchmove covers it too.
    window.addEventListener('scroll', mark, { passive: true, capture: true })
    window.addEventListener('touchmove', mark, { passive: true })
    window.addEventListener('wheel', mark, { passive: true })
    return () => {
      window.removeEventListener('scroll', mark, { capture: true })
      window.removeEventListener('touchmove', mark)
      window.removeEventListener('wheel', mark)
    }
  }, [])

  useEffect(() => {
    if (!state) return
    const matches = (p: never) => state.matches(p)
    const step = stepKey(matches)
    const prevStep = prevStepRef.current
    prevStepRef.current = step

    const isPhone = !window.matchMedia('(min-width: 1024px)').matches
    if (
      !shouldStepScroll({
        prevStep,
        step,
        isPhone,
        now: Date.now(),
        lastUserScrollAt: lastUserScrollAt.current,
      })
    )
      return

    const surface = stepScrollTarget(matches)
    const el = surface === 'board' ? boardRef.current : dockRef.current
    if (!el) return
    ownScrollAt.current = Date.now()
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [state, boardRef, dockRef])
}
