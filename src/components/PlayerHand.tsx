import { type Card } from '../data/cards';
import { type Player } from '../store/gameStore';
import { GameCard } from './GameCard';
import { Card as CardUI, CardContent, CardHeader, CardTitle } from './ui/card';

interface PlayerHandProps {
  player: Player;
  isCurrentPlayer: boolean;
  selectedCard?: Card | null;
  selectedCards?: Card[];
  onCardSelect?: (card: Card) => void;
}

export function PlayerHand({
  player,
  isCurrentPlayer,
  selectedCard,
  selectedCards,
  onCardSelect
}: PlayerHandProps) {
  const isCardSelected = (card: Card) => {
    if (selectedCards) {
      return selectedCards.some(sc => sc.id === card.id);
    }
    return selectedCard?.id === card.id;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {player.hand.map((card) => (
        <GameCard
          key={card.id}
          card={card}
          isSelected={isCardSelected(card)}
          onClick={() => onCardSelect?.(card)}
        />
      ))}
    </div>
  );
}