import { assign, fromPromise, sendTo, setup } from 'xstate'

// ==========================================================================
// Types
// ==========================================================================

type Era = 'canal' | 'rail'
type PlayerCount = 2 | 3 | 4
type IndustryType =
  | 'coal'
  | 'iron'
  | 'cotton'
  | 'manufacturer'
  | 'pottery'
  | 'brewery'
type CardType = 'location' | 'industry' | 'wildLocation' | 'wildIndustry'
type ActionType =
  | 'build'
  | 'network'
  | 'develop'
  | 'sell'
  | 'loan'
  | 'scout'
  | 'pass'
type MerchantBonus = 'develop' | 'income' | 'victoryPoints' | 'money'

// Basic player state
interface PlayerState {
  id: string
  name: string
  money: number
  income: number
  victoryPoints: number
  actionsRemaining: number
  spentMoney: number
}

// Game context
export interface GameContext {
  era: Era
  round: number
  playerCount: PlayerCount
  players: PlayerState[]
  currentPlayerIndex: number
  gameOver: boolean
  winner: string | null
}

// Game events
export type GameEvent =
  | { type: 'START_GAME'; playerCount: PlayerCount; playerNames: string[] }
  | { type: 'TAKE_ACTION'; action: ActionType }
  | { type: 'END_TURN' }
  | { type: 'END_ROUND' }
  | { type: 'END_ERA' }
  | { type: 'END_GAME' }
  | { type: 'TEST_ADVANCE_ROUND' }
  | { type: 'TEST_TRANSITION_TO_RAIL' }
  | { type: 'TEST_END_GAME' }
  | {
      type: 'SET_VICTORY_POINTS'
      playerScores: Array<{ playerId: string; points: number }>
    }

// Create a function to initialize a new player
function createPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    money: 17, // Starting money according to rules
    income: 10, // Starting income level
    victoryPoints: 0,
    actionsRemaining: 0, // Will be set to 1 for first round, 2 for others
    spentMoney: 0,
  }
}

// Create a function to initialize the game
function initializeGame(
  playerCount: PlayerCount,
  playerNames: string[],
): GameContext {
  return {
    era: 'canal',
    round: 1,
    playerCount,
    players: playerNames.map((name, index) =>
      createPlayer(index.toString(), name),
    ),
    currentPlayerIndex: 0,
    gameOver: false,
    winner: null,
  }
}

// Create the Brass Birmingham machine
export const brassBirminghamMachine = setup({
  types: {} as {
    context: GameContext
    events: GameEvent
  },
}).createMachine({
  id: 'brassBirmingham',
  context: {
    era: 'canal',
    round: 0,
    playerCount: 2,
    players: [],
    currentPlayerIndex: 0,
    gameOver: false,
    winner: null,
  },
  initial: 'setup',
  states: {
    setup: {
      on: {
        START_GAME: {
          target: 'playing',
          actions: assign({
            players: ({ context, event }) => {
              if (event.type !== 'START_GAME') return context.players

              return event.playerNames.map((name, index) => {
                const player = createPlayer(index.toString(), name)
                // First round has only 1 action per player
                player.actionsRemaining = 1
                return player
              })
            },
            playerCount: ({ event }) =>
              event.type === 'START_GAME' ? event.playerCount : 2,
            round: 1,
          }),
        },
      },
    },
    playing: {
      on: {
        TAKE_ACTION: {
          actions: assign({
            players: ({ context }: { context: GameContext }) => {
              return context.players.map((player, index) => {
                if (index === context.currentPlayerIndex) {
                  return {
                    ...player,
                    actionsRemaining: player.actionsRemaining - 1,
                  }
                }
                return player
              })
            },
          }),
        },
        END_TURN: {
          actions: assign({
            currentPlayerIndex: ({ context }: { context: GameContext }) =>
              (context.currentPlayerIndex + 1) % context.players.length,
          }),
        },
        END_ROUND: {
          actions: assign({
            round: ({ context }: { context: GameContext }) => context.round + 1,
            currentPlayerIndex: 0,
            players: ({ context }: { context: GameContext }) => {
              return context.players.map((player) => ({
                ...player,
                actionsRemaining: 2,
                spentMoney: 0,
              }))
            },
          }),
        },
        END_ERA: {
          actions: assign({
            era: 'rail',
            round: 1,
          }),
        },
        END_GAME: {
          actions: assign({
            gameOver: true,
            winner: ({ context }: { context: GameContext }) => {
              // Find player with highest victory points
              let highestVP = -1
              let winnerId = null

              for (const player of context.players) {
                if (player.victoryPoints > highestVP) {
                  highestVP = player.victoryPoints
                  winnerId = player.id
                }
              }

              return winnerId
            },
          }),
        },
        // Special test events
        TEST_ADVANCE_ROUND: {
          actions: assign({
            round: ({ context }: { context: GameContext }) => context.round + 1,
            players: ({ context }: { context: GameContext }) => {
              return context.players.map((player) => ({
                ...player,
                actionsRemaining: 2,
              }))
            },
          }),
        },
        TEST_TRANSITION_TO_RAIL: {
          actions: assign({
            era: 'rail',
            round: 1,
          }),
        },
        TEST_END_GAME: {
          actions: assign({
            gameOver: true,
            winner: ({ context }: { context: GameContext }) => {
              let highestVP = -1
              let winnerId = null

              for (const player of context.players) {
                if (player.victoryPoints > highestVP) {
                  highestVP = player.victoryPoints
                  winnerId = player.id
                }
              }

              return winnerId
            },
          }),
        },
        SET_VICTORY_POINTS: {
          actions: assign({
            players: ({
              context,
              event,
            }: {
              context: GameContext
              event: Extract<GameEvent, { type: 'SET_VICTORY_POINTS' }>
            }) => {
              return context.players.map((player) => {
                const scoreEntry = event.playerScores.find(
                  (score) => score.playerId === player.id,
                )

                if (scoreEntry) {
                  return {
                    ...player,
                    victoryPoints: scoreEntry.points,
                  }
                }

                return player
              })
            },
          }),
        },
      },
    },
    gameOver: {
      type: 'final',
    },
  },
})
