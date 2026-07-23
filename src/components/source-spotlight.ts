// The board half of the resource-source question, shared by both surfaces.
//
// While the engine is asking WHERE a resource comes from, every answer is a
// place — so the map lights the breweries, works and mines on offer. The choice
// itself stays engine-owned: this reads `pending{Beer,Iron,Coal}Choice` and
// re-derives no connectivity, ownership or market rule. Sharing the enumeration
// is what keeps the hotseat and multiplayer shells from drifting apart.
import type { GameState } from '~/store/gameStore'
import {
  pendingBeerChoice,
  pendingCoalChoice,
  pendingIronChoice,
} from '~/store/shared/resourceSources'

/** A live or rebuilt snapshot: the step it is parked in, and its context. */
export interface SourceStepState {
  matches: (path: never) => boolean
  context: GameState
}

const BEER_STEPS = [
  'playing.action.selling.choosingBeerSource',
  'playing.action.networking.choosingDoubleLinkBeer',
]

const IRON_STEPS = [
  'playing.action.building.choosingIronSource',
  'playing.action.developing.choosingIronSource',
]

const COAL_STEPS = [
  'playing.action.building.choosingCoalSource',
  'playing.action.networking.choosingLinkCoal',
  'playing.action.networking.choosingDoubleLinkCoal',
]

const inAnyStep = (state: SourceStepState, paths: string[]): boolean =>
  paths.some((path) => state.matches(path as never))

/**
 * The cities holding the sources the open step is offering, or null when no
 * source question is open (or the engine found nothing worth asking).
 *
 * In multiplayer a bystander's view has the acting player's staged selection
 * stripped, so the engine reports no pending choice for them and nothing
 * lights up — the spotlight cannot leak an opponent's in-progress pick.
 */
export function sourceCandidateCities(
  state: SourceStepState,
): Set<string> | null {
  const locations: string[] = []

  if (inAnyStep(state, BEER_STEPS)) {
    const choice = pendingBeerChoice(state.context)
    if (choice?.hasChoice) {
      for (const option of choice.options)
        locations.push(option.source.location)
    }
  } else if (inAnyStep(state, IRON_STEPS)) {
    const choice = pendingIronChoice(state.context)
    if (choice?.hasChoice) {
      for (const option of choice.options) {
        // Market iron sits off the board — there is no plate to light.
        if (option.source.kind === 'ironworks') {
          locations.push(option.source.location)
        }
      }
    }
  } else if (inAnyStep(state, COAL_STEPS)) {
    const choice = pendingCoalChoice(state.context)
    if (choice?.hasChoice) {
      for (const option of choice.options)
        locations.push(option.source.location)
    }
  }

  return locations.length > 0 ? new Set(locations) : null
}
