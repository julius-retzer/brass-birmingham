// Pins for the income Progress Track mapping, read space-by-space from the
// retail board photo (ai-docs/reference/board-retail-day-bgg4231616.jpg)
// and corroborated by npow/brass-birmingham. Every band boundary below was
// verified against the printed coins on the photographed track.
import { describe, expect, it } from 'vitest'
import {
  MAX_INCOME_LEVEL,
  MAX_INCOME_SPACE,
  MIN_INCOME_LEVEL,
  STARTING_INCOME_SPACE,
  advanceIncomeSpaces,
  highestSpaceForLevel,
  incomeLevelForSpace,
  incomeTrackLevels,
} from './incomeTrack'

describe('income track — space → level mapping (retail board)', () => {
  it('spaces 0-10 carry levels -10..0, one space per level', () => {
    expect(incomeLevelForSpace(0)).toBe(-10)
    expect(incomeLevelForSpace(1)).toBe(-9)
    expect(incomeLevelForSpace(7)).toBe(-3)
    expect(incomeLevelForSpace(9)).toBe(-1)
    expect(incomeLevelForSpace(10)).toBe(0)
  })

  it('spaces 11-30 carry levels 1..10, two spaces per level', () => {
    expect(incomeLevelForSpace(11)).toBe(1)
    expect(incomeLevelForSpace(12)).toBe(1)
    expect(incomeLevelForSpace(13)).toBe(2)
    // photographed: coin 8 sits beside 25/26, coin 9 beside 27/28,
    // coin 10 beside 29/30
    expect(incomeLevelForSpace(25)).toBe(8)
    expect(incomeLevelForSpace(26)).toBe(8)
    expect(incomeLevelForSpace(27)).toBe(9)
    expect(incomeLevelForSpace(28)).toBe(9)
    expect(incomeLevelForSpace(29)).toBe(10)
    expect(incomeLevelForSpace(30)).toBe(10)
  })

  it('spaces 31-60 carry levels 11..20, three spaces per level', () => {
    // photographed: 31/32/33 → 11, 34/35/36 → 12, … 58/59/60 → 20
    expect(incomeLevelForSpace(31)).toBe(11)
    expect(incomeLevelForSpace(33)).toBe(11)
    expect(incomeLevelForSpace(34)).toBe(12)
    expect(incomeLevelForSpace(45)).toBe(15)
    expect(incomeLevelForSpace(58)).toBe(20)
    expect(incomeLevelForSpace(60)).toBe(20)
  })

  it('spaces 61-96 carry levels 21..29, four spaces per level', () => {
    // photographed: 61-64 → 21, 65-68 → 22, 69-72 → 23, … 93-96 → 29
    expect(incomeLevelForSpace(61)).toBe(21)
    expect(incomeLevelForSpace(64)).toBe(21)
    expect(incomeLevelForSpace(65)).toBe(22)
    expect(incomeLevelForSpace(72)).toBe(23)
    expect(incomeLevelForSpace(93)).toBe(29)
    expect(incomeLevelForSpace(96)).toBe(29)
  })

  it('spaces 97-99 carry level 30 (end of track)', () => {
    expect(incomeLevelForSpace(97)).toBe(30)
    expect(incomeLevelForSpace(99)).toBe(30)
  })

  it('setup: the marker starts on space 10 = income level 0', () => {
    expect(STARTING_INCOME_SPACE).toBe(10)
    expect(incomeLevelForSpace(STARTING_INCOME_SPACE)).toBe(0)
  })
})

describe('income track — helpers', () => {
  it('highestSpaceForLevel is the loan landing space', () => {
    expect(highestSpaceForLevel(0)).toBe(10)
    expect(highestSpaceForLevel(-3)).toBe(7)
    expect(highestSpaceForLevel(-10)).toBe(0)
    expect(highestSpaceForLevel(1)).toBe(12)
    expect(highestSpaceForLevel(10)).toBe(30)
    expect(highestSpaceForLevel(11)).toBe(33)
    expect(highestSpaceForLevel(20)).toBe(60)
    expect(highestSpaceForLevel(21)).toBe(64)
    expect(highestSpaceForLevel(29)).toBe(96)
    expect(highestSpaceForLevel(30)).toBe(99)
  })

  it('level and space helpers are mutually consistent across the track', () => {
    for (let level = -10; level <= 30; level++) {
      expect(incomeLevelForSpace(highestSpaceForLevel(level))).toBe(level)
    }
    for (let space = 0; space <= MAX_INCOME_SPACE; space++) {
      const level = incomeLevelForSpace(space)
      expect(highestSpaceForLevel(level)).toBeGreaterThanOrEqual(space)
    }
  })

  it('advancement moves by spaces and stops at 99', () => {
    expect(advanceIncomeSpaces(10, 5)).toBe(15)
    expect(incomeLevelForSpace(advanceIncomeSpaces(10, 5))).toBe(3)
    expect(advanceIncomeSpaces(97, 10)).toBe(99)
  })
})

describe('income track — full-track view derivation', () => {
  const track = incomeTrackLevels()

  it('covers every level from -10 to 30 in ascending order', () => {
    expect(track[0]!.level).toBe(MIN_INCOME_LEVEL)
    expect(track[track.length - 1]!.level).toBe(MAX_INCOME_LEVEL)
    expect(track.map((l) => l.level)).toEqual(
      Array.from(
        { length: MAX_INCOME_LEVEL - MIN_INCOME_LEVEL + 1 },
        (_, i) => MIN_INCOME_LEVEL + i,
      ),
    )
  })

  it('reproduces the non-linear spacing (1→2→3→4 spaces per level)', () => {
    const spacesFor = (level: number) =>
      track.find((l) => l.level === level)!.spaces.length
    expect(spacesFor(-10)).toBe(1)
    expect(spacesFor(0)).toBe(1)
    expect(spacesFor(1)).toBe(2)
    expect(spacesFor(10)).toBe(2)
    expect(spacesFor(11)).toBe(3)
    expect(spacesFor(20)).toBe(3)
    expect(spacesFor(21)).toBe(4)
    expect(spacesFor(29)).toBe(4)
    expect(spacesFor(30)).toBe(3)
  })

  it('spaces tile the whole track 0..99 with no gaps or overlaps', () => {
    const all = track.flatMap((l) => l.spaces)
    expect(all).toEqual(
      Array.from({ length: MAX_INCOME_SPACE + 1 }, (_, i) => i),
    )
  })

  it('every space maps back to its own level', () => {
    for (const { level, spaces } of track) {
      for (const space of spaces) {
        expect(incomeLevelForSpace(space)).toBe(level)
      }
    }
  })
})
