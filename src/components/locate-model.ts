// The pure half of hover-to-locate + the command palette's spotlight: which
// cities the map should mark right now, and how a palette pick turns into one.
//
// The board's spotlight used to be exactly one city (the name under the
// cursor). The command palette added a second, TIMED source that can name
// MANY cities at once ("every location with a coal slot"), so the map-facing
// value is now a SET — the union of the hovered name and the live spotlight.
// Hover still writes a single `string | null`; nothing about it changed.
//
// Kept free of React so the transitions are unit-testable (vitest runs with
// `environment: 'node'` — no testing-library here). The stateful half lives in
// `locate.tsx`.

/** How long a palette spotlight stays on the map before clearing itself. */
export const SPOTLIGHT_MS = 5000

export interface SpotlightState {
  /** Cities the palette is spotlighting (empty = no spotlight). */
  cities: ReadonlySet<string>
  /** Pan target for the map's `focusCity`, or null when nothing to pan to. */
  focus: string | null
}

const EMPTY_CITIES: ReadonlySet<string> = new Set<string>()

/** The idle spotlight. Identity-stable so `===` means "nothing spotlit". */
export const NO_SPOTLIGHT: SpotlightState = {
  cities: EMPTY_CITIES,
  focus: null,
}

/**
 * A palette pick as spotlight state. The pan target is the FIRST city given:
 * for a city pick that is the city itself; for an industry pick it is the
 * first location carrying that industry (an arbitrary but deterministic
 * anchor — the pan mechanism no-ops when it is already in view, which is the
 * usual case at the full-board zoom).
 */
export function spotlightFor(cityIds: readonly string[]): SpotlightState {
  if (cityIds.length === 0) return NO_SPOTLIGHT
  return { cities: new Set(cityIds), focus: cityIds[0] ?? null }
}

/**
 * The cities the map should mark: the hovered name plus the live spotlight.
 * Returns an identity-stable empty set when there is nothing to mark, and the
 * spotlight set itself when the hover adds nothing — so a re-render with the
 * same inputs never churns the map's props.
 */
export function mergeLocated(
  hovered: string | null,
  spotlit: ReadonlySet<string>,
): ReadonlySet<string> {
  if (!hovered) return spotlit.size === 0 ? EMPTY_CITIES : spotlit
  if (spotlit.size === 0) return new Set([hovered])
  if (spotlit.has(hovered)) return spotlit
  return new Set([...spotlit, hovered])
}
