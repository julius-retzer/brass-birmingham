// Rail-era canal-only tile rule (crew-flagged gap, fixed 2026-07-16).
// RULES (ai-docs/brass-birmingham-rules.mdc):
//   p.4 step 2 — "Take the LOWEST level tile of the chosen industry from
//     your Player Mat and place it..."
//   p.7 "Rail Era Building" — "Industry tiles with a blue half-circle to the
//     left of their slot on your Player Mat may not be built. To remove these
//     tiles (and access the higher level tiles) you must perform the develop
//     action."
//   p.9 — "Unlike the other level 1 Industry tiles, the level 1 Pottery tile
//     may be built during the Rail Era."
// Together: the ONLY candidate tile is the lowest remaining on the mat. If it
// is canal-only (blue half-circle), that industry is unbuildable this era
// until Develop removes it. The engine used to filter era-illegal tiles OUT
// and then take the lowest of the remainder — silently auto-skipping the
// canal-only L1 and letting the player build L2 for free.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import {
  getBuildableTileInEra,
  industryTileDefinitions,
} from '../data/industryTiles'
import { eraRestrictionMessage } from './build/buildActions'
import { gameStore } from './gameStore'

const PLAYERS = [
  { id: '1', name: 'P1', color: 'red', character: 'A' },
  { id: '2', name: 'P2', color: 'blue', character: 'B' },
].map((p) => ({
  ...p,
  money: 17,
  victoryPoints: 0,
  income: 0,
  industryTilesOnMat: {},
}))

type Snap = {
  can: (e: unknown) => boolean
  context: {
    era: string
    lastError: string | null
    currentPlayerIndex: number
    selectedIndustryTile: { level: number; type: string } | null
    players: Array<{
      industries: Array<{ type: string; location: string; level: number }>
      industryTilesOnMat: Record<
        string,
        Array<{ tile: { level: number }; quantityAvailable: number }>
      >
    }>
  }
}

type AnyActor = ReturnType<typeof createActor>
const snap = (a: AnyActor) => a.getSnapshot() as unknown as Snap

const tilesAt = (a: AnyActor, loc: string) =>
  snap(a)
    .context.players[0]!.industries.filter((i) => i.location === loc)
    .map((i) => `${i.type}L${i.level}`)
    .sort()

/** Levels still on P1's mat for an industry, lowest first. */
const matLevels = (a: AnyActor, type: string) =>
  (snap(a).context.players[0]!.industryTilesOnMat[type] ?? [])
    .filter((r) => r.quantityAvailable > 0)
    .map((r) => r.tile.level)
    .sort((x, y) => x - y)

/** Burn other players' turns until P1 is on the clock. */
const untilP1 = (a: AnyActor) => {
  for (let i = 0; i < 12 && snap(a).context.currentPlayerIndex !== 0; i++) {
    a.send({ type: 'PASS' } as never)
  }
  expect(snap(a).context.currentPlayerIndex).toBe(0)
}

const start = (era: 'canal' | 'rail') => {
  const a = createActor(gameStore)
  a.start()
  a.send({ type: 'START_GAME', players: PLAYERS } as never)
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 300 } as never)
  a.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, money: 300 } as never)
  if (era === 'rail') a.send({ type: 'TEST_SET_ERA', era: 'rail' } as never)
  return a
}

const giveLocationCard = (a: AnyActor, id: string, location: string) =>
  a.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 0,
    hand: [{ id, type: 'location', location, color: 'other' }],
  } as never)

const giveIndustryCard = (a: AnyActor, id: string, industries: string[]) =>
  a.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 0,
    hand: [{ id, type: 'industry', industries }],
  } as never)

const unwind = (a: AnyActor) => {
  a.send({ type: 'CLEAR_ERROR' } as never)
  for (let i = 0; i < 5; i++) a.send({ type: 'CANCEL' } as never)
}

/** Full build attempt; returns lastError (null on success). */
const buildAs = (a: AnyActor, cardId: string, industryType: string) => {
  a.send({ type: 'BUILD' } as never)
  a.send({ type: 'SELECT_CARD', cardId } as never)
  a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as never)
  a.send({ type: 'CONFIRM' } as never)
  const err = snap(a).context.lastError
  unwind(a)
  return err
}

describe('rail era: canal-only L1 tiles are NOT buildable (Develop first)', () => {
  it('the guard refuses the industry step while the canal-only coal L1 is on the mat', () => {
    const a = start('rail')
    untilP1(a)
    giveLocationCard(a, 'du1', 'dudley')

    // The mat's lowest coal tile is L1 (canal-only, blue half-circle).
    expect(matLevels(a, 'coal')[0]).toBe(1)

    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'du1' } as never)
    expect(
      snap(a).can({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' }),
    ).toBe(false)
    unwind(a)
    a.stop()
  })

  it('forcing the build through anyway places NOTHING and does not skip to L2', () => {
    const a = start('rail')
    untilP1(a)
    giveLocationCard(a, 'du1', 'dudley')

    buildAs(a, 'du1', 'coal')

    expect(tilesAt(a, 'dudley')).toStrictEqual([])
    // The L1 is still on the mat — only Develop removes it.
    expect(matLevels(a, 'coal')[0]).toBe(1)
    a.stop()
  })

  it('the action agrees with the guard: a forced select errors instead of picking L2', () => {
    const a = start('rail')
    untilP1(a)
    giveLocationCard(a, 'du1', 'dudley')

    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'du1' } as never)
    // The guard already refuses this event; selectIndustryType used to be
    // era-ignorant and disagree with it, leaving a dead-end where the tile
    // was selected but the build could never execute.
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' } as never)
    expect(snap(a).context.selectedIndustryTile).toBeNull()
    unwind(a)
    a.stop()
  })

  it('an INDUSTRY card does not auto-select past the canal-only L1 either', () => {
    const a = start('rail')
    untilP1(a)
    giveIndustryCard(a, 'coalcard', ['coal'])

    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'coalcard' } as never)

    // Before the fix this auto-selected coal L2, handing the player a free
    // level skip that the rules charge a Develop action for.
    expect(snap(a).context.selectedIndustryTile).toBeNull()
    unwind(a)
    a.stop()
  })

  it('Develop removes the L1, and THEN the L2 builds', () => {
    const a = start('rail')
    untilP1(a)
    expect(matLevels(a, 'coal')[0]).toBe(1)

    // Develop away the canal-only coal L1.
    giveLocationCard(a, 'dev1', 'dudley')
    a.send({ type: 'DEVELOP' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'dev1' } as never)
    a.send({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['coal'],
    } as never)
    a.send({ type: 'CONFIRM' } as never)
    a.send({ type: 'CONFIRM' } as never)
    expect(snap(a).context.lastError).toBeNull()

    // The L1 is gone; L2 is now the lowest and IS rail-legal.
    expect(matLevels(a, 'coal')[0]).toBe(2)

    untilP1(a)
    giveLocationCard(a, 'du2', 'dudley')
    expect(buildAs(a, 'du2', 'coal')).toBeNull()
    expect(tilesAt(a, 'dudley')).toStrictEqual(['coalL2'])
    a.stop()
  })

  it('level 1 POTTERY is the rulebook exception — still buildable in the Rail Era', () => {
    const a = start('rail')
    untilP1(a)
    // Pottery L1 has no blue half-circle (rules p.9).
    expect(matLevels(a, 'pottery')[0]).toBe(1)
    giveLocationCard(a, 'st1', 'stoke')
    expect(buildAs(a, 'st1', 'pottery')).toBeNull()
    expect(tilesAt(a, 'stoke')).toStrictEqual(['potteryL1'])
    a.stop()
  })
})

describe('getBuildableTileInEra: lowest tile, or nothing', () => {
  /** Whole-mat rows for an industry, as the player starts the game. */
  const mat = (type: string) =>
    (industryTileDefinitions[type] ?? []).map((tile) => ({
      tile,
      quantityAvailable: tile.quantity,
    }))

  /** Mat rows with every tile below `from` already developed away. */
  const matFrom = (type: string, from: number) =>
    mat(type).map((r) =>
      r.tile.level < from ? { ...r, quantityAvailable: 0 } : r,
    )

  it('returns null in rail era while a canal-only L1 blocks the industry', () => {
    for (const type of ['coal', 'iron', 'cotton', 'manufacturer', 'brewery']) {
      expect(getBuildableTileInEra(mat(type), 'rail')).toBeNull()
      expect(getBuildableTileInEra(mat(type), 'canal')?.level).toBe(1)
    }
  })

  it('returns the L2 once the blocking L1 is gone', () => {
    expect(getBuildableTileInEra(matFrom('coal', 2), 'rail')?.level).toBe(2)
  })

  it('pottery L1 is buildable in BOTH eras (rulebook exception)', () => {
    expect(getBuildableTileInEra(mat('pottery'), 'rail')?.level).toBe(1)
    expect(getBuildableTileInEra(mat('pottery'), 'canal')?.level).toBe(1)
  })

  it('rail-only top tiles are refused in the canal era, not skipped down', () => {
    // pottery V and brewery IV carry the black half-circle instead.
    expect(getBuildableTileInEra(matFrom('pottery', 5), 'canal')).toBeNull()
    expect(getBuildableTileInEra(matFrom('pottery', 5), 'rail')?.level).toBe(5)
    expect(getBuildableTileInEra(matFrom('brewery', 4), 'canal')).toBeNull()
  })

  it('an empty mat yields nothing', () => {
    expect(getBuildableTileInEra([], 'rail')).toBeNull()
    expect(getBuildableTileInEra(matFrom('coal', 99), 'rail')).toBeNull()
  })
})

describe('eraRestrictionMessage points the player at Develop', () => {
  it('names the canal-era tile and the Develop way out', () => {
    const coal1 = industryTileDefinitions.coal![0]!
    const msg = eraRestrictionMessage(coal1, 'rail')
    expect(msg).toMatch(/canal/i)
    expect(msg).toMatch(/develop/i)
  })
})

describe('canal era is unaffected', () => {
  it('the canal-only coal L1 builds normally in the Canal Era', () => {
    const a = start('canal')
    untilP1(a)
    giveLocationCard(a, 'du1', 'dudley')
    expect(buildAs(a, 'du1', 'coal')).toBeNull()
    expect(tilesAt(a, 'dudley')).toStrictEqual(['coalL1'])
    a.stop()
  })

  it('an industry card still auto-selects the lowest (L1) tile in the Canal Era', () => {
    const a = start('canal')
    untilP1(a)
    giveIndustryCard(a, 'coalcard', ['coal'])
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'coalcard' } as never)
    expect(snap(a).context.selectedIndustryTile?.level).toBe(1)
    expect(snap(a).context.selectedIndustryTile?.type).toBe('coal')
    unwind(a)
    a.stop()
  })
})
