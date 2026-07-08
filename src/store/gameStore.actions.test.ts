// Game Actions Tests - Loan, Pass, and basic actions
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
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
  ]

  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const takeLoanAction = (actor: ReturnType<typeof createActor>) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  const cardToDiscard = currentPlayer!.hand[0]

  actor.send({ type: 'TAKE_LOAN' })
  actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard!.id })
  actor.send({ type: 'CONFIRM' })

  return { cardToDiscard }
}

describe('Game Store - Actions', () => {
  test('loan action - basic mechanics', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = initialPlayer.money
    const initialIncome = initialPlayer.income
    const initialHandSize = initialPlayer.hand.length

    const { cardToDiscard } = takeLoanAction(actor)
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!

    // Verify loan effects
    expect(updatedPlayer.money).toBe(initialMoney + 30) // +£30
    expect(updatedPlayer.income).toBe(Math.max(-10, initialIncome - 3)) // -3 income, min -10
    expect(updatedPlayer.hand.length).toBe(initialHandSize) // Hand refilled
    expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)
  })

  test('loan action - cannot take a loan that would drop income below -10', () => {
    const { actor } = setupGame()

    // Player at income -8: a loan would take them to -11, which is illegal
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, income: -8 })
    let snapshot = actor.getSnapshot()
    const moneyBefore = snapshot.context.players[0]!.money

    takeLoanAction(actor)

    snapshot = actor.getSnapshot()
    const player = snapshot.context.players[0]!
    // Guard blocked the loan - no money, no income change, action not consumed
    expect(player.income).toBe(-8)
    expect(player.money).toBe(moneyBefore)
    expect(
      snapshot.matches({
        playing: { action: { takingLoan: 'confirmingLoan' } },
      }),
    ).toBe(true)
    actor.send({ type: 'CANCEL' })
    actor.send({ type: 'CANCEL' })

    // At income -7 the loan is legal (lands exactly on -10)
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, income: -7 })
    takeLoanAction(actor)
    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[0]!.income).toBe(-10)
    expect(snapshot.context.players[0]!.money).toBe(moneyBefore + 30)
  })

  test('pass action - basic mechanics', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const currentPlayer =
      snapshot.context.players[snapshot.context.currentPlayerIndex]
    const cardToDiscard = currentPlayer!.hand[0]

    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard!.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Advanced to next player
  })

  test('turn progression - round 1 has 1 action each', () => {
    const { actor } = setupGame()

    // Player 1 takes loan
    takeLoanAction(actor)
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Now Player 2's turn

    // Player 2 takes loan
    takeLoanAction(actor)
    snapshot = actor.getSnapshot()

    // Should advance to round 2 with Player 1 going first
    expect(snapshot.context.currentPlayerIndex).toBe(0)
    expect(snapshot.context.round).toBe(2)
    expect(snapshot.context.actionsRemaining).toBe(2) // Round 2+ = 2 actions
  })

  test('turn progression - round 2+ has 2 actions each', () => {
    const { actor } = setupGame()

    // Get to round 2
    takeLoanAction(actor) // Player 1
    takeLoanAction(actor) // Player 2

    let snapshot = actor.getSnapshot()
    expect(snapshot.context.round).toBe(2)
    expect(snapshot.context.actionsRemaining).toBe(2)

    // Player 1 takes 2 actions
    takeLoanAction(actor)
    snapshot = actor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(0) // Still Player 1
    expect(snapshot.context.actionsRemaining).toBe(1)

    takeLoanAction(actor)
    snapshot = actor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Now Player 2
    expect(snapshot.context.actionsRemaining).toBe(2)
  })

  test('hand refilling after actions', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const initialHandSize = snapshot.context.players[0]!.hand.length

    takeLoanAction(actor)
    snapshot = actor.getSnapshot()

    // Hand should be refilled to original size after action
    expect(snapshot.context.players[0]!.hand.length).toBe(initialHandSize)
  })
})
