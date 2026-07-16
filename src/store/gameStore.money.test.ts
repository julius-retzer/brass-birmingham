// Invariant: player.money >= 0 at all times. Brass has no debt, so an action
// whose total cost exceeds the treasury is illegal and must be refused before
// commit. Regression suite for the network/develop paths, which committed the
// cost unconditionally (a player with £2 could build a £3 canal link → -£1).
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { IndustryType } from '../data/cards'
import { gameStore } from './gameStore'

let activeActors: ReturnType<typeof createActor>[] = []
afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const setupGame = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.subscribe({ error: () => {} })
  actor.start()
  const players = [
    {
      id: '1',
      name: 'Teo',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
    {
      id: '2',
      name: 'Jules',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
  ]
  actor.send({ type: 'START_GAME', players })
  return { actor }
}

describe('money invariant: treasury can never go negative', () => {
  test('canal link with £2 is illegal and refused; money unchanged', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const idx = snapshot.context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 2 })
    snapshot = actor.getSnapshot()
    const card = snapshot.context.players[idx]!.hand[0]!

    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    snapshot = actor.getSnapshot()

    // Guard rejects up front, so UI / multiplayer / AI driver all inherit it
    expect(
      snapshot.can({ type: 'SELECT_LINK', from: 'brno', to: 'znojmo' }),
    ).toBe(false)

    // Defense in depth: even if the guard is bypassed, nothing commits
    actor.send({ type: 'SELECT_LINK', from: 'brno', to: 'znojmo' })
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    const player = snapshot.context.players[idx]!
    expect(player.money).toBe(2)
    expect(
      player.links.some(
        (l) =>
          (l.from === 'brno' && l.to === 'znojmo') ||
          (l.from === 'znojmo' && l.to === 'brno'),
      ),
    ).toBe(false)
  })

  test('boundary: exactly £3 for a £3 canal link is legal and ends at £0', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const idx = snapshot.context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 3 })
    snapshot = actor.getSnapshot()
    const card = snapshot.context.players[idx]!.hand[0]!

    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    snapshot = actor.getSnapshot()
    expect(
      snapshot.can({ type: 'SELECT_LINK', from: 'brno', to: 'znojmo' }),
    ).toBe(true)

    actor.send({ type: 'SELECT_LINK', from: 'brno', to: 'znojmo' })
    snapshot = actor.getSnapshot()
    expect(snapshot.can({ type: 'CONFIRM' })).toBe(true)

    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    const player = snapshot.context.players[idx]!
    expect(player.money).toBe(0)
    expect(
      player.links.some(
        (l) =>
          (l.from === 'brno' && l.to === 'znojmo') ||
          (l.from === 'znojmo' && l.to === 'brno'),
      ),
    ).toBe(true)
  })

  // The guard-vs-execution seam: cost scales with the resources an action
  // consumes, so affordability must be judged on the resolved total, not on a
  // base the player happens to be able to cover.
  test('develop: £2 affords one tile of iron but not two', () => {
    const developTiles = (money: number, industryTypes: IndustryType[]) => {
      const { actor } = setupGame()
      let snapshot = actor.getSnapshot()
      const idx = snapshot.context.currentPlayerIndex
      actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money })
      snapshot = actor.getSnapshot()
      const card = snapshot.context.players[idx]!.hand[0]!
      actor.send({ type: 'DEVELOP' })
      actor.send({ type: 'SELECT_CARD', cardId: card.id })
      actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes })
      snapshot = actor.getSnapshot()
      const canConfirm = snapshot.can({ type: 'CONFIRM' })
      actor.send({ type: 'CONFIRM' })
      return {
        canConfirm,
        moneyAfter: actor.getSnapshot().context.players[idx]!.money,
      }
    }

    // One tile costs £2 of market iron — affordable, and lands exactly at £0
    expect(developTiles(2, ['cotton'])).toEqual({
      canConfirm: true,
      moneyAfter: 0,
    })

    // Two tiles cost £4 — refused, with the treasury untouched
    expect(developTiles(2, ['cotton', 'manufacturer'])).toEqual({
      canConfirm: false,
      moneyAfter: 2,
    })
  })

  test('develop with £0 and market-priced iron is refused; money unchanged', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const idx = snapshot.context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 0 })
    snapshot = actor.getSnapshot()
    const card = snapshot.context.players[idx]!.hand[0]!

    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['cotton'] })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedTilesForDevelop).toEqual(['cotton'])
    expect(snapshot.can({ type: 'CONFIRM' })).toBe(false)

    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[idx]!.money).toBe(0)
  })

  test('build already validates funds (the pattern the other paths now mirror)', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const idx = snapshot.context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 0 })
    snapshot = actor.getSnapshot()
    const locationCard = snapshot.context.players[idx]!.hand.find(
      (c) => c.type === 'location',
    )
    if (!locationCard) return

    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    snapshot = actor.getSnapshot()
    for (const industryType of [
      'coal',
      'brewery',
      'iron',
      'cotton',
      'manufacturer',
      'pottery',
    ] as const) {
      if (snapshot.can({ type: 'SELECT_INDUSTRY_TYPE', industryType })) {
        actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType })
        break
      }
    }
    snapshot = actor.getSnapshot()
    if (snapshot.can({ type: 'CONFIRM' })) actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[idx]!.money).toBe(0)
  })
})
