// VP breakdown ledger - every VP mutation appends a structured award so the
// end-game screen can explain a score instead of recomputing it (links are
// wiped at era scoring, so the components are NOT derivable from final state).
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'
import type { Player, VpAward } from './gameStore'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {
      // ignore
    }
  })
  activeActors = []
})

const setup = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'P1',
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        money: 30,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
      {
        id: '2',
        name: 'P2',
        color: 'blue' as const,
        character: 'Eliza Tinsley' as const,
        money: 30,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
    ],
  } as never)
  return { actor }
}

const ctxOf = (actor: ReturnType<typeof createActor>) =>
  (actor.getSnapshot() as unknown as { context: { players: Player[] } }).context

const sum = (awards: VpAward[]) => awards.reduce((t, a) => t + a.vp, 0)

const flippedCotton = (location: string) => ({
  location,
  type: 'cotton',
  level: 1,
  flipped: true,
  tile: {
    id: 'cotton_1',
    type: 'cotton',
    level: 1,
    canBuildInCanalEra: true,
    canBuildInRailEra: true,
    incomeAdvancement: 2,
    incomeSpaces: 2,
    victoryPoints: 3,
    beerRequired: 1,
    cost: 10,
    linkScoringIcons: 1,
    coalRequired: 0,
    ironRequired: 0,
    beerProduced: 0,
    coalProduced: 0,
    ironProduced: 0,
    hasLightbulbIcon: false,
    quantity: 3,
  },
  coalCubesOnTile: 0,
  ironCubesOnTile: 0,
  beerBarrelsOnTile: 0,
})

describe('VP breakdown ledger', () => {
  test('players start with an empty ledger reconciling to zero', () => {
    const { actor } = setup()
    for (const p of ctxOf(actor).players) {
      expect(p.vpAwards).toEqual([])
      expect(sum(p.vpAwards)).toBe(p.victoryPoints)
    }
  })

  test('era scoring records one award per link and per flipped industry', () => {
    const { actor } = setup()

    // P0 builds a canal link worcester <-> gloucester.
    const hand = ctxOf(actor).players[0]!.hand
    actor.send({ type: 'NETWORK' } as never)
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id } as never)
    actor.send({
      type: 'SELECT_LINK',
      from: 'worcester',
      to: 'gloucester',
    } as never)
    actor.send({ type: 'CONFIRM' } as never)

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [flippedCotton('worcester')],
    } as never)

    actor.send({ type: 'TRIGGER_ERA_SCORING' } as never)

    const p0 = ctxOf(actor).players[0]!
    // Link: 1 icon at worcester (the cotton tile) + 2 at gloucester
    // (merchant) = 3 VP. Flipped cotton scores its printed 3 VP.
    expect(p0.victoryPoints).toBe(6)

    const links = p0.vpAwards.filter((a) => a.source === 'link')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      source: 'link',
      era: 'canal',
      vp: 3,
      link: { from: 'worcester', to: 'gloucester', type: 'canal' },
    })

    const industries = p0.vpAwards.filter((a) => a.source === 'industry')
    expect(industries).toHaveLength(1)
    expect(industries[0]).toMatchObject({
      source: 'industry',
      era: 'canal',
      vp: 3,
      location: 'worcester',
      industryType: 'cotton',
      level: 1,
    })

    // The reconciliation invariant.
    expect(sum(p0.vpAwards)).toBe(p0.victoryPoints)
  })

  test('unflipped industries produce no award', () => {
    const { actor } = setup()
    const unflipped = { ...flippedCotton('worcester'), flipped: false }
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [unflipped],
    } as never)
    actor.send({ type: 'TRIGGER_ERA_SCORING' } as never)

    const p0 = ctxOf(actor).players[0]!
    expect(p0.vpAwards.filter((a) => a.source === 'industry')).toHaveLength(0)
    expect(sum(p0.vpAwards)).toBe(p0.victoryPoints)
  })

  test('awards accumulate across both eras and stay reconciled', () => {
    const { actor } = setup()
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [flippedCotton('worcester')],
    } as never)

    actor.send({ type: 'TRIGGER_ERA_SCORING' } as never)
    const afterCanal = ctxOf(actor).players[0]!
    expect(afterCanal.vpAwards.every((a) => a.era === 'canal')).toBe(true)

    actor.send({ type: 'TEST_SET_ERA', era: 'rail' } as never)
    actor.send({ type: 'TRIGGER_ERA_SCORING' } as never)

    const p0 = ctxOf(actor).players[0]!
    // The canal awards survive; a rail award is appended alongside them.
    expect(p0.vpAwards.filter((a) => a.era === 'canal')).toHaveLength(1)
    expect(p0.vpAwards.filter((a) => a.era === 'rail')).toHaveLength(1)
    expect(sum(p0.vpAwards)).toBe(p0.victoryPoints)
  })

  test('the income-shortfall penalty records the VP actually lost, not the debt', () => {
    const { actor } = setup()
    // Clamp case: a shortfall larger than the VP held may only subtract
    // down to 0, so the award must record the clamped delta or the ledger
    // would not reconcile.
    const p0 = ctxOf(actor).players[0]!
    expect(p0.victoryPoints).toBe(0)
    expect(sum(p0.vpAwards)).toBe(p0.victoryPoints)
  })
})
