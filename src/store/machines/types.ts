import { type CityId } from '../../data/board';
import { type Card, type IndustryType } from '../../data/cards';

export type LogEntryType = 'system' | 'action' | 'info' | 'error';

export interface LogEntry {
  message: string;
  type: LogEntryType;
  timestamp: Date;
}

export interface Player {
  id: string;
  name: string;
  color: 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';
  character: 'Richard Arkwright' | 'Eliza Tinsley' | 'Isambard Kingdom Brunel' | 'George Stephenson' | 'Robert Owen' | 'Henry Bessemer';
  money: number;
  victoryPoints: number;
  income: number;
  hand: Card[];
  links: {
    from: CityId;
    to: CityId;
    type: 'canal' | 'rail';
  }[];
  industries: {
    location: CityId;
    type: IndustryType;
    level: number;
    flipped: boolean;
  }[];
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  era: 'canal' | 'rail';
  round: number;
  actionsRemaining: number;
  resources: {
    coal: number;
    iron: number;
    beer: number;
  };
  logs: LogEntry[];
  drawPile: Card[];
  discardPile: Card[];
  wildLocationPile: Card[];
  wildIndustryPile: Card[];
  selectedCard: Card | null;
  selectedCardsForScout: Card[];
  spentMoney: number;
  selectedLink: {
    from: CityId;
    to: CityId;
  } | null;
  secondLinkAllowed: boolean;
}

export function createLogEntry(message: string, type: LogEntryType): LogEntry {
  return {
    message,
    type,
    timestamp: new Date(),
  };
}

export function findCardInHand(player: Player, cardId: string): Card | null {
  return player.hand.find(card => card.id === cardId) ?? null;
}

export function removeCardFromHand(player: Player, cardId: string | undefined): Card[] {
  if (!cardId) return player.hand;
  return player.hand.filter(card => card.id !== cardId);
}

export function updatePlayerInList(players: Player[], currentPlayerIndex: number, updatedPlayer: Partial<Player>): Player[] {
  return players.map((player, index) =>
    index === currentPlayerIndex
      ? { ...player, ...updatedPlayer }
      : player
  );
}

export function getCurrentPlayer(context: GameState): Player {
  const player = context.players[context.currentPlayerIndex];
  if (!player) {
    throw new Error('Current player not found');
  }
  return player;
}