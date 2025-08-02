import type { GameState, Player } from '../gameStore'

export interface IndustryBuildResult {
  updatedPlayer: Player
  updatedPlayers: Player[]
  updatedCoalMarket: GameState['coalMarket']
  updatedIronMarket: GameState['ironMarket']
  logMessage: string
}