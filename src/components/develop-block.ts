// Which industries the Develop tile picker can and cannot offer, in words.
//
// The picker used to simply omit any industry with no developable tile, so a
// player holding a lightbulb Pottery saw it vanish and had no way to learn WHY
// it could not be scrapped. The picker now lists those industries DISABLED and
// asks this module what to say — mirroring how `double-link-availability`
// explains a refused double rail. Legality itself still comes from
// `isDevelopable` (the same check the engine's Develop action uses); this only
// EXPLAINS the block.
import { type IndustryType, industryDisplayName } from '~/data/cards'
import type { IndustryTileWithQuantity } from '~/data/industryTiles'
import { isDevelopable } from '~/store/shared/gameUtils'

/** The player's mat, keyed by industry — the shape `Player.industryTilesOnMat`. */
export type IndustryMat = Partial<
  Record<IndustryType, IndustryTileWithQuantity[]>
>

/**
 * Rulebook p.7, "Potteries and the Lightbulb Icon": the lightbulb Pottery
 * tiles (levels 1 and 3) may never be developed — they leave the mat only when
 * built over, and block the higher Pottery levels until they do.
 */
export const POTTERY_LIGHTBULB_REASON =
  'Pottery cannot be developed — the lightbulb tiles are removed only by building over them, which then unlocks the higher Pottery levels (rulebook p.7).'

/** Tiles of this industry still on the mat (quantity remaining). */
function heldTiles(
  mat: IndustryMat,
  type: IndustryType,
): IndustryTileWithQuantity[] {
  return (mat[type] || []).filter((t) => t.quantityAvailable > 0)
}

/** Industries with at least one tile the Develop action may legally remove. */
export function developableIndustries(mat: IndustryMat): IndustryType[] {
  return (Object.keys(mat) as IndustryType[]).filter((type) =>
    heldTiles(mat, type).some((t) => isDevelopable(t.tile)),
  )
}

export interface DevelopBlock {
  type: IndustryType
  reason: string
}

/**
 * Industries the player still holds on the mat but cannot develop right now —
 * every remaining tile is flagged non-developable. Each carries the sentence to
 * show under its disabled option. The order follows the mat's own key order so
 * it is stable across renders.
 */
export function blockedIndustries(mat: IndustryMat): DevelopBlock[] {
  const blocks: DevelopBlock[] = []
  for (const type of Object.keys(mat) as IndustryType[]) {
    const held = heldTiles(mat, type)
    if (held.length === 0) continue
    if (held.some((t) => isDevelopable(t.tile))) continue
    const lightbulbPottery = held.some(
      (t) => t.tile.type === 'pottery' && t.tile.hasLightbulbIcon,
    )
    blocks.push({
      type,
      reason: lightbulbPottery
        ? POTTERY_LIGHTBULB_REASON
        : `${industryDisplayName(type)} cannot be developed.`,
    })
  }
  return blocks
}
