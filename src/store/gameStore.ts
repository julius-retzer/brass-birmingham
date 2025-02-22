import { setup, assign } from 'xstate';
import type { LogEntry } from '../components/GameLog';

// Basic types
export interface Player {
  id: string;
  name: string;
  money: number;
  victoryPoints: number;
  income: number;
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
}

// Setup the machine with proper typing
export const gameStore = setup({
  types: {} as {
    context: GameState;
    events: {
      type: 'START_GAME';
      players: Player[];
    } | {
      type: 'BUILD';
    } | {
      type: 'DEVELOP';
    } | {
      type: 'SELL';
    } | {
      type: 'TAKE_LOAN';
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
  },
  actions: {
    initializeGame: assign({
      players: ({ event }) => {
        if (event.type !== 'START_GAME') return [];
        return event.players;
      },
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
      }]
    }),
    decrementActions: assign({
      actionsRemaining: ({ context }) => context.actionsRemaining - 1
    }),
    nextPlayer: assign({
      currentPlayerIndex: ({ context }) =>
        (context.currentPlayerIndex + 1) % context.players.length,
      actionsRemaining: 2,
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
      logs: ({ context }) => [
        ...context.logs,
        {
          message: `Round ${context.round} ended. Starting round ${context.round + 1}`,
          type: 'system' as const,
          timestamp: new Date()
        }
      ]
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
    logs: []
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
      initial: 'playerTurn',
      states: {
        playerTurn: {
          on: {
            BUILD: {
              guard: 'canTakeAction',
              actions: ['decrementActions', 'logAction']
            },
            DEVELOP: {
              guard: 'canTakeAction',
              actions: ['decrementActions', 'logAction']
            },
            SELL: {
              guard: 'canTakeAction',
              actions: ['decrementActions', 'logAction']
            },
            TAKE_LOAN: {
              guard: 'canTakeAction',
              actions: ['decrementActions', 'logAction']
            },
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
      }
    },
    gameOver: {
      type: 'final'
    }
  }
});