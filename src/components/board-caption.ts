// The board's one-line caption: what the map is asking for right now, shown
// in the board frame's own chrome (a strip in normal flow above the svg —
// never an overlay on the play area). Shared by both surfaces, like
// legal-targets.ts and source-spotlight.ts, so the wording cannot drift.
//
// It renders ONLY when the next tap is on the board: a build's site pick, a
// network route pick, and the beer/iron/coal source steps whose candidates
// the map already spotlights. Every count comes from sets the engine's own
// guards produced — no rule is re-derived here.
import type { GameState } from '~/store/gameStore'
import {
  BEER_STEPS,
  COAL_STEPS,
  IRON_STEPS,
  type SourceStepState,
} from './source-spotlight'

export interface BoardCaptionInputs {
  /** Legal SELECT_LOCATION targets (null = not picking a site). */
  legalCities: ReadonlySet<string> | null
  /** Legal link targets, keyed both orders (null = not picking a route). */
  legalLinks: ReadonlySet<string> | null
  /** Cities the open source step spotlights (sourceCandidateCities). */
  sourceCities: ReadonlySet<string> | null
}

interface CaptionState {
  matches: (path: never) => boolean
  context: GameState
}

const inAnyStep = (state: SourceStepState, paths: readonly string[]): boolean =>
  paths.some((path) => state.matches(path as never))

export function boardCaption(
  state: CaptionState,
  { legalCities, legalLinks, sourceCities }: BoardCaptionInputs,
): string | null {
  const is = (path: string) => state.matches(path as never)
  const ctx = state.context

  if (is('playing.action.building.selectingLocation')) {
    const t = ctx.selectedIndustryTile?.type
    const n = legalCities?.size ?? 0
    return `Choose a site for your ${t === 'manufacturer' ? 'goods works' : (t ?? 'industry')} — ${n} legal ${n === 1 ? 'city' : 'cities'}`
  }

  const pickingSecondLink = is('playing.action.networking.selectingSecondLink')
  if (is('playing.action.networking.selectingLink') || pickingSecondLink) {
    const n = (legalLinks?.size ?? 0) / 2
    return `Choose ${pickingSecondLink ? 'a second' : 'a'} ${ctx.era} route — ${n} available`
  }

  // Source steps only park the machine when there is a real choice; a
  // bystander's filtered view carries no staged selection, so their
  // sourceCities is null and no caption shows for them.
  if (sourceCities && sourceCities.size > 0) {
    const n = sourceCities.size
    const lit = `${n} lit on the map`
    if (inAnyStep(state, BEER_STEPS)) return `Choose a beer source — ${lit}`
    if (inAnyStep(state, IRON_STEPS)) return `Choose an iron works — ${lit}`
    if (inAnyStep(state, COAL_STEPS)) return `Choose a coal mine — ${lit}`
  }

  return null
}
