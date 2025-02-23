import { createActor, type InspectionEvent } from 'xstate';
import { test, expect } from 'vitest';
import { type GameState, gameStore } from './gameStore';
import { type Card } from '~/data/cards';

const DEBUG = false;

function logInspectEvent(inspectEvent: InspectionEvent) {
  if (!DEBUG) return;
  switch (inspectEvent.type) {
    case '@xstate.event': {
      console.log('\n🔵 Event:', {
        type: inspectEvent.event.type,
        data: inspectEvent.event
      });
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
      }
      break;
    }

    case '@xstate.action': {
      console.log('🟣 Action:', {
        type: inspectEvent.action.type,
        params: inspectEvent.action.params
      });
      break;
    }


  }
}

test('game store state machine', () => {
  // 1. Arrange
  const actor = createActor(gameStore, {
    inspect: logInspectEvent
  });

  // 2. Act
  actor.start();

  // 3. Assert
  expect(actor.getSnapshot().value).toBe('setup');

  // Test starting a game
  const initialPlayers = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    }
  ];

  actor.send({ type: 'START_GAME', players: initialPlayers });

  // Verify game started and is in playing state
  const snapshot = actor.getSnapshot();
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });

  // Verify initial game state
  const { context } = snapshot;
  expect(context.players).toHaveLength(2);
  expect(context.currentPlayerIndex).toBe(0);
  expect(context.era).toBe('canal');
  expect(context.round).toBe(1);
  expect(context.actionsRemaining).toBe(1); // First round of Canal Era only gets 1 action
  expect(context.resources).toEqual({
    coal: 24,
    iron: 24,
    beer: 24
  });
  expect(context.logs).toHaveLength(1);

  // Add non-null assertion since we know logs[0] exists after checking length
  const firstLog = context.logs[0]!;
  expect(firstLog.message).toBe('Game started');
  expect(firstLog.type).toBe('system');
});

test('turn taking - player turn should switch after using all actions', () => {
  // 1. Arrange - Create and start the actor
  const actor = createActor(gameStore, {
    inspect: logInspectEvent
  });
  actor.start();

  // Start game with 2 players
  const initialPlayers = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    }
  ];

  // 2. Act - Start the game
  actor.send({ type: 'START_GAME', players: initialPlayers });

  // Verify initial turn state
  let snapshot = actor.getSnapshot();
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });
  expect(snapshot.context.actionsRemaining).toBe(1); // First round of Canal Era only gets 1 action
  expect(snapshot.context.currentPlayerIndex).toBe(0); // Player 1's turn
  expect(snapshot.context.round).toBe(1);

  // Player 1 takes their action
  actor.send({ type: 'TAKE_LOAN' });
  const player1Card = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player1Card!.id });
  actor.send({ type: 'CONFIRM' });
  snapshot = actor.getSnapshot();

  // Verify turn switched to Player 2
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });
  expect(snapshot.context.currentPlayerIndex).toBe(1); // Should now be Player 2's turn
  expect(snapshot.context.actionsRemaining).toBe(1); // First round still has 1 action
  expect(snapshot.context.round).toBe(1); // Still in first round

  // Player 2 takes their action
  actor.send({ type: 'TAKE_LOAN' });
  const player2Card = snapshot.context.players[1]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player2Card!.id });
  actor.send({ type: 'CONFIRM' });
  snapshot = actor.getSnapshot();

  // Verify round advanced and back to Player 1
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });
  expect(snapshot.context.currentPlayerIndex).toBe(0); // Back to Player 1
  expect(snapshot.context.round).toBe(2); // Advanced to round 2
  expect(snapshot.context.actionsRemaining).toBe(2); // Regular rounds have 2 actions

  // Take Player 1's first action in round 2
  actor.send({ type: 'TAKE_LOAN' });
  const round2FirstCard = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: round2FirstCard!.id });
  actor.send({ type: 'CONFIRM' });
  snapshot = actor.getSnapshot();

  // Verify still Player 1's turn with one action remaining
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });
  expect(snapshot.context.currentPlayerIndex).toBe(0); // Still Player 1
  expect(snapshot.context.actionsRemaining).toBe(1); // One action remaining
  expect(snapshot.context.round).toBe(2);

  // Take Player 1's second action
  actor.send({ type: 'TAKE_LOAN' });
  const round2SecondCard = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: round2SecondCard!.id });
  actor.send({ type: 'CONFIRM' });
  snapshot = actor.getSnapshot();

  // Verify turn switched to Player 2 after both actions used
  expect(snapshot.value).toEqual({ playing: 'playerTurn' });
  expect(snapshot.context.currentPlayerIndex).toBe(1); // Switched to Player 2
  expect(snapshot.context.actionsRemaining).toBe(2); // Reset to 2 actions for Player 2
  expect(snapshot.context.round).toBe(2); // Still in round 2
});

test.skip('scouting - player should be able to scout for wild cards', () => {
  // 1. Arrange
  const actor = createActor(gameStore);
  actor.start();

  const initialPlayers = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    }
  ];

  // 2. Act - Start the game
  actor.send({ type: 'START_GAME', players: initialPlayers });
  let snapshot = actor.getSnapshot();

  // Start scouting action
  actor.send({ type: 'SCOUT' });
  snapshot = actor.getSnapshot();

  // Get two cards from Player 1's hand to discard
  const player1Cards = snapshot.context.players[0]!.hand.slice(0, 2);
  expect(player1Cards).toHaveLength(2);

  // Select first card
  actor.send({ type: 'SELECT_CARD', cardId: player1Cards[0]!.id });
  // Select second card
  actor.send({ type: 'SELECT_CARD', cardId: player1Cards[1]!.id });

  // Confirm scouting action
  actor.send({ type: 'CONFIRM' });
  snapshot = actor.getSnapshot();

  // 3. Assert
  expect(snapshot.context.actionsRemaining).toBe(0); // Should have used the action
  const player1 = snapshot.context.players[0];
  expect(player1?.hand).toHaveLength(8); // Should still have 8 cards (2 discarded, 2 wild cards received)
});

test.skip('networking - player should be able to build links', () => {
  // 1. Arrange
  const actor = createActor(gameStore);
  actor.start();

  const initialPlayers = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    }
  ];

  // 2. Act - Start the game
  actor.send({ type: 'START_GAME', players: initialPlayers });
  let snapshot = actor.getSnapshot();

  // Start networking action
  actor.send({ type: 'NETWORK' });
  snapshot = actor.getSnapshot();

  // Get a card to discard for networking
  const networkingCard = snapshot.context.players[0]?.hand[0];
  expect(networkingCard).toBeDefined();

  // Select the card
  actor.send({ type: 'SELECT_CARD', cardId: networkingCard!.id });

  // Select a link to build (using example cities)
  actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'dudley' });

  // Confirm the action
  actor.send({ type: 'CONFIRM' });
  snapshot = actor.getSnapshot();

  // 3. Assert
  const player1 = snapshot.context.players[0];
  expect(player1?.links).toHaveLength(1);
  expect(player1?.money).toBe(27); // Should have spent £3 for canal era link
  expect(player1?.links[0]).toEqual({
    from: 'birmingham',
    to: 'dudley',
    type: 'canal'
  });
});

test.skip('round progression - game should advance rounds correctly', () => {
  // 1. Arrange
  const actor = createActor(gameStore);
  actor.start();

  const initialPlayers = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    }
  ];

  // 2. Act - Start the game
  actor.send({ type: 'START_GAME', players: initialPlayers });
  let snapshot = actor.getSnapshot();

  // Use Player 1's action and end turn
  actor.send({ type: 'TAKE_LOAN' });
  const player1Card = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player1Card!.id });
  actor.send({ type: 'CONFIRM' });
  actor.send({ type: 'END_TURN' });

  // Use Player 2's action and end turn
  snapshot = actor.getSnapshot();
  actor.send({ type: 'TAKE_LOAN' });
  const player2Card = snapshot.context.players[1]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player2Card!.id });
  actor.send({ type: 'CONFIRM' });
  actor.send({ type: 'END_TURN' });

  snapshot = actor.getSnapshot();

  // 3. Assert
  expect(snapshot.context.round).toBe(2); // Should have advanced to round 2
  expect(snapshot.context.currentPlayerIndex).toBe(0); // Should be back to Player 1
  expect(snapshot.context.actionsRemaining).toBe(2); // Should now have 2 actions (not first round)

});

test.skip('multiple actions in a turn - player should be able to take multiple actions', () => {
  // 1. Arrange
  const actor = createActor(gameStore);
  actor.start();

  const initialPlayers = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 30,
      victoryPoints: 0,
      income: 10
    }
  ];

  // 2. Act - Start the game and complete round 1
  actor.send({ type: 'START_GAME', players: initialPlayers });
  let snapshot = actor.getSnapshot();

  // Complete round 1 to get to 2 actions per turn
  actor.send({ type: 'TAKE_LOAN' });
  const player1FirstCard = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player1FirstCard!.id });
  actor.send({ type: 'CONFIRM' });
  actor.send({ type: 'END_TURN' });

  actor.send({ type: 'TAKE_LOAN' });
  const player2FirstCard = snapshot.context.players[1]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player2FirstCard!.id });
  actor.send({ type: 'CONFIRM' });
  actor.send({ type: 'END_TURN' });

  snapshot = actor.getSnapshot();
  expect(snapshot.context.actionsRemaining).toBe(2); // Should now have 2 actions

  // Take first action (loan)
  actor.send({ type: 'TAKE_LOAN' });
  const firstActionCard = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: firstActionCard!.id });
  actor.send({ type: 'CONFIRM' });

  snapshot = actor.getSnapshot();
  expect(snapshot.context.actionsRemaining).toBe(1); // Should have 1 action remaining

  // Take second action (another loan)
  actor.send({ type: 'TAKE_LOAN' });
  const secondActionCard = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: secondActionCard!.id });
  actor.send({ type: 'CONFIRM' });

  snapshot = actor.getSnapshot();

  // 3. Assert
  expect(snapshot.context.actionsRemaining).toBe(0); // Should have used both actions
  expect(snapshot.context.currentPlayerIndex).toBe(1); // Should have switched to Player 2

  const player1 = snapshot.context.players[0];
  expect(player1?.money).toBe(120); // Original 30 + 30 (round 1) + 30 + 30 (round 2)
  expect(player1?.income).toBe(1); // Original 10 - 3 - 3 - 3 = 1
});

