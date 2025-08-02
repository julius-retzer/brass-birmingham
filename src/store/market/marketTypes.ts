export interface CoalConsumptionResult {
  updatedPlayers: Array<{ id: string; name: string; color: string }>
  updatedCoalMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  coalCost: number
  logDetails: string[]
}

export interface IronConsumptionResult {
  updatedPlayers: Array<{ id: string; name: string; color: string }>
  updatedIronMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  ironCost: number
  logDetails: string[]
}

export interface MarketSellResult {
  updatedMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  cubesSold: number
  income: number
  logDetails: string[]
}