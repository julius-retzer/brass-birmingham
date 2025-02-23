import { createActor } from 'xstate';
import { test, expect } from 'vitest';
import { gameStore } from './gameStore';



test('game store state machine', () => {
  // 1. Arrange
  const actor = createActor(gameStore);

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
  expect(snapshot.value).toEqual({ playing: 'actionSelection' });

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
  const actor = createActor(gameStore);
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

  // Verify we're in the correct initial state
  let snapshot = actor.getSnapshot();

  // Player 1 takes a loan action
  actor.send({ type: 'TAKE_LOAN' });
  snapshot = actor.getSnapshot();

  // Get the first card from Player 1's hand to use for the loan
  const player1FirstCard = snapshot.context.players[0]?.hand[0];
  expect(player1FirstCard).toBeDefined();

  // Select the card for the loan
  actor.send({ type: 'SELECT_CARD', cardId: player1FirstCard!.id });
  snapshot = actor.getSnapshot();

  // Confirm the loan action
  actor.send({ type: 'CONFIRM_ACTION' });
  snapshot = actor.getSnapshot();

  // 3. Assert - Verify turn has switched to Player 2
  expect(snapshot.context.currentPlayerIndex).toBe(1); // Should now be Player 2's turn
  expect(snapshot.context.actionsRemaining).toBe(1); // First round of Canal Era

  // Verify Player 1's money and income changed from the loan
  const player1 = snapshot.context.players[0];
  expect(player1?.money).toBe(60); // Original 30 + 30 from loan
  expect(player1?.income).toBe(7); // Original 10 - 3 from loan

  // Verify the action was logged
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1];
  expect(lastLog?.type).toBe('action');
  expect(lastLog?.message).toContain('took a loan');
});

test('scouting - player should be able to scout for wild cards', () => {
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
  actor.send({ type: 'CONFIRM_ACTION' });
  snapshot = actor.getSnapshot();

  // 3. Assert
  expect(snapshot.context.actionsRemaining).toBe(0); // Should have used the action
  const player1 = snapshot.context.players[0];
  expect(player1?.hand).toHaveLength(8); // Should still have 8 cards (2 discarded, 2 wild cards received)
});

test('networking - player should be able to build links', () => {
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
  actor.send({ type: 'CONFIRM_ACTION' });
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

  // Verify the action was logged
  const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1];
  expect(lastLog?.type).toBe('action');
  expect(lastLog?.message).toContain('discarded');

  const secondLastLog = snapshot.context.logs[snapshot.context.logs.length - 2];
  expect(secondLastLog?.type).toBe('action');
  expect(secondLastLog?.message).toContain('built a canal link');
});

test('round progression - game should advance rounds correctly', () => {
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
  actor.send({ type: 'CONFIRM_ACTION' });
  actor.send({ type: 'END_TURN' });

  // Use Player 2's action and end turn
  snapshot = actor.getSnapshot();
  actor.send({ type: 'TAKE_LOAN' });
  const player2Card = snapshot.context.players[1]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player2Card!.id });
  actor.send({ type: 'CONFIRM_ACTION' });
  actor.send({ type: 'END_TURN' });

  snapshot = actor.getSnapshot();

  // 3. Assert
  expect(snapshot.context.round).toBe(2); // Should have advanced to round 2
  expect(snapshot.context.currentPlayerIndex).toBe(0); // Should be back to Player 1
  expect(snapshot.context.actionsRemaining).toBe(2); // Should now have 2 actions (not first round)

  // Verify round progression was logged
  const roundLog = snapshot.context.logs.find(log =>
    log.message.includes('Round 1 ended. Starting round 2')
  );
  expect(roundLog).toBeDefined();
  expect(roundLog?.type).toBe('system');
});

test('multiple actions in a turn - player should be able to take multiple actions', () => {
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
  actor.send({ type: 'CONFIRM_ACTION' });
  actor.send({ type: 'END_TURN' });

  actor.send({ type: 'TAKE_LOAN' });
  const player2FirstCard = snapshot.context.players[1]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: player2FirstCard!.id });
  actor.send({ type: 'CONFIRM_ACTION' });
  actor.send({ type: 'END_TURN' });

  snapshot = actor.getSnapshot();
  expect(snapshot.context.actionsRemaining).toBe(2); // Should now have 2 actions

  // Take first action (loan)
  actor.send({ type: 'TAKE_LOAN' });
  const firstActionCard = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: firstActionCard!.id });
  actor.send({ type: 'CONFIRM_ACTION' });

  snapshot = actor.getSnapshot();
  expect(snapshot.context.actionsRemaining).toBe(1); // Should have 1 action remaining

  // Take second action (another loan)
  actor.send({ type: 'TAKE_LOAN' });
  const secondActionCard = snapshot.context.players[0]?.hand[0];
  actor.send({ type: 'SELECT_CARD', cardId: secondActionCard!.id });
  actor.send({ type: 'CONFIRM_ACTION' });

  snapshot = actor.getSnapshot();

  // 3. Assert
  expect(snapshot.context.actionsRemaining).toBe(0); // Should have used both actions
  expect(snapshot.context.currentPlayerIndex).toBe(1); // Should have switched to Player 2

  const player1 = snapshot.context.players[0];
  expect(player1?.money).toBe(120); // Original 30 + 30 (round 1) + 30 + 30 (round 2)
  expect(player1?.income).toBe(1); // Original 10 - 3 - 3 - 3 = 1
});

