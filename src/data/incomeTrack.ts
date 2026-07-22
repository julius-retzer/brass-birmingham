// The income Progress Track, audited 2026-07-15 against the retail board
// (ai-docs/reference/board-retail-day-bgg4231616.jpg — the numbered track
// runs around the board edge) and corroborated by the npow/brass-birmingham
// transcription. Structure printed on the board:
//
//   spaces  0-10  → levels -10..0   (1 space per level)
//   spaces 11-30  → levels   1..10  (2 spaces per level)
//   spaces 31-60  → levels  11..20  (3 spaces per level)
//   spaces 61-96  → levels  21..29  (4 spaces per level)
//   spaces 97-99  → level   30
//
// The MARKER lives on a SPACE; the income LEVEL is the coin printed beside
// that space. Industry flips and the Oxford merchant bonus advance SPACES;
// loans drop LEVELS (marker to the highest space of the new level).
// Setup: "Place your Income Marker on the '10' space" — space 10, level 0.

export const STARTING_INCOME_SPACE = 10
export const MAX_INCOME_SPACE = 99

export function incomeLevelForSpace(space: number): number {
  const s = Math.max(0, Math.min(MAX_INCOME_SPACE, space))
  if (s <= 10) return s - 10
  if (s <= 30) return Math.ceil((s - 10) / 2)
  if (s <= 60) return 10 + Math.ceil((s - 30) / 3)
  if (s <= 96) return 20 + Math.ceil((s - 60) / 4)
  return 30
}

/** Highest-numbered space within a level — where a loan drop lands. */
export function highestSpaceForLevel(level: number): number {
  const l = Math.max(-10, Math.min(30, level))
  if (l <= 0) return l + 10
  if (l <= 10) return 10 + 2 * l
  if (l <= 20) return 30 + 3 * (l - 10)
  if (l <= 29) return 60 + 4 * (l - 20)
  return MAX_INCOME_SPACE
}

/** Advance the marker N spaces (never beyond the end of the track). */
export function advanceIncomeSpaces(space: number, spaces: number): number {
  return Math.min(MAX_INCOME_SPACE, Math.max(0, space) + Math.max(0, spaces))
}

/** The lowest and highest income level printed on the track. */
export const MIN_INCOME_LEVEL = -10
export const MAX_INCOME_LEVEL = 30

export interface IncomeTrackLevel {
  /** The income level (= £ collected per round; negative levels are a debt). */
  level: number
  /** Progress-track spaces (0..99) this level spans, ascending. */
  spaces: number[]
}

/**
 * The full income track as an ordered list of levels, each with the exact
 * progress-track spaces it spans — derived entirely from the audited
 * `highestSpaceForLevel`/`incomeLevelForSpace` mapping so the non-linear
 * spacing (1→2→3→4 spaces per level) is never hand-guessed. Ascending by
 * level (lowest income first).
 */
export function incomeTrackLevels(): IncomeTrackLevel[] {
  const levels: IncomeTrackLevel[] = []
  for (let level = MIN_INCOME_LEVEL; level <= MAX_INCOME_LEVEL; level++) {
    const last = highestSpaceForLevel(level)
    const prev = level > MIN_INCOME_LEVEL ? highestSpaceForLevel(level - 1) : -1
    const spaces: number[] = []
    for (let space = prev + 1; space <= last; space++) spaces.push(space)
    levels.push({ level, spaces })
  }
  return levels
}
