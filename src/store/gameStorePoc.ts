import { setup, assign, sendTo } from 'xstate'

// Simplified player interface
export interface PlayerContext {
  id: string
  name: string
  money: number
  actionsRemaining: number
}

// Events that can happen in the game
type GameEvent =
  | {
      type: 'START_GAME'
      players: Array<{ id: string; name: string; money: number }>
    }
  | { type: 'TAKE_ACTION' }
  | { type: 'END_TURN' }

type PlayerEvent = { type: 'TAKE_ACTION' } | { type: 'END_TURN' }

// Create a player actor machine
const playerMachine = setup({
  types: {} as {
    context: PlayerContext
    events: PlayerEvent
  },
  actions: {
    decrementActions: assign(({ context }) => ({
      actionsRemaining: context.actionsRemaining - 1,
    })),
  },
  guards: {
    canTakeAction: ({ context }) => context.actionsRemaining > 0,
  },
}).createMachine({
  id: 'player',
  initial: 'idle',
  context: {
    id: '',
    name: '',
    money: 0,
    actionsRemaining: 2,
  },
  states: {
    idle: {
      on: {
        TAKE_ACTION: {
          target: 'acting',
          guard: 'canTakeAction',
        },
      },
    },
    acting: {
      entry: 'decrementActions',
      always: {
        target: 'idle',
      },
    },
  },
})

export interface GameState {
  players: ReturnType<
    typeof setup<{
      context: PlayerContext
      events: PlayerEvent
    }>
  >['createActor'][]
  currentPlayerIndex: number
  round: number
  logs: string[]
}

// Create the main game machine
export const gameStorePoc = setup({
  types: {} as {
    context: GameState
    events: GameEvent
  },
  actions: {
    nextPlayer: assign(({ context }) => ({
      currentPlayerIndex:
        (context.currentPlayerIndex + 1) % context.players.length,
      round:
        (context.currentPlayerIndex + 1) % context.players.length === 0
          ? context.round + 1
          : context.round,
    })),
  },
}).createMachine({
  id: 'game',
  context: {
    players: [],
    currentPlayerIndex: 0,
    round: 1,
    logs: [],
  },
  initial: 'setup',
  states: {
    setup: {
      on: {
        START_GAME: {
          target: 'playing',
          actions: [
            assign({
              players: ({ spawn, event }) =>
                event.players.map((player) =>
                  spawn(
                    playerMachine.provide({
                      input: {
                        id: player.id,
                        name: player.name,
                        money: player.money,
                      },
                    }),
                  ),
                ),
              logs: () => ['Game started'],
            }),
          ],
        },
      },
    },
    playing: {
      on: {
        TAKE_ACTION: {
          guard: ({ context }) => {
            const currentPlayer = context.players[context.currentPlayerIndex]
            return currentPlayer?.getSnapshot().context.actionsRemaining > 0
          },
          actions: [
            ({ context }) => {
              const currentPlayer = context.players[context.currentPlayerIndex]
              if (currentPlayer) {
                currentPlayer.send({ type: 'TAKE_ACTION' })
              }
            },
            assign({
              logs: ({ context }) => [
                ...context.logs,
                `Player ${context.currentPlayerIndex + 1} took an action`,
              ],
            }),
          ],
          target: 'checkTurn',
        },
        END_TURN: {
          target: 'checkTurn',
        },
      },
    },
    checkTurn: {
      always: [
        {
          guard: ({ context }) => context.round > 5,
          target: 'gameOver',
        },
        {
          actions: ['nextPlayer'],
          target: 'playing',
        },
      ],
    },
    gameOver: {
      type: 'final',
      entry: assign(({ context }) => ({
        logs: [...context.logs, 'Game Over!'],
      })),
    },
  },
})
