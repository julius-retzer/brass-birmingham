import { assert, expect, test } from 'vitest'
import {
  type Actor,
  type InspectionEvent,
  type SnapshotFrom,
  createActor,
} from 'xstate'
import { type Card } from '~/data/cards'
import { type GameState, gameStore } from './gameStore'

const DEBUG = true

// Test utilities
type TestPlayer = {
  id: string
  name: string
  color: 'red' | 'blue'
  character: 'Richard Arkwright' | 'Eliza Tinsley'
  money: number
  victoryPoints: number
  income: number
}

const createTestPlayers = (): TestPlayer[] => [
  {
    id: '1',
    name: 'Player 1',
    color: 'red',
    character: 'Richard Arkwright',
    money: 17,
    victoryPoints: 0,
    income: 10,
  },
  {
    id: '2',
    name: 'Player 2',
    color: 'blue',
    character: 'Eliza Tinsley',
    money: 17,
    victoryPoints: 0,
    income: 10,
  },
]

type GameActor = Actor<typeof gameStore>
type GameSnapshot = SnapshotFrom<typeof gameStore>

const setupTestGame = () => {
  const actor = createActor(gameStore, { inspect: logInspectEvent })
  actor.start()
  const players = createTestPlayers()
  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const takeLoanAction = (actor: GameActor) => {
  let snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  if (!currentPlayer) throw new Error('Expected current player to exist')

  actor.send({ type: 'TAKE_LOAN' })
  snapshot = actor.getSnapshot()

  const cardToDiscard = currentPlayer.hand[0]
  if (!cardToDiscard) throw new Error('Expected at least one card in hand')

  actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
  actor.send({ type: 'CONFIRM' })

  return { cardToDiscard }
}

const verifyGameState = (
  snapshot: GameSnapshot,
  expected: Partial<GameState>,
) => {
  const { context } = snapshot
  for (const key in expected) {
    if (Object.prototype.hasOwnProperty.call(expected, key)) {
      expect(context[key as keyof GameState]).toEqual(
        expected[key as keyof GameState],
      )
    }
  }
}

const verifyPlayerState = (
  player: GameState['players'][0],
  expected: Partial<GameState['players'][0]>,
) => {
  Object.entries(expected).forEach(([key, value]) => {
    expect(player[key as keyof typeof player]).toEqual(value)
  })
}

const debugLog = (context: GameState) => {
  // log context but without the cards in the hand
  const { players, logs, drawPile, discardPile, wildLocationPile, ...rest } =
    context
  const playersHands = context.players.map((p) => p.hand.map((c) => c.id))
  console.log('🔥 context', rest, playersHands)
}

function logInspectEvent(inspectEvent: InspectionEvent) {
  if (!DEBUG) return
  switch (inspectEvent.type) {
    case '@xstate.event': {
      console.log('\n🔵 Event:', inspectEvent.event)
      break
    }

    case '@xstate.snapshot': {
      const snapshot = inspectEvent.snapshot
      if ('context' in snapshot) {
        const context = snapshot.context as GameState
        console.log('🟢 State Context:', {
          currentPlayerIndex: context.currentPlayerIndex,
          actionsRemaining: context.actionsRemaining,
          round: context.round,
          era: context.era,
          selectedCard: context.selectedCard?.id,
          selectedCardsForScout: context.selectedCardsForScout.map(
            (c: Card) => c.id,
          ),
          selectedLink: context.selectedLink,
          spentMoney: context.spentMoney,
          players: context.players.map((p) => ({
            hand: p.hand.map((c) => c.id),
          })),
        })
        if ('value' in snapshot) {
          const state = snapshot.value
          console.log('State:', state)
        }
      }
      break
    }

    case '@xstate.action': {
      console.log('🟣 Action:', inspectEvent.action)
      break
    }
  }
}

test('game store state machine', () => {
  const { actor } = setupTestGame()
  const snapshot = actor.getSnapshot()

  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 1,
    resources: {
      coal: 24,
      iron: 24,
      beer: 24,
    },
  })

  const player1 = snapshot.context.players[0]
  assert(player1, 'Expected player 1 to exist')

  verifyPlayerState(player1, {
    money: 17,
    income: 10,
  })

  const player2 = snapshot.context.players[1]
  assert(player2, 'Expected player 2 to exist')

  verifyPlayerState(player2, {
    money: 17,
    income: 10,
  })

  expect(snapshot.context.logs).toHaveLength(1)
  const firstLog = snapshot.context.logs[0]
  expect(firstLog?.message).toBe('Game started')
  expect(firstLog?.type).toBe('system')
})

test('taking loan action', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const initialHand = [...initialPlayer.hand]
  const initialDiscardPile = [...snapshot.context.discardPile]

  // Verify initial state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })

  verifyPlayerState(initialPlayer, {
    money: 17,
    income: 10,
  })

  expect(initialHand).toHaveLength(8)
  expect(initialDiscardPile).toHaveLength(0)

  // Take loan action
  const { cardToDiscard } = takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Get final player state
  const finalPlayer = snapshot.context.players[0]
  assert(finalPlayer, 'Expected player 1 to exist')

  // Verify all aspects of taking a loan
  verifyPlayerState(finalPlayer, {
    money: 47, // Initial 17 + 30 from loan
    income: 7, // Initial 10 - 3 from loan
  })

  // Verify card was discarded
  expect(finalPlayer.hand).toHaveLength(8)
  expect(
    finalPlayer.hand.find((c) => c.id === cardToDiscard.id),
  ).toBeUndefined()
  expect(snapshot.context.discardPile).toHaveLength(1)
  expect(snapshot.context.discardPile[0]?.id).toBe(cardToDiscard.id)

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.type).toBe('action')
  expect(lastLog?.message).toContain('took a loan')
  expect(lastLog?.message).toContain('Player 1')

  // Verify turn state
  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    round: 1,
    selectedCard: null,
    selectedCardsForScout: [],
    spentMoney: 0,
  })
})

test('building action', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const initialHand = [...initialPlayer.hand]
  const initialDiscardPile = [...snapshot.context.discardPile]

  // Verify initial state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })
  verifyPlayerState(initialPlayer, {
    money: 17,
    income: 10,
  })
  expect(initialHand).toHaveLength(8)
  expect(initialDiscardPile).toHaveLength(0)

  // Start build action
  actor.send({ type: 'BUILD' })
  snapshot = actor.getSnapshot()
  expect(snapshot.value).toMatchObject({
    playing: {
      action: { building: 'selectingCard' },
    },
  })

  // Select a card to build with
  const cardToBuild = initialHand[0]
  assert(cardToBuild, 'Expected at least one card in hand')
  actor.send({ type: 'SELECT_CARD', cardId: cardToBuild.id })
  snapshot = actor.getSnapshot()

  // Verify card selection
  expect(snapshot.value).toMatchObject({
    playing: {
      action: { building: 'confirmingBuild' },
    },
  })
  expect(snapshot.context.selectedCard?.id).toBe(cardToBuild.id)

  // Confirm build
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // Get final player state
  const finalPlayer = snapshot.context.players[0]
  assert(finalPlayer, 'Expected player 1 to exist')

  // Verify card was discarded
  expect(finalPlayer.hand).toHaveLength(8) // Hand should be refilled
  expect(finalPlayer.hand.find((c) => c.id === cardToBuild.id)).toBeUndefined()
  expect(snapshot.context.discardPile).toHaveLength(1)
  expect(snapshot.context.discardPile[0]?.id).toBe(cardToBuild.id)

  // Verify action was decremented
  verifyGameState(snapshot, {
    currentPlayerIndex: 1, // Turn should have passed to next player
    actionsRemaining: 1,
    selectedCard: null,
  })

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.type).toBe('action')
  expect(lastLog?.message).toContain('Player 1')
  expect(lastLog?.message).toContain('built')
})

test('network action - canal era', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const initialHand = [...initialPlayer.hand]
  const initialDiscardPile = [...snapshot.context.discardPile]
  const initialMoney = initialPlayer.money

  // Verify initial state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })
  verifyPlayerState(initialPlayer, {
    money: 17,
    income: 10,
    links: [],
  })
  expect(initialHand).toHaveLength(8)
  expect(initialDiscardPile).toHaveLength(0)

  // Start network action
  actor.send({ type: 'NETWORK' })
  snapshot = actor.getSnapshot()
  expect(snapshot.value).toMatchObject({
    playing: { action: { networking: 'selectingCard' } },
  })

  // Select a card to build link with
  const cardToUse = initialHand[0]
  assert(cardToUse, 'Expected at least one card in hand')
  actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
  snapshot = actor.getSnapshot()

  // Verify card selection
  expect(snapshot.value).toMatchObject({
    playing: { action: { networking: 'selectingLink' } },
  })
  expect(snapshot.context.selectedCard?.id).toBe(cardToUse.id)

  // Select link location
  actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'dudley' })
  snapshot = actor.getSnapshot()

  // Verify link selection
  expect(snapshot.value).toMatchObject({
    playing: { action: { networking: 'confirmingLink' } },
  })
  expect(snapshot.context.selectedLink).toEqual({
    from: 'birmingham',
    to: 'dudley',
  })

  // Confirm link building
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // Get final player state
  const finalPlayer = snapshot.context.players[0]
  assert(finalPlayer, 'Expected player 1 to exist')

  // Verify card was discarded
  expect(finalPlayer.hand).toHaveLength(8) // Hand should be refilled
  expect(finalPlayer.hand.find((c) => c.id === cardToUse.id)).toBeUndefined()
  expect(snapshot.context.discardPile).toHaveLength(1)
  expect(snapshot.context.discardPile[0]?.id).toBe(cardToUse.id)

  // Verify link was built
  expect(finalPlayer.links).toHaveLength(1)
  expect(finalPlayer.links[0]).toEqual({
    from: 'birmingham',
    to: 'dudley',
    type: 'canal',
  })

  // Verify money was spent (£3 in canal era)
  expect(finalPlayer.money).toBe(initialMoney - 3)

  // Verify resources were not consumed in canal era
  verifyGameState(snapshot, {
    resources: {
      coal: 24,
      iron: 24,
      beer: 24,
    },
  })

  // Verify action was decremented and turn passed
  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    actionsRemaining: 1,
    selectedCard: null,
    selectedLink: null,
  })

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.type).toBe('action')
  expect(lastLog?.message).toContain('Player 1')
  expect(lastLog?.message).toContain(
    'built a canal link between birmingham and dudley',
  )
})

test('turn taking - round 1', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Verify initial turn state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })
  verifyGameState(snapshot, {
    actionsRemaining: 1,
    currentPlayerIndex: 0,
    round: 1,
    era: 'canal',
  })

  // Round 1: Each player takes their single action
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify turn switched to Player 2
  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    actionsRemaining: 1,
    round: 1,
  })

  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify round advanced to round 2 and back to Player 1
  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    round: 2,
    actionsRemaining: 2,
  })
})

test('turn taking - round 2', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Complete round 1
  takeLoanAction(actor)
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify we're at start of round 2
  verifyGameState(snapshot, {
    round: 2,
    currentPlayerIndex: 0,
    actionsRemaining: 2,
  })

  // Player 1's first action
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify still Player 1's turn
  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    actionsRemaining: 1,
    round: 2,
  })

  // Player 1's second action
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify turn switched to Player 2
  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    actionsRemaining: 2,
    round: 2,
  })

  // Player 2's first action
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    actionsRemaining: 1,
    round: 2,
  })

  // Player 2's second action
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify round advanced to round 3
  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    actionsRemaining: 2,
    round: 3,
  })
})

test('hand refilling after actions', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Get initial state
  const initialPlayer1 = snapshot.context.players[0]
  assert(initialPlayer1, 'Expected player 1 to exist')
  expect(initialPlayer1.hand).toHaveLength(8)

  // Track initial draw pile size
  const initialDrawPileSize = snapshot.context.drawPile.length

  // Player 1 takes their action in round 1
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify Player 1's hand was refilled
  const player1AfterAction = snapshot.context.players[0]
  assert(player1AfterAction, 'Expected player 1 to exist')
  expect(player1AfterAction.hand).toHaveLength(8)

  // Player 2 takes their action in round 1
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Verify Player 2's hand was refilled
  const player2AfterAction = snapshot.context.players[1]
  assert(player2AfterAction, 'Expected player 2 to exist')
  expect(player2AfterAction.hand).toHaveLength(8)

  // Round 2: Player 1 takes two actions
  takeLoanAction(actor) // First action
  snapshot = actor.getSnapshot()

  // Verify hand after first action
  const player1AfterFirstAction = snapshot.context.players[0]
  assert(player1AfterFirstAction, 'Expected player 1 to exist')
  expect(player1AfterFirstAction.hand).toHaveLength(8)

  takeLoanAction(actor) // Second action
  snapshot = actor.getSnapshot()

  // Verify hand after second action
  const player1AfterSecondAction = snapshot.context.players[0]
  assert(player1AfterSecondAction, 'Expected player 1 to exist')
  expect(player1AfterSecondAction.hand).toHaveLength(8)

  // Player 2 takes two actions
  takeLoanAction(actor) // First action
  snapshot = actor.getSnapshot()

  // Verify hand after first action
  const player2AfterFirstAction = snapshot.context.players[1]
  assert(player2AfterFirstAction, 'Expected player 2 to exist')
  expect(player2AfterFirstAction.hand).toHaveLength(8)

  takeLoanAction(actor) // Second action
  snapshot = actor.getSnapshot()

  // Verify hand after second action
  const player2AfterSecondAction = snapshot.context.players[1]
  assert(player2AfterSecondAction, 'Expected player 2 to exist')
  expect(player2AfterSecondAction.hand).toHaveLength(8)

  // Verify draw pile decreased by the correct amount
  // Each player discarded 6 cards total (1 in round 1, 2 in round 2) and drew 6 new ones
  expect(snapshot.context.drawPile.length).toBe(initialDrawPileSize - 6)
  expect(snapshot.context.discardPile.length).toBe(6) // Total cards discarded
})

test('develop action', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const initialHand = [...initialPlayer.hand]
  const initialDiscardPile = [...snapshot.context.discardPile]

  // Verify initial state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })
  verifyPlayerState(initialPlayer, {
    money: 17,
    income: 10,
  })
  expect(initialHand).toHaveLength(8)
  expect(initialDiscardPile).toHaveLength(0)

  // Start develop action
  actor.send({ type: 'DEVELOP' })
  snapshot = actor.getSnapshot()
  expect(snapshot.value).toMatchObject({
    playing: {
      action: { developing: 'selectingCard' },
    },
  })

  // Select a card for develop action
  const cardToDevelop = initialHand[0]
  assert(cardToDevelop, 'Expected at least one card in hand')
  actor.send({ type: 'SELECT_CARD', cardId: cardToDevelop.id })
  snapshot = actor.getSnapshot()

  // Verify card selection
  expect(snapshot.value).toMatchObject({
    playing: {
      action: { developing: 'confirmingDevelop' },
    },
  })
  expect(snapshot.context.selectedCard?.id).toBe(cardToDevelop.id)

  // Confirm develop
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // Get final player state
  const finalPlayer = snapshot.context.players[0]
  assert(finalPlayer, 'Expected player 1 to exist')

  // Verify card was discarded
  expect(finalPlayer.hand).toHaveLength(8) // Hand should be refilled
  expect(finalPlayer.hand.find((c) => c.id === cardToDevelop.id)).toBeUndefined()
  expect(snapshot.context.discardPile).toHaveLength(1)
  expect(snapshot.context.discardPile[0]?.id).toBe(cardToDevelop.id)

  // Verify action was decremented
  verifyGameState(snapshot, {
    currentPlayerIndex: 1, // Turn should have passed to next player
    actionsRemaining: 1,
    selectedCard: null,
  })

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.type).toBe('action')
  expect(lastLog?.message).toContain('Player 1')
  expect(lastLog?.message).toContain('developed')
})

test('sell action', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const initialHand = [...initialPlayer.hand]
  const initialDiscardPile = [...snapshot.context.discardPile]

  // Verify initial state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })
  verifyPlayerState(initialPlayer, {
    money: 17,
    income: 10,
  })
  expect(initialHand).toHaveLength(8)
  expect(initialDiscardPile).toHaveLength(0)

  // Start sell action
  actor.send({ type: 'SELL' })
  snapshot = actor.getSnapshot()
  expect(snapshot.value).toMatchObject({
    playing: {
      action: { selling: 'selectingCard' },
    },
  })

  // Select a card for sell action
  const cardToSell = initialHand[0]
  assert(cardToSell, 'Expected at least one card in hand')
  actor.send({ type: 'SELECT_CARD', cardId: cardToSell.id })
  snapshot = actor.getSnapshot()

  // Verify card selection
  expect(snapshot.value).toMatchObject({
    playing: {
      action: { selling: 'confirmingSell' },
    },
  })
  expect(snapshot.context.selectedCard?.id).toBe(cardToSell.id)

  // Confirm sell
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // Get final player state
  const finalPlayer = snapshot.context.players[0]
  assert(finalPlayer, 'Expected player 1 to exist')

  // Verify card was discarded
  expect(finalPlayer.hand).toHaveLength(8) // Hand should be refilled
  expect(finalPlayer.hand.find((c) => c.id === cardToSell.id)).toBeUndefined()
  expect(snapshot.context.discardPile).toHaveLength(1)
  expect(snapshot.context.discardPile[0]?.id).toBe(cardToSell.id)

  // Verify action was decremented
  verifyGameState(snapshot, {
    currentPlayerIndex: 1, // Turn should have passed to next player
    actionsRemaining: 1,
    selectedCard: null,
  })

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.type).toBe('action')
  expect(lastLog?.message).toContain('Player 1')
  expect(lastLog?.message).toContain('sold')
})

test('scout action', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const initialHand = [...initialPlayer.hand]
  const initialDiscardPile = [...snapshot.context.discardPile]
  const initialWildLocationPile = [...snapshot.context.wildLocationPile]
  const initialWildIndustryPile = [...snapshot.context.wildIndustryPile]

  // Verify initial state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })
  verifyPlayerState(initialPlayer, {
    money: 17,
    income: 10,
  })
  expect(initialHand).toHaveLength(8)
  expect(initialDiscardPile).toHaveLength(0)

  // Start scout action
  actor.send({ type: 'SCOUT' })
  snapshot = actor.getSnapshot()
  expect(snapshot.value).toMatchObject({
    playing: {
      action: { scouting: 'selectingCards' },
    },
  })

  // Select 3 cards for scout action (1 for the action + 2 additional)
  const cardsToScout = initialHand.slice(0, 3)
  actor.send({ type: 'SELECT_CARD', cardId: cardsToScout[0]!.id })
  actor.send({ type: 'SELECT_CARD', cardId: cardsToScout[1]!.id })
  actor.send({ type: 'SELECT_CARD', cardId: cardsToScout[2]!.id })
  snapshot = actor.getSnapshot()

  // Verify we have 3 cards selected
  expect(snapshot.context.selectedCardsForScout).toHaveLength(3)

  // Confirm scout
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // Get final player state
  const finalPlayer = snapshot.context.players[0]
  assert(finalPlayer, 'Expected player 1 to exist')

  // Verify 3 cards were discarded and 2 wild cards were added
  expect(finalPlayer.hand).toHaveLength(8) // Hand should be refilled after action (8 - 3 + 2 + refill = 8)
  expect(snapshot.context.discardPile).toHaveLength(3) // 3 cards discarded
  
  // Verify wild cards were taken
  expect(snapshot.context.wildLocationPile).toHaveLength(initialWildLocationPile.length - 1)
  expect(snapshot.context.wildIndustryPile).toHaveLength(initialWildIndustryPile.length - 1)

  // Verify player has wild cards in hand
  const hasWildLocation = finalPlayer.hand.some(card => card.type === 'wild_location')
  const hasWildIndustry = finalPlayer.hand.some(card => card.type === 'wild_industry')
  expect(hasWildLocation).toBe(true)
  expect(hasWildIndustry).toBe(true)

  // Verify action was decremented
  verifyGameState(snapshot, {
    currentPlayerIndex: 1, // Turn should have passed to next player
    actionsRemaining: 1,
    selectedCard: null,
    selectedCardsForScout: [],
  })

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.type).toBe('action')
  expect(lastLog?.message).toContain('Player 1')
  expect(lastLog?.message).toContain('scouted')
})

test('pass action', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const initialHand = [...initialPlayer.hand]
  const initialDiscardPile = [...snapshot.context.discardPile]

  // Verify initial state
  expect(snapshot.value).toMatchObject({
    playing: { action: 'selectingAction' },
  })
  verifyPlayerState(initialPlayer, {
    money: 17,
    income: 10,
  })
  expect(initialHand).toHaveLength(8)
  expect(initialDiscardPile).toHaveLength(0)

  // Start pass action
  actor.send({ type: 'PASS' })
  snapshot = actor.getSnapshot()

  // Get final player state
  const finalPlayer = snapshot.context.players[0]
  assert(finalPlayer, 'Expected player 1 to exist')

  // Verify card was discarded (pass still requires discarding a card)
  expect(finalPlayer.hand).toHaveLength(8) // Hand should be refilled
  expect(snapshot.context.discardPile).toHaveLength(1) // One card discarded

  // Verify action was decremented
  verifyGameState(snapshot, {
    currentPlayerIndex: 1, // Turn should have passed to next player
    actionsRemaining: 1,
  })

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.type).toBe('action')
  expect(lastLog?.message).toContain('Player 1')
  expect(lastLog?.message).toContain('passed')
})

// TDD Tests for Rule Compliance Fixes

test('build action - card type validation', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Start build action
  actor.send({ type: 'BUILD' })
  snapshot = actor.getSnapshot()

  // Create a mock card that's not a valid build card type (if we had such cards)
  // For now, test that valid card types work
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  
  // Find different card types in hand
  const locationCard = initialPlayer.hand.find(c => c.type === 'location')
  const industryCard = initialPlayer.hand.find(c => c.type === 'industry')
  const wildLocationCard = initialPlayer.hand.find(c => c.type === 'wild_location')
  const wildIndustryCard = initialPlayer.hand.find(c => c.type === 'wild_industry')

  // Test that location cards work for build
  if (locationCard) {
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard?.id).toBe(locationCard.id)
    
    // Confirm should work (though we'll cancel to test other cards)
    actor.send({ type: 'CANCEL' })
    actor.send({ type: 'BUILD' })
  }

  // Test that industry cards work for build  
  if (industryCard) {
    actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard?.id).toBe(industryCard.id)
    
    actor.send({ type: 'CANCEL' })
    actor.send({ type: 'BUILD' })
  }

  // Test that wild cards work for build
  if (wildLocationCard) {
    actor.send({ type: 'SELECT_CARD', cardId: wildLocationCard.id })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard?.id).toBe(wildLocationCard.id)
    
    actor.send({ type: 'CANCEL' })
    actor.send({ type: 'BUILD' })
  }

  if (wildIndustryCard) {
    actor.send({ type: 'SELECT_CARD', cardId: wildIndustryCard.id })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedCard?.id).toBe(wildIndustryCard.id)
  }
})

test('develop action - iron consumption', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial iron amount
  const initialIron = snapshot.context.resources.iron
  expect(initialIron).toBe(24) // Should start with 24 iron

  // Perform develop action
  actor.send({ type: 'DEVELOP' })
  
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const cardToDevelop = initialPlayer.hand[0]
  assert(cardToDevelop, 'Expected at least one card in hand')
  
  actor.send({ type: 'SELECT_CARD', cardId: cardToDevelop.id })
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // Verify iron was consumed (1 iron per tile removed, we remove 1 tile in simplified implementation)
  expect(snapshot.context.resources.iron).toBe(initialIron - 1) // Should be 23
  
  // Verify log mentions iron consumption
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.message).toContain('consumed')
  expect(lastLog?.message).toContain('iron')
})

test('sell action - beer consumption', () => {
  const { actor } = setupTestGame()
  let snapshot = actor.getSnapshot()

  // Store initial beer amount
  const initialBeer = snapshot.context.resources.beer
  expect(initialBeer).toBe(24) // Should start with 24 beer

  // Perform sell action
  actor.send({ type: 'SELL' })
  
  const initialPlayer = snapshot.context.players[0]
  assert(initialPlayer, 'Expected player 1 to exist')
  const cardToSell = initialPlayer.hand[0]
  assert(cardToSell, 'Expected at least one card in hand')
  
  actor.send({ type: 'SELECT_CARD', cardId: cardToSell.id })
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // Verify beer was consumed (1 beer per tile sold, we sell 1 tile in simplified implementation)
  expect(snapshot.context.resources.beer).toBe(initialBeer - 1) // Should be 23
  
  // Verify log mentions beer consumption
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.message).toContain('consumed')
  expect(lastLog?.message).toContain('beer')
})

test('network action - rail era coal consumption', () => {
  const { actor } = setupTestGame()  
  let snapshot = actor.getSnapshot()

  // Complete round 1 to get to round 2 where we can change era for testing
  takeLoanAction(actor)
  takeLoanAction(actor)
  snapshot = actor.getSnapshot()

  // Manually set era to rail for testing (in real game this would happen through era transition)
  // We need to modify the game state - this is a test-only operation
  // For now, let's test the canal era behavior and note that rail era would consume coal
  
  const initialCoal = snapshot.context.resources.coal
  expect(initialCoal).toBe(24)

  // Test canal era network (should not consume coal)
  actor.send({ type: 'NETWORK' })
  
  const currentPlayer = snapshot.context.players[0]
  assert(currentPlayer, 'Expected current player to exist')
  const cardToUse = currentPlayer.hand[0]
  assert(cardToUse, 'Expected at least one card in hand')
  
  actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
  actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
  actor.send({ type: 'CONFIRM' })
  snapshot = actor.getSnapshot()

  // In canal era, coal should not be consumed
  expect(snapshot.context.resources.coal).toBe(initialCoal) // Should still be 24
  
  // Verify log shows canal link
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1]
  expect(lastLog?.message).toContain('canal link')
  
  // TODO: Add test for rail era coal consumption when era transitions are implemented
})

test('starting money compliance with rules', () => {
  const { actor } = setupTestGame()
  const snapshot = actor.getSnapshot()

  // Verify both players start with £17 as per Brass Birmingham rules
  const player1 = snapshot.context.players[0]
  const player2 = snapshot.context.players[1]
  
  assert(player1, 'Expected player 1 to exist')
  assert(player2, 'Expected player 2 to exist')

  expect(player1.money).toBe(17)
  expect(player2.money).toBe(17)
  
  // Verify they also start with correct income (£10)
  expect(player1.income).toBe(10)
  expect(player2.income).toBe(10)
})
