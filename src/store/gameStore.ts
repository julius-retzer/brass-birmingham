import { setup, assign } from 'xstate';
import { type CityId } from '../data/board';
import { type Card, type IndustryType, type CardType, type LocationColor, type BaseCard, type LocationCard, type IndustryCard, type WildLocationCard, type WildIndustryCard, getInitialCards, type CardDecks } from '../data/cards';
import { on } from 'events';
import { timestamp } from 'drizzle-orm/mysql-core';

export type LogEntryType = 'system' | 'action' | 'info' | 'error';

export interface LogEntry {
  message: string;
  type: LogEntryType;
  timestamp: Date;
}

export interface Player {
  id: string;
  name: string;
  color: 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';
  character: 'Richard Arkwright' | 'Eliza Tinsley' | 'Isambard Kingdom Brunel' | 'George Stephenson' | 'Robert Owen' | 'Henry Bessemer';
  money: number;
  victoryPoints: number;
  income: number;
  hand: Card[];
  // Built items
  links: {
    from: CityId;
    to: CityId;
    type: 'canal' | 'rail';
  }[];
  industries: {
    location: CityId;
    type: IndustryType;
    level: number;
    flipped: boolean;
  }[];
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
  // Network-related state
  selectedLink: {
    from: CityId;
    to: CityId;
  } | null;
  secondLinkAllowed: boolean;
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

function createLogEntry(message: string, type: LogEntryType): LogEntry {
  return {
    message,
    type,
    timestamp: new Date(),
  };
}

// Setup the machine with proper typing
export const gameStore = setup({
  types: {} as {
    context: GameState;
    events: {
      type: 'START_GAME';
      players: Array<Omit<Player, 'hand' | 'links' | 'industries'>>;
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
      type: 'NETWORK';
    } | {
      type: 'SELECT_LINK';
      from: CityId;
      to: CityId;
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
    hasSelectedLink: ({ context }) => context.selectedLink !== null,
    canBuildLink: ({ context, event }) => {
      if (event.type !== 'SELECT_LINK') return false;

      // Check if any player already has a link on this connection
      const existingLink = context.players.some(player =>
        player.links.some(link =>
          (link.from === event.from && link.to === event.to) ||
          (link.from === event.to && link.to === event.from)
        )
      );

      if (existingLink) {
        // Add an error message to the logs
        context.logs.push(createLogEntry(
          `Cannot build a link between ${event.from} and ${event.to} as a link already exists there`,
          'error'
        ));
        return false;
      }

      return true;
    }
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
        links: [],
        industries: [],
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
        logs: [createLogEntry('Game started', 'system')],
        drawPile: shuffledCards.slice(currentIndex),
        discardPile: [],
        wildLocationPile: wildLocationCards,
        wildIndustryPile: wildIndustryCards,
        selectedCard: null,
        selectedCardsForScout: [],
        spentMoney: 0,
        selectedLink: null,
        secondLinkAllowed: true,
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
          createLogEntry(message, 'action')
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
          createLogEntry(
            `${currentPlayer.name} scouted by discarding ${cardDescriptions.join(' and ')}`,
            'action'
          )
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
          createLogEntry(
            `${currentPlayer.name} drew wild location and wild industry cards`,
            'action'
          )
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
          createLogEntry(
            `${currentPlayer.name} took a loan (£30, -3 income) using ${cardDesc}`,
            'action'
          )
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
          createLogEntry(
            `${currentPlayer.name}'s turn ended`,
            'system'
          )
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
        createLogEntry(
          `Round ${context.round} ended. Starting round ${context.round + 1}`,
          'system'
        )
      ]
    }),
    selectLink: assign({
      selectedLink: ({ event }) => {
        if (event.type !== 'SELECT_LINK') return null;
        return {
          from: event.from,
          to: event.to
        };
      }
    }),
    clearSelectedLink: assign({
      selectedLink: null,
      secondLinkAllowed: true
    }),
    buildLink: assign({
      spentMoney: ({ context }) => {
        // Canal era: £3 per link
        // Rail era: £5 for first link, £15 for two links
        if (context.era === 'canal') {
          return context.spentMoney + 3;
        }
        return context.spentMoney + 5;
      },
      resources: ({ context }) => {
        // Only consume coal in rail era
        if (context.era === 'rail') {
          return {
            ...context.resources,
            coal: context.resources.coal - 1,
          };
        }
        return context.resources;
      },
      players: ({ context }) => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer || !context.selectedLink) return context.players;

        const selectedLink = context.selectedLink; // Capture in variable to satisfy TypeScript

        return context.players.map((player, index) =>
          index === context.currentPlayerIndex
            ? {
                ...player,
                money: player.money - (
                  context.era === 'canal'
                    ? 3 // Canal era: £3 per link
                    : 5 // Rail era: £5 for first link
                ),
                links: [
                  ...player.links,
                  {
                    from: selectedLink.from,
                    to: selectedLink.to,
                    type: context.era
                  }
                ]
              }
            : player
        );
      },
      logs: ({ context }): LogEntry[] => {
        const currentPlayer = context.players[context.currentPlayerIndex];
        if (!currentPlayer || !context.selectedLink) return context.logs;

        const selectedLink = context.selectedLink; // Capture in variable to satisfy TypeScript

        return [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} built a ${context.era} link between ${selectedLink.from} and ${selectedLink.to}`,
            'action'
          )
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
    spentMoney: 0,
    selectedLink: null,
    secondLinkAllowed: true,
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
      initial: 'turnStart',
      states: {
        turnStart: {
          always: [
            { guard: 'isGameOver', target: '#brassGame.gameOver' },
            { guard: 'isRoundOver', target: 'roundEnd' },
            { target: 'actionSelection' }
          ]
        },
        actionSelection: {
          on: {
            BUILD: {
              target: 'actions.building',
              guard: 'canTakeAction'
            },
            DEVELOP: {
              target: 'actions.developing',
              guard: 'canTakeAction'
            },
            SELL: {
              target: 'actions.selling',
              guard: 'canTakeAction'
            },
            TAKE_LOAN: {
              target: 'actions.takingLoan',
              guard: 'canTakeAction'
            },
            SCOUT: {
              target: 'actions.scouting',
              guard: 'canTakeAction'
            },
            NETWORK: {
              target: 'actions.networking',
              guard: 'canTakeAction'
            },
            END_TURN: {
              target: 'turnEnd',
              actions: ['refillHand']
            }
          }
        },
        actions: {
          initial: 'idle',
          states: {
            idle: {},
            building: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingBuild',
                      actions: ['selectCard']
                    },
                    CANCEL_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingBuild: {
                  on: {
                    CONFIRM_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      guard: 'hasSelectedCard',
                      actions: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL_ACTION: {
                      target: 'selectingCard',
                      actions: ['clearSelectedCards']
                    }
                  }
                }
              }
            },
            developing: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingDevelop',
                      actions: ['selectCard']
                    },
                    CANCEL_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingDevelop: {
                  on: {
                    CONFIRM_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      guard: 'hasSelectedCard',
                      actions: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL_ACTION: {
                      target: 'selectingCard',
                      actions: ['clearSelectedCards']
                    }
                  }
                }
              }
            },
            selling: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingSell',
                      actions: ['selectCard']
                    },
                    CANCEL_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingSell: {
                  on: {
                    CONFIRM_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      guard: 'hasSelectedCard',
                      actions: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL_ACTION: {
                      target: 'selectingCard',
                      actions: ['clearSelectedCards']
                    }
                  }
                }
              }
            },
            takingLoan: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingLoan',
                      actions: ['selectCard']
                    },
                    CANCEL_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingLoan: {
                  on: {
                    CONFIRM_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      guard: 'hasSelectedCard',
                      actions: ['takeLoan', 'discardSelectedCard', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL_ACTION: {
                      target: 'selectingCard',
                      actions: ['clearSelectedCards']
                    }
                  }
                }
              }
            },
            scouting: {
              initial: 'selectingCards',
              states: {
                selectingCards: {
                  on: {
                    SELECT_CARD: {
                      target: 'selectingCards',
                      actions: ['selectScoutCard']
                    },
                    CONFIRM_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      guard: 'canScout',
                      actions: ['discardScoutCards', 'drawWildCards', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      actions: ['clearSelectedCards']
                    }
                  }
                }
              }
            },
            networking: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'selectingLink',
                      actions: ['selectCard']
                    },
                    CANCEL_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                selectingLink: {
                  on: {
                    SELECT_LINK: {
                      target: 'confirmingLink',
                      actions: ['selectLink'],
                      guard: 'canBuildLink'
                    },
                    CANCEL_ACTION: {
                      target: 'selectingCard',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingLink: {
                  on: {
                    CONFIRM_ACTION: {
                      target: '#brassGame.playing.actionSelection',
                      guard: 'hasSelectedLink',
                      actions: ['buildLink', 'discardSelectedCard', 'decrementActions', 'clearSelectedLink']
                    },
                    CANCEL_ACTION: {
                      target: 'selectingLink',
                      actions: ['clearSelectedLink']
                    }
                  }
                }
              }
            }
          }
        },
        turnEnd: {
          entry: ['refillHand'],
          always: { target: 'turnStart', actions: ['nextPlayer'] }
        },
        roundEnd: {
          entry: assign({
            logs: ({ context }) => [
              ...context.logs,
              createLogEntry(
                `Round ${context.round} ended. Starting round ${context.round + 1}`,
                'system'
              )
            ]
          }),
          always: { target: 'turnStart', actions: ['nextRound'] }
        }
      }
    },
    gameOver: {
      entry: assign({
        logs: ({ context }) => [
          ...context.logs,
          createLogEntry('Game Over!', 'system')
        ]
      }),
      type: 'final'
    }
  }
});