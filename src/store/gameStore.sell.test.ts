// Sell Actions Tests - Resource selling and income generation
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

const setupSellTest = (actor: ReturnType<typeof createActor>) => {
  // Provide a sellable cotton industry connected to a merchant (Warrington) via Stoke
  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: 0,
    industries: [
      {
        location: 'stoke',
        type: 'cotton',
        level: 1,
        flipped: false,
        tile: {
          id: 'cotton_1',
          type: 'cotton',
          level: 1,
          canBuildInCanalEra: true,
          canBuildInRailEra: true,
          incomeAdvancement: 2,
          victoryPoints: 3,
          beerRequired: 1,
          cost: 10,
        },
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ],
    money: 20,
    income: 10,
  })
}

describe('Game Store - Sell Actions', () => {
  test('sell action - basic mechanics (flip, income, merchant beer, money bonus)', () => {
    const { actor } = setupGame()
    setupSellTest(actor)

    let snapshot = actor.getSnapshot()
    const initialMoney = snapshot.context.players[0]!.money
    const initialIncome = snapshot.context.players[0]!.income
    const initialActions = snapshot.context.actionsRemaining
    const initialDiscard = snapshot.context.discardPile.length
    const initialPlayerIndex = snapshot.context.currentPlayerIndex

    // Start selling and select any card (guard requires a selected card)
    actor.send({ type: 'SELL' })
    const cardToUse = snapshot.context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const updatedPlayer = snapshot.context.players[0]!

    // Industry should be flipped
    const cotton = updatedPlayer.industries.find((i) => i.type === 'cotton')!
    expect(cotton.flipped).toBe(true)

    // Income should have increased by incomeAdvancement (clamped in machine)
    expect(updatedPlayer.income).toBeGreaterThan(initialIncome)

    // Discard pile should include the used card
    expect(snapshot.context.discardPile.length).toBe(initialDiscard + 1)

    // Turn should have advanced to next player after action completes
    expect(snapshot.context.currentPlayerIndex).not.toBe(initialPlayerIndex)

    // Merchant at Warrington beer should have been consumed (hasBeer toggled)
    const warrington = snapshot.context.merchants.find(
      (m) => m.location === 'warrington',
    )!
    expect(warrington.hasBeer).toBe(false)

    // Money bonus (+£5) from Warrington merchant
    expect(updatedPlayer.money).toBe(initialMoney + 5)
  })

  test('sell action - requires card selection (guard)', () => {
    const { actor } = setupGame()
    setupSellTest(actor)

    // Start selling but do not select a card
    actor.send({ type: 'SELL' })
    const before = actor.getSnapshot()
    actor.send({ type: 'CONFIRM' })
    const after = actor.getSnapshot()

    // Still in selling state (guard blocked)
    expect(after.matches({ playing: { action: 'selling' } })).toBe(true)
    // No discard occurred
    expect(after.context.discardPile.length).toBe(
      before.context.discardPile.length,
    )
  })

  test('sell action - cancel returns to action selection', () => {
    const { actor } = setupGame()
    setupSellTest(actor)

    actor.send({ type: 'SELL' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selling' } })).toBe(true)

    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
  })

  test('sell action - flip and income increase without asserting money if no money bonus', () => {
    const { actor } = setupGame()
    // Provide a pottery at Stoke (also connected); still hits Warrington with money bonus, but we focus on flip/income
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        {
          location: 'stoke',
          type: 'pottery',
          level: 1,
          flipped: false,
          tile: {
            id: 'pottery_1',
            type: 'pottery',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 1,
            victoryPoints: 2,
            beerRequired: 1,
            cost: 12,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
      income: 5,
      money: 10,
    })

    let snapshot = actor.getSnapshot()
    const initialIncome = snapshot.context.players[0]!.income

    actor.send({ type: 'SELL' })
    const cardToUse = snapshot.context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const pottery = snapshot.context.players[0]!.industries.find(
      (i) => i.type === 'pottery',
    )!
    expect(pottery.flipped).toBe(true)
    expect(snapshot.context.players[0]!.income).toBeGreaterThan(initialIncome)
  })

  test('sell action - requires connectivity to a merchant that buys the industry', () => {
    const { actor } = setupGame()
    // Place cotton at Birmingham which is not connected to any merchant in simplified graph
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        {
          location: 'birmingham',
          type: 'cotton',
          level: 1,
          flipped: false,
          tile: {
            id: 'cotton_bham_1',
            type: 'cotton',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 2,
            victoryPoints: 3,
            beerRequired: 1,
            cost: 10,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
      money: 20,
      income: 10,
    })

    let snapshot = actor.getSnapshot()
    const initialMoney = snapshot.context.players[0]!.money
    const initialDiscard = snapshot.context.discardPile.length

    actor.send({ type: 'SELL' })
    const cardToUse = snapshot.context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    const cotton = snapshot.context.players[0]!.industries.find(
      (i) => i.type === 'cotton',
    )!
    // Should not have flipped due to missing connectivity
    expect(cotton.flipped).toBe(false)
    // Money unchanged and discard not increased
    expect(snapshot.context.players[0]!.money).toBe(initialMoney)
    expect(snapshot.context.discardPile.length).toBe(initialDiscard)
    // Logs should include an error about cannot sell
    expect(
      snapshot.context.logs.some(
        (l) => l.type === 'error' && l.message.includes('Cannot sell'),
      ),
    ).toBe(true)
  })
})
