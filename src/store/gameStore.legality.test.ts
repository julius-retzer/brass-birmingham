// Engine-owned legality: the guards must answer COMPLETELY, so every offered
// candidate is confirmable and every illegal one is rejected WITH a reason.
// Pins the audit fixes:
//   F1 canBuildLink — rejects a non-existent edge and a wrong-era edge.
//   F2 canSelectLocation — rejects a slot-legal-but-uncompletable build site
//      (coal/iron reach + affordability), so a selected site is always
//      confirmable (offer == confirmable, like the route-selectability pin).
import { afterEach, describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { connections } from '../data/board'
import { type GameState, type Player, gameStore } from './gameStore'
import { explainRefusal } from './refusal'
import { pendingCoalChoice } from './shared/resourceSources'

let actors: ReturnType<typeof createActor>[] = []
afterEach(() => {
  actors.forEach((a) => {
    try {
      a.stop()
    } catch {}
  })
  actors = []
})

const start = () => {
  const actor = createActor(gameStore)
  actors.push(actor)
  actor.subscribe({ error: () => {} })
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'Player 1',
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        money: 100,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
      {
        id: '2',
        name: 'Player 2',
        color: 'blue' as const,
        character: 'Eliza Tinsley' as const,
        money: 100,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
    ],
  })
  return actor
}

// Open a network action so SELECT_LINK candidacy can be probed. The starting
// player is virgin (no tiles), so canBuildLink's adjacency clause passes and the
// era/board-graph checks are what a rejection isolates.
const openNetwork = (actor: ReturnType<typeof createActor>) => {
  const snap = actor.getSnapshot()
  const seat = snap.context.currentPlayerIndex
  const cardId = snap.context.players[seat]!.hand[0]!.id
  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId })
}

/** A plain built tile, used only to anchor a player's network at a city. */
const potteryAt = (location: string) =>
  ({
    type: 'pottery',
    location,
    flipped: false,
    level: 1,
    coalCubesOnTile: 0,
    ironCubesOnTile: 0,
    beerBarrelsOnTile: 0,
    tile: { incomeAdvancement: 1 },
  }) as unknown as Player['industries'][number]

describe('F1 — canBuildLink owns era + board-graph', () => {
  it('rejects a non-existent connection with a reason', () => {
    const actor = start()
    openNetwork(actor)
    const snap = actor.getSnapshot()
    // Birmingham and Wolverhampton are NOT directly connected on the board.
    const ev = {
      type: 'SELECT_LINK',
      from: 'birmingham',
      to: 'wolverhampton',
    } as const
    expect(snap.can(ev)).toBe(false)
    expect(explainRefusal(snap, ev)).toMatch(/no route/i)
  })

  it('rejects a rail-only corridor in the Canal Era with a reason', () => {
    const actor = start()
    expect(actor.getSnapshot().context.era).toBe('canal')
    openNetwork(actor)
    const snap = actor.getSnapshot()
    // belper–leek carries rail only.
    const ev = { type: 'SELECT_LINK', from: 'belper', to: 'leek' } as const
    expect(snap.can(ev)).toBe(false)
    expect(explainRefusal(snap, ev)).toMatch(/rail/i)
  })

  it('rejects a canal-only corridor in the Rail Era with a reason', () => {
    const actor = start()
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    expect(actor.getSnapshot().context.era).toBe('rail')
    openNetwork(actor)
    const snap = actor.getSnapshot()
    // burton–walsall carries canal only.
    const ev = { type: 'SELECT_LINK', from: 'burton', to: 'walsall' } as const
    expect(snap.can(ev)).toBe(false)
    expect(explainRefusal(snap, ev)).toMatch(/canal-only/i)
  })

  it('accepts a real canal-era corridor', () => {
    const actor = start()
    openNetwork(actor)
    // birmingham–coventry carries canal+rail; a virgin player may lay it.
    expect(
      actor.getSnapshot().can({
        type: 'SELECT_LINK',
        from: 'birmingham',
        to: 'coventry',
      }),
    ).toBe(true)
  })

  it('refuses a coal-dead rail corridor by name, not generically', () => {
    // canBuildLink's last clause (railNetworkPayable) rejects a rail link that
    // cannot reach coal once placed. explainLink used to fall off its end here
    // and answer null, so the player got the generic refusal.
    const actor = start()
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    const seat = actor.getSnapshot().context.currentPlayerIndex
    // Anchor the network at Leek so the adjacency clause passes and the player
    // is no longer virgin (the virgin exception short-circuits before coal).
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seat,
      money: 100,
      industries: [potteryAt('leek')],
      links: [] as never,
    })
    openNetwork(actor)
    const snap = actor.getSnapshot()
    // belper–leek is a real rail corridor touching the network; no coal mine
    // exists anywhere and Leek reaches no merchant, so the rail link is dead.
    const ev = { type: 'SELECT_LINK', from: 'belper', to: 'leek' } as const
    expect(snap.can(ev)).toBe(false)
    // The exact string can only come from explainLink's railNetworkCostView
    // branch — pinning it proves the reason is the coal one, not a fallback.
    expect(explainRefusal(snap, ev)).toBe(
      'No coal reachable from belper/leek — a rail link needs 1 coal.',
    )
  })

  it('only offers canal-era corridors while in the Canal Era', () => {
    const actor = start()
    openNetwork(actor)
    const snap = actor.getSnapshot()
    // Every offered first-link must be a real edge carrying the current era.
    for (const c of connections) {
      const offered = snap.can({
        type: 'SELECT_LINK',
        from: c.from,
        to: c.to,
      })
      if (offered) {
        expect(
          (c.types as readonly string[]).includes('canal'),
          `${c.from}-${c.to} offered in canal era`,
        ).toBe(true)
      }
    }
  })
})

type Industry = Player['industries'][number]

const coalMineAt = (location: string, cubes: number): Industry =>
  ({
    type: 'coal',
    location,
    flipped: false,
    level: 1,
    coalCubesOnTile: cubes,
    ironCubesOnTile: 0,
    beerBarrelsOnTile: 0,
    tile: { incomeAdvancement: 1 },
  }) as unknown as Industry

const resolveCoalTies = (actor: ReturnType<typeof createActor>) => {
  for (let guard = 0; guard < 8; guard++) {
    const choice = pendingCoalChoice(actor.getSnapshot().context as GameState)
    if (!choice?.hasChoice || !choice.options[0]) break
    actor.send({ type: 'SELECT_COAL_SOURCE', source: choice.options[0].source })
  }
}

describe('F2 — canSelectLocation owns build completability', () => {
  // A player holding an iron industry card (iron works burns coal). A
  // dudley–birmingham link puts Birmingham's free iron slot in-network; a coal
  // mine at Dudley (or not) and the player's money are the completability knobs.
  const ironBuildGame = (opts: {
    money: number
    withCoal: boolean
  }) => {
    const actor = start()
    const seat = actor.getSnapshot().context.currentPlayerIndex
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: seat,
      hand: [{ id: 'iron_card', type: 'industry', industries: ['iron'] }],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seat,
      money: opts.money,
      industries: opts.withCoal ? [coalMineAt('dudley', 4)] : [],
      links: [{ from: 'dudley', to: 'birmingham', type: 'canal' }] as never,
    })
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'iron_card' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'iron' })
    return { actor, seat }
  }

  const allCities = Array.from(
    new Set(connections.flatMap((c) => [c.from, c.to])),
  )

  it('offered build sites are exactly the confirmable ones (no dead confirm)', () => {
    const { actor } = ironBuildGame({ money: 100, withCoal: true })
    expect(
      actor.getSnapshot().matches({
        playing: { action: { building: 'selectingLocation' } },
      }),
    ).toBe(true)

    const probe = actor.getSnapshot()
    const offered = allCities.filter((cityId) =>
      probe.can({ type: 'SELECT_LOCATION', cityId }),
    )
    expect(offered.length).toBeGreaterThan(0)

    for (const cityId of offered) {
      const { actor: a } = ironBuildGame({ money: 100, withCoal: true })
      a.send({ type: 'SELECT_LOCATION', cityId })
      resolveCoalTies(a)
      expect(
        a.getSnapshot().can({ type: 'CONFIRM' }),
        `CONFIRM after offering ${cityId}`,
      ).toBe(true)
    }
  })

  it('refuses an in-network iron site out of coal reach, naming coal', () => {
    // No coal mine anywhere and no coal-market reach: Birmingham's iron slot is
    // in-network and affordable, but the works can never source its coal.
    const { actor } = ironBuildGame({ money: 100, withCoal: false })
    const snap = actor.getSnapshot()
    const ev = { type: 'SELECT_LOCATION', cityId: 'birmingham' } as const
    expect(snap.can(ev)).toBe(false)
    expect(explainRefusal(snap, ev)).toMatch(/coal/i)
  })

  it('refuses an unaffordable build site, naming money', () => {
    // Coal is reachable, but £2 cannot pay for the iron works.
    const { actor } = ironBuildGame({ money: 2, withCoal: true })
    const snap = actor.getSnapshot()
    const ev = { type: 'SELECT_LOCATION', cityId: 'birmingham' } as const
    expect(snap.can(ev)).toBe(false)
    expect(explainRefusal(snap, ev)).toMatch(/money/i)
  })
})
