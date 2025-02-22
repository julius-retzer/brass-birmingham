import { setup, assign } from 'xstate';
import type { LogEntry } from '../components/GameLog';
import { type CityId } from '../data/board';
import { on } from 'events';

// Card Types
export type IndustryType = 'cotton' | 'coal' | 'iron' | 'manufacturer' | 'pottery' | 'brewery';
export type CardType = 'location' | 'industry' | 'wild_location' | 'wild_industry';
export type LocationColor = 'blue' | 'teal' | 'other';

export interface BaseCard {
  id: string;
  type: CardType;
  playerCount: 2 | 3 | 4;
}

export interface LocationCard extends BaseCard {
  type: 'location';
  location: CityId;
  color: LocationColor;
}

export interface IndustryCard extends BaseCard {
  type: 'industry';
  industries: IndustryType[];
}

export interface WildLocationCard extends BaseCard {
  type: 'wild_location';
}

export interface WildIndustryCard extends BaseCard {
  type: 'wild_industry';
}

export type Card = LocationCard | IndustryCard | WildLocationCard | WildIndustryCard;

// Basic types
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
  wildLocationPile: Card[];
  wildIndustryPile: Card[];
  selectedCard: Card | null;
  currentAction: 'BUILD' | 'DEVELOP' | 'SELL' | 'TAKE_LOAN' | 'SCOUT' | null;
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
      type: 'SELECT_ACTION';
      action: 'BUILD' | 'DEVELOP' | 'SELL' | 'TAKE_LOAN' | 'SCOUT';
    } | {
      type: 'BUILD';
      cardId: string;
      location: CityId;
    } | {
      type: 'DEVELOP';
      cardId: string;
    } | {
      type: 'SELL';
      cardId: string;
    } | {
      type: 'TAKE_LOAN';
    } | {
      type: 'SCOUT';
      cardIds: [string, string]; // Two cards to discard
    } | {
      type: 'SELECT_CARD';
      cardId: string;
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
    canScoutAction: ({ context, event }) => {
      if (event.type !== 'SCOUT') return false;
      if (context.actionsRemaining <= 0) return false;

      const player = context.players[context.currentPlayerIndex];
      if (!player) return false;

      const cardsExist = event.cardIds.every(id =>
        player.hand.some(card => card.id === id)
      );
      const noWildCards = player.hand.every(card =>
        card.type !== 'wild_location' && card.type !== 'wild_industry'
      );
      return cardsExist && noWildCards;
    },
  },
  actions: {
    initializeGame: assign(({ event }) => {
      if (event.type !== 'START_GAME') return {};

      // Initialize card piles based on player count
      const playerCount = event.players.length;
      const allCards = getInitialCards(playerCount);
      const regularCards = allCards.filter(card =>
        card.type !== 'wild_location' && card.type !== 'wild_industry'
      );
      const wildCards = allCards.filter(card =>
        card.type === 'wild_location' || card.type === 'wild_industry'
      );

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
        actionsRemaining: 2,
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
        wildLocationPile: wildCards.filter(card => card.type === 'wild_location'),
        wildIndustryPile: wildCards.filter(card => card.type === 'wild_industry'),
        selectedCard: null,
        currentAction: null,
      };
    }),
    selectAction: assign({
      currentAction: ({ event }) => {
        if (event.type !== 'SELECT_ACTION') return null;
        return event.action;
      }
    }),
    decrementActions: assign({
      actionsRemaining: ({ context }) => context.actionsRemaining - 1,
      selectedCard: null,
      currentAction: null,
    }),
    nextPlayer: assign({
      currentPlayerIndex: ({ context }) =>
        (context.currentPlayerIndex + 1) % context.players.length,
      actionsRemaining: 2,
      selectedCard: null,
      currentAction: null,
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
      currentAction: null,
      logs: ({ context }) => [
        ...context.logs,
        {
          message: `Round ${context.round} ended. Starting round ${context.round + 1}`,
          type: 'system' as const,
          timestamp: new Date()
        }
      ]
    }),
    selectCard: assign({
      selectedCard: ({ context, event }) => {
        if (event.type !== 'SELECT_CARD') return null;
        const player = context.players[context.currentPlayerIndex];
        if (!player) return null;
        return player.hand.find(card => card.id === event.cardId) ?? null;
      }
    }),
    discardCard: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SCOUT') return context.players;
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.players;
        const updatedHand = currentPlayer.hand.filter(
          card => !event.cardIds.includes(card.id)
        );
        return context.players.map((player, index) =>
          index === context.currentPlayerIndex
            ? { ...player, hand: updatedHand }
            : player
        );
      },
      discardPile: ({ context, event }) => {
        if (event.type !== 'SCOUT') return context.discardPile;
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.discardPile;
        const cardsToDiscard = currentPlayer.hand.filter(
          card => event.cardIds.includes(card.id)
        );
        return [...context.discardPile, ...cardsToDiscard];
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
    }),
    logAction: assign({
      logs: ({ context, event }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer) return context.logs;

        return [
          ...context.logs,
          {
            message: `${currentPlayer.name} performed ${event.type}`,
            type: 'action' as const,
            timestamp: new Date()
          }
        ];
      }
    })
  }
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCMBOBDWsDi6C2YAdLGAC4CuADgMQDKAKgIIBK9A+towLICiA2gAYAuolCUA9rACWpKeIB2okAA9EARgDMAdkIaATAA41agwBYAbBtNbzAgKwAaEAE91AjQE5Ce0-YMCDQI0DDXMAXzCnNEwcfCJKABt0Zyl5KEJE5LBUenJUeWoAIQBVAEkAGQARQREkEAlpWQUlVQQDPTtdQ2Mzc3NTK3MnVwQtAy9TMw07Uw9DOxmIqIwsXAIMpJS0jaycvILKngA1HnKAeQAFGqUGmTlFOtajPUIDOzUF9q0Bu09hxD6OgEY2MAxCwT0eiWIGiqziOy26UyzmyuXydFO5WudVuTQeoCeei8dhBAgEmlCvy0-wQM1MhHMWhMWmCELU7mhsNi62RqSRm1R+2oTAA0jw2OdGAA5bFiSR3ZqPRD+ekCDzaKyTPQCDoGGmmSHecx2Sz6dXuKaclbc+KbPkIwXo2gAYTOxXosvq8rxLWVah02lm4I0oQCepciB85kIHl+alMBoTanM7StMTWtuS9uRjoKtFOPGd7GdLGqwhu3vuvraM1e7xmHl8FnVGhpHzUhDJXbMehDdg8OrTcJ5du2Ob26J4UsqbHoxWYMvLOMrioJAJJDN85jUPg8Bm+jJpWhNunZsZZO9+kyHNoR9oAxgALMD3gDWGdopHQpDA1E9uKrJVaT0NtBkINR1SZRk1QgwwbwzO9tifF93ziT9v1-Pg1FqOVGkAtdaUCQgQUhLQbG1XwPBpfxoyMNVPFMEw9HMdV4PhXkkOfN8Py-H8-z0HCvTw1cVEQOwiJIvQyPMCi1WovcjSbRiAjsQwPAiSIQHkcQIDgJQuQzCthPxUSEAAWiGCNzN7GMPDs+yHLsgY2PWEgKEoIyFRM1oDTbAQZMICwmWsPc9H9MiXMzRFPJ9ICwI8FMWWBQJvhsGlLEIOwuwEA1jEZWNTEixD+V2NETIAkSniZcCmQMWwEoTSZLJGDxk1eAd+xmFktGYtQio49JkO4tDeLAGL8NMhiY0SjRkv3axmsQVqNF0DqCu63qiqgOIzgAN2ycbKsjZjXh3axtEZZM+lA40Y21KTrDGCENLCIA */
  id: 'brassGame',
  context: {
    players: [],
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
    currentAction: null,
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
      initial: 'actionSelection',
      states: {
        actionSelection: {
          on: {
            SELECT_ACTION: {
              target: 'build',
                  guard: 'isBuildAction'
                },
                DEVELOP: {
                  target: 'develop',
                  guard: 'isDevelopAction'
                },
                SELL: {
                  target: 'sell',
                  guard: 'isSellAction'
                },
                TAKE_LOAN: {
                  target: 'takeLoan',
                  guard: 'isTakeLoanAction'
                },
                SCOUT: {
                  target: 'scout',
                  guard: 'isScoutAction'
                }
          }
        },
        build: {
          on: {
            SELECT_CARD: {
              target: 'playerTurn',
              actions: ['selectCard', 'decrementActions', 'logAction']
            }
          }
        },
        develop: {
          on: {
            SELECT_CARD: {
              target: 'playerTurn',
              actions: ['selectCard', 'decrementActions', 'logAction']
            }
          }
        },
        sell: {
          on: {
            SELECT_CARD: {
              target: 'playerTurn',
              actions: ['selectCard', 'decrementActions', 'logAction']
            }
          }
        },
        takeLoan: {
          on: {
            END_TURN: {
              target: 'checkGameState',
              actions: ['decrementActions', 'logAction']
            }
          }
        },
        scout: {
          on: {
            SCOUT: {
              target: 'playerTurn',
              actions: ['discardCard', 'drawWildCards', 'decrementActions', 'logAction']
            }
          }
        },
        playerTurn: {
          on: {
            END_TURN: {
              target: 'checkGameState'
            }
          }
        },
        checkGameState: {
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
              target: 'playerTurn',
              actions: ['nextRound']
            },
            {
              target: 'playerTurn',
              actions: ['nextPlayer']
            }
          ]
        }
      },
    },
    gameOver: {
      type: 'final'
    }
  }
});

// Helper function to get initial cards (implementation needed)
function getInitialCards(playerCount: number): Card[] {
  // Wild cards (always included)
  const wildCards: Card[] = [
    {
      id: 'wild_location_1',
      type: 'wild_location',
      playerCount: 2,
    },
    {
      id: 'wild_location_2',
      type: 'wild_location',
      playerCount: 2,
    },
    {
      id: 'wild_industry_1',
      type: 'wild_industry',
      playerCount: 2,
    },
    {
      id: 'wild_industry_2',
      type: 'wild_industry',
      playerCount: 2,
    },
  ];

  // Location cards
  const locationCards: LocationCard[] = [
    // Base locations (2+ players)
    {
      id: 'birmingham_1',
      type: 'location',
      location: 'birmingham',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'dudley_1',
      type: 'location',
      location: 'dudley',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'walsall_1',
      type: 'location',
      location: 'walsall',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'wolverhampton_1',
      type: 'location',
      location: 'wolverhampton',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'coventry_1',
      type: 'location',
      location: 'coventry',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'redditch_1',
      type: 'location',
      location: 'redditch',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'worcester_1',
      type: 'location',
      location: 'worcester',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'kidderminster_1',
      type: 'location',
      location: 'kidderminster',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'cannock_1',
      type: 'location',
      location: 'cannock',
      color: 'other',
      playerCount: 2,
    },
    {
      id: 'tamworth_1',
      type: 'location',
      location: 'tamworth',
      color: 'other',
      playerCount: 2,
    },

    // Teal locations (3+ players)
    {
      id: 'coventry_teal',
      type: 'location',
      location: 'coventry',
      color: 'teal',
      playerCount: 3,
    },
    {
      id: 'wolverhampton_teal',
      type: 'location',
      location: 'wolverhampton',
      color: 'teal',
      playerCount: 3,
    },
    {
      id: 'walsall_teal',
      type: 'location',
      location: 'walsall',
      color: 'teal',
      playerCount: 3,
    },
    {
      id: 'tamworth_teal',
      type: 'location',
      location: 'tamworth',
      color: 'teal',
      playerCount: 3,
    },

    // Blue locations (4 players only)
    {
      id: 'birmingham_blue',
      type: 'location',
      location: 'birmingham',
      color: 'blue',
      playerCount: 4,
    },
    {
      id: 'dudley_blue',
      type: 'location',
      location: 'dudley',
      color: 'blue',
      playerCount: 4,
    },
    {
      id: 'walsall_blue',
      type: 'location',
      location: 'walsall',
      color: 'blue',
      playerCount: 4,
    },
    {
      id: 'wolverhampton_blue',
      type: 'location',
      location: 'wolverhampton',
      color: 'blue',
      playerCount: 4,
    },
  ];

  // Industry cards
  const industryCards: IndustryCard[] = [
    // Cotton Mills
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `cotton_${i + 1}`,
      type: 'industry' as const,
      industries: ['cotton' as const],
      playerCount: 2 as const,
    })),
    // Coal Mines
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `coal_${i + 1}`,
      type: 'industry' as const,
      industries: ['coal' as const],
      playerCount: 2 as const,
    })),
    // Iron Works
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `iron_${i + 1}`,
      type: 'industry' as const,
      industries: ['iron' as const],
      playerCount: 2 as const,
    })),
    // Manufacturers
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `manufacturer_${i + 1}`,
      type: 'industry' as const,
      industries: ['manufacturer' as const],
      playerCount: 2 as const,
    })),
    // Potteries
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `pottery_${i + 1}`,
      type: 'industry' as const,
      industries: ['pottery' as const],
      playerCount: 2 as const,
    })),
    // Breweries
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `brewery_${i + 1}`,
      type: 'industry' as const,
      industries: ['brewery' as const],
      playerCount: 2 as const,
    })),
    // Dual Industry Cards
    {
      id: 'coal_iron_1',
      type: 'industry',
      industries: ['coal', 'iron'] as const,
      playerCount: 2,
    },
    {
      id: 'coal_iron_2',
      type: 'industry',
      industries: ['coal', 'iron'] as const,
      playerCount: 2,
    },
    {
      id: 'pottery_manufacturer_1',
      type: 'industry',
      industries: ['pottery', 'manufacturer'] as const,
      playerCount: 2,
    },
    {
      id: 'pottery_manufacturer_2',
      type: 'industry',
      industries: ['pottery', 'manufacturer'] as const,
      playerCount: 2,
    },
  ];

  // Filter cards based on player count
  return [
    ...wildCards,
    ...locationCards.filter(card => card.playerCount <= playerCount),
    ...industryCards.filter(card => card.playerCount <= playerCount),
  ];
}