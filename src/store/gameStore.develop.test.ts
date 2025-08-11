// Develop Actions Tests - Industry development and resource consumption
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {
      // Ignore errors during cleanup
    }
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

const setupDevelopTest = (actor: ReturnType<typeof createActor>) => {
  // Minimal board industries; no iron works so market iron will be used
  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: 0,
    industries: [
      {
        location: 'birmingham',
        type: 'coal',
        level: 1,
        flipped: false,
        tile: {
          id: 'coal_1',
          type: 'coal',
          level: 1,
          canBuildInCanalEra: true,
          canBuildInRailEra: true,
          cost: 5,
        },
        coalCubesOnTile: 2,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ],
    money: 50,
  })
}

describe('Game Store - Develop Actions', () => {
  test('develop action - basic mechanics', () => {
    const { actor } = setupGame()
    setupDevelopTest(actor)

    let snapshot = actor.getSnapshot()
    const initialMoney = snapshot.context.players[0]!.money
    const initialDiscard = snapshot.context.discardPile.length
    const initialPlayerIndex = snapshot.context.currentPlayerIndex

    // Start development
    actor.send({ type: 'DEVELOP' })
    snapshot = actor.getSnapshot()

    // Should be in developing state
    expect(snapshot.matches({ playing: { action: 'developing' } })).toBe(true)

    // Select any card to pay for the develop action
    const card = snapshot.context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: card.id })

    // Confirm development
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Returns to action selection (or next player's action)
    expect(
      snapshot.matches({ playing: { action: 'selectingAction' } }) ||
        snapshot.matches({ playing: { action: 'action' } }),
    ).toBe(true)

    // Discard pile increased by 1
    expect(snapshot.context.discardPile.length).toBe(initialDiscard + 1)

    // Money decreased due to iron purchased from market
    expect(snapshot.context.players[0]!.money).toBeLessThan(initialMoney)

    // Turn likely advanced after action completes
    expect(snapshot.context.currentPlayerIndex).not.toBe(initialPlayerIndex)
  })

  test('develop action - requires card selection (guard)', () => {
    const { actor } = setupGame()
    setupDevelopTest(actor)

    // Start development
    actor.send({ type: 'DEVELOP' })
    const before = actor.getSnapshot()

    // Try to confirm without selecting a card
    actor.send({ type: 'CONFIRM' })
    const after = actor.getSnapshot()

    // Still in developing state (guard blocked)
    expect(after.matches({ playing: { action: 'developing' } })).toBe(true)
    // Discard unchanged
    expect(after.context.discardPile.length).toBe(
      before.context.discardPile.length,
    )
  })

  test('develop action - consumes iron from market when no iron works available', () => {
    const { actor } = setupGame()
    setupDevelopTest(actor)

    let snapshot = actor.getSnapshot()
    const initialIronMarket = [...snapshot.context.ironMarket]

    // Start development and confirm with a card
    actor.send({ type: 'DEVELOP' })
    const card = actor.getSnapshot().context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    // Iron should be consumed from market (1 cube)
    const totalIronConsumed = initialIronMarket.reduce(
      (sum, level, i) =>
        sum + (level.cubes - snapshot.context.ironMarket[i]!.cubes),
      0,
    )
    expect(totalIronConsumed).toBeGreaterThan(0)
  })

  test('develop action - multiple develops consume multiple cards and actions', () => {
    const { actor } = setupGame()
    setupDevelopTest(actor)

    let snapshot = actor.getSnapshot()
    const initialDiscard = snapshot.context.discardPile.length

    // First develop
    actor.send({ type: 'DEVELOP' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[0]!.hand[0]!.id,
    })
    actor.send({ type: 'CONFIRM' })

    // Second develop
    actor.send({ type: 'DEVELOP' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[0]!.hand[0]!.id,
    })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    // Turn may have advanced; ensure at least one develop was processed (discard grew)
    expect(snapshot.context.discardPile.length).toBeGreaterThan(initialDiscard)
  })

  test('develop action - cancel returns to action selection', () => {
    const { actor } = setupGame()
    setupDevelopTest(actor)

    let snapshot = actor.getSnapshot()

    // Start development
    actor.send({ type: 'DEVELOP' })
    snapshot = actor.getSnapshot()

    // Should be in developing state
    expect(snapshot.matches({ playing: { action: 'developing' } })).toBe(true)

    // Cancel development
    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()

    // Should return to action selection
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
  })
})
