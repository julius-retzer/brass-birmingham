// The board candidates both surfaces render. These are enumeration only — the
// point of the pins below is that what comes out is exactly what the machine's
// guards accept, so hotseat and multiplayer cannot offer different sets and no
// offered target can walk into a dead confirm.
import { afterEach, describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { cities, connections } from '~/data/board'
import type { CityId } from '~/data/board'
import { gameStore } from '~/store/gameStore'
import { linkKey } from './board/board-data'
import { legalCityTargets, legalLinkTargets } from './legal-targets'

let actors: ReturnType<typeof createActor>[] = []
afterEach(() => {
  actors.forEach((a) => {
    try {
      a.stop()
    } catch {}
  })
  actors = []
})

const game = () => {
  const actor = createActor(gameStore)
  actors.push(actor)
  actor.subscribe({ error: () => {} })
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'P1',
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        money: 100,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
      {
        id: '2',
        name: 'P2',
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

const openNetwork = (actor: ReturnType<typeof createActor>) => {
  const snap = actor.getSnapshot()
  const seat = snap.context.currentPlayerIndex
  actor.send({ type: 'NETWORK' })
  actor.send({
    type: 'SELECT_CARD',
    cardId: snap.context.players[seat]!.hand[0]!.id,
  })
}

describe('legalLinkTargets', () => {
  it('offers only real board edges that carry the current era', () => {
    const actor = game()
    openNetwork(actor)
    const offered = legalLinkTargets(actor.getSnapshot(), false)
    expect(offered.size).toBeGreaterThan(0)

    const canalEdges = new Set(
      connections
        .filter((c) => (c.types as readonly string[]).includes('canal'))
        .flatMap((c) => [linkKey(c.from, c.to), linkKey(c.to, c.from)]),
    )
    for (const key of offered) {
      expect(canalEdges.has(key), `${key} offered in the canal era`).toBe(true)
    }
  })

  it('agrees with the machine, edge for edge', () => {
    const actor = game()
    openNetwork(actor)
    const snap = actor.getSnapshot()
    const offered = legalLinkTargets(snap, false)
    for (const conn of connections) {
      const accepted = snap.can({
        type: 'SELECT_LINK',
        from: conn.from,
        to: conn.to,
      })
      expect(
        offered.has(linkKey(conn.from, conn.to)),
        `${conn.from}-${conn.to}`,
      ).toBe(accepted)
    }
  })
})

describe('legalCityTargets', () => {
  it('agrees with the machine, city for city', () => {
    const actor = game()
    const seat = actor.getSnapshot().context.currentPlayerIndex
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: seat,
      hand: [{ id: 'iron_card', type: 'industry', industries: ['iron'] }],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seat,
      money: 100,
      industries: [
        {
          type: 'coal',
          location: 'dudley',
          flipped: false,
          level: 1,
          coalCubesOnTile: 4,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
          tile: { incomeAdvancement: 1 },
        },
      ] as never,
      links: [{ from: 'dudley', to: 'birmingham', type: 'canal' }] as never,
    })
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'iron_card' })

    const snap = actor.getSnapshot()
    const offered = legalCityTargets(snap)
    for (const cityId of Object.keys(cities) as CityId[]) {
      expect(offered.has(cityId), cityId).toBe(
        snap.can({ type: 'SELECT_LOCATION', cityId }),
      )
    }
    // The guard is complete, so the offer is non-empty and every entry is a
    // site the build can actually be completed at.
    expect(offered.size).toBeGreaterThan(0)
  })
})
