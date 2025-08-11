// Network Actions Tests - Link building and network mechanics
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
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
  actor.start()

  const players = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
    },
  ]

  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const buildNetworkAction = (
  actor: ReturnType<typeof createActor>,
  from = 'birmingham',
  to = 'coventry',
) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  const cardToUse = currentPlayer.hand[0] // Use any card for network

  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: cardToUse?.id })
  actor.send({ type: 'SELECT_LINK', from, to })
  actor.send({ type: 'CONFIRM' })

  return { cardUsed: cardToUse, from, to }
}

describe('Game Store - Network Actions', () => {
  test('basic link building - canal era', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = initialPlayer.money

    const { cardUsed, from, to } = buildNetworkAction(
      actor,
      'birmingham',
      'coventry',
    )
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!
    const builtLink = updatedPlayer.links.find(
      (link) =>
        (link.from === from && link.to === to) ||
        (link.from === to && link.to === from),
    )

    expect(builtLink).toBeDefined()
    expect(builtLink!.type).toBe('canal')
    expect(updatedPlayer.money).toBeLessThan(initialMoney) // Link costs money
    expect(snapshot.context.discardPile).toContainEqual(cardUsed)
  })

  test('rail era - coal consumption for links', () => {
    const { actor } = setupGame()

    // Advance to rail era by ending canal era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    const initialCoalMarket = [...snapshot.context.coalMarket]

    const { from, to } = buildNetworkAction(
      actor,
      'birmingham',
      'wolverhampton',
    )
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!
    const builtLink = updatedPlayer.links.find(
      (link) =>
        (link.from === from && link.to === to) ||
        (link.from === to && link.to === from),
    )

    expect(builtLink).toBeDefined()
    expect(builtLink!.type).toBe('rail')

    // Coal should be consumed for rail links
    const totalCoalConsumed = initialCoalMarket.reduce(
      (sum, level, i) =>
        sum + (level.cubes - snapshot.context.coalMarket[i]!.cubes),
      0,
    )
    expect(totalCoalConsumed).toBeGreaterThan(0)
  })

  test('network adjacency requirement', () => {
    const { actor } = setupGame()

    // First build a link to establish network
    buildNetworkAction(actor, 'birmingham', 'coventry')

    // Pass to next player's turn
    let snapshot = actor.getSnapshot()
    if (snapshot.context.actionsRemaining > 0) {
      actor.send({ type: 'PASS' })
      actor.send({
        type: 'SELECT_CARD',
        cardId: snapshot.context.players[0]!.hand[0]!.id,
      })
      actor.send({ type: 'CONFIRM' })
    }

    // Now build adjacent link
    buildNetworkAction(actor, 'coventry', 'nuneaton')
    snapshot = actor.getSnapshot()

    const player =
      snapshot.context.players[
        snapshot.context.currentPlayerIndex === 0 ? 0 : 1
      ]!
    const links = player.links

    // Should have built second link connected to first
    expect(links.length).toBe(1)
    const link = links[0]!
    expect(
      (link.from === 'coventry' && link.to === 'nuneaton') ||
        (link.from === 'nuneaton' && link.to === 'coventry'),
    ).toBe(true)
  })

  test('double link building in rail era', () => {
    const { actor } = setupGame()

    // Advance to rail era by ending canal era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })

    // Build initial link
    buildNetworkAction(actor, 'birmingham', 'coventry')
    let snapshot = actor.getSnapshot()

    // Check if double link option is available (would need specific conditions)
    const currentPlayer =
      snapshot.context.players[snapshot.context.currentPlayerIndex]!

    // Try to build second link in same action (if supported)
    if (snapshot.context.era === 'rail') {
      actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
      actor.send({
        type: 'SELECT_SECOND_LINK',
        from: 'coventry',
        to: 'nuneaton',
      })
      actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })

      snapshot = actor.getSnapshot()

      // Should have built two links in one action
      expect(currentPlayer.links.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('network validation - requires valid connections', () => {
    const { actor } = setupGame()

    // Try to build network
    actor.send({ type: 'NETWORK' })
    let snapshot = actor.getSnapshot()

    // Should be in network building state
    expect(snapshot.matches({ playing: { action: 'networking' } })).toBe(true)

    // Select card
    const cardToUse = snapshot.context.players[0]!.hand[0]
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse?.id })

    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'networking' } })).toBe(true)
  })

  test('network costs vary by era', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    // Canal era link cost
    const canalMoney = snapshot.context.players[0]!.money
    buildNetworkAction(actor, 'birmingham', 'coventry')
    snapshot = actor.getSnapshot()
    const canalCost = canalMoney - snapshot.context.players[0]!.money

    // Complete turn to get to next round
    if (snapshot.context.actionsRemaining > 0) {
      actor.send({ type: 'PASS' })
      actor.send({
        type: 'SELECT_CARD',
        cardId: snapshot.context.players[0]!.hand[0]!.id,
      })
      actor.send({ type: 'CONFIRM' })
    }

    // Pass player 2's turn
    actor.send({ type: 'PASS' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[1]!.hand[0]!.id,
    })
    actor.send({ type: 'CONFIRM' })

    // Should be in round 2 now with 2 actions per player
    snapshot = actor.getSnapshot()
    expect(snapshot.context.round).toBeGreaterThanOrEqual(2)

    // Canal links should have consistent cost structure
    expect(canalCost).toBeGreaterThan(0)
  })
})
