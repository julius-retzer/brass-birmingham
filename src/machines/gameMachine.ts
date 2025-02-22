import { createMachine } from "xstate";
import { type Player, type GameState as GameStateType } from "~/types/player";

// Events that can occur in the game
export type GameEvent =
  | { type: "START_GAME"; players: Player[] }
  | { type: "PERFORM_ACTION"; action: GameAction }
  | { type: "END_TURN" }
  | { type: "END_ROUND" }
  | { type: "END_ERA" };

// Actions a player can take on their turn
export type GameAction =
  | "BUILD"
  | "NETWORK"
  | "DEVELOP"
  | "SELL"
  | "LOAN"
  | "SCOUT"
  | "PASS";

// Context holds the actual game state data
export interface GameContext extends GameStateType {
  // Additional context specific to the state machine
  availableActions: number; // Actions remaining in current turn
  lastAction?: GameAction; // Last action performed
}

export const gameMachine = createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCMBOBDWsDi6C2YAdAMboB26ANgKIaGwAu6qDASgPYCuZEAxANoAGALqJQAB3awAlg2nsyYkAA9EAdgBsATkJrBAZgCMAJn0AOYxuMAWNQBoQAT3WDrhQxuuvL1r4cNqAL6BDmiYOPhEpBQ0dOKU6I5gqAAqnKhkhADu6LLSZFAAYuyoAILEcgq8AArUrIUA8qwAsgD6pQDCKQCSDQByQqJIIJIylYrDqgj++oLuglrm+sYexmqGDs4InhqEGp6CawCsZoJm1mbBoRhYuAQk5FS06ITxiclpGYToFfJk1ckAGYlAh8QZKUZ5BRKKYzOaGBZLFZWdabRAaQRzfZeaw+PweK4gMK3SIPGLPV4JJKpdKZH7jAGoYGoUECQxDCRSKETUBTfQnPbrMz8hamLRqMxohC+I6EfRqazirRaC7mDEaQnEiL3aJPOhkMDKBjVKnJAQiCFc8YwxDWDT6Qh2sxqI7WWbyjQbJyINYO52K-1qZUaIOam7aqKPWIvA1Gk3vVBsjkjK1-G0IfQXQWGYVHUX6cWS70II5WQj+8U2DynXxh8J3SPkuhgHgcbhgi3DSHWyaIDwedyl2b2vy+KVmbS6XE5tSzN0KjUhInhhtkvUvFsQNs8JOWsZp3vSvSEI5GYyWQz6fQaMy3o5SvRuLSGHELMz+FWXJda1ebjpR55zWTbsD15H1BEMXQtBvMwji0I482MU5jClS8rxPCUzhDBCVlrb8V1JDBpGjegmBYbcO2A1NoUPCdILzTE3QsCCTC9LYAk9R1BCsYwEKdEw6xJe4iJIt5qU+TIcjyApijKX4qlqeomjaToen6cEu2onkVD7c9IK0bj3RWCDrxQ4sAgMQgDKsBFVU8Z1BIjQgRIpMSPlpb55P+IEQUgIC925dMTBWKzDIMYzLysVCNCONRQp4vibxMfRHNXFy4lNGkvnpP5GWZVl+HZAKezA6U80dG8XTzCdLH0VDEL2AJVlg-wJy-a560I3ISNjY1Mv8zT9xo0qENlSxSwVYxxSsKLzKvSD-HWPRzDWG9Fw6oSiHSmNDT6hNd0GwLD18OYnSqrDaui4x4SahCjGgwQjlSrriIpTcKIGzkhu02E9Di+DllqzNMUWVCtEsKzznlQ5BCWp78M64Ture1suB3QqqO+9NS2MOUkJfT1jldNi+00XHDBx0xbwLeDrGCJcyHYCA4CUH9ImK0CdIQABaDQpW5mxCExTF-GutR1lPBVnvuWAwAYThxA54audxKUprMdwbC0c5Fhva86YRza12jJWfp9U5s1zfNCyle1HWVZUTH2S83Wlxt11I5g2DRiBTfTe1ZQVB3DhnLWH14qzT2StQkLdV3Dac3VRMyiS-cPAzcdMN1nwseVQeLI5L3cA4-D0fstDd43XJTjypLkGSSnKEqUyx9Pyqzgsc1MIM6uLDE3EVWdNCDGxC+MSuk+rhMJM8hkfJZSA09KyLIOsKOLlsPM+b77irPFflLBi4dx4T1dJ-1Xb42pJeueWDWQxzEVwYLCV6rmB3lXlGnhW1ieAObVG7Yb58jdJbJ+YpX7FlnLja8hYeIBFLO1ZciMiB-n-ugYBiBYqoX5LKa8ehaYnGugESu21MEZhjhVZ0CELr2lQiYOYk1zwYlvAYCup8XokUYF7Ci5CY5xVdNoBEKxeIGRJtMCUDpDAA24vaZKipSHIwytPWk5DlRuAMJeVqHEiH1WPF4FEipwayKQWzJGr1lHiVrrkeuRRG5eXIbZXGmijA5h0RYaKnFZzwTgtoI4vET4bScttSkKjspeTyr5X2h1m6wjXg6XimIbxOnBqeTxbgxSFxfF4aCJCOHmJ6pfTK5DcSnUqjQmqdDzLXQ1jYFYmhPBrHOAbIJaUlEbkATwEp-IqHnUqb3diEodCemkTUvQlggj5KIFASI1AukxM5lMbBxYVjwUhm6GaVVFgpXpkAA */
  id: "brassGame",
  initial: "setup",
  context: {
    era: "Canal",
    round: 1,
    turnOrder: [],
    currentPlayer: 0,
    coalMarket: [1, 2, 3, 4, 5],
    ironMarket: [1, 2, 3, 4],
    availableResources: {
      coal: 24,
      iron: 24,
      beer: 24
    },
    availableActions: 0,
    lastAction: undefined
  } satisfies GameContext,
  states: {
    setup: {
      on: {
        START_GAME: {
          target: "canalEra",
          actions: ["initializeGame"]
        }
      }
    },
    canalEra: {
      initial: "startRound",
      states: {
        startRound: {
          always: {
            target: "playerTurn",
            actions: ["setupRound"]
          }
        },
        playerTurn: {
          initial: "waitingForAction",
          states: {
            waitingForAction: {
              on: {
                PERFORM_ACTION: {
                  target: "actionPerformed",
                  actions: ["performAction"]
                }
              }
            },
            actionPerformed: {
              always: [
                {
                  guard: "hasRemainingActions",
                  target: "waitingForAction"
                },
                {
                  target: "#brassGame.canalEra.nextPlayer"
                }
              ]
            }
          }
        },
        nextPlayer: {
          always: [
            {
              guard: "isLastPlayer",
              target: "endRound"
            },
            {
              target: "playerTurn",
              actions: ["nextPlayer"]
            }
          ]
        },
        endRound: {
          always: [
            {
              guard: "isLastRound",
              target: "#brassGame.endCanalEra"
            },
            {
              target: "startRound",
              actions: ["endRound"]
            }
          ]
        }
      }
    },
    endCanalEra: {
      always: {
        target: "railEra",
        actions: ["transitionToRailEra"]
      }
    },
    railEra: {
      initial: "startRound",
      states: {
        startRound: {
          always: {
            target: "playerTurn",
            actions: ["setupRound"]
          }
        },
        playerTurn: {
          initial: "waitingForAction",
          states: {
            waitingForAction: {
              on: {
                PERFORM_ACTION: {
                  target: "actionPerformed",
                  actions: ["performAction"]
                }
              }
            },
            actionPerformed: {
              always: [
                {
                  guard: "hasRemainingActions",
                  target: "waitingForAction"
                },
                {
                  target: "#brassGame.railEra.nextPlayer"
                }
              ]
            }
          }
        },
        nextPlayer: {
          always: [
            {
              guard: "isLastPlayer",
              target: "endRound"
            },
            {
              target: "playerTurn",
              actions: ["nextPlayer"]
            }
          ]
        },
        endRound: {
          always: [
            {
              guard: "isLastRound",
              target: "#brassGame.gameEnd"
            },
            {
              target: "startRound",
              actions: ["endRound"]
            }
          ]
        }
      }
    },
    gameEnd: {
      type: "final"
    }
  }
});

// Types for the machine
export type GameMachine = typeof gameMachine;
export type GameMachineState = typeof gameMachine.states;