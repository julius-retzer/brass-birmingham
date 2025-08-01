import { Coins, TrendingUp, Trophy } from 'lucide-react'
import { type Card } from '../data/cards'
import { cn } from '../lib/utils'
import { type Player } from '../store/gameStore'
import { GameCard } from './GameCard'
import { Badge } from './ui/badge'
import { CardContent, CardHeader, CardTitle, Card as CardUI } from './ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'

interface PlayerStatsProps {
  player: Player
}

function PlayerStats({ player }: PlayerStatsProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Coins className="h-4 w-4" />
        <span>£{player.money}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <TrendingUp className="h-4 w-4" />
        <span>£{player.income}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Trophy className="h-4 w-4" />
        <span>{player.victoryPoints}</span>
      </div>
    </div>
  )
}

interface PlayerHandProps {
  player: Player
  selectedCard?: Card | null
  selectedCards?: Card[]
  onCardSelect?: (card: Card) => void
  currentAction?: string
  currentSubState?: string
}

export function PlayerHand({
  player,
  selectedCard,
  selectedCards,
  onCardSelect,
  currentAction,
  currentSubState,
}: PlayerHandProps) {
  const isCardSelected = (card: Card) => {
    if (selectedCards) {
      return selectedCards.some((sc) => sc.id === card.id)
    }
    return selectedCard?.id === card.id
  }

  const getCardTooltip = (card: Card) => {
    if (!currentAction) return 'No action selected'

    switch (currentAction) {
      case 'building':
        return 'Select this card to build an industry or location'
      case 'developing':
        return 'Select this card to develop an industry'
      case 'selling':
        return 'Select this card to sell'
      case 'takingLoan':
        return 'Select this card to discard and take a £30 loan'
      case 'scouting':
        if (selectedCards && selectedCards.length >= 3) {
          return 'Already selected 3 cards for scouting'
        }
        return `Select this card to discard for wild cards (${selectedCards?.length || 0}/3 selected)`
      case 'networking':
        return 'Select this card to discard for building a link'
      default:
        return 'Cannot select cards right now'
    }
  }

  return (
    <CardUI
      className={cn(
        'transition-colors duration-200',
        onCardSelect ? 'border-primary' : 'border-muted',
      )}
    >
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CardTitle>{player.name}&apos;s Hand</CardTitle>
            <Badge variant={onCardSelect ? 'default' : 'secondary'}>
              {currentAction ? currentSubState : 'Waiting'}
            </Badge>
          </div>
          <PlayerStats player={player} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TooltipProvider>
            {player.hand.map((card) => (
              <Tooltip key={card.id}>
                <TooltipTrigger asChild>
                  <div>
                    <GameCard
                      card={card}
                      isSelected={isCardSelected(card)}
                      onClick={() => onCardSelect?.(card)}
                      disabled={!onCardSelect}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{getCardTooltip(card)}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      </CardContent>
    </CardUI>
  )
}
