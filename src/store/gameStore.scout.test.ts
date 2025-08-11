// Scout Actions Tests - Card scouting and wild card mechanics
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

const setupScoutTest = (actor: ReturnType<typeof createActor>) => {
  // Set player to have 3 cards for scouting
  actor.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 0,
    hand: [
      { id: 'card1', type: 'location', location: 'birmingham', color: 'blue' },
      { id: 'card2', type: 'industry', industries: ['coal'] },
      { id: 'card3', type: 'location', location: 'coventry', color: 'teal' },
    ],
  })

  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: 0,
    money: 50, // Money should not change due to scouting
  })
}

describe('Game Store - Scout Actions', () => {
  test('scout action - basic mechanics', () => {
    const { actor } = setupGame()
    setupScoutTest(actor)

    let snapshot = actor.getSnapshot()
    const initialMoney = snapshot.context.players[0]!.money
    const initialDiscard = snapshot.context.discardPile.length

    // Start scouting
    actor.send({ type: 'SCOUT' })
    snapshot = actor.getSnapshot()

    // Should be in scouting state
    expect(snapshot.matches({ playing: { action: 'scouting' } })).toBe(true)

    // Select 3 cards for scouting
    const cardsToScout = snapshot.context.players[0]!.hand.slice(0, 3)
    cardsToScout.forEach((card) => {
      actor.send({ type: 'SELECT_CARD', cardId: card.id })
    })

    // Confirm scouting
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Discard pile should increase by 3
    expect(snapshot.context.discardPile.length).toBe(initialDiscard + 3)

    // Player 0 should have received 2 wild cards and been refilled to 8 cards
    const player0 = snapshot.context.players[0]!
    const wildCards = player0.hand.filter(
      (card) => card.type === 'wild_location' || card.type === 'wild_industry',
    )
    expect(wildCards).toHaveLength(2)
    expect(player0.hand.length).toBe(8)

    // Scouting does not cost money per rules
    expect(player0.money).toBe(initialMoney)
  })

  test('scout action - requires exactly 3 cards', () => {
    const { actor } = setupGame()
    setupScoutTest(actor)

    let snapshot = actor.getSnapshot()

    // Start scouting
    actor.send({ type: 'SCOUT' })
    snapshot = actor.getSnapshot()

    // Try to confirm with only 2 cards selected
    const cardsToScout = snapshot.context.players[0]!.hand.slice(0, 2)
    cardsToScout.forEach((card) => {
      actor.send({ type: 'SELECT_CARD', cardId: card.id })
    })

    // Should not be able to confirm with less than 3 cards
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Should still be in scouting state
    expect(snapshot.matches({ playing: { action: 'scouting' } })).toBe(true)
  })

  test('scout action - cannot complete if already has wild cards in hand', () => {
    const { actor } = setupGame()
    setupScoutTest(actor)

    // Give player a wild card first
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [
        { id: 'wild1', type: 'wild_location' },
        {
          id: 'card1',
          type: 'location',
          location: 'birmingham',
          color: 'blue',
        },
        { id: 'card2', type: 'industry', industries: ['coal'] },
        { id: 'card3', type: 'location', location: 'coventry', color: 'teal' },
      ],
    })

    let snapshot = actor.getSnapshot()
    const initialHandSize = snapshot.context.players[0]!.hand.length
    const initialDiscard = snapshot.context.discardPile.length

    // Start scouting (entering the state is allowed; confirm should be blocked)
    actor.send({ type: 'SCOUT' })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'scouting' } })).toBe(true)

    // Select 3 cards
    const toScout = snapshot.context.players[0]!.hand.slice(0, 3)
    toScout.forEach((card) =>
      actor.send({ type: 'SELECT_CARD', cardId: card.id }),
    )

    // Attempt to confirm should be blocked by guard
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Still in scouting state and no change to hand/discard
    expect(snapshot.matches({ playing: { action: 'scouting' } })).toBe(true)
    expect(snapshot.context.players[0]!.hand.length).toBe(initialHandSize)
    expect(snapshot.context.discardPile.length).toBe(initialDiscard)
  })

  test('scout action - wild cards can be selected for building (wild location -> industry type selection)', () => {
    const { actor } = setupGame()
    setupScoutTest(actor)

    // Perform scouting to get wild cards
    actor.send({ type: 'SCOUT' })
    const cardsToScout = actor
      .getSnapshot()
      .context.players[0]!.hand.slice(0, 3)
    cardsToScout.forEach((card) => {
      actor.send({ type: 'SELECT_CARD', cardId: card.id })
    })
    actor.send({ type: 'CONFIRM' })

    let snapshot = actor.getSnapshot()
    const wildCards = snapshot.context.players[0]!.hand.filter(
      (card) => card.type === 'wild_location' || card.type === 'wild_industry',
    )

    // Use wild location card to enter selectingIndustryType in build flow
    const wildLocationCard = wildCards.find(
      (card) => card.type === 'wild_location',
    )
    if (wildLocationCard) {
      actor.send({ type: 'BUILD' })
      actor.send({ type: 'SELECT_CARD', cardId: wildLocationCard.id })

      snapshot = actor.getSnapshot()
      expect(
        snapshot.matches({
          playing: { action: { building: 'selectingIndustryType' } },
        }),
      ).toBe(true)
    }
  })

  test('scout action - cancel returns to action selection', () => {
    const { actor } = setupGame()
    setupScoutTest(actor)

    let snapshot = actor.getSnapshot()

    // Start scouting
    actor.send({ type: 'SCOUT' })
    snapshot = actor.getSnapshot()

    // Should be in scouting state
    expect(snapshot.matches({ playing: { action: 'scouting' } })).toBe(true)

    // Cancel scouting
    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()

    // Should return to action selection
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
  })

  test('scout action - advances turn but does not cost money', () => {
    const { actor } = setupGame()
    setupScoutTest(actor)

    let snapshot = actor.getSnapshot()
    const initialMoney = snapshot.context.players[0]!.money
    const initialPlayerIndex = snapshot.context.currentPlayerIndex

    // Perform scouting
    actor.send({ type: 'SCOUT' })
    const cardsToScout = snapshot.context.players[0]!.hand.slice(0, 3)
    cardsToScout.forEach((card) => {
      actor.send({ type: 'SELECT_CARD', cardId: card.id })
    })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const updatedPlayer = snapshot.context.players[0]!

    // Money should be unchanged
    expect(updatedPlayer.money).toBe(initialMoney)
    // Turn should advance to the next player
    expect(snapshot.context.currentPlayerIndex).not.toBe(initialPlayerIndex)
  })
})
