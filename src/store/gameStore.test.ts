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
  console.log('After START_GAME:', {
    value: snapshot.value,
    currentPlayerIndex: snapshot.context.currentPlayerIndex,
    actionsRemaining: snapshot.context.actionsRemaining
  });

  // Player 1 takes a loan action
  actor.send({ type: 'TAKE_LOAN' });
  snapshot = actor.getSnapshot();
  console.log('After TAKE_LOAN:', {
    value: snapshot.value,
    currentPlayerIndex: snapshot.context.currentPlayerIndex,
    actionsRemaining: snapshot.context.actionsRemaining
  });

  // Get the first card from Player 1's hand to use for the loan
  const player1FirstCard = snapshot.context.players[0]?.hand[0];
  expect(player1FirstCard).toBeDefined();

  // Select the card for the loan
  actor.send({ type: 'SELECT_CARD', cardId: player1FirstCard!.id });
  snapshot = actor.getSnapshot();
  console.log('After SELECT_CARD:', {
    value: snapshot.value,
    currentPlayerIndex: snapshot.context.currentPlayerIndex,
    actionsRemaining: snapshot.context.actionsRemaining
  });

  // Confirm the loan action
  actor.send({ type: 'CONFIRM_ACTION' });
  snapshot = actor.getSnapshot();
  console.log('After CONFIRM_ACTION:', {
    value: snapshot.value,
    currentPlayerIndex: snapshot.context.currentPlayerIndex,
    actionsRemaining: snapshot.context.actionsRemaining
  });

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

