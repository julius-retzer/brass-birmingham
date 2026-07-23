// The player mat as the Develop picking surface — the machine-facing half.
//
// When the machine sits in any `developing` tile step, both surfaces
// (`game.tsx` hotseat and `mp/mp-game.tsx`) open the PlayerLedger in develop
// mode and drive it from THIS view: which industries a mat click may pick,
// which exact tile a pick would peel off, and what event each interaction
// sends. Legality is never re-derived here — `canPick` asks the machine's own
// `canSelectTilesForDevelop` guard via `can()`, and a rejected pick is
// explained by `explainRefusal` (engine-owned legality, AGENTS.md).
import type { IndustryType } from '~/data/cards'
import type { GameEvent, GameStoreSnapshot } from '~/store/gameStore'
import { isDevelopable } from '~/store/shared/gameUtils'
import {
  type IronChoice,
  type IronSource,
  pendingIronChoice,
} from '~/store/shared/resourceSources'
import { disabledActionReason } from './action-reason'

export type DevelopStep = 'tiles' | 'iron' | 'confirm'

/** The mat shape `Player.industryTilesOnMat` holds. */
type IndustryMat = Partial<
  Record<
    IndustryType,
    Array<{
      tile: {
        id: string
        level: number
        type: IndustryType
        hasLightbulbIcon: boolean
      }
      quantityAvailable: number
    }>
  >
>

export interface DevelopMatView {
  /** Which develop step the machine is on. */
  step: DevelopStep
  /** Tiles already staged for this develop, straight from machine context. */
  staged: IndustryType[]
  /** May a mat click add one more tile of this industry? Asks `can()`. */
  canPick: (type: IndustryType) => boolean
  /** The engine's reason a pick of this industry is refused. */
  pickReason: (type: IndustryType) => string
  /** The event a mat click sends: the staged picks plus one more. */
  pickEvent: (type: IndustryType) => GameEvent
  /**
   * The event that removes one staged pick: a smaller re-pick, or a CANCEL
   * back to the tile step when the last staged tile is returned.
   */
  unstageEvent: (index: number) => GameEvent
  /** The open iron question, when the machine stopped to ask it. */
  ironChoice: IronChoice | null
  /** Iron sources already assigned this flow (feeds the picker's ×N tags). */
  ironPicks: IronSource[]
  /** CONFIRM legality + the engine's reason when refused. */
  canConfirm: boolean
  confirmReason: string
}

/**
 * The develop-mode view of the machine, or null when the machine is not on a
 * develop tile step (the card step keeps the hand tray as its surface).
 */
export function developMatView(
  snapshot: GameStoreSnapshot,
): DevelopMatView | null {
  const at = (path: string) => snapshot.matches(path as never)
  const step: DevelopStep | null = at(
    'playing.action.developing.selectingTiles',
  )
    ? 'tiles'
    : at('playing.action.developing.choosingIronSource')
      ? 'iron'
      : at('playing.action.developing.confirmingDevelop')
        ? 'confirm'
        : null
  if (step === null) return null

  const staged = snapshot.context.selectedTilesForDevelop
  const pickEvent = (type: IndustryType): GameEvent => ({
    type: 'SELECT_TILES_FOR_DEVELOP',
    industryTypes: [...staged, type],
  })

  return {
    step,
    staged,
    canPick: (type) => snapshot.can(pickEvent(type) as never),
    pickReason: (type) =>
      disabledActionReason(
        snapshot,
        pickEvent(type),
        'That tile cannot be developed right now.',
      ),
    pickEvent,
    unstageEvent: (index) => {
      const rest = staged.filter((_, i) => i !== index)
      return rest.length > 0
        ? { type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: rest }
        : { type: 'CANCEL' }
    },
    ironChoice: step === 'iron' ? pendingIronChoice(snapshot.context) : null,
    ironPicks: snapshot.context.chosenIronSources ?? [],
    canConfirm: snapshot.can({ type: 'CONFIRM' } as never),
    confirmReason: disabledActionReason(
      snapshot,
      { type: 'CONFIRM' },
      'This develop cannot be completed.',
    ),
  }
}

/**
 * Which exact tiles the staged picks would peel off the mat, in pick order —
 * the presentation preview the ledger animates. Mirrors the executor
 * (`executeDevelopAction`): each pick scraps the LOWEST developable tile of
 * its track, counting earlier staged picks as already gone. Preview only;
 * legality stays with the guard.
 */
export function stagedRemovals(
  mat: IndustryMat,
  staged: IndustryType[],
): Array<{ type: IndustryType; tileId: string; level: number }> {
  const taken = new Map<string, number>()
  const removals: Array<{
    type: IndustryType
    tileId: string
    level: number
  }> = []
  for (const type of staged) {
    const next = [...(mat[type] ?? [])]
      .sort((a, b) => a.tile.level - b.tile.level)
      .find(
        (t) =>
          isDevelopable(t.tile) &&
          t.quantityAvailable - (taken.get(t.tile.id) ?? 0) > 0,
      )
    if (!next) continue
    taken.set(next.tile.id, (taken.get(next.tile.id) ?? 0) + 1)
    removals.push({ type, tileId: next.tile.id, level: next.tile.level })
  }
  return removals
}
