import { setup, assign } from 'xstate';
import type { LogEntry } from '../components/GameLog';
import { type CityId } from '../data/board';
import { type Card, type IndustryType, type CardType, type LocationColor, type BaseCard, type LocationCard, type IndustryCard, type WildLocationCard, type WildIndustryCard, getInitialCards, type CardDecks } from '../data/cards';
import { on } from 'events';
import { timestamp } from 'drizzle-orm/mysql-core';

// Remove all card type definitions since they are now imported from cards.ts

export interface Player {
  id: string;
  name: string;
  money: number;
  victoryPoints: number;
  income: number;
  hand: Card[];
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  era: 'canal' | 'rail';
  round: number;
  actionsRemaining: number;
  resources: {
    coal: number;
    iron: number;
    beer: number;
  };
  logs: LogEntry[];
  // Card-related state
  drawPile: Card[];
  discardPile: Card[];
  wildLocationPile: WildLocationCard[];
  wildIndustryPile: WildIndustryCard[];
  selectedCard: Card | null;
  selectedCardsForScout: Card[];
  spentMoney: number;
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    const next = shuffled[j];
    if (temp !== undefined && next !== undefined) {
      shuffled[i] = next;
      shuffled[j] = temp;
    }
  }
  return shuffled;
}

// Setup the machine with proper typing
export const gameStore = setup({
  types: {} as {
    context: GameState;
    events: {
      type: 'START_GAME';
      players: Omit<Player, 'hand'>[];
    } | {
      type: 'BUILD';
    } | {
      type: 'DEVELOP';
    } | {
      type: 'SELL';
    } | {
      type: 'TAKE_LOAN';
    } | {
      type: 'SCOUT';
    } | {
      type: 'SELECT_CARD';
      cardId: string;
    } | {
      type: 'CONFIRM_ACTION';
    } | {
      type: 'CANCEL_ACTION';
    } | {
      type: 'END_TURN';
    };
  },
  guards: {
    canTakeAction: ({ context }) => context.actionsRemaining > 0,
    isGameOver: ({ context }) =>
      context.era === 'rail' && context.round >= 8,
    isRoundOver: ({ context }) =>
      context.currentPlayerIndex === context.players.length - 1,
    hasSelectedCard: ({ context }) => context.selectedCard !== null,
    canScout: ({ context }) => {
      return context.selectedCardsForScout.length === 2;
    },
    isFirstRound: ({ context }) =>
      context.era === 'canal' && context.round === 1,
  },
  actions: {
    initializeGame: assign(({ event }) => {
      if (event.type !== 'START_GAME') return {};

      // Initialize card piles based on player count
      const playerCount = event.players.length;
      const { regularCards, wildLocationCards, wildIndustryCards } = getInitialCards(playerCount);
      const shuffledCards = shuffleArray(regularCards);
      const hands: Card[][] = [];
      let currentIndex = 0;

      // Deal 8 cards to each player
      for (let i = 0; i < playerCount; i++) {
        hands.push(shuffledCards.slice(currentIndex, currentIndex + 8));
        currentIndex += 8;
      }

      // Initialize players with their hands
      const players = event.players.map((player, index) => ({
        ...player,
        hand: hands[index] ?? [],
      }));

      return {
        players,
        currentPlayerIndex: 0,
        era: 'canal' as const,
        round: 1,
        actionsRemaining: 1, // First round of Canal Era only gets 1 action
        resources: {
          coal: 24,
          iron: 24,
          beer: 24,
        },
        logs: [{
          message: 'Game started',
          type: 'system' as const,
          timestamp: new Date()
        }],
        drawPile: shuffledCards.slice(currentIndex),
        discardPile: [],
        wildLocationPile: wildLocationCards,
        wildIndustryPile: wildIndustryCards,
        selectedCard: null,
        selectedCardsForScout: [],
        spentMoney: 0,
      };
    }),
    selectCard: assign({
      selectedCard: ({ context, event }) => {
        if (event.type !== 'SELECT_CARD') return null;
        const player = context.players[context.currentPlayerIndex];
        if (!player) return null;
        return player.hand.find(card => card.id === event.cardId) ?? null;
      }
    }),
    selectScoutCard: assign({
      selectedCardsForScout: ({ context, event }) => {
        if (event.type !== 'SELECT_CARD') return context.selectedCardsForScout;
        const player = context.players[context.currentPlayerIndex];
        if (!player) return context.selectedCardsForScout;

        const card = player.hand.find(c => c.id === event.cardId);
        if (!card) return context.selectedCardsForScout;

        if (context.selectedCardsForScout.length < 2) {
          return [...context.selectedCardsForScout, card];
        }
        return context.selectedCardsForScout;
      }
    }),
    clearSelectedCards: assign({
      selectedCard: null,
      selectedCardsForScout: []
    }),
    discardSelectedCard: assign({
      players: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer || !context.selectedCard) return context.players;

        const updatedHand = currentPlayer.hand.filter(
          card => card.id !== context.selectedCard?.id
        );

        return context.players.map((player, index) =>
          index === context.currentPlayerIndex
            ? { ...player, hand: updatedHand }
            : player
        );
      },
      discardPile: ({ context }) => {
        if (!context.selectedCard) return context.discardPile;
        return [...context.discardPile, context.selectedCard];
      },
      logs: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer || !context.selectedCard) return context.logs;

        let message = '';
        switch (context.selectedCard.type) {
          case 'location':
            message = `${currentPlayer.name} discarded ${context.selectedCard.location} (${context.selectedCard.color})`;
            break;
          case 'industry':
            message = `${currentPlayer.name} discarded ${context.selectedCard.industries.join('/')} industry card`;
            break;
          case 'wild_location':
            message = `${currentPlayer.name} discarded wild location card`;
            break;
          case 'wild_industry':
            message = `${currentPlayer.name} discarded wild industry card`;
            break;
        }

        return [
          ...context.logs,
          {
            message,
            type: 'action' as const,
            timestamp: new Date()
          }
        ];
      }
    }),
    discardScoutCards: assign({
      players: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.players;

        const updatedHand = currentPlayer.hand.filter(
          card => !context.selectedCardsForScout.some(sc => sc.id === card.id)
        );

        return context.players.map((player, index) =>
          index === context.currentPlayerIndex
            ? { ...player, hand: updatedHand }
            : player
        );
      },
      discardPile: ({ context }) => {
        return [...context.discardPile, ...context.selectedCardsForScout];
      },
      logs: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.logs;

        const cardDescriptions = context.selectedCardsForScout.map(card => {
          switch (card.type) {
            case 'location':
              return `${card.location} (${card.color})`;
            case 'industry':
              return `${card.industries.join('/')} industry`;
            case 'wild_location':
              return 'wild location';
            case 'wild_industry':
              return 'wild industry';
          }
        });

        return [
          ...context.logs,
          {
            message: `${currentPlayer.name} scouted by discarding ${cardDescriptions.join(' and ')}`,
            type: 'action' as const,
            timestamp: new Date()
          }
        ];
      }
    }),
    drawWildCards: assign({
      players: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.players;

        const wildLocation = context.wildLocationPile[0];
        const wildIndustry = context.wildIndustryPile[0];

        if (!wildLocation || !wildIndustry) return context.players;

        const updatedHand = [...currentPlayer.hand, wildLocation, wildIndustry];
        return context.players.map((player, index) =>
          index === context.currentPlayerIndex
            ? { ...player, hand: updatedHand }
            : player
        );
      },
      wildLocationPile: ({ context }) => context.wildLocationPile.slice(1),
      wildIndustryPile: ({ context }) => context.wildIndustryPile.slice(1),
      logs: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.logs;

        return [
          ...context.logs,
          {
            message: `${currentPlayer.name} drew wild location and wild industry cards`,
            type: 'action' as const,
            timestamp: new Date()
          }
        ];
      }
    }),
    takeLoan: assign({
      players: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.players;

        return context.players.map((player, index) =>
          index === context.currentPlayerIndex
            ? {
                ...player,
                money: player.money + 30,
                income: Math.max(0, player.income - 3)
              }
            : player
        );
      },
      logs: ({ context }) => {
        console.log(context);
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer || !context.selectedCard) return context.logs;

        let cardDesc = '';
        switch (context.selectedCard.type) {
          case 'location':
            cardDesc = `${context.selectedCard.location} (${context.selectedCard.color})`;
            break;
          case 'industry':
            cardDesc = `${context.selectedCard.industries.join('/')} industry`;
            break;
          case 'wild_location':
            cardDesc = 'wild location';
            break;
          case 'wild_industry':
            cardDesc = 'wild industry';
            break;
        }

        return [
          ...context.logs,
          {
            message: `${currentPlayer.name} took a loan (£30, -3 income) using ${cardDesc}`,
            type: 'action' as const,
            timestamp: new Date()
          }
        ];
      }
    }),
    decrementActions: assign({
      actionsRemaining: ({ context }) => context.actionsRemaining - 1
    }),
    refillHand: assign({
      players: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.players;

        const cardsNeeded = 8 - currentPlayer.hand.length;
        if (cardsNeeded <= 0) return context.players;

        const newCards = context.drawPile.slice(0, cardsNeeded);
        const updatedHand = [...currentPlayer.hand, ...newCards];

        return context.players.map((player, index) =>
          index === context.currentPlayerIndex
            ? { ...player, hand: updatedHand }
            : player
        );
      },
      drawPile: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.drawPile;

        const cardsNeeded = 8 - currentPlayer.hand.length;
        return context.drawPile.slice(cardsNeeded);
      }
    }),
    nextPlayer: assign({
      currentPlayerIndex: ({ context }) =>
        (context.currentPlayerIndex + 1) % context.players.length,
      actionsRemaining: ({ context }) =>
        context.era === 'canal' && context.round === 1 ? 1 : 2,
      selectedCard: null,
      selectedCardsForScout: [],
      spentMoney: 0,
      logs: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.logs;

        return [
          ...context.logs,
          {
            message: `${currentPlayer.name}'s turn ended`,
            type: 'system' as const,
            timestamp: new Date()
          }
        ];
      }
    }),
    nextRound: assign({
      round: ({ context }) => context.round + 1,
      currentPlayerIndex: 0,
      actionsRemaining: 2,
      selectedCard: null,
      selectedCardsForScout: [],
      spentMoney: 0,
      logs: ({ context }) => [
        ...context.logs,
        {
          message: `Round ${context.round} ended. Starting round ${context.round + 1}`,
          type: 'system' as const,
          timestamp: new Date()
        }
      ]
    })
  }
}).createMachine({
  id: 'brassGame',
  context: {
    players: [],
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 1,
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
    spentMoney: 0
  },
  initial: 'setup',
  states: {
    setup: {
      on: {
        START_GAME: {
          target: 'playing',
          actions: ['initializeGame'],
          guard: ({ event }) =>
            event.players.length >= 2 && event.players.length <= 4
        }
      }
    },
    playing: {
      initial: 'selectingAction',
      states: {
        selectingAction: {
          on: {
            BUILD: {
              target: 'building',
              guard: 'canTakeAction'
            },
            DEVELOP: {
              target: 'developing',
              guard: 'canTakeAction'
            },
            SELL: {
              target: 'selling',
              guard: 'canTakeAction'
            },
            TAKE_LOAN: {
              target: 'takingLoan',
              guard: 'canTakeAction'
            },
            SCOUT: {
              target: 'scouting',
              guard: 'canTakeAction'
            },
            END_TURN: {
              target: 'checkingGameState',
              actions: ['refillHand']
            }
          }
        },
        building: {
          on: {
            SELECT_CARD: {
              actions: ['selectCard']
            },
            CONFIRM_ACTION: {
              target: 'selectingAction',
              guard: 'hasSelectedCard',
              exit: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
            },
            CANCEL_ACTION: {
              target: 'selectingAction',
              actions: ['clearSelectedCards']
            }
          }
        },
        developing: {
          on: {
            SELECT_CARD: {
              actions: ['selectCard']
            },
            CONFIRM_ACTION: {
              target: 'selectingAction',
              guard: 'hasSelectedCard',
              exit: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
            },
            CANCEL_ACTION: {
              target: 'selectingAction',
              actions: ['clearSelectedCards']
            }
          }
        },
        selling: {
          on: {
            SELECT_CARD: {
              actions: ['selectCard']
            },
            CONFIRM_ACTION: {
              target: 'selectingAction',
              guard: 'hasSelectedCard',
              exit: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
            },
            CANCEL_ACTION: {
              target: 'selectingAction',
              actions: ['clearSelectedCards']
            }
          }
        },
        takingLoan: {
          on: {
            SELECT_CARD: {
              actions: ['selectCard']
            },
            CONFIRM_ACTION: {
              target: 'selectingAction',
              guard: 'hasSelectedCard',
              actions: ['takeLoan'],
              exit: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
            },
            CANCEL_ACTION: {
              target: 'selectingAction',
              actions: ['clearSelectedCards']
            }
          }
        },
        scouting: {
          on: {
            SELECT_CARD: {
              actions: ['selectScoutCard']
            },
            CONFIRM_ACTION: {
              target: 'selectingAction',
              guard: 'canScout',
              exit: ['discardScoutCards', 'drawWildCards', 'decrementActions', 'clearSelectedCards']
            },
            CANCEL_ACTION: {
              target: 'selectingAction',
              actions: ['clearSelectedCards']
            }
          }
        },
        checkingGameState: {
          always: [
            {
              guard: 'isGameOver',
              target: '#brassGame.gameOver',
              actions: assign({
                logs: ({ context }) => [
                  ...context.logs,
                  {
                    message: 'Game Over!',
                    type: 'system' as const,
                    timestamp: new Date()
                  }
                ]
              })
            },
            {
              guard: 'isRoundOver',
              target: 'selectingAction',
              actions: ['nextRound']
            },
            {
              target: 'selectingAction',
              actions: ['nextPlayer']
            }
          ]
        }
      }
    },
    gameOver: {
      type: 'final'
    }
  }
});