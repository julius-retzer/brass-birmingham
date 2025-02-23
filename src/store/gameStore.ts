import { setup, assign, createMachine, Action } from 'xstate';
import { type CityId } from '../data/board';
import { type Card, type IndustryType, type CardType, type LocationColor, type BaseCard, type LocationCard, type IndustryCard, type WildLocationCard, type WildIndustryCard, getInitialCards, type CardDecks } from '../data/cards';


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

const DEBUG = true;

function debugLog(actionName: string, { context, event }: { context: GameState; event: { type: string } & Record<string, unknown> }) {
  if (DEBUG) {
    const state = {
      currentPlayerIndex: context.currentPlayerIndex,
      actionsRemaining: context.actionsRemaining,
      round: context.round,
      era: context.era,
      selectedCard: context.selectedCard,
    };

    console.log(`Action: 🔴 ${actionName}]`, {
      state,
      event
    });
  }
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
      type: 'CONFIRM';
    } | {
      type: 'CANCEL';
    } | {
      type: 'END_TURN';
    };
  },
  guards: {
    hasActionsRemaining: ({ context }) => context.actionsRemaining > 0,
    isGameOver: ({ context }) =>
      context.era === 'rail' && context.round >= 8,
    isRoundOver: ({ context }) =>
      context.currentPlayerIndex === context.players.length - 1 && context.actionsRemaining === 0,
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
    initializeGame: assign(({ event, context }) => {
      if (event.type !== 'START_GAME') return {};
      debugLog('initializeGame', { context, event });

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
        debugLog('selectCard', { context, event });
        if (event.type !== 'SELECT_CARD') return null;
        const player = context.players[context.currentPlayerIndex];
        if (!player) return null;
        return player.hand.find(card => card.id === event.cardId) ?? null;
      }
    }),
    selectScoutCard: assign({
      selectedCardsForScout: ({ context, event }) => {
        debugLog('selectScoutCard', { context, event });
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
      players: ({ context, event }) => {
        debugLog('discardSelectedCard', { context, event });
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
      players: ({ context, event }) => {
        debugLog('discardScoutCards', { context, event });
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
      players: ({ context, event }) => {
        debugLog('drawWildCards', { context, event });
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
      players: ({ context, event }) => {
        debugLog('takeLoan', { context, event });
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
      actionsRemaining: ({ context, event }) => {
        debugLog('decrementActions', { context, event });
        return context.actionsRemaining - 1;
      }
    }),
    refillHand: assign({
      players: ({ context, event }) => {
        debugLog('refillHand', { context, event });
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
    nextPlayer: assign(({ context }) => {
      const nextPlayerIndex = (context.currentPlayerIndex + 1) % context.players.length;
      const isRoundOver = nextPlayerIndex === 0;
      const nextRound = isRoundOver ? context.round + 1 : context.round;
      const isFirstRound = context.era === 'canal' && nextRound === 1;

      return {
        currentPlayerIndex: nextPlayerIndex,
        actionsRemaining: isFirstRound ? 1 : 2, // 1 action for first round, 2 for all others
        round: nextRound,
        selectedCard: null,
        selectedCardsForScout: [],
        spentMoney: 0
      };
    }),
    nextRound: assign({
      round: ({ context, event }) => {
        debugLog('nextRound', { context, event });
        return context.round + 1;
      },
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
      selectedLink: ({ event, context }) => {
        debugLog('selectLink', { context, event });
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
      spentMoney: ({ context, event }) => {
        debugLog('buildLink', { context, event });
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
    }),
  }
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCMBOBDWsDi6C2YAdLGAC4CuADgMQDKAKgIIBK9A+towLICiA2gAYAuolCUA9rACWpKeIB2okAA9EAJgAsARkIAOLWoCsAgOwDdATgtaAbKYA0IAJ6ItbwgLUBmDfuNfrOy8AX2DHNEwcfCJKABt0Jyl5KGJSdFRZZPpyVHlqQREkEAlpWQUlVQQTNUcXBC8TLUMPG0MTdtaBK10NUPCMLFwCQjiEpJTYNIzx7Nz8rUKxSRk5RSLK22tCIwEutRsLAQ0LNRrnRC8m3UJDS00BL1MTLxs+kAjB6JH4xOTU9MyUFmeT4akWxWWZTWoA2Bx0Oz2ByOJzOdUeWgshBsXkMFjMJkOVkMbw+UWGo1+EzAsTAAGNAYx6atqAAhACqAEkADIAEQKShKK3K61cBJshEO2I0Zlujy8Xlq6hMNhMhC0OIs2N0BLUGNeYXeAzJMR+42I1LpDKZCmoPJ4ADUeFyAPIABX5RUFUIqosaEsMXnuhi0vl0nkVCDU1mu2NxNjD+zUumJBtJQxNYz+JBpTOSjKhdCdXI9S1Kqx9CC0YeaGgEsar2P2ul0EaaXjVwaCWgEWhM2t0IVTRvT30zVJzVoLTAA0jw2C7GAA5EsQsvCmGiwwaQgaBp2EzHZX6EwRqMHNUag613Q2XpDyIjilm7OW8b55m0ADCzrZ9BXXvLEVKz7VVdCTU5dR7aVNFPG9rnVOMbFvAJB36B8vifLMLVzKB3xtRceHoAB1Z1mGnf9IUAjdgNaFp9k8FVsVsGxYN7LFL0MfYmgPEwSWHDDTSwic32tPIeEXHk2HoNlmGXYQBUo9cVHUF41B3OsAlaEDA1bYMPF2I4o1xaUBADPj0PJQSUkoMBUAAM3EVA8BEqFCGQcgpFiCBn2wwFP3SCBCy5HhP3YT8WD5eTPUU6FlMrUxMTUB4MQPGw1DMCwFXOSNfDU3dwNuWtey0czPksscRlshynJc1Y3I8ryfOE5J-NQQLwsXT8nTYRhQo5Z05PBAClNhLYEROJFjlOU9TG3Tj1T7DQkWTO80LKjNKUq+zHOcvNRPqzzvL+WkFDsqQauSFkGvagaADEOWYLger6gaKLXWLRvhYxEUOKbUXUXsBB3A9jHVMMMQ0VbDQsjazRs7aLtw-b3MOs0TvkM7Eauw7qA6rquWe+h+sGhT3orbsCW2ZK8SW9KuiyupvBvYG8U8E5JTUUrjVHTb4eq3akdciAwAAN2pcRKCa18WoCoKQrCiK3qFD7XA0iVAwaYMcU2VttGaWxql7W943aEr73Wnm4aqnbaoUQhhbF2IJalnDWvapd8cJ4mle9IDNi+3YJt+lEI0aTFqjxKMjmeECucfKytv5235Ht0Xxcl47TvOgWeTTp2aG-Rd7ser3Xqi0tlfJuFtm+oPkWm7KwfbdVTDaHt9CQqG0wEiq+Ztvahbz53M4x7Pxlzx2Jdxj3ut6omy6GmLybVzLvBMLXOwsVtLkSkMumlHEjzjnveetxG8JT7NYhdvzZdoJ15bYcLmEixeyb98xmgPXw7CMYxrBPNlOwmIcTSlrASXYSUzZrW5phayZ8BYX3NLEa+QlpZQDdtPTqs8Xok2iu-ai-sa6B32MHBujMHhYk7EcXw2gNDpWPuVU+CNEH7SvmjLOiNaDUliLjO6D0npz29uXVclc-bV3GqQ+u-1IxWCxNHdKAROLBmVIw2Gfw+7nzYTwjho8uE8KwZ7IRC9SZiMIZ-Qg38byeEMP-XsEYtbqVsL2fs1hoHQwtnAxO-dBZ1TSAAa3GFycQ6BL6+XGJg++wVQpP0ViI4aKt4qUzFBYTiaUwKahYo3Hsal6J4hOFWSGN41GWw0Qg5OhAAlBJCWE5qGDZZ4xwfPPBFdfaEIkbXKRf0IxFJ3LebsJxfC3DaLxc2sCE6aNYa5KpyRgmhMIOjTGAs5l5ELsXQRuCfZUTikQyRk0Q7ZS3NubQ1RAxNE1BYXwJSvGTIqTMqAKyFmcOWTUwxTThFvzMTshKliLlpPApkiMgRCCPD7IYbEph5SpOuRM8pA86qwBOuQQEyD0Fu1gHLGJz9X6mLaTskMmIbxLROdqCwzYsl1FsElLESV5SXH6ZkmFvc4W+Ltoi8QyKb4RIChitZAjS4tNEXiz6xCfrSN0pcCUhwwbaiaEy5hSd4VsqRSil8rseVvIJsYwVCSq5jU6fs8hopTAgoYofXEVYAjyqtiwip8gyAAHdHKBLQeqtqmKFYvy2SNRAYYgY9nBfGHojQehb2ykldoHh9i3APG4A8+xrVlNtUqlO9rSBOtQC68caKGkzy1Zs+JS9xH6pIYamRVZKF-3XjeMwUZUIePGcy5NrLU2OudVy2ZSR-EevnByRc5FC0EPxccKhTEwzgK8D0GalM0kxu0L2eh+oYHxybYqlthA00ZqzainCXIu2aoFd6xJfqPBNCQs2aUhSw2UrJToSFxLvrYgaIm+BzakGbvbSPJZQT918pLtqo9eqA5iu6Y3SwiVzDNiuHvTmYyV0Kp8e+ttmbdHfs7fIbtjT83NMA37U41w+zqiMDYK4CZWxkvbG0Hwt5H3ylGcuk+ZoKC5B4PIQKuHqLeDSupbEmo2jah0tlQMAYsQGDMK0NKeIX2EFQBytjrH2ODq+RsKDNw0q5VsZcBoMjHi0VjJqNwDR5QhlCAaeQ4hhbwCKN3AguLtmVBgtlAAtJoEpJAKCUDsz6ysS0dw9EnRc9UxwKWuB8KK+hTY63uJs+oqAXnElDJ3AGEM6psQx0AXUbENwDK6mlHiHEDC4OMazFMQEwJ4vk2MGpAprMkJcevRcM9egAjeGlJYaoSFpNqsnNs3VQFdSXJuEtW98pdRGFbAebY+wginODZxaTtyU0VaAgGdsGhkvaBeEZ9oEZ5TXCKjN9mrQE1FaYTatdSCpAQBpMt8xWXtZakgVBDQp4SPXEncZbUwYkwLZZUglGjVki3bitYrEtYkJWB1GlGRpwyUSgJI0B4+HOy-bfcja6Hb6ltWB5UQ4MZwcHHyYmGHxxtyLQCGYG8yXUcXfR6jL9Y9LrXRx64RRHhhucSSvvZ4p5voeGVHWabq3TI08Q-tB26dxgs4QD0ZoLwyXSlaL2XULZG7eB0I0bQngDCpJGaLrRg9J4Z2zW6iA0vLDtnl8GpXhtVeUvoaqYM-ZmyryM-rqZdUJf51Q4zqAE907S4MG0SxyodcCfAbrQMehuzrchtUB48Z3cVPYUD-BynfUqjVGBUbptbzrZ6UYCUPY0qcWqGYOsSeU3INQSb2+2O0-CsQNYfW2fAy58hoYCMaUNeC8OJOgwLwl0Nvg+dsXrkU8pEWb77hKDA-pUxLcG8BLMqBjxF3-YUqCSyiQrYetMXSmvtp9M9AWaVnm5I9sHw9DgxFNJxGMC1wwx9jSz2HX0X+JnaTUfvxJ-qnzO69yvXq0vZk3l0JfpDEYCGLQpcq2J4NuCRkYIbBiKkt4JXuuvco8lPojGfg3iAZWGzreKYJCkhAGEtLAVGEXvQgVhNEYGgUguypyqnsAd5m4D2HoMbCSgSOShKs3LSrWLYlwdiHQWwiqpjuioHm2NHu0PoDQpDOGI3IbDcM8OtvuAGKZLoMIa5B+ihkwUKngbcDoOtpcJtmlg0Blq4BbkoT4CGpclQV3B-rFt4gbnVNodugATLEAXod5pJklsYalttuYZGOYCAoRg0JAqkhYJoS4chm4eEuhv4tLlYO2MmJct4MMlQTNINhDuOmSn2MmCmAxp-ofmPtEemp+pPs8j+hhoHtoI-kmClEooMjDl0KqJsP5kMtYJEado4cxvIAptLjsNuMruYAgQIcqK2LeGqPlM8GEfHgONJrJuQPJmxgMRDENgcPoKNkHrtj8u0CcMYPQgUnvg4YQFANEM6GLKgAMb5voDsJTlYLYA4EJkGmpm0FuCDL2CmKEEAA */
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
  on: {
    '*': {
      actions: [({ event }) => {
        throw new Error(`Invalid call of event ${event.type}`);
      }]
    }
  },
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
          always: [
            { guard: 'isGameOver', target: '#brassGame.gameOver' }
          ],
          on: {
            BUILD: { target: 'performingAction.building' },
            DEVELOP: { target: 'performingAction.developing' },
            SELL: { target: 'performingAction.selling' },
            TAKE_LOAN: { target: 'performingAction.takingLoan' },
            SCOUT: { target: 'performingAction.scouting' },
            NETWORK: { target: 'performingAction.networking' },
          }
        },
        performingAction: {
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
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingBuild: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      guard: 'hasSelectedCard',
                      actions: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL: {
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
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingDevelop: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      guard: 'hasSelectedCard',
                      actions: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL: {
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
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingSell: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      guard: 'hasSelectedCard',
                      actions: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL: {
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
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingLoan: {
                  on: {
                    CONFIRM: {
                      guard: 'hasSelectedCard',
                      target: '#brassGame.playing.actionComplete',
                      actions: ['takeLoan']
                    },
                    CANCEL: {
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
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      guard: 'canScout',
                      actions: ['discardScoutCards', 'drawWildCards', 'decrementActions', 'clearSelectedCards']
                    },
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
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
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
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
                    CANCEL: {
                      target: 'selectingCard',
                      actions: ['clearSelectedCards']
                    }
                  }
                },
                confirmingLink: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      guard: 'hasSelectedLink',
                      actions: ['buildLink', 'discardSelectedCard', 'decrementActions', 'clearSelectedLink']
                    },
                    CANCEL: {
                      target: 'selectingLink',
                      actions: ['clearSelectedLink']
                    }
                  }
                }
              }
            }
          }
        },
        actionComplete: {
          entry: ['discardSelectedCard', 'decrementActions', 'clearSelectedCards', 'refillHand'],
          always: [
            {
              guard: 'hasActionsRemaining',
              target: 'playerTurn'
            },
            {
              target: 'nextPlayer'
            }
          ]
        },
        nextPlayer: {
          entry: ['nextPlayer'],
          always: {
            target: 'playerTurn'
          }
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
