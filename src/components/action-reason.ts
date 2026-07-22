import type { GameEvent, GameStoreSnapshot } from '~/store/gameStore'
import { explainRefusal } from '~/store/refusal'

// explainRefusal's contract is "why is this refused", so only ask once the
// machine already refuses — the `can` short-circuit enforces that.
export function disabledActionReason(
  snapshot: GameStoreSnapshot,
  event: GameEvent,
  fallback: string,
): string {
  if (snapshot.can(event)) return fallback
  return explainRefusal(snapshot, event) ?? fallback
}
