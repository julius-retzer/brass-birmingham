// Why the "Build two rails" affordance is unavailable, in words.
//
// The dock used to render that button only when the machine's
// `CHOOSE_DOUBLE_LINK_BUILD` guard passed, so a player with no reachable
// beer never saw it at all and double rail looked like it didn't exist.
// The dock now renders it DISABLED instead, and asks this module what to
// say. Legality itself still comes from the machine (`snapshot.can`) — this
// only EXPLAINS a refusal the machine has already made, mirroring the
// `canBuildSecondLink` guard's checks in the same order.
import type { GameState } from '~/store/gameStore'

/**
 * Whether the double-rail option belongs on screen at all. Double rail is a
 * Rail Era rule — in the Canal Era it doesn't exist, so it is hidden rather
 * than disabled (an option that can never apply is noise, not information).
 */
export function showsDoubleLinkOption(context: GameState): boolean {
  return context.era === 'rail'
}

/**
 * The reason `CHOOSE_DOUBLE_LINK_BUILD` is refused, phrased for a player.
 * Returns `null` when nothing this module knows about is missing — the
 * caller should fall back to a generic message rather than claim a cause.
 */
export function explainDoubleLinkUnavailable(
  context: GameState,
): string | null {
  if (context.era !== 'rail') {
    return 'Two rails can only be laid in the Rail Era.'
  }
  if (!context.selectedLink) {
    return 'Choose your first route before adding a second.'
  }

  const hasBeer = context.players.some((player) =>
    player.industries.some(
      (industry) =>
        industry.type === 'brewery' &&
        !industry.flipped &&
        industry.beerBarrelsOnTile > 0,
    ),
  )
  if (!hasBeer) {
    return 'Needs 1 beer — no brewery with a barrel left stands on the board.'
  }

  return null
}

/**
 * Said when the machine refuses the option for a reason this module cannot
 * name — it lists the full price rather than guessing which part is missing.
 */
export const DOUBLE_LINK_GENERIC_REASON =
  'Two rails need £15, 2 coal and 1 beer within reach.'

/** The line to print under a disabled "Build two rails" — always a sentence. */
export function doubleLinkDisabledReason(context: GameState): string {
  return explainDoubleLinkUnavailable(context) ?? DOUBLE_LINK_GENERIC_REASON
}
