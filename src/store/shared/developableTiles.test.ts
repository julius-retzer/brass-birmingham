// Develop is lowest-first and a lightbulb Pottery blocks its whole track
// (rulebook p.7). These pin the two pure helpers the guard/executor read —
// counting or targeting a tile ABOVE a lightbulb was the captain's bug
// (Pottery II/IV offered while the lightbulb Pottery I still sat on the mat).
import { describe, expect, test } from 'vitest'
import {
  type IndustryTile,
  type IndustryTileWithQuantity,
  getDevelopableTileOnMat,
} from '../../data/industryTiles'
import { developableTileQuantity } from './gameUtils'

const tile = (
  type: IndustryTile['type'],
  level: number,
  hasLightbulbIcon = false,
): IndustryTile =>
  ({
    id: `${type}_${level}`,
    type,
    level,
    canBuildInCanalEra: true,
    canBuildInRailEra: true,
    incomeAdvancement: 0,
    incomeSpaces: 0,
    victoryPoints: 0,
    cost: 0,
    linkScoringIcons: 0,
    coalRequired: 0,
    ironRequired: 0,
    beerRequired: 0,
    beerProduced: 0,
    coalProduced: 0,
    ironProduced: 0,
    hasLightbulbIcon,
    quantity: 1,
  }) as IndustryTile

const held = (
  t: IndustryTile,
  quantityAvailable = 1,
): IndustryTileWithQuantity => ({ tile: t, quantityAvailable })

describe('developableTileQuantity — lowest-first, blocked by a lightbulb', () => {
  test('a track with no lightbulbs sums all held quantity', () => {
    expect(
      developableTileQuantity([
        held(tile('coal', 1), 2),
        held(tile('coal', 2)),
      ]),
    ).toBe(3)
  })

  test('a lightbulb at the bottom makes the whole track non-developable', () => {
    // Pottery I (lightbulb) present → 0, even with II/IV above it.
    expect(
      developableTileQuantity([
        held(tile('pottery', 1, true)),
        held(tile('pottery', 2)),
        held(tile('pottery', 3, true)),
        held(tile('pottery', 4)),
      ]),
    ).toBe(0)
  })

  test('once the lightbulb bottom is gone, count stops at the next lightbulb', () => {
    // I built away; II developable, III (lightbulb) blocks IV → exactly 1.
    expect(
      developableTileQuantity([
        held(tile('pottery', 1, true), 0),
        held(tile('pottery', 2)),
        held(tile('pottery', 3, true)),
        held(tile('pottery', 4)),
      ]),
    ).toBe(1)
  })
})

describe('getDevelopableTileOnMat — the single develop target', () => {
  test('returns the true lowest of a clean track', () => {
    expect(
      getDevelopableTileOnMat([
        held(tile('cotton', 2)),
        held(tile('cotton', 1)),
      ])?.level,
    ).toBe(1)
  })

  test('returns null when the lowest tile is a lightbulb (never skips up)', () => {
    expect(
      getDevelopableTileOnMat([
        held(tile('pottery', 1, true)),
        held(tile('pottery', 2)),
      ]),
    ).toBeNull()
  })

  test('returns the new lowest after the lightbulb bottom is removed', () => {
    expect(
      getDevelopableTileOnMat([
        held(tile('pottery', 1, true), 0),
        held(tile('pottery', 2)),
      ])?.level,
    ).toBe(2)
  })
})
