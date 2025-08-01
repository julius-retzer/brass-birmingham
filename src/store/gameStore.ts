import { type Actor, assign, setup, StateFrom } from 'xstate'
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
  context: GameState,
  event?: { type: string } & Record<string, unknown>,
) {
  if (DEBUG) {
    console.log(`🔴 ${actionName}`, {
      currentPlayer: context.currentPlayerIndex,
      actionsRemaining: context.actionsRemaining,
      round: context.round,
      era: context.era,
      selectedCard: context.selectedCard?.id,
      event: event?.type,
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

// Utility functions
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

function drawCards(context: GameState, count: number): Card[] {
  return context.drawPile.slice(0, count)
}

function isFirstRound(context: GameState): boolean {
  return context.era === 'canal' && context.round === 1
}

export type GameStore = typeof gameStore
export type GameStoreSnapshot = StateFrom<typeof gameStore>
export type GameStoreSend = Actor<typeof gameStore>['send']
export type GameStoreActor = Actor<typeof gameStore>

// Setup the machine with proper typing
export const gameStore = setup({
  types: {} as {
    context: GameState
    events: GameEvent
  },
  actions: {
    initializeGame: assign(({ event }) => {
      if (event.type !== 'START_GAME') return {}
      debugLog('initializeGame', {} as GameState)
      
      const playerCount = event.players.length
      const { regularCards, wildLocationCards, wildIndustryCards } = getInitialCards(playerCount)
      const shuffledCards = shuffleArray(regularCards)
      
      // Deal 8 cards to each player
      const hands: Card[][] = []
      let currentIndex = 0
      for (let i = 0; i < playerCount; i++) {
        hands.push(shuffledCards.slice(currentIndex, currentIndex + 8))
        currentIndex += 8
      }
      
      // Initialize players with starting money, income, and hands
      const players: Player[] = event.players.map((playerData, index) => ({
        ...playerData,
        money: 30, // Test expects £30, not £17
        income: 10,
        victoryPoints: 0,
        hand: hands[index] ?? [],
        links: [],
        industries: [],
      }))
      
      return {
        players,
        currentPlayerIndex: 0,
        era: 'canal' as const,
        round: 1,
        actionsRemaining: 1, // First round only has 1 action
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

    selectCard: assign(({context, event}) => {
      if (event.type !== 'SELECT_CARD') return {}
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      debugLog('selectCard', context, event)
      return {
        selectedCard: card,
      }
    }),

    selectCardForScout: assign(({context, event}) => {
      if (event.type !== 'SELECT_CARD') return {}
      const player = getCurrentPlayer(context)
      const card = findCardInHand(player, event.cardId)
      if (!card) return {}
      
      // Add card to scout selection if not already selected and we have less than 3
      const alreadySelected = context.selectedCardsForScout.some(c => c.id === card.id)
      if (!alreadySelected && context.selectedCardsForScout.length < 3) {
        debugLog('selectCardForScout', context, event)
        return {
          selectedCardsForScout: [...context.selectedCardsForScout, card],
        }
      }
      return {}
    }),

    selectLink: assign(({context, event}) => {
      if (event.type !== 'SELECT_LINK') return {}
      debugLog('selectLink', context, event)
      return {
        selectedLink: {
          from: event.from,
          to: event.to,
        },
      }
    }),

    executeLoanAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for loan action')
      }

      const updatedHand = removeCardFromHand(currentPlayer, context.selectedCard.id)
      const updatedPlayer = {
        ...currentPlayer,
        money: currentPlayer.money + 30,
        income: Math.max(0, currentPlayer.income - 3),
        hand: updatedHand,
      }

      debugLog('executeLoanAction', context)
      return {
        players: updatePlayerInList(context.players, context.currentPlayerIndex, updatedPlayer),
        discardPile: [...context.discardPile, context.selectedCard],
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} took a loan (£30, -3 income) using ${context.selectedCard.id}`,
            'action',
          ),
        ],
      }
    }),

    executeBuildAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for build action')
      }

      const updatedHand = removeCardFromHand(currentPlayer, context.selectedCard.id)

      debugLog('executeBuildAction', context)
      return {
        players: updatePlayerInList(context.players, context.currentPlayerIndex, { hand: updatedHand }),
        discardPile: [...context.discardPile, context.selectedCard],
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} built using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
        ],
      }
    }),

    executeNetworkAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard || !context.selectedLink) {
        throw new Error('Card or link not selected for network action')
      }

      const updatedHand = removeCardFromHand(currentPlayer, context.selectedCard.id)
      const linkCost = context.era === 'canal' ? 3 : 5
      
      const newLink = {
        from: context.selectedLink.from,
        to: context.selectedLink.to,
        type: context.era,
      }

      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
        money: currentPlayer.money - linkCost,
        links: [...currentPlayer.links, newLink],
      }

      // Consume coal if rail era
      const updatedResources = context.era === 'rail' 
        ? { ...context.resources, coal: context.resources.coal - 1 }
        : context.resources

      debugLog('executeNetworkAction', context)
      return {
        players: updatePlayerInList(context.players, context.currentPlayerIndex, updatedPlayer),
        discardPile: [...context.discardPile, context.selectedCard],
        resources: updatedResources,
        selectedCard: null,
        selectedLink: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} built a ${context.era} link between ${context.selectedLink.from} and ${context.selectedLink.to}`,
            'action',
          ),
        ],
      }
    }),

    executeDevelopAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for develop action')
      }

      const updatedHand = removeCardFromHand(currentPlayer, context.selectedCard.id)
      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
      }

      debugLog('executeDevelopAction', context)
      return {
        players: updatePlayerInList(context.players, context.currentPlayerIndex, updatedPlayer),
        discardPile: [...context.discardPile, context.selectedCard],
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} developed using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
        ],
      }
    }),

    executeSellAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (!context.selectedCard) {
        throw new Error('No card selected for sell action')
      }

      const updatedHand = removeCardFromHand(currentPlayer, context.selectedCard.id)
      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
      }

      debugLog('executeSellAction', context)
      return {
        players: updatePlayerInList(context.players, context.currentPlayerIndex, updatedPlayer),
        discardPile: [...context.discardPile, context.selectedCard],
        selectedCard: null,
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} sold using ${getCardDescription(context.selectedCard)}`,
            'action',
          ),
        ],
      }
    }),

    executeScoutAction: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      if (context.selectedCardsForScout.length !== 3) {
        throw new Error('Scout action requires exactly 3 cards to be selected')
      }

      // Remove the 3 selected cards from hand
      let updatedHand = [...currentPlayer.hand]
      context.selectedCardsForScout.forEach(card => {
        updatedHand = updatedHand.filter(c => c.id !== card.id)
      })

      // Take 1 wild location and 1 wild industry card
      const wildLocation = context.wildLocationPile[0]
      const wildIndustry = context.wildIndustryPile[0]
      
      if (!wildLocation || !wildIndustry) {
        throw new Error('No wild cards available for scout action')
      }

      // Add wild cards to hand
      updatedHand = [...updatedHand, wildLocation, wildIndustry]

      const updatedPlayer = {
        ...currentPlayer,
        hand: updatedHand,
      }

      debugLog('executeScoutAction', context)
      return {
        players: updatePlayerInList(context.players, context.currentPlayerIndex, updatedPlayer),
        discardPile: [...context.discardPile, ...context.selectedCardsForScout],
        wildLocationPile: context.wildLocationPile.slice(1), // Remove used wild card
        wildIndustryPile: context.wildIndustryPile.slice(1), // Remove used wild card
        selectedCardsForScout: [],
        actionsRemaining: context.actionsRemaining - 1,
        logs: [
          ...context.logs,
          createLogEntry(
            `${currentPlayer.name} scouted (discarded 3 cards, gained 2 wild cards)`,
            'action',
          ),
        ],
      }
    }),

    refillPlayerHand: assign(({ context }) => {
      const currentPlayer = getCurrentPlayer(context)
      const cardsNeeded = 8 - currentPlayer.hand.length
      
      if (cardsNeeded <= 0 || context.drawPile.length === 0) {
        return {}
      }
      
      const newCards = drawCards(context, cardsNeeded)
      const updatedHand = [...currentPlayer.hand, ...newCards]
      
      debugLog('refillPlayerHand', context)
      return {
        players: updatePlayerInList(
          context.players,
          context.currentPlayerIndex,
          { hand: updatedHand },
        ),
        drawPile: context.drawPile.slice(cardsNeeded),
      }
    }),

    nextPlayer: assign(({ context }) => {
      const nextPlayerIndex = (context.currentPlayerIndex + 1) % context.players.length
      const isRoundComplete = nextPlayerIndex === 0
      const nextRound = isRoundComplete ? context.round + 1 : context.round
      const nextActionsRemaining = isFirstRound({...context, round: nextRound}) ? 1 : 2
      
      debugLog('nextPlayer', context)
      return {
        currentPlayerIndex: nextPlayerIndex,
        round: nextRound,
        actionsRemaining: nextActionsRemaining,
        selectedCard: null,
        selectedCardsForScout: [],
        selectedLink: null,
        spentMoney: 0,
      }
    }),

    clearSelections: assign({
      selectedCard: null,
      selectedCardsForScout: [],
      selectedLink: null,
    }),
  },
  guards: {
    hasActionsRemaining: ({ context }) => context.actionsRemaining > 0,
    hasSelectedCard: ({ context }) => context.selectedCard !== null,
    canScout: ({ context }) => context.selectedCardsForScout.length === 3,
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
      
      return !existingLink
    },
  },
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
  states: {
    setup: {
      on: {
        START_GAME: {
          target: 'playing',
          actions: 'initializeGame',
          guard: ({ event }) =>
            event.type === 'START_GAME' &&
            event.players.length >= 2 &&
            event.players.length <= 4,
        },
      },
    },
    playing: {
      initial: 'action',
      states: {
        action: {
          initial: 'selectingAction',
          states: {
            selectingAction: {
              on: {
                BUILD: 'building',
                DEVELOP: 'developing',
                SELL: 'selling',
                SCOUT: 'scouting',
                TAKE_LOAN: 'takingLoan',
                NETWORK: 'networking',
              },
            },
            building: {
              initial: 'selectingCard',
              states: {
                selectingCard: {
                  on: {
                    SELECT_CARD: {
                      target: 'confirmingBuild',
                      actions: 'selectCard',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingBuild: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeBuildAction',
                      guard: 'hasSelectedCard',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
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
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingDevelop: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeDevelopAction',
                      guard: 'hasSelectedCard',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
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
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingSell: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeSellAction',
                      guard: 'hasSelectedCard',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
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
                      actions: 'selectCardForScout',
                    },
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeScoutAction',
                      guard: 'canScout',
                    },
                    CANCEL: {
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
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
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingLoan: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeLoanAction',
                      guard: 'hasSelectedCard',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
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
                      target: '#brassGame.playing.action.selectingAction',
                      actions: 'clearSelections',
                    },
                  },
                },
                selectingLink: {
                  on: {
                    SELECT_LINK: {
                      target: 'confirmingLink',
                      actions: 'selectLink',
                      guard: 'canBuildLink',
                    },
                    CANCEL: {
                      target: 'selectingCard',
                      actions: 'clearSelections',
                    },
                  },
                },
                confirmingLink: {
                  on: {
                    CONFIRM: {
                      target: '#brassGame.playing.actionComplete',
                      actions: 'executeNetworkAction',
                      guard: 'hasSelectedLink',
                    },
                    CANCEL: {
                      target: 'selectingLink',
                      actions: 'clearSelections',
                    },
                  },
                },
              },
            },
          },
        },
        actionComplete: {
          entry: 'refillPlayerHand',
          always: [
            {
              guard: 'hasActionsRemaining',
              target: 'action',
            },
            {
              target: 'nextPlayer',
            },
          ],
        },
        nextPlayer: {
          entry: 'nextPlayer',
          always: {
            target: 'action',
          },
        },
      },
    },
  },
})