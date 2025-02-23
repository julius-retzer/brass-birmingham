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
      money: 30,
      victoryPoints: 0,
      income: 10,
      links: [],
      industries: []
    },
    {
      id: '2',
      name: 'Player 2',
      money: 30,
      victoryPoints: 0,
      income: 10,
      links: [],
      industries: []
    }
  ];

  actor.send({ type: 'START_GAME', players: initialPlayers });

  // Verify game started and is in playing state
  const snapshot = actor.getSnapshot();
  expect(snapshot.value).toEqual({ playing: 'selectingAction'});

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

