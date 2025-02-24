import {
  setup,
  assign,
  type ActorRefFrom,
  type AnyActorRef,
  sendTo,
  ActorRefFromLogic,
} from 'xstate'
import { Player } from './gameStore'

// Simplified player interface
export interface PlayerContext {
  name: string
  money: number
  actionsRemaining: number
}

// Simplified game state

// Events that can happen in the game
type GameEvent =
  | {
      type: 'START_GAME'
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
  context: {
    name: '',
    money: 0,
    actionsRemaining: 2,
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        TAKE_ACTION: {
          target: 'acting',
          guard: 'canTakeAction',
          actions: ({ context }) => {
            console.log('👻 ~ context: from child', context)
          },
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
  players: ActorRefFromLogic<typeof playerMachine>[]
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
    logAction: assign(({ context, event }) => {
      const currentPlayer = context.players[context.currentPlayerIndex]
      return {
        logs:
          event.type === 'TAKE_ACTION' && currentPlayer
            ? [
                ...context.logs,
                `${currentPlayer.getSnapshot().context.name} took an action`,
              ]
            : context.logs,
      }
    }),
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
      entry: [
        assign({
          players: ({ spawn }) => {
            return [spawn(playerMachine), spawn(playerMachine)]
          },
        }),
      ],
      on: {
        START_GAME: {
          target: 'playing',
          actions: [
            ({ context }) => {
              // console.log('👻 ~ context:', context.players)
            },
            assign(({ context }) => ({
              logs: ['Game started'],
            })),
          ],
        },
      },
    },
    playing: {
      on: {
        TAKE_ACTION: {
          actions: [
            sendTo(
              ({ context }) => {
                const player1 = context.players[0]
                return player1
              },
              {
                type: 'TAKE_ACTION',
              },
            ),
            'logAction',
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
