'use client'

// Hover-to-locate: hovering (or keyboard-focusing) a city NAME anywhere in
// the UI spotlights that city's plate on the board map — finding cities on
// the map is genuinely hard (captain's feedback). This module is the shared
// plumbing used by both surfaces (game.tsx and mp/mp-game.tsx): each surface
// owns the `locatedCity` state (so it can feed the map directly) and provides
// it through this context; name-bearing UI reads only the setter.
//
// The state is deliberately a plain "one city id or null" value. Note:
// card-map-sync (auto-pan to a hovered card's city) landed as a SEPARATE
// BoardMap prop (`focusCity`, fed from the hovered card) on purpose —
// name-hover highlights must never move the map, card hover may.
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type CityId, cities } from '~/data/board'

export interface LocateCityState {
  locatedCity: string | null
  setLocatedCity: Dispatch<SetStateAction<string | null>>
}

// Default is a no-op so name components render fine outside a provider
// (setup screen, unit renders) — they just locate nothing.
const LocateCityContext = createContext<LocateCityState>({
  locatedCity: null,
  setLocatedCity: () => {
    // no provider mounted — locating is a no-op
  },
})

export const LocateCityProvider = LocateCityContext.Provider

/** Surface-side state holder — call in game.tsx / mp-game.tsx, feed the map. */
export function useLocateCityState(): LocateCityState {
  const [locatedCity, setLocatedCity] = useState<string | null>(null)
  return useMemo(() => ({ locatedCity, setLocatedCity }), [locatedCity])
}

export interface LocateHandlers {
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
}

/**
 * Locate/unlocate callbacks plus a handler factory for elements that are
 * already interactive (picker option buttons). `unlocate` clears only its
 * own city, so interleaved hovers never wipe a fresher highlight.
 */
export function useLocateCity() {
  const { setLocatedCity } = useContext(LocateCityContext)
  return useMemo(() => {
    const locate = (cityId: string) => setLocatedCity(cityId)
    const unlocate = (cityId: string) =>
      setLocatedCity((prev) => (prev === cityId ? null : prev))
    const handlersFor = (
      cityId: string | null | undefined,
    ): LocateHandlers | undefined => {
      if (!cityId) return undefined
      const enter = () => locate(cityId)
      const leave = () => unlocate(cityId)
      return {
        onMouseEnter: enter,
        onMouseLeave: leave,
        onFocus: enter,
        onBlur: leave,
      }
    }
    return { locate, unlocate, handlersFor }
  }, [setLocatedCity])
}

/**
 * A city name that locates its city on the map while hovered or focused.
 * Renders the board's display name unless children are given. `passive`
 * drops the handlers and focusability for names inside elements that already
 * carry locate handlers themselves (picker buttons) — the span then only
 * contributes the dotted-underline affordance.
 */
export function CityName({
  cityId,
  children,
  passive = false,
  focusable = true,
}: {
  cityId: string
  children?: ReactNode
  passive?: boolean
  /** Set false inside interactive parents to keep them a single tab stop. */
  focusable?: boolean
}) {
  const { locate, unlocate } = useLocateCity()
  // If the name unmounts mid-hover (a picker step closing under the cursor)
  // no mouseleave ever fires — release the highlight ourselves.
  const hovering = useRef(false)
  useEffect(() => {
    return () => {
      if (hovering.current) unlocate(cityId)
    }
  }, [cityId, unlocate])

  const label = children ?? cities[cityId as CityId]?.name ?? cityId
  if (passive) {
    return (
      <span className="bb2-locate-name" data-locate-city={cityId}>
        {label}
      </span>
    )
  }
  const enter = () => {
    hovering.current = true
    locate(cityId)
  }
  const leave = () => {
    hovering.current = false
    unlocate(cityId)
  }
  return (
    <span
      className="bb2-locate-name"
      data-locate-city={cityId}
      tabIndex={focusable ? 0 : undefined}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      {label}
    </span>
  )
}
