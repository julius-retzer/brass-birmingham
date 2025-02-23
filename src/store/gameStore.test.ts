import { createActor, type InspectionEvent, type Actor, type SnapshotFrom } from 'xstate';
import { test, expect, assert } from 'vitest';
import { type GameState, gameStore } from './gameStore';
import { type Card } from '~/data/cards';

const DEBUG = true;

// Test utilities
type TestPlayer = {
  id: string;
  name: string;
  color: 'red' | 'blue';
  character: 'Richard Arkwright' | 'Eliza Tinsley';
  money: number;
  victoryPoints: number;
  income: number;
};

const createTestPlayers = (): TestPlayer[] => [
  {
    id: '1',
    name: 'Player 1',
    color: 'red',
    character: 'Richard Arkwright',
    money: 30,
    victoryPoints: 0,
    income: 10
  },
  {
    id: '2',
    name: 'Player 2',
    color: 'blue',
    character: 'Eliza Tinsley',
    money: 30,
    victoryPoints: 0,
    income: 10
  }
];

type GameActor = Actor<typeof gameStore>;
type GameSnapshot = SnapshotFrom<typeof gameStore>;

const setupTestGame = () => {
  const actor = createActor(gameStore, { inspect: logInspectEvent });
  actor.start();
  const players = createTestPlayers();
  actor.send({ type: 'START_GAME', players });
  return { actor, players };
};

const takeLoanAction = (actor: GameActor) => {
  let snapshot = actor.getSnapshot();
  const currentPlayer = snapshot.context.players[snapshot.context.currentPlayerIndex];
  if (!currentPlayer) throw new Error('Expected current player to exist');

  actor.send({ type: 'TAKE_LOAN' });
  snapshot = actor.getSnapshot();

  const cardToDiscard = currentPlayer.hand[0];
  if (!cardToDiscard) throw new Error('Expected at least one card in hand');

  actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id });
  actor.send({ type: 'CONFIRM' });

  return { cardToDiscard };
};

const verifyGameState = (snapshot: GameSnapshot, expected: Partial<GameState>) => {
  const { context } = snapshot;
  for (const key in expected) {
    if (Object.prototype.hasOwnProperty.call(expected, key)) {
      expect(context[key as keyof GameState]).toEqual(expected[key as keyof GameState]);
    }
  }
};

const verifyPlayerState = (player: GameState['players'][0], expected: Partial<GameState['players'][0]>) => {
  Object.entries(expected).forEach(([key, value]) => {
    expect(player[key as keyof typeof player]).toEqual(value);
  });
};

const debugLog = (context: GameState) => {
  // log context but without the cards in the hand
  const { players, logs, drawPile, discardPile, wildLocationPile, ...rest } = context;
  const playersHands = context.players.map((p) => p.hand.map((c) => c.id));
  console.log('🔥 context', rest, playersHands);
}

function logInspectEvent(inspectEvent: InspectionEvent) {
  if (!DEBUG) return;
  switch (inspectEvent.type) {
    case '@xstate.event': {
      console.log('\n🔵 Event:', inspectEvent.event);
      break;
    }

    case '@xstate.snapshot': {
      const snapshot = inspectEvent.snapshot;
      if ('context' in snapshot) {
        const context = snapshot.context as GameState;
        console.log('🟢 State Context:', {
          currentPlayerIndex: context.currentPlayerIndex,
          actionsRemaining: context.actionsRemaining,
          round: context.round,
          era: context.era,
          selectedCard: context.selectedCard?.id,
          selectedCardsForScout: context.selectedCardsForScout.map((c: Card) => c.id),
          selectedLink: context.selectedLink,
          spentMoney: context.spentMoney,
          players: context.players.map((p) => ({
            hand: p.hand.map((c) => c.id)
          }))
        });
        if ('value' in snapshot) {
          const state = snapshot.value;
          console.log('State:', state);
        }
      }
      break;
    }

    case '@xstate.action': {
      console.log('🟣 Action:', inspectEvent.action);
      break;
    }
  }
}

test('game store state machine', () => {
  const { actor } = setupTestGame();
  const snapshot = actor.getSnapshot();


  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 1,
    resources: {
      coal: 24,
      iron: 24,
      beer: 24
    }
  });

  const player1 = snapshot.context.players[0];
  assert(player1, 'Expected player 1 to exist');

  verifyPlayerState(player1, {
    money: 30,
    income: 10
  });

  const player2 = snapshot.context.players[1];
  assert(player2, 'Expected player 2 to exist');

  verifyPlayerState(player2, {
    money: 30,
    income: 10
  });

  expect(snapshot.context.logs).toHaveLength(1);
  const firstLog = snapshot.context.logs[0];
  expect(firstLog?.message).toBe('Game started');
  expect(firstLog?.type).toBe('system');
});

test('taking loan action', () => {
  const { actor } = setupTestGame();
  let snapshot = actor.getSnapshot();

  // Store initial state for comparison
  const initialPlayer = snapshot.context.players[0];
  assert(initialPlayer, 'Expected player 1 to exist');
  const initialHand = [...initialPlayer.hand];
  const initialDiscardPile = [...snapshot.context.discardPile];

  // Verify initial state
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });

  verifyPlayerState(initialPlayer, {
    money: 30,
    income: 10
  });

  expect(initialHand).toHaveLength(8);
  expect(initialDiscardPile).toHaveLength(0);

  // Take loan action
  const { cardToDiscard } = takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Get final player state
  const finalPlayer = snapshot.context.players[0];
  assert(finalPlayer, 'Expected player 1 to exist');

  // Verify all aspects of taking a loan
  verifyPlayerState(finalPlayer, {
    money: 60, // Initial 30 + 30 from loan
    income: 7 // Initial 10 - 3 from loan
  });

  // Verify card was discarded
  expect(finalPlayer.hand).toHaveLength(8);
  expect(finalPlayer.hand.find(c => c.id === cardToDiscard.id)).toBeUndefined();
  expect(snapshot.context.discardPile).toHaveLength(1);
  expect(snapshot.context.discardPile[0]?.id).toBe(cardToDiscard.id);

  // Verify log entry
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1];
  expect(lastLog?.type).toBe('action');
  expect(lastLog?.message).toContain('took a loan');
  expect(lastLog?.message).toContain('Player 1');

  // Verify turn state
  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    round: 1,
    selectedCard: null,
    selectedCardsForScout: [],
    spentMoney: 0
  });
});

test('turn taking - round 1', () => {
  const { actor } = setupTestGame();
  let snapshot = actor.getSnapshot();

  // Verify initial turn state
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });
  verifyGameState(snapshot, {
    actionsRemaining: 1,
    currentPlayerIndex: 0,
    round: 1,
    era: 'canal'
  });

  // Round 1: Each player takes their single action
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify turn switched to Player 2
  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    actionsRemaining: 1,
    round: 1
  });

  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify round advanced to round 2 and back to Player 1
  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    round: 2,
    actionsRemaining: 2
  });
});

test('turn taking - round 2', () => {
  const { actor } = setupTestGame();
  let snapshot = actor.getSnapshot();

  // Complete round 1
  takeLoanAction(actor);
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify we're at start of round 2
  verifyGameState(snapshot, {
    round: 2,
    currentPlayerIndex: 0,
    actionsRemaining: 2
  });

  // Player 1's first action
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify still Player 1's turn
  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    actionsRemaining: 1,
    round: 2
  });

  // Player 1's second action
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify turn switched to Player 2
  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    actionsRemaining: 2,
    round: 2
  });

  // Player 2's first action
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  verifyGameState(snapshot, {
    currentPlayerIndex: 1,
    actionsRemaining: 1,
    round: 2
  });

  // Player 2's second action
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify round advanced to round 3
  verifyGameState(snapshot, {
    currentPlayerIndex: 0,
    actionsRemaining: 2,
    round: 3
  });
});

test('hand refilling after actions', () => {
  const { actor } = setupTestGame();
  let snapshot = actor.getSnapshot();

  // Get initial state
  const initialPlayer1 = snapshot.context.players[0];
  assert(initialPlayer1, 'Expected player 1 to exist');
  expect(initialPlayer1.hand).toHaveLength(8);

  // Track initial draw pile size
  const initialDrawPileSize = snapshot.context.drawPile.length;

  // Player 1 takes their action in round 1
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify Player 1's hand was refilled
  const player1AfterAction = snapshot.context.players[0];
  assert(player1AfterAction, 'Expected player 1 to exist');
  expect(player1AfterAction.hand).toHaveLength(8);

  // Player 2 takes their action in round 1
  takeLoanAction(actor);
  snapshot = actor.getSnapshot();

  // Verify Player 2's hand was refilled
  const player2AfterAction = snapshot.context.players[1];
  assert(player2AfterAction, 'Expected player 2 to exist');
  expect(player2AfterAction.hand).toHaveLength(8);

  // Round 2: Player 1 takes two actions
  takeLoanAction(actor); // First action
  snapshot = actor.getSnapshot();

  // Verify hand after first action
  const player1AfterFirstAction = snapshot.context.players[0];
  assert(player1AfterFirstAction, 'Expected player 1 to exist');
  expect(player1AfterFirstAction.hand).toHaveLength(8);

  takeLoanAction(actor); // Second action
  snapshot = actor.getSnapshot();

  // Verify hand after second action
  const player1AfterSecondAction = snapshot.context.players[0];
  assert(player1AfterSecondAction, 'Expected player 1 to exist');
  expect(player1AfterSecondAction.hand).toHaveLength(8);

  // Player 2 takes two actions
  takeLoanAction(actor); // First action
  snapshot = actor.getSnapshot();

  // Verify hand after first action
  const player2AfterFirstAction = snapshot.context.players[1];
  assert(player2AfterFirstAction, 'Expected player 2 to exist');
  expect(player2AfterFirstAction.hand).toHaveLength(8);

  takeLoanAction(actor); // Second action
  snapshot = actor.getSnapshot();

  // Verify hand after second action
  const player2AfterSecondAction = snapshot.context.players[1];
  assert(player2AfterSecondAction, 'Expected player 2 to exist');
  expect(player2AfterSecondAction.hand).toHaveLength(8);

  // Verify draw pile decreased by the correct amount
  // Each player discarded 6 cards total (1 in round 1, 2 in round 2) and drew 6 new ones
  expect(snapshot.context.drawPile.length).toBe(initialDrawPileSize - 6);
  expect(snapshot.context.discardPile.length).toBe(6); // Total cards discarded
});

