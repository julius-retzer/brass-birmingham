// Rail-route selection must equal confirmability: a route is offered
// (pulses selectable, passes `canBuildLink`) only when it can actually be laid
// once placed. The bug this pins: `canBuildLink` checked network + base cost
// but NOT coal, while the confirm guard `hasSelectedLink` did — so coal-dead
// spur routes (no connected mine AND no coal-market reach) pulsed as selectable
// then got rejected at confirm. Reproduces the diagnosis state around the Derby
// spur: derby→nottingham is payable via the £-market, belper→derby and
// derby→uttoxeter are genuine dead ends.
import { afterEach, describe, expect, it } from 'vitest'
import { connections } from '../data/board'
import { type GameState, type Player, gameStore } from './gameStore'
import { pendingCoalChoice } from './shared/resourceSources'
import { createActor } from 'xstate'

type Industry = Player['industries'][number]

const nonCoalIndustry = (location: string): Industry =>
  ({
    type: 'cotton',
    location,
    flipped: false,
    coalCubesOnTile: 0,
    ironCubesOnTile: 0,
    beerBarrelsOnTile: 0,
    level: 1,
    tile: { incomeAdvancement: 1 },
  }) as unknown as Industry

const linkOf = (player: Player, from: string, to: string) =>
  player.links.some(
    (l) => (l.from === from && l.to === to) || (l.from === to && l.to === from),
  )

const resolveCoalTies = (actor: ReturnType<typeof createActor>) => {
  for (let guard = 0; guard < 8; guard++) {
    const choice = pendingCoalChoice(actor.getSnapshot().context as GameState)
    if (!choice?.hasChoice || !choice.options[0]) break
    actor.send({ type: 'SELECT_COAL_SOURCE', source: choice.options[0].source })
  }
}

describe('rail-route selection == confirmability', () => {
  let actors: ReturnType<typeof createActor>[] = []
  afterEach(() => {
    actors.forEach((a) => {
      try {
        a.stop()
      } catch {}
    })
    actors = []
  })

  // A rail-era game with the current player holding a single non-coal industry
  // at Derby (so Derby is in their network) and NO coal mines or links anywhere
  // — Derby's spurs can reach coal only through the market, and only if the
  // placed link touches a merchant.
  const derbySpurGame = () => {
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
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    const seat = actor.getSnapshot().context.currentPlayerIndex
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seat,
      money: 100,
      industries: [nonCoalIndustry('derby')],
      links: [] as never,
    })
    return { actor, seat }
  }

  const openNetworkStep = (actor: ReturnType<typeof createActor>) => {
    const snap = actor.getSnapshot()
    const seat = snap.context.currentPlayerIndex
    const cardId = snap.context.players[seat]!.hand[0]!.id
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId })
  }

  it('offers the market-coal route derby→nottingham and lays it', () => {
    const { actor } = derbySpurGame()
    openNetworkStep(actor)

    // Nottingham is a merchant, so the placed derby→nottingham link reaches the
    // coal market — payable via £, therefore offered.
    expect(
      actor.getSnapshot().can({
        type: 'SELECT_LINK',
        from: 'derby',
        to: 'nottingham',
      }),
    ).toBe(true)

    actor.send({ type: 'SELECT_LINK', from: 'derby', to: 'nottingham' })
    expect(actor.getSnapshot().can({ type: 'CONFIRM' })).toBe(true)
    actor.send({ type: 'CONFIRM' })
    resolveCoalTies(actor)

    const seat = actor.getSnapshot().context.currentPlayerIndex
    const me = actor.getSnapshot().context.players[seat]!
    expect(linkOf(me, 'derby', 'nottingham')).toBe(true)
  })

  it('does NOT offer coal-dead spur routes (belper→derby, derby→uttoxeter)', () => {
    const { actor } = derbySpurGame()
    openNetworkStep(actor)

    // Both touch Derby (in-network) so pass the old adjacency-only check, but
    // once placed they reach no mine and no merchant — genuine dead ends.
    for (const [from, to] of [
      ['belper', 'derby'],
      ['derby', 'uttoxeter'],
    ] as const) {
      expect(actor.getSnapshot().can({ type: 'SELECT_LINK', from, to })).toBe(
        false,
      )
    }
  })

  it('every offered rail first-link is confirmable and executable', () => {
    // Enumerate the offered set once, then lay each on a fresh game — proving
    // offer==execute end-to-end, not merely via the shared guard.
    const { actor: probe } = derbySpurGame()
    openNetworkStep(probe)
    const snap = probe.getSnapshot()
    const offered = connections
      .filter((c) => (c.types as readonly string[]).includes('rail'))
      .flatMap((c) => [
        { from: c.from, to: c.to },
        { from: c.to, to: c.from },
      ])
      .filter((route) =>
        snap.can({ type: 'SELECT_LINK', from: route.from, to: route.to }),
      )

    expect(offered.length).toBeGreaterThan(0)

    for (const route of offered) {
      const { actor } = derbySpurGame()
      openNetworkStep(actor)
      actor.send({ type: 'SELECT_LINK', from: route.from, to: route.to })
      // The confirm guard must agree with selection…
      expect(
        actor.getSnapshot().can({ type: 'CONFIRM' }),
        `CONFIRM after offering ${route.from}->${route.to}`,
      ).toBe(true)
      // …and the link must actually land.
      actor.send({ type: 'CONFIRM' })
      resolveCoalTies(actor)
      const seat = actor.getSnapshot().context.currentPlayerIndex
      const me = actor.getSnapshot().context.players[seat]!
      expect(
        linkOf(me, route.from, route.to),
        `link ${route.from}->${route.to} placed`,
      ).toBe(true)
    }
  })
})
