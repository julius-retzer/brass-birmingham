import { setup, assign } from 'xstate';
import { type GameState, createLogEntry, getCurrentPlayer, findCardInHand, removeCardFromHand, updatePlayerInList } from './types';

export type LoanEvent =
  | { type: 'SELECT_CARD'; cardId: string }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

export const loanMachine = setup({
  types: {} as {
    context: GameState;
    events: LoanEvent;
    input: GameState;
  },
  guards: {
    hasSelectedCard: ({ context }) => context.selectedCard !== null
  }
}).createMachine({
  id: 'loan',
  initial: 'selectingCard',
  context: ({ input }) => input,
  output: ({ context }) => {
    console.log('🚀 loanMachine output', context);
    return context;
  },
  states: {
    selectingCard: {
      on: {
        SELECT_CARD: {
          target: 'confirmingLoan',
          actions: [
            assign({
              selectedCard: ({ context, event }) => {
                if (event.type !== 'SELECT_CARD') return null;
                const player = getCurrentPlayer(context);
                return findCardInHand(player, event.cardId);
              }
            })
          ]
        },
        CANCEL: {
          target: 'done',
          actions: [
            assign({
              selectedCard: null
            })
          ]
        }
      }
    },
    confirmingLoan: {
      on: {
        CONFIRM: {
          target: 'done',
          guard: 'hasSelectedCard',
          actions: [
            assign(({ context }) => {
              const currentPlayer = getCurrentPlayer(context);
              if (!context.selectedCard) {
                throw new Error('No card selected');
              }

              const updatedHand = removeCardFromHand(currentPlayer, context.selectedCard.id);

              return {
                players: updatePlayerInList(context.players, context.currentPlayerIndex, {
                  hand: updatedHand,
                  money: currentPlayer.money + 30,
                  income: Math.max(0, currentPlayer.income - 3)
                }),
                discardPile: [...context.discardPile, context.selectedCard],
                selectedCard: null,
                actionsRemaining: context.actionsRemaining - 1,
                logs: [
                  ...context.logs,
                  createLogEntry(
                    `${currentPlayer.name} took a loan (£30, -3 income)`,
                    'action'
                  )
                ]
              };
            })
          ]
        },
        CANCEL: {
          target: 'selectingCard',
          actions: [
            assign({
              selectedCard: null
            })
          ]
        }
      }
    },
    done: {
      entry: () => {
        console.log('🚀 loanMachine done');
      },
      type: 'final'
    }
  }
});