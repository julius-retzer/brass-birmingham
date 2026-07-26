import { type Card } from '../data/cards'
import { cn } from '../lib/utils'
import { type Player } from '../store/gameStore'
import { type FilteredPlayer } from '../server/stateFilter'
import { GameCard } from './GameCard'
import { Badge } from './ui/badge'
import { CardContent, CardHeader, CardTitle, Card as CardUI } from './ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'

interface PlayerHandProps {
  player: Player | FilteredPlayer
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
  // Check if this is a filtered player (opponent) without hand details
  const isFilteredPlayer = !('hand' in player) || player.hand === undefined
  const handCount = 'handCount' in player ? player.handCount : player.hand?.length || 0
  const playerHand = !isFilteredPlayer && player.hand ? player.hand : []

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
        onCardSelect && !isFilteredPlayer ? 'border-primary' : 'border-muted',
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Hand ({handCount} cards)</CardTitle>
          {onCardSelect && !isFilteredPlayer && (
            <Badge variant="default">
              {currentAction ? currentSubState : 'Select card'}
            </Badge>
          )}
          {isFilteredPlayer && (
            <Badge variant="secondary">
              Hidden (opponent)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isFilteredPlayer ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Opponent's hand is hidden</p>
            <p className="text-sm">Cards: {handCount}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TooltipProvider>
              {playerHand.map((card) => (
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
        )}
      </CardContent>
    </CardUI>
  )
}
