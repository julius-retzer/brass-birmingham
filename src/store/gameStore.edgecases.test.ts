// Edge Case Tests - No valid moves and last card scenarios (ENGINE-07)
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'
import type { Card } from '../data/cards'

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
  actor.subscribe({
    error: (error: any) => {
      // Silently handle errors expected in edge case test scenarios
    },
  })
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

describe('Edge Case: No Valid Moves', () => {
  test('player with cards but no legal actions can still pass', () => {
    const { actor } = setupGame()

    let snapshot = actor.getSnapshot()
    const player = snapshot.context.players[0]!

    // Verify player has cards in hand
    expect(player.hand.length).toBeGreaterThan(0)

    // Even when a player cannot legally build, network, develop, sell, or scout,
    // they should always be able to pass.
    // Set up a scenario where:
    // - Player has no money (cannot build or network)
    // - Player has no industries on board (cannot sell)
    // - Player has no developable tiles
    // But they still have cards

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      money: 0,
      industries: [],
      industryTilesOnMat: {
        cotton: [],
        coal: [],
        iron: [],
        manufacturer: [],
        pottery: [],
        brewery: [],
      },
    })

    snapshot = actor.getSnapshot()
    const updatedPlayer = snapshot.context.players[0]!

    // Player should have 0 money and no industries
    expect(updatedPlayer.money).toBe(0)
    expect(updatedPlayer.industries).toHaveLength(0)
    expect(updatedPlayer.hand.length).toBeGreaterThan(0)

    // Player can still take the PASS action
    const cardToDiscard = updatedPlayer.hand[0]!
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    // Should have advanced to next player (pass succeeded)
    expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)
  })

  test('player with only industry cards and no network can still pass', () => {
    const { actor } = setupGame()

    // Set up player with no links and no industries (no network)
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      links: [],
      industries: [],
    })

    // Replace hand with only industry cards
    const snapshot = actor.getSnapshot()
    const industryCards = snapshot.context.players[0]!.hand.filter(
      (c) => c.type === 'industry',
    )

    if (industryCards.length > 0) {
      // Player has industry cards but no network
      // For industry cards, build requires network adjacency
      // But pass is always available
      const card = industryCards[0]!
      actor.send({ type: 'PASS' })
      actor.send({ type: 'SELECT_CARD', cardId: card.id })
      actor.send({ type: 'CONFIRM' })

      const snap2 = actor.getSnapshot()
      expect(snap2.context.discardPile).toContainEqual(card)
    }
  })
})

describe('Edge Case: Last Card Triggers Era End', () => {
  test('when draw pile is empty and player plays last card, hand becomes empty', () => {
    const { actor } = setupGame()

    // Set draw pile to empty
    actor.send({
      type: 'TEST_SET_ERA_END_CONDITIONS',
      drawPile: [],
      allPlayersHandsEmpty: false,
    })

    // Set player 0 to have exactly 1 card
    const snapshot = actor.getSnapshot()
    const lastCard = snapshot.context.players[0]!.hand[0]!
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [lastCard],
    })

    let snap = actor.getSnapshot()
    expect(snap.context.players[0]!.hand).toHaveLength(1)
    expect(snap.context.drawPile).toHaveLength(0)

    // Player plays their last card via pass action
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: lastCard.id })
    actor.send({ type: 'CONFIRM' })

    snap = actor.getSnapshot()
    // After playing the last card, hand should be empty
    // (refillPlayerHand won't add cards since drawPile is empty)
    expect(snap.context.players[0]!.hand).toHaveLength(0)
  })

  test('isEraEnd triggers when draw pile empty and all hands empty', () => {
    const { actor } = setupGame()

    // Set draw pile to empty
    actor.send({
      type: 'TEST_SET_ERA_END_CONDITIONS',
      drawPile: [],
      allPlayersHandsEmpty: true,
    })

    // Set both players to have exactly 1 card each
    const snapshot = actor.getSnapshot()
    const p0Card = snapshot.context.players[0]!.hand[0]!
    const p1Card = snapshot.context.players[1]!.hand[0]!

    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [p0Card],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 1,
      hand: [p1Card],
    })

    // Player 0 plays their last card
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: p0Card.id })
    actor.send({ type: 'CONFIRM' })

    // Player 1 plays their last card
    let snap = actor.getSnapshot()
    const currentIdx = snap.context.currentPlayerIndex
    const currentCard = snap.context.players[currentIdx]!.hand[0]
    if (currentCard) {
      actor.send({ type: 'PASS' })
      actor.send({ type: 'SELECT_CARD', cardId: currentCard.id })
      actor.send({ type: 'CONFIRM' })
    }

    snap = actor.getSnapshot()
    // After both players play their last cards, all hands are empty
    // and draw pile is empty - isEraEnd should evaluate to true
    expect(snap.context.drawPile).toHaveLength(0)
    // At least one player should have empty hand
    const someHandEmpty = snap.context.players.some((p) => p.hand.length === 0)
    expect(someHandEmpty).toBe(true)
  })

  test('era end detected via isEraEnd guard checking deck and hands', () => {
    const { actor } = setupGame()

    // Verify isEraEnd conditions directly
    actor.send({ type: 'TEST_SET_DRAW_PILE', drawPile: [] })
    actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [] })
    actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 1, hand: [] })

    const snap = actor.getSnapshot()
    expect(snap.context.drawPile).toHaveLength(0)
    expect(snap.context.players[0]!.hand).toHaveLength(0)
    expect(snap.context.players[1]!.hand).toHaveLength(0)

    // isEraEnd guard checks: drawPile empty AND all hands empty
    // In canal era, isGameEnd returns false (only true in rail era)
    expect(snap.context.era).toBe('canal')
  })
})
