// The merchant "Develop" beer bonus (Gloucester): consuming that merchant's
// beer during a Sell lets the player remove one of their LOWEST-level industry
// tiles from the Player Mat, for no iron cost (rules p.6, "Merchant Beer
// Bonuses"). The tile removed must be the lowest level of the CHOSEN industry
// (rules p.7, "Develop Action"), and a Pottery tile showing the lightbulb icon
// may never be developed — when it is the lowest tile of its track, that track
// cannot be developed at all until it is built off the mat.
//
// This is the single place that decides which industry tracks a develop bonus
// may target and which specific tile each removes, mirroring resourceSources.ts
// for the coal/beer/iron choices. The machine guards, the AI move enumerator
// and the multiplayer refusal all read from here so they can never disagree.
import type { IndustryType } from '../../data/cards'
import type {
  IndustryTile,
  IndustryTileWithQuantity,
} from '../../data/industryTiles'
import { isDevelopable } from './gameUtils'

export interface DevelopBonusOption {
  industryType: IndustryType
  /** The lowest-level tile of that track — the one this option would remove. */
  tile: IndustryTile
}

/**
 * The industry tracks a develop bonus may remove from this mat, each paired
 * with the exact tile it takes (that track's lowest available tile). A track
 * whose lowest tile carries the lightbulb icon is excluded — it cannot be
 * developed, only built.
 */
export function getDevelopBonusOptions(
  mat: Partial<Record<IndustryType, IndustryTileWithQuantity[]>>,
): DevelopBonusOption[] {
  const options: DevelopBonusOption[] = []
  for (const industryType of Object.keys(mat) as IndustryType[]) {
    const available = (mat[industryType] ?? [])
      .filter((t) => t.quantityAvailable > 0)
      .map((t) => t.tile)
    if (available.length === 0) continue
    const lowest = available.reduce((lo, cur) =>
      cur.level < lo.level ? cur : lo,
    )
    // Only the lowest tile is removable; if it is a lightbulb Pottery, the
    // whole track is off-limits to Develop.
    if (!isDevelopable(lowest)) continue
    options.push({ industryType, tile: lowest })
  }
  return options
}

export interface PendingDevelopChoiceView {
  /** How many tiles the player still owes to this bonus. */
  required: number
  options: DevelopBonusOption[]
  /** Two or more tracks to choose between — a real choice, not an auto-pick. */
  hasChoice: boolean
}

/**
 * The open develop-bonus step, or null when nothing is owed. `hasChoice` is
 * false only defensively — the machine auto-applies a single option at sale
 * time and never enters the choosing state for it, so a pending choice here
 * always offers two or more tracks.
 */
export function pendingDevelopBonusChoice(
  mat: Partial<Record<IndustryType, IndustryTileWithQuantity[]>>,
  remaining: number | null | undefined,
): PendingDevelopChoiceView | null {
  if (!remaining || remaining <= 0) return null
  const options = getDevelopBonusOptions(mat)
  if (options.length === 0) return null
  return { required: remaining, options, hasChoice: options.length >= 2 }
}
