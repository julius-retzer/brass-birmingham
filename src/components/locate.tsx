'use client'

// Hover-to-locate: hovering (or keyboard-focusing) a city NAME anywhere in
// the UI spotlights that city's plate on the board map — finding cities on
// the map is genuinely hard (captain's feedback). This module is the shared
// plumbing used by both surfaces (game.tsx and mp/mp-game.tsx): each surface
// owns the `locatedCity` state (so it can feed the map directly) and provides
// it through this context; name-bearing UI reads only the setter.
//
// HOVER is still a plain "one city id or null" value. The map-facing value is
// a SET (`locatedCities`) because a SECOND source shares this spotlight: the
// command palette, which can light up many locations at once ("every location
// with a coal slot") and clears itself after SPOTLIGHT_MS. The union and the
// pick→spotlight transition are pure in `locate-model.ts`.
//
// Note: card-map-sync (auto-pan to a hovered card's city) landed as a SEPARATE
// BoardMap prop (`focusCity`, fed from the hovered card) on purpose —
// name-hover highlights must never move the map. A palette pick DOES pan, and
// does it through that same prop (`spotlightFocus`).
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type CityId, cities } from '~/data/board'
import {
  NO_SPOTLIGHT,
  SPOTLIGHT_MS,
  type SpotlightState,
  mergeLocated,
  spotlightFor,
} from './locate-model'

export interface LocateCityState {
  /** Every city the map should mark: the hovered name plus any spotlight. */
  locatedCities: ReadonlySet<string>
  setLocatedCity: Dispatch<SetStateAction<string | null>>
  /** Palette: spotlight these cities for ~5s (first one is the pan anchor). */
  spotlightCities: (cityIds: readonly string[]) => void
  /** Pan target owned by the live spotlight; null while idle. */
  spotlightFocus: string | null
}

const NO_CITIES: ReadonlySet<string> = new Set<string>()

// Default is a no-op so name components render fine outside a provider
// (setup screen, unit renders) — they just locate nothing.
const LocateCityContext = createContext<LocateCityState>({
  locatedCities: NO_CITIES,
  setLocatedCity: () => {
    // no provider mounted — locating is a no-op
  },
  spotlightCities: () => {
    // no provider mounted — spotlighting is a no-op
  },
  spotlightFocus: null,
})

export const LocateCityProvider = LocateCityContext.Provider

/** Surface-side state holder — call in game.tsx / mp-game.tsx, feed the map. */
export function useLocateCityState(): LocateCityState {
  const [locatedCity, setLocatedCity] = useState<string | null>(null)
  const [spotlight, setSpotlight] = useState<SpotlightState>(NO_SPOTLIGHT)
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (expiry.current) clearTimeout(expiry.current)
    }
  }, [])

  // Re-picking restarts the countdown rather than stacking timers.
  const spotlightCities = useCallback((cityIds: readonly string[]) => {
    if (expiry.current) clearTimeout(expiry.current)
    setSpotlight(spotlightFor(cityIds))
    expiry.current = setTimeout(() => {
      expiry.current = null
      setSpotlight(NO_SPOTLIGHT)
    }, SPOTLIGHT_MS)
  }, [])

  const locatedCities = useMemo(
    () => mergeLocated(locatedCity, spotlight.cities),
    [locatedCity, spotlight],
  )

  return useMemo(
    () => ({
      locatedCities,
      setLocatedCity,
      spotlightCities,
      spotlightFocus: spotlight.focus,
    }),
    [locatedCities, spotlightCities, spotlight.focus],
  )
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
  const { setLocatedCity, spotlightCities } = useContext(LocateCityContext)
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
    return { locate, unlocate, handlersFor, spotlightCities }
  }, [setLocatedCity, spotlightCities])
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
