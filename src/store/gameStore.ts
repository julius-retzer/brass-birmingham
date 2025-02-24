import { on } from 'events'
import { type } from 'os'
import { Action, assign, createMachine, setup } from 'xstate'
import { type CityId } from '../data/board'
import {
  type BaseCard,
  type Card,
  type CardDecks,
  type CardType,
  type IndustryCard,
  type IndustryType,
  type LocationCard,
  type LocationColor,
  type WildIndustryCard,
  type WildLocationCard,
  getInitialCards,
} from '../data/cards'
import { availableIndustryTiles } from '../data/availableIndustryTiles'
export type LogEntryType = 'system' | 'action' | 'info' | 'error'

export interface LogEntry {
  message: string
  type: LogEntryType
  timestamp: Date
}

export interface Player {
  id: string
  name: string
  color: 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'
  character:
    | 'Richard Arkwright'
    | 'Eliza Tinsley'
    | 'Isambard Kingdom Brunel'
    | 'George Stephenson'
    | 'Robert Owen'
    | 'Henry Bessemer'
  money: number
  victoryPoints: number
  income: number
  hand: Card[]
  // Built items
  links: {
    from: CityId
    to: CityId
    type: 'canal' | 'rail'
  }[]
  industries: {
    location: CityId
    type: IndustryType
    level: number
    flipped: boolean
  }[]
}

export interface GameState {
  players: Player[]
  currentPlayerIndex: number
  era: 'canal' | 'rail'
  round: number
  actionsRemaining: number
  resources: {
    coal: number
    iron: number
    beer: number
  }
  logs: LogEntry[]
  // Card-related state
  drawPile: Card[]
  discardPile: Card[]
  wildLocationPile: WildLocationCard[]
  wildIndustryPile: WildIndustryCard[]
  selectedCard: Card | null
  selectedCardsForScout: Card[]
  spentMoney: number
  // Network-related state
  selectedLink: {
    from: CityId
    to: CityId
  } | null
  secondLinkAllowed: boolean
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = shuffled[i]
    const next = shuffled[j]
    if (temp !== undefined && next !== undefined) {
      shuffled[i] = next
      shuffled[j] = temp
    }
  }
  return shuffled
}

const DEBUG = false

function debugLog(
  actionName: string,
  {
    context,
    event,
  }: { context: GameState; event: { type: string } & Record<string, unknown> },
) {
  if (DEBUG) {
    const state = {
      currentPlayerIndex: context.currentPlayerIndex,
      actionsRemaining: context.actionsRemaining,
      round: context.round,
      era: context.era,
      selectedCard: context.selectedCard,
    }

    console.log(`Action: 🔴 ${actionName}]`, {
      state,
      event,
    })
  }
}

function createLogEntry(message: string, type: LogEntryType): LogEntry {
  return {
    message,
    type,
    timestamp: new Date(),
  }
}

// Replace the GameEvent type with types from the machine
type GameEvent =
  | {
      type: 'START_GAME'
      players: Array<Omit<Player, 'hand' | 'links' | 'industries'>>
    }
  | {
      type: 'BUILD'
    }
  | {
      type: 'DEVELOP'
    }
  | {
      type: 'SELL'
    }
  | {
      type: 'TAKE_LOAN'
    }
  | {
      type: 'SCOUT'
    }
  | {
      type: 'NETWORK'
    }
  | {
      type: 'SELECT_LINK'
      from: CityId
      to: CityId
    }
  | {
      type: 'SELECT_CARD'
      cardId: string
    }
  | {
      type: 'CONFIRM'
    }
  | {
      type: 'CANCEL'
    }

type AssignArgs = {
  context: GameState
  event: GameEvent
}

// Update utility functions with proper types
function findCardInHand(player: Player, cardId: string): Card | null {
  return player.hand.find((card) => card.id === cardId) ?? null
}

function removeCardFromHand(
  player: Player,
  cardId: string | undefined,
): Card[] {
  if (!cardId) return player.hand
  return player.hand.filter((card) => card.id !== cardId)
}

function updatePlayerInList(
  players: Player[],
  currentPlayerIndex: number,
  updatedPlayer: Partial<Player>,
): Player[] {
  return players.map((player, index) =>
    index === currentPlayerIndex ? { ...player, ...updatedPlayer } : player,
  )
}

function getCurrentPlayer(context: GameState): Player {
  const player = context.players[context.currentPlayerIndex]
  if (!player) {
    throw new Error('Current player not found')
  }
  return player
}

function getCardDescription(card: Card): string {
  switch (card.type) {
    case 'location':
      return `${card.location} (${card.color})`
    case 'industry':
      return `${card.industries.join('/')} industry`
    case 'wild_location':
      return 'wild location'
    case 'wild_industry':
      return 'wild industry'
  }
}

// Setup the machine with proper typing
export const gameStore = setup({
  types: {} as {
    context: GameState
    events: GameEvent
  },
  actions: {
    selectCard: assign({
      selectedCard: ({ context, event }) => {
        debugLog('selectCard', { context, event })
        if (event.type !== 'SELECT_CARD') return null
        const player = getCurrentPlayer(context)
        return findCardInHand(player, event.cardId)
      },
    }),

    discardSelectedCard: assign(({ context, event }) => {
      debugLog('discardSelectedCard', { context, event })
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('Card not found')
      }

      const updatedHand = removeCardFromHand(
        currentPlayer,
        context.selectedCard.id,
      )

      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          { hand: updatedHand },
        ),
        discardPile: [...context.discardPile, context.selectedCard],
        selectedCard: null,
      }
    }),

    decrementActions: assign(({ context }) => {
      debugLog('decrementActions', { context, event: { type: 'DECREMENT' } })
      return {
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),

    refillPlayerHand: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      const cardsNeeded = 8 - currentPlayer.hand.length

      if (cardsNeeded <= 0) {
        return {
          players: context.players,
          drawPile: context.drawPile,
        }
      }

      const newCards = context.drawPile.slice(0, cardsNeeded)
      const updatedHand = [...currentPlayer.hand, ...newCards]

      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          { hand: updatedHand },
        ),
        drawPile: context.drawPile.slice(cardsNeeded),
      }
    }),
  },
  guards: {
    hasActionsRemaining: ({ context }) => context.actionsRemaining > 0,
    isGameOver: ({ context }) => context.era === 'rail' && context.round >= 8,
    isRoundOver: ({ context }) =>
      context.currentPlayerIndex === context.players.length - 1 &&
      context.actionsRemaining === 0,
    hasSelectedCard: ({ context }) => context.selectedCard !== null,
    canScout: ({ context }) => {
      return context.selectedCardsForScout.length === 2
    },
    isFirstRound: ({ context }) =>
      context.era === 'canal' && context.round === 1,
    hasSelectedLink: ({ context }) => context.selectedLink !== null,
    canBuildLink: ({ context, event }) => {
      if (event.type !== 'SELECT_LINK') return false

      // Check if any player already has a link on this connection
      const existingLink = context.players.some((player) =>
        player.links.some(
          (link) =>
            (link.from === event.from && link.to === event.to) ||
            (link.from === event.to && link.to === event.from),
        ),
      )

      if (existingLink) {
        // Add an error message to the logs
        context.logs.push(
          createLogEntry(
            `Cannot build a link between ${event.from} and ${event.to} as a link already exists there`,
            'error',
          ),
        )
        return false
      }

      return true
    },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCMBOBDWsDi6C2YAxAFQDaADALqKgAOA9rAJYAuT9AdjSAB6ICMAJgBsAdgB0ggMwAWUQA4pg8qICccgDQgAngMEBffVrSYc+MONhgWAV1qEAygBUAggCUnAfWwuAsgFEKaiQQBmY2Tm4+BH4ZQXEleSFlaXl5ES1dBBkZAFZxURFcqVzRcnJhflF+XMNjDCxcAnFaABt0bSYOKBb27TBUJxtUDkIAIQBVAEkAGQARIO4w1nYuEOi8mXFVYXlREuEZfikpfnlMxHlyLdVyUpPinLF+OpATRvNejq6eto6BoYjQhzfwANX8MwA8gAFRYhZYRNagDa5G67fa5Q7HU7nHR6FTiJKxYSyYSlQSiUSvd5mZp-TrdL79QbDUYOCEzOF0RgrSLrRCbbbog5HE5nC4xSrkApnCnyXKqUTCHbyakNWkWek-JkA1mEVwAaX8nihLgAclzQjzEVEBaihXsRdjxXiEMpjuJhII5KdVDtyDsZGrTE1NX1tfTdUCHABhSETJyWhGrW3Ze0qjFYsW4rKCQT8VTiFSiXIiGTleTlqlGN7q0NMiN9KOjM3+JwAdUhbgNSetKf5abRjsxopxEpE8mE4iEhQxeSk5SkwY+dPDjMjLKBvfC-eRiFKEtOgkLJzuuXkOyEZ2XGob66bm444mQNiYrQg2qsrTAAGM2N0Y3QVAIEcCF-BjLwY3cBYqCWPs+T3BAlXiPYZEnJVZDOchBAldJ4hqUo5Cw6QdhvestXvf5H2fV930-MBvz-H5AOAwgoLNGMIW3XkkV4ARjnyYsklUb0pGEEkpAlc94kKSoSWwsSrlVGsaXItdfgfQEnxfN8P0ZH9OAAMyYVA8B+MZaJAuMzQAMSmNxfG4m0ByqctxBkXZVAXGRVExLzJNdNRpX4AsC1yFQ0iVF4VLrT4KI0qitJo3TtQMjhjNM8zLLY81OM5WD4Xg3joiuKcykESd0PLFQJVkyRsKJMkpEKE4yLi9SdWoiAwAANwY+haHoxj-ygFiQPZGZwMg6CnN3PikL2QkKUVClqsETEJWSQTKjkaoQtqGKQ3a75KOZJLur61oBqG38RrGnKOK4gruR3BD5pC9Jtma2QAyqETKglVR5U9HERN8nyqza1cToSs7WXEC7+sG-SjJMszujmXqkbYyFbPsxznqtV7ioEUQ3I8i9vN85UTk25Qp3WqohCB8SjihsMYc686sau5GejSjL0agTHLoGh68tmt6StOT1cgVfZKSB0tck25np3IeUjnPHzFGEdm71h5tLAY1obqYgCgPGsCIM8KC3Bg4IXp41N0nkBJbmEa5K098TNq9CQVWPPMZFJLz9firn4a-U3GS-W7mMt8WnsdonnZcgtpQUELqkOEpSxkTapDScRinlCk83IIRS3DjqNyS6PUtRzLugcE2cbxhzJZJmIyelCmvOuan-L9gNp3PWRClyWUDvqI7oYZQ3qIblH0rRn5W9aVok-ylPkyly5CkkM5PfPeUL2PTbiniSufPUIGTkUJdDpXDmF8jkZxBYdAAGsfhmeh0BPjjubUaicJpTVtjNQme9u5XHyLIIuBxSyexqq6ZQC5CRkzJiOY+qga6czrvDL+v9uj-0AcbYaCdWLsQltAoqqZs5TjJJUP0+ZZDFFUJtNQ-B3I5DUIqKeZN8Fv0IR-Yhf8AFPgFmvUhkj252U7nQ4mDDe7uU8lTPytNXQFiBoSIuBYSjlnCnLYRjZEpEJ-hI8h0jm5QDIaMGhyc4LKIHJWQsVR8xAziAqRUAUsgGJuPmHIigkgKCfrPF+Bt35AIMjYEaFD44W2ArAUCk0bZ2wds4tOiEfbuREvmfMSQ5aFHHNIKcSgSzVQ8pUCkpjTpG1gLE+JwC7qWxSdZBRBNd70Jcqo-uGiaZ+MQHmK4BRVBCFPCWI8dTF71yaWbVpyTt5dxdncacqExIVTuJSHCaCqhTj9HEb0twlQhxmdE8QHBrAAHd6CoBIT0FpVCrZpOmvbFZA41BbGqJOPOAYPIFnHGUKQCQdl7FCiocJtY56vzMXDD+VyWC3PuQs55yylHZPeuefIwKqjNQatcXZuYPIgvUCWPM-AxCFHUOc0RT5EXIoeQkkBMwujf1SRAmYUwzQ9gxc5RCIUCzq3GdhMQIkKiiCBWsvY1QKhKDiGkWlml4YMruUyp5pC2Xou6S4xCISS7VLEqiESaROFoM9hIOIUggZ+gXEDasETbwRzpZcm5arG6r1sayjg7KOn4w+QKvp6jB6aKGW6NCAdpLlC9CFM5z8nW12VQit1KKV6Cz-lqxxO8sn8veiIEFU9MQlkrAuQ4whxye0LCJI4ZQ1CUmqA66FkSI7oCYpwGM9A8BtGsEQAN80jhVuFDg7Mh5dj1Xldawpk4DDxrUpzVtiIO1du-CwXt-AdWYuiHmCkkhxIqBJPk3Y5btGHELJOKoxRK5egqHg2dx035XJ4CwaED5CB9o2KPDMToR1oLQtsYoJwvIXlrYqu9884VG0RrzD16aMY8zFlm0g66c1zWljwsk8tmpqDLirbR+aixyTJCkJmSrzEfyg9dNNMjhbwfsIhwQG7c1odlphxWOHC5TxLnJBq3plDV1eBweg3V4AhFUuYFD+8EAAFp+C1VJQBgseRK6gcdfWKwthaASe7poV0FN-1HlRLsUKM8m0Jphlp1MJQ3ZfuHWOE9PD5yyCOOiW4NRSPwt4jA1M5YDlDqzHZrIPl8h5jkgobCGFoqqfvRBpeDFElQBcG2zzPTEKChs-5l0-i5bxEKYzUtNRrxgdhfU6iOk6LdAswOVEWwjw4intekKEoSRu3KiWMmzUQ5iHc0bMrelHlxZAWNSriEFTxFq2cer7pZOukUFscK1R1ByDQta7rpXLIweoxZXSw35peQc0e9a1SLwAxm9asZaQSRayuEIVb3NRZ8x29EPyu7URlIrtUza1x0Ma0M2JHzesitRJdRRvmzLFkQEe4gSoEgihWq9MoD7eHmruWOPwO45c0hxFu-DEHG3bEiyRpDhA1N3L5n2Ns1alK6ZxAKNcSkcRjjewB1F8DJX64mx+ETytS04HkiUpK7ROQ5uxD9IqL0HkTGA+dUmoBHPY4DfB1z0oPOzyFH537NyvpxXljQsUEzYnWezKjnL-mTchYb1aETv0ByS1ejEHsdIGv8iVBqJTPIRTG0G+K0bsRljZGAKJ+eMqSQKpNQ8vmY9-jKyWqCcUSlGsiPY99w8+xYPnlc9kAUEPk5Hgxsj8M64IKQsFmPH93YQYpeJrI0+cR-upFm6scl3Vu39hfRLF5XXpxfZoK9iXKo56ZUhxUEnmJ9A4mc8Ks3p7553YqDyOM5WpxxyxDdukSpaF1rKn17FQ3FzGlj+aQr55ImnZMahxUWf2CF-rSX2gk4MOlLfQqMqPYI-XVIvdRVyfm79xKjHp7X5cZDfM1XMKeKtEiMlNHG9N-VVVNfrShJJCHb-M-BAcXf-BPa1FfC+NBaoHFCqfYYJItPMGAlNdVI-TVH1K3EkBICZfyBnRWIFfMIsBHcgWQEQS7CvFnb3C5WAplGxIWb1b+InRnN2CqWIJQEkBUPXRggtFgtg8SJzc5BdVYJdbtVdInZQa4f-ZhCoaPCqP2b0T0faMVC8cKKoc5R9Z9B8DQ61YKAMBtaqNxP2EKacdQU1DDH0fWKAcwSEPqVADQlwkPEOPMIDEOHTLIU4bCPRa4Vg7WDrCvQwIAA */
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
      beer: 24,
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
      actions: [
        ({ event, context }) => {
          const toLog = {
            context: context.currentPlayerIndex,
            selectedCard: context.selectedCard?.id,
            event: event.type,
            state: context.era,
          }
          console.log(JSON.stringify(toLog, null, 2))
          throw new Error(`Invalid call of event ${event.type}`)
        },
      ],
    },
  },
  states: {
    setup: {
      on: {
        START_GAME: {
          target: 'playing',
          actions: assign(({ event, context }) => {
            if (event.type !== 'START_GAME') return {}
            debugLog('initializeGame', { context, event })

            // Initialize card piles based on player count
            const playerCount = event.players.length
            const { regularCards, wildLocationCards, wildIndustryCards } =
              getInitialCards(playerCount)
            const shuffledCards = shuffleArray(regularCards)
            const hands: Card[][] = []
            let currentIndex = 0

            // Deal 8 cards to each player
            for (let i = 0; i < playerCount; i++) {
              hands.push(shuffledCards.slice(currentIndex, currentIndex + 8))
              currentIndex += 8
            }

            // Initialize players with their hands
            const players = event.players.map((player, index) => ({
              ...player,
              hand: hands[index] ?? [],
              links: [],
              industries: [],
              availableIndustryTiles,
            }))

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
            }
          }),
          guard: ({ event }) =>
            event.type === 'START_GAME' &&
            event.players.length >= 2 &&
            event.players.length <= 4,
        },
      },
    },
    playing: {
      initial: 'playerTurn',
      states: {
        playerTurn: {
          initial: 'selectingAction',
          always: [{ guard: 'isGameOver', target: '#brassGame.gameOver' }],
          on: {
            BUILD: { target: '.building' },
            DEVELOP: { target: '.developing' },
            SELL: { target: '.selling' },
            TAKE_LOAN: { target: '.takingLoan' },
            SCOUT: { target: '.scouting' },
            NETWORK: { target: '.networking' },
          },
          states: {
            selectingAction: {},
            building: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingBuild',
                      actions: [
                        assign({
                          selectedCard: ({ context, event }) => {
                            debugLog('selectingCard', { context, event })
                            if (event.type !== 'SELECT_CARD') return null
                            const player = getCurrentPlayer(context)
                            return findCardInHand(player, event.cardId)
                          },
                        }),
                      ],
                    },
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
                confirmingBuild: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: [
                        assign({
                          logs: ({ context }) => {
                            const currentPlayer = getCurrentPlayer(context)
                            if (!context.selectedCard) {
                              throw new Error('Card not found')
                            }

                            return [
                              ...context.logs,
                              createLogEntry(
                                `${currentPlayer.name} built using ${getCardDescription(context.selectedCard)}`,
                                'action',
                              ),
                            ]
                          },
                        }),
                        'discardSelectedCard',
                        'decrementActions',
                      ],
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
              },
            },
            developing: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingDevelop',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
                confirmingDevelop: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: ['discardSelectedCard', 'decrementActions'],
                    },
                    CANCEL: [
                      {
                        target: 'selectingCard',

                        actions: [
                          assign({
                            selectedCard: null,
                            selectedCardsForScout: [],
                          }),
                        ],

                        guard: 'New guard',
                      },
                      {
                        target: 'selectingCard',
                        guard: 'canPlay',
                      },
                      {
                        target: '#brassGame.playing.playerTurn.selling',
                        reenter: true,
                      },
                    ],
                  },
                },
              },
            },
            selling: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingSell',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
                confirmingSell: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: ['discardSelectedCard', 'decrementActions'],
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
              },
            },
            takingLoan: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingLoan',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
                confirmingLoan: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: [
                        assign(({ context }) => {
                          const currentPlayer = getCurrentPlayer(context)
                          if (!context.selectedCard) {
                            throw new Error('Card not found')
                          }

                          return {
                            players: updatePlayerInList(
                              context.players,
                              context.currentPlayerIndex,
                              {
                                money: currentPlayer.money + 30,
                                income: Math.max(0, currentPlayer.income - 3),
                              },
                            ),
                            logs: [
                              ...context.logs,
                              createLogEntry(
                                `${currentPlayer.name} took a loan (£30, -3 income) using ${context.selectedCard.id}`,
                                'action',
                              ),
                            ],
                          }
                        }),
                        'discardSelectedCard',
                        'decrementActions',
                      ],
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
              },
            },
            scouting: {
              initial: 'selectingCards',
              states: {
                selectingCards: {
                  on: {
                    SELECT_CARD: {
                      target: 'selectingCards',
                      actions: [
                        assign({
                          selectedCardsForScout: ({ context, event }) => {
                            debugLog('selectScoutCard', { context, event })
                            if (event.type !== 'SELECT_CARD')
                              return context.selectedCardsForScout
                            const player =
                              context.players[context.currentPlayerIndex]
                            if (!player) return context.selectedCardsForScout

                            const card = player.hand.find(
                              (c) => c.id === event.cardId,
                            )
                            if (!card) return context.selectedCardsForScout

                            if (context.selectedCardsForScout.length < 2) {
                              return [...context.selectedCardsForScout, card]
                            }
                            return context.selectedCardsForScout
                          },
                        }),
                      ],
                    },
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      guard: 'canScout',
                      actions: [
                        assign({
                          players: ({ context, event }) => {
                            debugLog('discardScoutCards', { context, event })
                            const currentPlayer =
                              context.players[context.currentPlayerIndex]
                            if (!currentPlayer) return context.players

                            const updatedHand = currentPlayer.hand.filter(
                              (card) =>
                                !context.selectedCardsForScout.some(
                                  (sc) => sc.id === card.id,
                                ),
                            )

                            return context.players.map((player, index) =>
                              index === context.currentPlayerIndex
                                ? { ...player, hand: updatedHand }
                                : player,
                            )
                          },
                          discardPile: ({ context }) => {
                            return [
                              ...context.discardPile,
                              ...context.selectedCardsForScout,
                            ]
                          },
                          logs: ({ context }) => {
                            const currentPlayer =
                              context.players[context.currentPlayerIndex]
                            if (!currentPlayer) return context.logs

                            const cardDescriptions =
                              context.selectedCardsForScout.map((card) => {
                                switch (card.type) {
                                  case 'location':
                                    return `${card.location} (${card.color})`
                                  case 'industry':
                                    return `${card.industries.join('/')} industry`
                                  case 'wild_location':
                                    return 'wild location'
                                  case 'wild_industry':
                                    return 'wild industry'
                                }
                              })

                            return [
                              ...context.logs,
                              createLogEntry(
                                `${currentPlayer.name} scouted by discarding ${cardDescriptions.join(' and ')}`,
                                'action',
                              ),
                            ]
                          },
                        }),
                        assign({
                          players: ({ context, event }) => {
                            debugLog('drawWildCards', { context, event })
                            const currentPlayer =
                              context.players[context.currentPlayerIndex]
                            if (!currentPlayer) return context.players

                            const wildLocation = context.wildLocationPile[0]
                            const wildIndustry = context.wildIndustryPile[0]

                            if (!wildLocation || !wildIndustry)
                              return context.players

                            const updatedHand = [
                              ...currentPlayer.hand,
                              wildLocation,
                              wildIndustry,
                            ]
                            return context.players.map((player, index) =>
                              index === context.currentPlayerIndex
                                ? { ...player, hand: updatedHand }
                                : player,
                            )
                          },
                          wildLocationPile: ({ context }) =>
                            context.wildLocationPile.slice(1),
                          wildIndustryPile: ({ context }) =>
                            context.wildIndustryPile.slice(1),
                          logs: ({ context }) => {
                            const currentPlayer =
                              context.players[context.currentPlayerIndex]
                            if (!currentPlayer) return context.logs

                            return [
                              ...context.logs,
                              createLogEntry(
                                `${currentPlayer.name} drew wild location and wild industry cards`,
                                'action',
                              ),
                            ]
                          },
                        }),
                        assign({
                          actionsRemaining: ({ context, event }) => {
                            debugLog('decrementActions', { context, event })
                            return context.actionsRemaining - 1
                          },
                        }),
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
              },
            },
            networking: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'selectingLink',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.playerTurn',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
                selectingLink: {
                  on: {
                    SELECT_LINK: {
                      target: 'confirmingLink',
                      actions: [
                        assign({
                          selectedLink: ({ event, context }) => {
                            debugLog('selectLink', { context, event })
                            if (event.type !== 'SELECT_LINK') return null
                            return {
                              from: event.from,
                              to: event.to,
                            }
                          },
                        }),
                      ],
                      guard: 'canBuildLink',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: [
                        assign({
                          selectedCard: null,
                          selectedCardsForScout: [],
                        }),
                      ],
                    },
                  },
                },
                confirmingLink: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      guard: 'hasSelectedLink',
                      actions: [
                        assign({
                          spentMoney: ({ context, event }) => {
                            debugLog('buildLink', { context, event })
                            // Canal era: £3 per link
                            // Rail era: £5 for first link, £15 for two links
                            if (context.era === 'canal') {
                              return context.spentMoney + 3
                            }
                            return context.spentMoney + 5
                          },
                          resources: ({ context }) => {
                            // Only consume coal in rail era
                            if (context.era === 'rail') {
                              return {
                                ...context.resources,
                                coal: context.resources.coal - 1,
                              }
                            }
                            return context.resources
                          },
                          players: ({ context }) => {
                            const currentPlayer =
                              context.players[context.currentPlayerIndex]
                            if (!currentPlayer || !context.selectedLink)
                              return context.players

                            const selectedLink = context.selectedLink // Capture in variable to satisfy TypeScript

                            return context.players.map((player, index) =>
                              index === context.currentPlayerIndex
                                ? {
                                    ...player,
                                    money:
                                      player.money -
                                      (context.era === 'canal'
                                        ? // Canal era: £3 per link
                                          3
                                        : 5), // Rail era: £5 for first link
                                    links: [
                                      ...player.links,
                                      {
                                        from: selectedLink.from,
                                        to: selectedLink.to,
                                        type: context.era,
                                      },
                                    ],
                                  }
                                : player,
                            )
                          },
                          logs: ({ context }): LogEntry[] => {
                            const currentPlayer =
                              context.players[context.currentPlayerIndex]
                            if (!currentPlayer || !context.selectedLink)
                              return context.logs

                            const selectedLink = context.selectedLink // Capture in variable to satisfy TypeScript

                            return [
                              ...context.logs,
                              createLogEntry(
                                `${currentPlayer.name} built a ${context.era} link between ${selectedLink.from} and ${selectedLink.to}`,
                                'action',
                              ),
                            ]
                          },
                        }),
                        'discardSelectedCard',
                        'decrementActions',
                        assign({
                          selectedLink: null,
                          secondLinkAllowed: true,
                        }),
                      ],
                    },
                    CANCEL: {
                      target: 'selectingLink',
                      actions: [
                        assign({
                          selectedLink: null,
                          secondLinkAllowed: true,
                        }),
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        actionComplete: {
          entry: ['refillPlayerHand'],
          always: [
            {
              guard: 'hasActionsRemaining',
              target: 'playerTurn',
            },
            {
              target: 'nextPlayer',
            },
          ],
        },
        nextPlayer: {
          entry: [
            assign(({ context, event }) => {
              debugLog('nextPlayer', { context, event })
              const nextPlayerIndex =
                (context.currentPlayerIndex + 1) % context.players.length
              const isRoundOver = nextPlayerIndex === 0
              const nextRound = isRoundOver ? context.round + 1 : context.round
              const isFirstRound = context.era === 'canal' && nextRound === 1

              return {
                currentPlayerIndex: nextPlayerIndex,
                actionsRemaining: isFirstRound ? 1 : 2, // 1 action for first round, 2 for all others
                round: nextRound,
                selectedCard: null,
                selectedCardsForScout: [],
                spentMoney: 0,
              }
            }),
          ],
          always: {
            target: 'playerTurn',
          },
        },
      },
    },
    gameOver: {
      entry: [
        assign({
          logs: ({ context }) => [
            ...context.logs,
            createLogEntry('Game Over!', 'system'),
          ],
        }),
      ],
      type: 'final',
    },
  },
})
