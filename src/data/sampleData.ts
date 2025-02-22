import { type Player, type GameState } from '~/types/player';

export const samplePlayers: Player[] = [
  {
    name: "Player 1",
    character: "Richard Arkwright",
    color: "#e63946", // Red
    money: 17,
    victoryPoints: 0,
    income: 10,
    hand: [],
    discardPile: [],
    playerMat: {
      "Cotton Mill": [],
      "Coal Mine": [],
      "Iron Works": [],
      "Manufacturer": [],
      "Pottery": [],
      "Brewery": []
    },
    builtIndustries: [],
    links: []
  },
  {
    name: "Player 2",
    character: "Eliza Tinsley",
    color: "#1d3557", // Blue
    money: 17,
    victoryPoints: 0,
    income: 10,
    hand: [],
    discardPile: [],
    playerMat: {
      "Cotton Mill": [],
      "Coal Mine": [],
      "Iron Works": [],
      "Manufacturer": [],
      "Pottery": [],
      "Brewery": []
    },
    builtIndustries: [],
    links: []
  }
];

export const sampleGameState: GameState = {
  era: "Canal",
  round: 1,
  turnOrder: samplePlayers,
  currentPlayer: 0,
  coalMarket: [1, 2, 3, 4, 5],
  ironMarket: [1, 2, 3, 4],
  availableResources: {
    coal: 24,
    iron: 24,
    beer: 24
  }
};