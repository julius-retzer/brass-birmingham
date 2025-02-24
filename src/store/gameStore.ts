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
  /** @xstate-layout N4IgpgJg5mDOIC5QCMBOBDWsDi6C2YAxAFQDaADALqKgAOA9rAJYAuT9AdjSAJ6IC0AZgCs5ADQgAHogCMADgDsAJgB0SmTPLkAnHO3DtSgCxKAvqYlpMOfGBWwwLAK61CAZQAqAQQBKHgPrYXgCyAKIU1EggDMxsnNzSCMYyKnIySqIK5HraMgBs5AoSfAgaKeRKgkZpooK5BYLmlhhYuAQqtAA26DxMHFAd3TxgqB5OqByEAEIAqgCSADIAIhHcMazsXFGJleQqgunCxYhKynKpcgbVCsLpck0gVq22gz19A109I2MThEuhADVQgsAPIABVWUXWcS2oB2gj2BwyxySCly+0u2mutyU9wsjxaNnan16-Vew1G40mbmBC0hdEYG3i2xOCP2hxRuOEgguV0UOLxzWsbTsJPe5O+VMI3gA0qF-KCvAA5enRRkwhKsxEc3gneoYvk3O4PJ5E0VDcUkyW-NwAYRBMw8quhm01STZSKOuqS2gU5zkmOxxvxppF5MtQ2tkyVoQ8AHUQT4Zc71a6We7tcjvQijClBIH+cGhc9iRayVbKb8U7E03CteysyUDuQeQHDQKTYSw2LyyMAGb0VB4d5eADGMJUyCcTE6EHFDk6YHH71t6FQEHcwNCtoCtt8Kyoa1TzLrpUK2jULZkvqMeVOOkEnOqqiMglxGTkRnIMgUMk7wpeHsPn7Qdh36McJynGc5zJBclzYfpV3XQg9yVW1gWrJlYSkWR8lUO9RCMIxfUMO8lCfKoVFfd9hE-b9f3-EtzTeXtUAHIcR2XThJ2nWdxVHTg+yYDj+imXiN3tJUADE5h8YJMI1KISgyLQVEKAo7zyPJuQRL1EhkYQvxUPJ+QUZQtCxBRGhDLtALLYC2NAzjIPE-jBOEsCoDE6CUOVdC6UPKFj2w5TRD2dTyE07TBF0iR9MMvYTJuMylAsowrMYs1w1Y9jPIgzYVAgMAADcwE6ehaHnMr4JXNcNxpBZt13fcFNrHCzzyHltDfQQjREfJtBRGRc2EFR8mUH88lvRQGJsgDSxYhzcucgqitK8rKtg6rl0QurfLQjDAoZGsT3ajR0v2QylGu7Sf3UOQhsEPIFDG571AUKaktm4ssqAjoQJEqB8u4tayoqtyOCEwGlhKsHXEkmS5Na06SmGt9Uk0IxDPS1Knoes7DJep7dDRRQqkKTLu3s-7HMB4GOEK2GNohqHPJh9aKv2-zkZC2RqIx8gsaI8y8bi2RCf2PISZJ8mFEpuzFpp5bwK4hmF06KrFx2qAkPqrcd38PcfAPSJjqwt1NEuFQFCIuQCgyURciKb0CgvER0q-NEtFSv85qY7KlqclWJ3VzWat25DUO5o61RO7D9IG17nsKMz8iIr0SmEPI80Jz3tG9795YW0lA7p1X7DKjWyQEyGPPeNxK5QkFpNk+SY5dFHEE0lRtBI2inuzzqxdKbkialu3iO6t9fSL5iS6VoOgfL0Pq-cwGG86ToucO03Y-NpSu6UPIe77uQB-yR8Cd6yXdCm3uYqUGe-d+6naABvLy5YdAAGt3gWeh0Bq22ghHWe0GpNUNi1duwULbnmttoKWwgj7vgQXkIa35VBHx0Gie6ts8izwDgvMuE4v6-36P-QBFctYgN1tvAKu8O7x1wp1NQ8g5BaGGtUYiRgUQIKMGoV2OD5B4IIX9N+tMP4kJ-n-ABDMa6sxkYApuLckbQLjtwVGFQLz5xMCIR+yC9LizqMZO648tLclvKI1+78VrcVIYouRa9PIUMmFHHeR51EHzPI-HugtKhINIlmeKxjs7KDMdFSxz8qaK3EcrJeIcBJOBAVQ8OoD1ywE3I1A2RsTYeP3qec6F4J5TR-IoXQdshp3kSrjGKadrxaSsTEmxwcCqwESckuC2tdYZIRq3HmGjZATRUMIKyWMCg3F0vjfSI1UjESvILIiX4zBRIVvPWJi96b2HaWHLpdUel+XcUFTxoBUZDJGVULOhRuTkFosPYaBlZn52bIspZjS1nNPiQVDgjgADug4yEDE6TQsB+tmrG36emdh4UDJaQDOlYRg1vSpTMmpI+tEbYaBtkfN5loPmbO+SwP5qAAUpN2ZHA59C8mKVPAGHkr4jSdU6lZMynItGou0ooXMP4TD4JWcXXFEjbEMwJUSklQK-59G-pkiBCw5hKmTGo-JZ1hoXm0p1eQgtCj5h4UiuBSCOUYu5divlc8BVxPxb8-5OyQELElXQiFBTjA8iesoJ62QrqX2UleYZaLOWYp5TinKGzy4iqtavWugNbUcClb01RDCYFeNSr6V6uhXzVAMNeO5Jk9jqE0DoPQBhjDLJ+tE95gqWncVDcSlmddyF2rcZSo5SqvXJoGp+KomJM1nWzawvNuh9CGBMIGgY6BVa2noHgLojgiAOrOr+YyaIkoZ0QM2VsBYjS4mHSoUdMJx2TsXCwGdMh43HLnSkZ6CD+QogONnXkWJCybpNYQ75kgWBgkjKgQgs79IsKvI2Fd6ginro7A8Dg9AirwCiKGWwVK2qJH4DITkPIkEiBbKcGKZkiLWRLS8BwzhaCwdOtM4+XD8wINyFUBBj1+EqT8UfOQj8DjDsI0w0oDy-3LoQAcGjV4fzdU6uwqaW6Kw-Gwowt04gkWXHOPmdsRYCTzVNUG4hbVxPplzF1a5ttF21JRF+FIWQDjT3zkgmQ2GFP+zEXi8uTAICLhY7Alh-UBMF04ZybOMngPyeg-y5TkiCpQT4v0Bz6nb36BzNcBBunvQ2xzSM3IR9KNn19jh3zpd-PcUCzBQFwDarrhC6efO5wpqRSliRZB5EkXcOtu2302RoopYsy-Jp5bPmZdcuGhRolxIFbOuhtSt59DXTSlZTkYU1IfUikfaKulhPWYnKDZmwWm3UvareFI4WFllM6gcR6pxjJvQ+pUXuX5hBzda5sxb4MtrULyxAXriQ9DOvHulW6E18aoxMC9W4igAxPcqBlJ9VmLvlyu5tAY8ja1QHZnDB7sgMgvTMtnR+ZNPZDX5mkQW2MRYmXO+a5eld3hw4QOtnuWnIs7cQ96UzqRCb3zPtkKoePg0h0Jzd1Jutie5FGvISob5U5TSxiiO8BmptPLSJUBpQPrEg9Z5vGt69K7E-SGiYZAZs6Twfr6YXR8T5on7lpC+zOVN2OkeQ2RxPSebe01F3b3pB3WwKHoG5P5ND5mNxlhm9jzeUPFRHe7K24OIHzheSoREMicM-FidBxgTEI9zb3FDHuhUqG91AFxKhIeRot4Hoj8OrLGU9lq8xVQ0Hek0D4nR-j9EEWTxWtW2zltm1W4kW8x9rcU+i6jHSY1cZOxGca1LSn0sp7afQJJ1q7uQeb0Htj3IMZmUxy8ioQ0zmjMuRMm5gomulrNSzr5lrq1N73i3xAVvyfba77ILfauNKaV5+Znzw+iGe5UFWsVuX-fE7vBeLG3GzNMq9TOxep6D7B+hmZZBaIGB15tbCqH4f63Z1rRpc7dS05Yj+KXC6KspYgHa6CCwkxthnbS4tb44Tjv4K7OKSrK65j+i4jXhWQDpFrYEvRtppqdraBbo7qbB7pTqHrE78BUZIq9yqBtj3obrb5P7PpgCvrvpfCoD8GCFNjcoGhiEgZD4qBQC2AgilTyG56sbGDHwS6ZDZC9z5CFDXomTnBZwjK5y3A3DmDmBAA */
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
          always: [{ guard: 'isGameOver', target: '#brassGame.gameOver' }],
          on: {
            BUILD: { target: 'performingAction.building' },
            DEVELOP: { target: 'performingAction.developing' },
            SELL: { target: 'performingAction.selling' },
            TAKE_LOAN: { target: 'performingAction.takingLoan' },
            SCOUT: { target: 'performingAction.scouting' },
            NETWORK: { target: 'performingAction.networking' },
          },
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
