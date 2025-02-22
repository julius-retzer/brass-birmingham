import { type Card, type Player } from '../store/gameStore';
import { GameCard } from './GameCard';
import { Card as CardUI, CardContent, CardHeader, CardTitle } from './ui/card';

interface PlayerHandProps {
  player: Player;
  isCurrentPlayer: boolean;
  selectedCard?: Card | null;
  onCardSelect?: (card: Card) => void;
}

export function PlayerHand({ player, isCurrentPlayer, selectedCard, onCardSelect }: PlayerHandProps) {
  return (
    <CardUI className={isCurrentPlayer ? 'border-primary' : ''}>
      <CardHeader>
        <CardTitle>{player.name}'s Hand</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {player.hand.map((card) => (
            <GameCard
              key={card.id}
              card={card}
              isSelected={selectedCard?.id === card.id}
              onClick={() => onCardSelect?.(card)}
            />
          ))}
        </div>
      </CardContent>
    </CardUI>
  );
}