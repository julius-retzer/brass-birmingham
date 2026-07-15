// Saved games and generated fixtures embed COPIES of the industry tile
// definitions (on player mats, on built industries, and in an in-flight
// build selection). The 2026-07-14 data audit corrected many printed
// stats (brewery link icons, pottery levels, costs…), so a game saved
// before the audit would keep playing — and scoring — with the wrong
// numbers. This migration refreshes every embedded tile from the current
// definitions by tile id, appends tiles the audit added (pottery_5), and
// caps mat quantities at the corrected print run.
import { highestSpaceForLevel } from '../data/incomeTrack'
import {
  type IndustryTile,
  industryTileDefinitions,
} from '../data/industryTiles'

const TILE_BY_ID = new Map<string, IndustryTile>(
  Object.values(industryTileDefinitions)
    .flat()
    .map((t) => [t.id, t]),
)

interface TileWithQuantityShape {
  tile?: { id?: string }
  quantityAvailable?: number
}

interface SnapshotShape {
  context?: {
    players?: Array<{
      income?: number
      incomeSpace?: number
      industries?: Array<{ tile?: { id?: string } }>
      industryTilesOnMat?: Record<string, TileWithQuantityShape[]>
    }>
    selectedIndustryTile?: { id?: string } | null
  }
}

/**
 * Refresh all embedded tile stats IN PLACE from the current definitions.
 * Safe on already-current snapshots (no-op) and defensive about shape —
 * anything unexpected is left untouched.
 */
export function refreshEmbeddedTileStats(snapshot: unknown): unknown {
  const ctx = (snapshot as SnapshotShape).context
  if (!ctx?.players) return snapshot

  for (const player of ctx.players) {
    // Saves from before the income-track audit carry only the level —
    // seat the marker on the highest space of that level.
    if (
      typeof player.incomeSpace !== 'number' &&
      typeof player.income === 'number'
    ) {
      player.incomeSpace = highestSpaceForLevel(player.income)
    }
    for (const industry of player.industries ?? []) {
      const current = industry.tile?.id && TILE_BY_ID.get(industry.tile.id)
      if (current) industry.tile = { ...current }
    }

    const mat = player.industryTilesOnMat
    if (!mat) continue
    for (const [industryType, rows] of Object.entries(mat)) {
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const current = row.tile?.id && TILE_BY_ID.get(row.tile.id)
        if (!current) continue
        row.tile = { ...current }
        if (
          typeof row.quantityAvailable === 'number' &&
          row.quantityAvailable > current.quantity
        ) {
          row.quantityAvailable = current.quantity
        }
      }
      // tiles the audit ADDED (e.g. pottery level 5) are missing from
      // old mats — append them with their full print quantity
      for (const def of industryTileDefinitions[industryType] ?? []) {
        if (!rows.some((r) => r.tile?.id === def.id)) {
          rows.push({ tile: { ...def }, quantityAvailable: def.quantity })
        }
      }
    }
  }

  const selected = ctx.selectedIndustryTile
  if (selected?.id) {
    const current = TILE_BY_ID.get(selected.id)
    if (current) ctx.selectedIndustryTile = { ...current }
  }

  return snapshot
}
