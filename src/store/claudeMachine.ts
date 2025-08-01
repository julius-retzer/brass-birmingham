import { assign, fromCallback, or, setup } from 'xstate'

// TYPES

// Game eras
export type Era = 'Canal' | 'Rail'

// Industry types
export type IndustryType =
  | 'CottonMill'
  | 'CoalMine'
  | 'IronWorks'
  | 'Manufacturer'
  | 'Pottery'
  | 'Brewery'

// Actions a player can take
export type ActionType =
  | 'Build'
  | 'Network'
  | 'Develop'
  | 'Sell'
  | 'Loan'
  | 'Scout'
  | 'Pass'

// Card types
export type CardType = 'Location' | 'Industry' | 'WildLocation' | 'WildIndustry'

// Card representation
export interface Card {
  type: CardType
  value: string // Location name or industry type
  playerCount?: number // Minimum player count for this card
}

// Industry tile representation
export interface IndustryTile {
  id: string
  type: IndustryType
  level: number
  flipped: boolean
  resources: number // Coal for CoalMine, Iron for IronWorks, Beer for Brewery
  location?: string // Location on board if built
  vp: number // Victory points when flipped
  incomeIncrease: number // Income spaces to move when flipped
  cost: number // Cost to build
  beerRequired: number // Beer required to sell (for Cotton Mills, Manufacturers, Potteries)
  requiresCoal: boolean // Whether building requires coal
  requiresIron: boolean // Whether building requires iron
  canBuildInCanalEra: boolean
  canBuildInRailEra: boolean
}

// Link tile representation
export interface LinkTile {
  type: 'Canal' | 'Rail'
  from: string
  to: string
  ownerId: string
}

// Player representation
export interface Player {
  id: string
  name: string
  character: string
  color: string
  money: number
  income: number
  vp: number
  industryTiles: IndustryTile[] // Tiles on player mat
  builtIndustries: IndustryTile[] // Tiles on the board
  links: LinkTile[] // Links on the board
  hand: Card[]
  discard: Card[]
  moneySpentThisRound: number
}

// Location on the board
export interface Location {
  name: string
  industries: IndustryType[] // Available industry spaces
  spaces: number // Total spaces available
  occupied: number // Currently occupied spaces
  connections: {
    canal: string[]
    rail: string[]
  }
  hasMerchant: boolean
}

// Merchant representation
export interface Merchant {
  location: string
  industryType: IndustryType
  bonus: {
    type: 'Develop' | 'Income' | 'VictoryPoints' | 'Money'
    value: number
  }
  hasBeer: boolean
}

// Market for coal and iron
export interface Market {
  coal: (number | null)[] // Prices, null means empty space
  iron: (number | null)[] // Prices, null means empty space
}

// Context for the state machine
export interface BrassMachineContext {
  players: Player[]
  currentPlayerIndex: number
  round: number
  era: Era
  actionsRemaining: number
  turnOrder: string[] // Player IDs in turn order
  locations: Record<string, Location>
  merchants: Merchant[]
  market: Market
  drawDeck: Card[]
  wildLocationCards: Card[]
  wildIndustryCards: Card[]
  playerCount: number
  winningPlayerId?: string
  selectedAction?: ActionType
  selectedCard?: Card
  selectedLocation?: string
  selectedIndustry?: IndustryType
  selectedLink?: { from: string; to: string }
}

// Events for the state machine
export type BrassMachineEvents =
  | { type: 'START_GAME'; playerCount: number; playerNames: string[] }
  | { type: 'SELECT_ACTION'; action: ActionType }
  | { type: 'SELECT_CARD'; card: Card }
  | { type: 'SELECT_LOCATION'; location: string }
  | { type: 'SELECT_INDUSTRY'; industry: IndustryType }
  | { type: 'SELECT_LINK'; from: string; to: string }
  | { type: 'CONFIRM_ACTION' }
  | { type: 'CANCEL_ACTION' }

// Create initial context
function createInitialContext(
  playerCount: number,
  playerNames: string[],
): BrassMachineContext {
  // Initialize players with starting money, income, etc.
  const players = playerNames.map((name, index) => ({
    id: `player-${index}`,
    name,
    character:
      [
        'Richard Arkwright',
        'Eliza Tinsley',
        'Isambard Kingdom Brunel',
        'George Stephenson',
      ][index] ?? 'Richard Arkwright',
    color: ['red', 'blue', 'green', 'yellow'][index] ?? 'red',
    money: 17, // Starting money
    income: 10, // Starting income level
    vp: 0,
    industryTiles: [], // Would initialize with proper industry tiles
    builtIndustries: [],
    links: [],
    hand: [], // Would initialize with 8 cards from the draw deck
    discard: [], // Would initialize with 1 card face down
    moneySpentThisRound: 0,
  }))

  // In a real implementation, we would initialize locations, merchants, etc.
  // Simplified for this example

  return {
    players,
    currentPlayerIndex: 0,
    round: 1,
    era: 'Canal',
    actionsRemaining: 1, // First round of Canal Era has only 1 action
    turnOrder: players.map((p) => p.id),
    locations: {}, // Would initialize with the board locations
    merchants: [], // Would initialize with merchants
    market: {
      coal: [null, 1, 2, 3, 4], // Initialize with coal prices
      iron: [1, 1, 2, 3, 4], // Initialize with iron prices
    },
    drawDeck: [], // Would initialize with shuffled deck
    wildLocationCards: [], // Would initialize with wild location cards
    wildIndustryCards: [], // Would initialize with wild industry cards
    playerCount,
  }
}

// Main state machine
export const brassMachine = setup({
  types: {
    context: {} as BrassMachineContext,
    events: {} as BrassMachineEvents,
  },
  guards: {
    'is first round of canal era': ({ context }) =>
      context?.era === 'Canal' && context?.round === 1,
    'is last round of era': ({ context }) => {
      if (!context) return false
      const maxRounds =
        context.playerCount === 2 ? 10 : context.playerCount === 3 ? 9 : 8
      return context.round === maxRounds
    },
    'is canal era': ({ context }) => context?.era === 'Canal',
    'is rail era': ({ context }) => context?.era === 'Rail',
    'has actions remaining': ({ context }) =>
      !!context && context.actionsRemaining > 0,
    'all players have taken turns': ({ context }) =>
      !!context && context.currentPlayerIndex >= context.players.length - 1,
    'can build': ({ context }) => {
      if (!context) return false
      // Logic to check if player can build with current selections
      return true // Simplified for example
    },
    'can network': ({ context }) => {
      if (!context) return false
      // Logic to check if player can build a network link
      return true // Simplified for example
    },
    'can develop': ({ context }) => {
      if (!context) return false
      // Logic to check if player can develop
      return true // Simplified for example
    },
    'can sell': ({ context }) => {
      if (!context) return false
      // Logic to check if player can sell
      return true // Simplified for example
    },
    'can loan': ({ context }) => {
      // Logic to check if player can take a loan
      const player = context.players[context.currentPlayerIndex]
      if (!player) return false
      return player.income > -7 // Can't go below level -10, and loan reduces by 3
    },
    'can scout': ({ context }) => {
      // Logic to check if player can scout (has no wild cards in hand)
      const player = context.players[context.currentPlayerIndex]
      if (!player) return false
      return !player.hand.some((card) => card.type.includes('Wild'))
    },
  },
  actions: {
    'initialize game': assign(({ event }) => {
      if (event.type === 'START_GAME') {
        return createInitialContext(event.playerCount, event.playerNames)
      }
      return {}
    }),
    'select action': assign(({ event }) =>
      event.type === 'SELECT_ACTION' ? { selectedAction: event.action } : {},
    ),
    'select card': assign(({ event }) =>
      event.type === 'SELECT_CARD' ? { selectedCard: event.card } : {},
    ),
    'select location': assign(({ event }) =>
      event.type === 'SELECT_LOCATION'
        ? { selectedLocation: event.location }
        : {},
    ),
    'select industry': assign(({ event }) =>
      event.type === 'SELECT_INDUSTRY'
        ? { selectedIndustry: event.industry }
        : {},
    ),
    'select link': assign(({ event }) =>
      event.type === 'SELECT_LINK'
        ? { selectedLink: { from: event.from, to: event.to } }
        : {},
    ),
    'clear action selection': assign({
      selectedAction: undefined,
      selectedCard: undefined,
      selectedLocation: undefined,
      selectedIndustry: undefined,
      selectedLink: undefined,
    }),
    'perform build': assign(({ context }) => {
      // Implementation of build action
      // Would place industry tile, consume resources, update player money, etc.

      return {
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),
    'perform network': assign(({ context }) => {
      // Implementation of network action
      // Would place link tile, consume coal if rail link, update player money, etc.

      return {
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),
    'perform develop': assign(({ context }) => {
      // Implementation of develop action
      // Would remove industry tiles from player mat, consume iron, etc.

      return {
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),
    'perform sell': assign(({ context }) => {
      // Implementation of sell action
      // Would flip industry tiles, consume beer, increase income, etc.

      return {
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),
    'perform loan': assign(({ context }) => {
      if (!context) return {}

      // Implementation of loan action
      const currentPlayer = context.players[context.currentPlayerIndex]

      // Create a new players array with the updated player
      const updatedPlayers = context.players.map((player, index) => {
        if (index === context.currentPlayerIndex) {
          return {
            ...player,
            money: player.money + 30,
            income: player.income - 3,
          }
        }
        return player
      })

      return {
        players: updatedPlayers,
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),
    'perform scout': assign(({ context }) => {
      // Implementation of scout action
      // Would discard 3 cards, add 2 wild cards to hand

      return {
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),
    'perform pass': assign(({ context }) => {
      // Implementation of pass action
      // Just discard a card and skip action

      return {
        actionsRemaining: context.actionsRemaining - 1,
      }
    }),
    'next player': assign(({ context }) => {
      if (!context) return {}

      return {
        currentPlayerIndex:
          (context.currentPlayerIndex + 1) % context.players.length,
        actionsRemaining:
          context.era === 'Canal' && context.round === 1 ? 1 : 2,
      }
    }),
    'reset current player': assign({
      currentPlayerIndex: 0,
    }),
    'increment round': assign(({ context }) => {
      if (!context) return {}

      return {
        round: context.round + 1,
      }
    }),
    'change era': assign({
      era: 'Rail',
      round: 1,
    }),
    'determine turn order': assign(({ context }) => {
      if (!context) return {}

      // Sort players by money spent this round (ascending)
      const playersBySpending = [...context.players]
        .sort((a, b) => a.moneySpentThisRound - b.moneySpentThisRound)
        .map((p) => p.id)

      // Reset money spent
      const updatedPlayers = context.players.map((player) => ({
        ...player,
        moneySpentThisRound: 0,
      }))

      return {
        turnOrder: playersBySpending,
        players: updatedPlayers,
      }
    }),
    'collect income': assign(({ context }) => {
      if (!context) return {}

      return {
        players: context.players.map((player) => {
          let updatedMoney = player.money + player.income
          let updatedVP = player.vp

          // Handle negative income and shortfall
          if (player.income < 0 && updatedMoney < 0) {
            const shortfall = Math.abs(updatedMoney)
            // Logic to remove industry tiles or lose VPs would go here
            // For now, just lose VPs
            updatedVP = Math.max(0, updatedVP - shortfall)
            updatedMoney = 0
          }

          return {
            ...player,
            money: updatedMoney,
            vp: updatedVP,
          }
        }),
      }
    }),
    'score canal links': assign({
      players: ({ context }) => {
        // Score canal links based on adjacent locations
        return context.players.map((player) => {
          // Calculate VP for links
          // This would involve checking each link and adjacent locations
          const linkVP = 0 // Simplified for example

          return {
            ...player,
            vp: player.vp + linkVP,
            links: player.links.filter((link) => link.type !== 'Canal'),
          }
        })
      },
    }),
    'score rail links': assign({
      players: ({ context }) => {
        // Score rail links based on adjacent locations
        return context.players.map((player) => {
          // Calculate VP for links
          // This would involve checking each link and adjacent locations
          const linkVP = 0 // Simplified for example

          return {
            ...player,
            vp: player.vp + linkVP,
            links: [],
          }
        })
      },
    }),
    'score flipped industries': assign({
      players: ({ context }) => {
        // Score flipped industries based on VP value
        return context.players.map((player) => {
          const industryVP = player.builtIndustries
            .filter((industry) => industry.flipped)
            .reduce((total, industry) => total + industry.vp, 0)

          return {
            ...player,
            vp: player.vp + industryVP,
          }
        })
      },
    }),
    'remove obsolete industries': assign({
      players: ({ context }) => {
        // Remove level 1 industries from the board at the end of Canal Era
        return context.players.map((player) => ({
          ...player,
          builtIndustries: player.builtIndustries.filter(
            (industry) => industry.level > 1,
          ),
        }))
      },
    }),
    'reset merchant beer': assign({
      merchants: ({ context }) => {
        // Reset beer barrels on merchants
        return context.merchants.map((merchant) => ({
          ...merchant,
          hasBeer: true,
        }))
      },
    }),
    'shuffle draw deck': assign({
      // Collect all discard piles and shuffle them into draw deck
      drawDeck: ({ context }) => {
        const allCards = context.players.flatMap((player) => player.discard)
        // Would implement shuffle logic here
        return allCards
      },
      players: ({ context }) => {
        // Clear all discard piles
        return context.players.map((player) => ({
          ...player,
          discard: [],
        }))
      },
    }),
    'draw new hands': assign({
      players: ({ context }) => {
        // Draw 8 cards for each player
        // This is simplified and would need proper implementation
        return context.players.map((player) => ({
          ...player,
          hand: context.drawDeck.slice(0, 8),
        }))
      },
      drawDeck: ({ context }) => {
        // Remove cards from draw deck that were dealt to players
        return context.drawDeck.slice(context.players.length * 8)
      },
    }),
    'determine winner': assign(({ context }) => {
      if (!context) return {}

      // Find player with most VPs
      const sortedPlayers = [...context.players].sort((a, b) => b.vp - a.vp)

      if (sortedPlayers.length === 0) return {}

      // If tied, break by income
      if (
        sortedPlayers.length > 1 &&
        sortedPlayers[0]?.vp === sortedPlayers[1]?.vp
      ) {
        const highestVP = sortedPlayers[0]?.vp
        const tiedPlayers = sortedPlayers.filter((p) => p.vp === highestVP)
        tiedPlayers.sort((a, b) => b.income - a.income)

        // If still tied, break by money
        if (
          tiedPlayers.length > 1 &&
          tiedPlayers[0]?.income === tiedPlayers[1]?.income
        ) {
          const highestIncome = tiedPlayers[0]?.income
          const stillTiedPlayers = tiedPlayers.filter(
            (p) => p.income === highestIncome,
          )
          stillTiedPlayers.sort((a, b) => b.money - a.money)

          return { winningPlayerId: stillTiedPlayers[0]?.id }
        }

        return { winningPlayerId: tiedPlayers[0]?.id }
      }

      return { winningPlayerId: sortedPlayers[0]?.id }
    }),
  },
}).createMachine({
  id: 'BrassBirminghamGame',
  context: {} as BrassMachineContext,
  initial: 'GameSetup',
  states: {
    GameSetup: {
      on: {
        START_GAME: {
          actions: 'initialize game',
          target: 'CanalEra',
        },
      },
    },
    CanalEra: {
      initial: 'Round',
      states: {
        Round: {
          initial: 'PlayerTurn',
          states: {
            PlayerTurn: {
              initial: 'SelectAction',
              states: {
                SelectAction: {
                  on: {
                    SELECT_ACTION: {
                      actions: 'select action',
                      target: 'ProcessAction',
                    },
                  },
                },
                ProcessAction: {
                  always: [
                    {
                      guard: ({ context }) =>
                        context.selectedAction === 'Build',
                      target: 'BuildAction',
                    },
                    {
                      guard: ({ context }) =>
                        context.selectedAction === 'Network',
                      target: 'NetworkAction',
                    },
                    {
                      guard: ({ context }) =>
                        context.selectedAction === 'Develop',
                      target: 'DevelopAction',
                    },
                    {
                      guard: ({ context }) => context.selectedAction === 'Sell',
                      target: 'SellAction',
                    },
                    {
                      guard: ({ context }) => context.selectedAction === 'Loan',
                      target: 'LoanAction',
                    },
                    {
                      guard: ({ context }) =>
                        context.selectedAction === 'Scout',
                      target: 'ScoutAction',
                    },
                    {
                      guard: ({ context }) => context.selectedAction === 'Pass',
                      target: 'PassAction',
                    },
                  ],
                },
                BuildAction: {
                  initial: 'SelectCard',
                  states: {
                    SelectCard: {
                      on: {
                        SELECT_CARD: {
                          actions: 'select card',
                          target: 'SelectLocation',
                        },
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                    SelectLocation: {
                      on: {
                        SELECT_LOCATION: {
                          actions: 'select location',
                          target: 'SelectIndustry',
                        },
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                    SelectIndustry: {
                      on: {
                        SELECT_INDUSTRY: {
                          actions: 'select industry',
                          target: 'ConfirmBuild',
                        },
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                    ConfirmBuild: {
                      on: {
                        CONFIRM_ACTION: [
                          {
                            guard: 'can build',
                            actions: 'perform build',
                            target:
                              '#BrassBirminghamGame.CanalEra.Round.CheckActionsRemaining',
                          },
                        ],
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                  },
                },
                NetworkAction: {
                  initial: 'SelectLink',
                  states: {
                    SelectLink: {
                      on: {
                        SELECT_LINK: {
                          actions: 'select link',
                          target: 'ConfirmNetwork',
                        },
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                    ConfirmNetwork: {
                      on: {
                        CONFIRM_ACTION: [
                          {
                            guard: 'can network',
                            actions: 'perform network',
                            target:
                              '#BrassBirminghamGame.CanalEra.Round.CheckActionsRemaining',
                          },
                        ],
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                  },
                },
                DevelopAction: {
                  initial: 'SelectIndustry',
                  states: {
                    SelectIndustry: {
                      on: {
                        SELECT_INDUSTRY: {
                          actions: 'select industry',
                          target: 'ConfirmDevelop',
                        },
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                    ConfirmDevelop: {
                      on: {
                        CONFIRM_ACTION: [
                          {
                            guard: 'can develop',
                            actions: 'perform develop',
                            target:
                              '#BrassBirminghamGame.CanalEra.Round.CheckActionsRemaining',
                          },
                        ],
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                  },
                },
                SellAction: {
                  initial: 'SelectIndustry',
                  states: {
                    SelectIndustry: {
                      on: {
                        SELECT_INDUSTRY: {
                          actions: 'select industry',
                          target: 'ConfirmSell',
                        },
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                    ConfirmSell: {
                      on: {
                        CONFIRM_ACTION: [
                          {
                            guard: 'can sell',
                            actions: 'perform sell',
                            target:
                              '#BrassBirminghamGame.CanalEra.Round.CheckActionsRemaining',
                          },
                        ],
                        CANCEL_ACTION: {
                          actions: 'clear action selection',
                          target:
                            '#BrassBirminghamGame.CanalEra.Round.PlayerTurn.SelectAction',
                        },
                      },
                    },
                  },
                },
                LoanAction: {
                  on: {
                    CONFIRM_ACTION: [
                      {
                        guard: 'can loan',
                        actions: 'perform loan',
                        target:
                          '#BrassBirminghamGame.CanalEra.Round.CheckActionsRemaining',
                      },
                    ],
                    CANCEL_ACTION: {
                      actions: 'clear action selection',
                      target: 'SelectAction',
                    },
                  },
                },
                ScoutAction: {
                  on: {
                    CONFIRM_ACTION: [
                      {
                        guard: 'can scout',
                        actions: 'perform scout',
                        target:
                          '#BrassBirminghamGame.CanalEra.Round.CheckActionsRemaining',
                      },
                    ],
                    CANCEL_ACTION: {
                      actions: 'clear action selection',
                      target: 'SelectAction',
                    },
                  },
                },
                PassAction: {
                  entry: 'perform pass',
                  always: {
                    target:
                      '#BrassBirminghamGame.CanalEra.Round.CheckActionsRemaining',
                  },
                },
              },
            },
            CheckActionsRemaining: {
              always: [
                {
                  guard: 'has actions remaining',
                  actions: 'clear action selection',
                  target: 'PlayerTurn',
                },
                {
                  target: 'EndTurn',
                },
              ],
            },
            EndTurn: {
              entry: 'next player',
              always: [
                {
                  guard: 'all players have taken turns',
                  target: 'EndRound',
                },
                {
                  target: 'PlayerTurn',
                },
              ],
            },
            EndRound: {
              entry: [
                'determine turn order',
                'collect income',
                'reset current player',
                'increment round',
              ],
              always: [
                {
                  guard: 'is last round of era',
                  target: '#BrassBirminghamGame.EndOfCanalEra',
                },
                {
                  target: 'PlayerTurn',
                },
              ],
            },
          },
        },
      },
    },
    EndOfCanalEra: {
      entry: [
        'score canal links',
        'score flipped industries',
        'remove obsolete industries',
        'reset merchant beer',
        'shuffle draw deck',
        'draw new hands',
        'change era',
      ],
      always: {
        target: 'RailEra',
      },
    },
    RailEra: {
      initial: 'Round',
      states: {
        Round: {
          initial: 'PlayerTurn',
          states: {
            PlayerTurn: {
              // Similar to Canal Era but with Rail Era specific rules
              // For brevity, using a simplified implementation
              on: {
                SELECT_ACTION: {
                  actions: 'select action',
                  target: 'CheckActionsRemaining',
                },
              },
            },
            CheckActionsRemaining: {
              always: [
                {
                  guard: 'has actions remaining',
                  actions: 'clear action selection',
                  target: 'PlayerTurn',
                },
                {
                  target: 'EndTurn',
                },
              ],
            },
            EndTurn: {
              entry: 'next player',
              always: [
                {
                  guard: 'all players have taken turns',
                  target: 'EndRound',
                },
                {
                  target: 'PlayerTurn',
                },
              ],
            },
            EndRound: {
              entry: [
                'determine turn order',
                'collect income',
                'reset current player',
                'increment round',
              ],
              always: [
                {
                  guard: 'is last round of era',
                  target: '#BrassBirminghamGame.EndOfRailEra',
                },
                {
                  target: 'PlayerTurn',
                },
              ],
            },
          },
        },
      },
    },
    EndOfRailEra: {
      entry: [
        'score rail links',
        'score flipped industries',
        'determine winner',
      ],
      always: {
        target: 'GameEnd',
      },
    },
    GameEnd: {
      type: 'final',
    },
  },
})
