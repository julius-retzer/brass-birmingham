import { createActor } from 'xstate';
import { loanMachine } from './loanMachine';
import { type GameState, type Player } from './types';
import { type Card, type LocationCard, type IndustryCard } from '../../data/cards';
import { describe, it, expect } from 'vitest';

describe('loanMachine', () => {
  const mockLocationCard: LocationCard = {
    id: 'card1',
    type: 'location',
    location: 'birmingham',
    color: 'blue'
  };

  const mockIndustryCard: IndustryCard = {
    id: 'card2',
    type: 'industry',
    industries: ['cotton']
  };

  const mockPlayer: Player = {
    id: 'player1',
    name: 'Test Player',
    color: 'red',
    character: 'Richard Arkwright',
    money: 10,
    victoryPoints: 0,
    income: 10,
    hand: [mockLocationCard, mockIndustryCard],
    links: [],
    industries: []
  };

  const mockGameState: GameState = {
    players: [mockPlayer],
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 2,
    resources: {
      coal: 24,
      iron: 24,
      beer: 24
    },
    logs: [],
    drawPile: [],
    discardPile: [],
    wildLocationPile: [],
    wildIndustryPile: [],
    selectedCard: null,
    selectedCardsForScout: [],
    spentMoney: 0,
    selectedLink: null,
    secondLinkAllowed: true
  };

  it('should start in selectingCard state', () => {
    const actor = createActor(loanMachine, { input: mockGameState });
    actor.start();
    expect(actor.getSnapshot().value).toBe('selectingCard');
  });

  it('should select a card and move to confirmingLoan state', () => {
    const actor = createActor(loanMachine, { input: mockGameState });
    actor.start();

    actor.send({ type: 'SELECT_CARD', cardId: 'card1' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('confirmingLoan');
    expect(snapshot.context.selectedCard).toEqual(mockLocationCard);
  });

  it('should cancel card selection and clear selectedCard', () => {
    const actor = createActor(loanMachine, { input: mockGameState });
    actor.start();

    actor.send({ type: 'SELECT_CARD', cardId: 'card1' });
    actor.send({ type: 'CANCEL' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('selectingCard');
    expect(snapshot.context.selectedCard).toBeNull();
  });

  it('should complete loan action when confirmed', () => {
    const actor = createActor(loanMachine, { input: mockGameState });
    actor.start();

    actor.send({ type: 'SELECT_CARD', cardId: 'card1' });
    actor.send({ type: 'CONFIRM' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('done');

    const updatedPlayer = snapshot.context.players[0];
    expect(updatedPlayer?.money).toBe(mockPlayer.money + 30); // +30 for loan
    expect(updatedPlayer?.income).toBe(mockPlayer.income - 3); // -3 income penalty
    expect(updatedPlayer?.hand).toHaveLength(mockPlayer.hand.length - 1); // Card discarded
    expect(snapshot.context.discardPile).toHaveLength(1); // Card moved to discard
    expect(snapshot.context.actionsRemaining).toBe(mockGameState.actionsRemaining - 1); // Action spent
  });

  it('should not allow confirming without selecting a card first', () => {
    const actor = createActor(loanMachine, { input: mockGameState });
    actor.start();

    actor.send({ type: 'CONFIRM' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('selectingCard');
  });

  it('should not reduce income below 0', () => {
    const lowIncomeState: GameState = {
      ...mockGameState,
      players: [{
        ...mockPlayer,
        income: 2 // Set income low enough that -3 would go below 0
      }]
    };

    const actor = createActor(loanMachine, { input: lowIncomeState });
    actor.start();

    actor.send({ type: 'SELECT_CARD', cardId: 'card1' });
    actor.send({ type: 'CONFIRM' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.players[0]?.income).toBe(0);
  });

  it('should add appropriate log entry', () => {
    const actor = createActor(loanMachine, { input: mockGameState });
    actor.start();

    actor.send({ type: 'SELECT_CARD', cardId: 'card1' });
    actor.send({ type: 'CONFIRM' });

    const snapshot = actor.getSnapshot();
    const lastLog = snapshot.context.logs[snapshot.context.logs.length - 1];
    if (!lastLog) throw new Error('Expected log entry to be created');

    expect(lastLog.message).toContain('took a loan');
    expect(lastLog.message).toContain(mockPlayer.name);
    expect(lastLog.type).toBe('action');
  });

  it('should output modified game state', () => {
    const actor = createActor(loanMachine, { input: mockGameState });
    actor.start();

    actor.send({ type: 'SELECT_CARD', cardId: 'card1' });
    actor.send({ type: 'CONFIRM' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.players[0]?.money).toBe(mockPlayer.money + 30);
    expect(snapshot.context.players[0]?.income).toBe(mockPlayer.income - 3);
    expect(snapshot.context.discardPile).toHaveLength(1);
    expect(snapshot.context.actionsRemaining).toBe(mockGameState.actionsRemaining - 1);
  });
});