// The definite reason a disabled action control is disabled.
//
// A disabled confirm used to print a hand-written requirement list ("Two rails
// need £15, 2 coal and 1 beer within reach.") — it never said WHICH requirement
// actually failed or on WHICH link/tile. The engine already knows: `explainRefusal`
// re-derives the one blocking cause from the same validators the guards call.
// This wires that answer onto the control, falling back to the generic line only
// when the engine cannot pin a cause (a wrong reason is worse than a vague one).
//
// CONTRACT mirrors explainRefusal's: it answers "why is this refused", so only
// call it under a control the machine already refuses. The dock only renders the
// result beneath a disabled button, where `can(event)` is already false; the
// `can` short-circuit here keeps that guarantee even if a caller slips.
import type { GameEvent, GameStoreSnapshot } from '~/store/gameStore'
import { explainRefusal } from '~/store/refusal'

export function disabledActionReason(
  snapshot: GameStoreSnapshot,
  event: GameEvent,
  fallback: string,
): string {
  if (snapshot.can(event)) return fallback
  return explainRefusal(snapshot, event) ?? fallback
}
