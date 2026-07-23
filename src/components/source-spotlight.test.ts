// The map's half of the resource-source question. These pins exist so the two
// surfaces cannot drift: both feed BoardMap from this one enumeration, and it
// lights exactly the places the engine put on offer — never a source the engine
// did not name, and nothing at all outside a source step.
import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '~/store/gameStore'
import { sourceCandidateCities } from './source-spotlight'

type Industry = Player['industries'][number]

const tile = (over: Record<string, unknown> = {}) =>
  ({
    beerRequired: 0,
    coalRequired: 0,
    ironRequired: 0,
    incomeAdvancement: 1,
    ...over,
  }) as unknown as Industry['tile']

const industry = (
  type: string,
  location: string,
  over: Record<string, unknown> = {},
): Industry =>
  ({
    type,
    location,
    flipped: false,
    level: 1,
    coalCubesOnTile: 0,
    ironCubesOnTile: 0,
    beerBarrelsOnTile: 0,
    tile: tile(),
    ...over,
  }) as unknown as Industry

const player = (
  id: string,
  industries: Industry[],
  links: Array<{ from: string; to: string }> = [],
): Player =>
  ({
    id,
    name: id,
    money: 30,
    income: 0,
    incomeSpace: 10,
    victoryPoints: 0,
    hand: [],
    industries,
    links: links.map((l) => ({ ...l, type: 'canal' as const })),
  }) as unknown as Player

const context = (players: Player[], over: Partial<GameState> = {}): GameState =>
  ({
    players,
    currentPlayerIndex: 0,
    era: 'canal',
    merchants: [],
    selectedTilesForDevelop: [],
    chosenBeerSources: [],
    chosenIronSources: [],
    chosenCoalSources: [],
    coalMarket: [
      { price: 1, cubes: 2, maxCubes: 2 },
      { price: 8, cubes: 0, maxCubes: Number.POSITIVE_INFINITY },
    ],
    ironMarket: [
      { price: 1, cubes: 2, maxCubes: 2 },
      { price: 6, cubes: 0, maxCubes: Number.POSITIVE_INFINITY },
    ],
    ...over,
  }) as unknown as GameState

/** A snapshot parked in exactly one step. */
const parkedAt = (path: string, ctx: GameState) => ({
  matches: (p: never) => (p as unknown as string) === path,
  context: ctx,
})

describe('sourceCandidateCities', () => {
  it('lights both breweries a sale may drink from', () => {
    const mine = player(
      'p1',
      [
        industry('cotton', 'birmingham', { tile: tile({ beerRequired: 1 }) }),
        industry('brewery', 'coventry', { beerBarrelsOnTile: 1 }),
      ],
      [{ from: 'birmingham', to: 'coventry' }],
    )
    const rival = player(
      'p2',
      [industry('brewery', 'dudley', { beerBarrelsOnTile: 1 })],
      [{ from: 'birmingham', to: 'dudley' }],
    )
    const ctx = context([mine, rival], {
      pendingSale: {
        location: 'birmingham',
        industryType: 'cotton',
        merchant: 'oxford',
      },
    } as Partial<GameState>)

    const lit = sourceCandidateCities(
      parkedAt('playing.action.selling.choosingBeerSource', ctx),
    )
    expect(lit && [...lit].sort()).toEqual(['coventry', 'dudley'])
  })

  it('lights the rival iron works on offer but never the market', () => {
    const mine = player('p1', [
      industry('iron', 'coalbrookdale', { ironCubesOnTile: 2 }),
    ])
    const rival = player('p2', [
      industry('iron', 'wednesbury', { ironCubesOnTile: 2 }),
    ])
    const ctx = context([mine, rival], {
      pendingIronStep: 'build',
      selectedIndustryTile: tile({ ironRequired: 1 }),
    } as unknown as Partial<GameState>)

    const lit = sourceCandidateCities(
      parkedAt('playing.action.building.choosingIronSource', ctx),
    )
    expect(lit && [...lit].sort()).toEqual(['coalbrookdale', 'wednesbury'])
  })

  it('lights only the mines tied at the nearest distance', () => {
    const mine = player(
      'p1',
      [
        industry('coal', 'dudley', { coalCubesOnTile: 2 }),
        // Two links out — never part of the nearest tier, so never lit.
        industry('coal', 'wolverhampton', { coalCubesOnTile: 2 }),
      ],
      [
        { from: 'birmingham', to: 'dudley' },
        { from: 'birmingham', to: 'walsall' },
        { from: 'dudley', to: 'wolverhampton' },
      ],
    )
    const rival = player('p2', [
      industry('coal', 'walsall', { coalCubesOnTile: 2 }),
    ])
    const ctx = context([mine, rival], {
      pendingCoalStep: 'build',
      selectedLocation: 'birmingham',
      selectedIndustryTile: tile({ coalRequired: 1 }),
    } as unknown as Partial<GameState>)

    const lit = sourceCandidateCities(
      parkedAt('playing.action.building.choosingCoalSource', ctx),
    )
    expect(lit && [...lit].sort()).toEqual(['dudley', 'walsall'])
  })

  it('lights nothing outside a source step', () => {
    const ctx = context([
      player('p1', [industry('coal', 'dudley', { coalCubesOnTile: 2 })]),
    ])
    expect(
      sourceCandidateCities(
        parkedAt('playing.action.building.selectingLocation', ctx),
      ),
    ).toBeNull()
  })

  it('lights nothing when the engine has only one source to give', () => {
    const mine = player('p1', [
      industry('iron', 'coalbrookdale', { ironCubesOnTile: 2 }),
    ])
    const ctx = context([mine], {
      pendingIronStep: 'build',
      selectedIndustryTile: tile({ ironRequired: 1 }),
    } as unknown as Partial<GameState>)

    expect(
      sourceCandidateCities(
        parkedAt('playing.action.building.choosingIronSource', ctx),
      ),
    ).toBeNull()
  })
})
