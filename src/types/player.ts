// Types for player characters
export type Character =
  | "Richard Arkwright"
  | "Eliza Tinsley"
  | "Isambard Kingdom Brunel"
  | "George Stephenson"
  | "Robert Owen"
  | "Henry Bessemer";

// Types for industries that can be on player mat
export type Industry =
  | "Cotton Mill"
  | "Coal Mine"
  | "Iron Works"
  | "Manufacturer"
  | "Pottery"
  | "Brewery";

// Type for a single industry tile on player mat or board
export interface IndustryTile {
  industry: Industry;
  level: number;
  flipped: boolean;
  // Resources on tile (coal/iron/beer)
  resources: number;
  // Victory points when flipped
  victoryPoints: number;
  // Income spaces to advance when flipped
  incomeIncrease: number;
  // Cost to build
  cost: number;
  // Required resources to build (coal/iron)
  requiredResources: {
    coal?: number;
    iron?: number;
  };
  // Required beer to sell (for Cotton/Manufacturer/Pottery)
  requiredBeerToSell?: number;
}

import { type GameCard } from './cards';

// Type for a player's state in the game
export interface Player {
  // Basic info
  name: string;
  character: Character;
  color: string;

  // Resources
  money: number;
  victoryPoints: number;
  income: number;

  // Cards in hand
  hand: GameCard[];
  discardPile: GameCard[];

  // Industry tiles on player mat
  playerMat: Record<Industry, IndustryTile[]>;

  // Industry tiles built on board
  builtIndustries: {
    location: string;
    tile: IndustryTile;
  }[];

  // Network links placed
  links: {
    from: string;
    to: string;
    type: "canal" | "rail";
  }[];
}

// Type for tracking game state
export interface GameState {
  era: "Canal" | "Rail";
  round: number;
  turnOrder: Player[];
  currentPlayer: number;

  // Market states
  coalMarket: number[];
  ironMarket: number[];

  // Resources available
  availableResources: {
    coal: number;
    iron: number;
    beer: number;
  };
}