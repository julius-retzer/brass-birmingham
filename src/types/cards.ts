import { type Industry } from './player';

// Base card interface
export interface Card {
  type: 'location' | 'industry' | 'wild';
}

// Location card - allows building in specific location
export interface LocationCard extends Card {
  type: 'location';
  location: string;
  // Some locations have multiple industries available
  availableIndustries: Industry[];
}

// Industry card - allows building specific industry in network
export interface IndustryCard extends Card {
  type: 'industry';
  industry: Industry;
}

// Wild card - can be used as any location or industry
export interface WildCard extends Card {
  type: 'wild';
  wildType: 'location' | 'industry';
}

// Union type of all possible cards
export type GameCard = LocationCard | IndustryCard | WildCard;