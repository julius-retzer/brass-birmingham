import { Factory, MapPin, Sparkles } from 'lucide-react'
import { type Card as CardType } from '../data/cards'
import { cn } from '../lib/utils'
import { Card, CardContent } from './ui/card'

interface GameCardProps {
  card: CardType
  isSelected?: boolean
  onClick?: () => void
  disabled?: boolean
}

export function GameCard({
  card,
  isSelected = false,
  onClick,
  disabled = false,
}: GameCardProps) {
  const getCardIcon = () => {
    switch (card.type) {
      case 'location':
        return <MapPin className="h-5 w-5" />
      case 'industry':
        return <Factory className="h-5 w-5" />
      case 'wild_location':
      case 'wild_industry':
        return <Sparkles className="h-5 w-5" />
    }
  }

  const getCardTitle = () => {
    switch (card.type) {
      case 'location':
        return card.location.charAt(0).toUpperCase() + card.location.slice(1)
      case 'industry':
        return card.industries
          .map((i) => i.charAt(0).toUpperCase() + i.slice(1))
          .join(' / ')
      case 'wild_location':
        return 'Wild Location'
      case 'wild_industry':
        return 'Wild Industry'
    }
  }

  const getCardColor = () => {
    if (card.type === 'location') {
      switch (card.color) {
        case 'blue':
          return 'bg-blue-100 dark:bg-blue-900'
        case 'teal':
          return 'bg-teal-100 dark:bg-teal-900'
        default:
          return 'bg-gray-100 dark:bg-gray-800'
      }
    }
    if (card.type === 'industry') {
      return 'bg-amber-100 dark:bg-amber-900'
    }
    return 'bg-purple-100 dark:bg-purple-900' // Wild cards
  }

  return (
    <Card
      className={cn(
        'transition-all',
        getCardColor(),
        isSelected && 'ring-2 ring-primary ring-offset-2',
        !disabled && 'hover:scale-105 cursor-pointer',
        disabled && 'opacity-70 cursor-not-allowed',
      )}
      onClick={disabled ? undefined : onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {getCardIcon()}
          <h3 className="font-semibold">{getCardTitle()}</h3>
        </div>
        {card.type === 'location' && (
          <div className="text-sm">
            <span
              className={cn(
                'inline-block px-2 py-1 rounded-full text-xs',
                card.color === 'blue'
                  ? 'bg-blue-200 dark:bg-blue-800'
                  : card.color === 'teal'
                    ? 'bg-teal-200 dark:bg-teal-800'
                    : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              {card.color.charAt(0).toUpperCase() + card.color.slice(1)}
            </span>
          </div>
        )}
        {card.type === 'industry' && (
          <div className="text-sm space-y-1">
            {card.industries.map((industry, index) => (
              <span
                key={index}
                className="inline-block px-2 py-1 rounded-full text-xs bg-amber-200 dark:bg-amber-800 mr-1"
              >
                {industry.charAt(0).toUpperCase() + industry.slice(1)}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
