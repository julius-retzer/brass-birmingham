'use client'

import { Search, MapPin, Factory, Shuffle, Eye } from 'lucide-react'
import React from 'react'
import { type Card, type IndustryCard, type LocationCard, type WildCard, type IndustryType } from '~/data/cards'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'
import { Separator } from '../ui/separator'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'
import { cn } from '~/lib/utils'

interface ImprovedCardSelectorProps {
  cards: Card[]
  selectedCard?: Card | null
  selectedCards?: Card[] // For multi-select (scout action)
  onCardSelect: (card: Card) => void
  onCardToggle?: (card: Card) => void // For multi-select
  actionType: 'build' | 'develop' | 'sell' | 'network' | 'scout' | 'loan'
  maxSelections?: number
  searchEnabled?: boolean
  filterEnabled?: boolean
  previewEnabled?: boolean
}

interface CardGrouped {
  location: LocationCard[]
  industry: IndustryCard[]
  wild: WildCard[]
}

const actionConfig = {
  build: {
    title: 'Select Card to Build',
    description: 'Choose a location or industry card',
    allowedTypes: ['location', 'industry', 'wild_location', 'wild_industry'],
    icon: Factory
  },
  develop: {
    title: 'Select Card to Develop',
    description: 'Choose any card to discard for development',
    allowedTypes: ['location', 'industry', 'wild_location', 'wild_industry'],
    icon: Factory
  },
  sell: {
    title: 'Select Card to Sell',
    description: 'Choose a card to discard for selling',
    allowedTypes: ['location', 'industry', 'wild_location', 'wild_industry'],
    icon: Factory
  },
  network: {
    title: 'Select Card for Network',
    description: 'Choose a card to discard for networking',
    allowedTypes: ['location', 'industry', 'wild_location', 'wild_industry'],
    icon: Factory
  },
  scout: {
    title: 'Select Cards to Scout',
    description: 'Choose 3 cards to discard for scouting',
    allowedTypes: ['location', 'industry', 'wild_location', 'wild_industry'],
    icon: Eye
  },
  loan: {
    title: 'Select Card for Loan',
    description: 'Choose a card to discard for a loan',
    allowedTypes: ['location', 'industry', 'wild_location', 'wild_industry'],
    icon: Factory
  }
}

const getCardIcon = (card: Card) => {
  switch (card.type) {
    case 'location':
    case 'wild_location':
      return '📍'
    case 'industry':
      return getIndustryIcon((card as IndustryCard).industryType)
    case 'wild_industry':
      return '🏭'
    default:
      return '❓'
  }
}

const getIndustryIcon = (type: IndustryType) => {
  const icons = {
    cotton: '🧵',
    coal: '⚫',
    iron: '🔩',
    manufacturer: '🏭',
    pottery: '🏺',
    brewery: '🍺',
  }
  return icons[type] || '🏭'
}

const getCardColor = (card: Card) => {
  switch (card.type) {
    case 'location':
      return 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 hover:bg-blue-200 dark:hover:bg-blue-800/40 text-blue-900 dark:text-blue-100'
    case 'industry':
      return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-600 hover:bg-green-200 dark:hover:bg-green-800/40 text-green-900 dark:text-green-100'
    case 'wild_location':
      return 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-600 hover:bg-purple-200 dark:hover:bg-purple-800/40 text-purple-900 dark:text-purple-100'
    case 'wild_industry':
      return 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-600 hover:bg-orange-200 dark:hover:bg-orange-800/40 text-orange-900 dark:text-orange-100'
    default:
      return 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
  }
}

function CardPreview({ card }: { card: Card }) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{getCardIcon(card)}</span>
        <div>
          <h4 className="font-semibold capitalize">
            {card.type === 'location' || card.type === 'wild_location' 
              ? (card as LocationCard).location 
              : card.type === 'industry'
              ? (card as IndustryCard).industryType
              : 'Wild Card'}
          </h4>
          <p className="text-xs text-muted-foreground">
            {card.type.replace('_', ' ')} card
          </p>
        </div>
      </div>
      
      {card.type === 'industry' && (
        <div className="text-xs text-muted-foreground">
          <p>Industry Type: {(card as IndustryCard).industryType}</p>
        </div>
      )}
      
      {(card.type === 'location' || card.type === 'wild_location') && (
        <div className="text-xs text-muted-foreground">
          <p>Location: {(card as LocationCard).location}</p>
        </div>
      )}
    </div>
  )
}

function CardItem({ 
  card, 
  isSelected, 
  isMultiSelect, 
  onSelect, 
  previewEnabled,
  isDisabled 
}: {
  card: Card
  isSelected: boolean
  isMultiSelect: boolean
  onSelect: () => void
  previewEnabled: boolean
  isDisabled?: boolean
}) {
  const cardContent = (
    <div
      className={cn(
        'p-3 border rounded-lg cursor-pointer transition-all duration-200',
        getCardColor(card),
        isSelected && 'ring-2 ring-primary ring-offset-2',
        isDisabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={!isDisabled ? onSelect : undefined}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{getCardIcon(card)}</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">
            {card.type === 'location' || card.type === 'wild_location' 
              ? (card as LocationCard).location 
              : card.type === 'industry'
              ? (card as IndustryCard).industryType
              : 'Wild Card'}
          </h4>
          <p className="text-xs text-muted-foreground capitalize">
            {card.type.replace('_', ' ')}
          </p>
        </div>
        {isMultiSelect && isSelected && (
          <Badge variant="default" className="text-xs">
            Selected
          </Badge>
        )}
      </div>
    </div>
  )

  if (previewEnabled) {
    return (
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          {cardContent}
        </HoverCardTrigger>
        <HoverCardContent side="left" className="w-64">
          <CardPreview card={card} />
        </HoverCardContent>
      </HoverCard>
    )
  }

  return cardContent
}

export function ImprovedCardSelector({
  cards,
  selectedCard,
  selectedCards = [],
  onCardSelect,
  onCardToggle,
  actionType,
  maxSelections = 1,
  searchEnabled = true,
  filterEnabled = true,
  previewEnabled = true
}: ImprovedCardSelectorProps) {
  const [searchTerm, setSearchTerm] = React.useState('')
  const [activeTab, setActiveTab] = React.useState('all')
  
  const config = actionConfig[actionType]
  const isMultiSelect = actionType === 'scout'
  
  // Group cards by type
  const groupedCards: CardGrouped = React.useMemo(() => {
    const filtered = cards.filter(card => {
      // Filter by allowed types for this action
      if (!config.allowedTypes.includes(card.type)) return false
      
      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const cardName = card.type === 'location' || card.type === 'wild_location' 
          ? (card as LocationCard).location.toLowerCase()
          : card.type === 'industry'
          ? (card as IndustryCard).industryType.toLowerCase()
          : card.type.toLowerCase()
        
        if (!cardName.includes(searchLower)) return false
      }
      
      return true
    })
    
    return {
      location: filtered.filter(c => c.type === 'location' || c.type === 'wild_location') as LocationCard[],
      industry: filtered.filter(c => c.type === 'industry' || c.type === 'wild_industry') as IndustryCard[],
      wild: filtered.filter(c => c.type.startsWith('wild')) as WildCard[]
    }
  }, [cards, searchTerm, config.allowedTypes])

  const allFilteredCards = [...groupedCards.location, ...groupedCards.industry, ...groupedCards.wild]
  
  const handleCardSelect = (card: Card) => {
    if (isMultiSelect && onCardToggle) {
      onCardToggle(card)
    } else {
      onCardSelect(card)
    }
  }

  const isCardSelected = (card: Card) => {
    if (isMultiSelect) {
      return selectedCards.some(c => c.id === card.id)
    }
    return selectedCard?.id === card.id
  }

  const canSelectMore = isMultiSelect ? selectedCards.length < maxSelections : true

  const renderCardList = (cardsToRender: Card[], emptyMessage: string) => {
    if (cardsToRender.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">{emptyMessage}</p>
        </div>
      )
    }

    return (
      <div className="grid gap-2">
        {cardsToRender.map((card) => {
          const isSelected = isCardSelected(card)
          const isDisabled = isMultiSelect && !isSelected && !canSelectMore
          
          return (
            <CardItem
              key={card.id}
              card={card}
              isSelected={isSelected}
              isMultiSelect={isMultiSelect}
              onSelect={() => handleCardSelect(card)}
              previewEnabled={previewEnabled}
              isDisabled={isDisabled}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <config.icon className="h-5 w-5" />
          {config.title}
        </h3>
        <p className="text-sm text-muted-foreground">{config.description}</p>
        {isMultiSelect && (
          <p className="text-xs text-muted-foreground mt-1">
            {selectedCards.length} / {maxSelections} selected
          </p>
        )}
      </div>

      {/* Search */}
      {searchEnabled && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cards..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Tabs for filtering */}
      {filterEnabled && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              All ({allFilteredCards.length})
            </TabsTrigger>
            {groupedCards.location.length > 0 && (
              <TabsTrigger value="location" className="flex-1">
                <MapPin className="h-4 w-4 mr-1" />
                Locations ({groupedCards.location.length})
              </TabsTrigger>
            )}
            {groupedCards.industry.length > 0 && (
              <TabsTrigger value="industry" className="flex-1">
                <Factory className="h-4 w-4 mr-1" />
                Industries ({groupedCards.industry.length})
              </TabsTrigger>
            )}
            {groupedCards.wild.length > 0 && (
              <TabsTrigger value="wild" className="flex-1">
                <Shuffle className="h-4 w-4 mr-1" />
                Wild ({groupedCards.wild.length})
              </TabsTrigger>
            )}
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            <TabsContent value="all" className="mt-0">
              {renderCardList(allFilteredCards, 'No cards available')}
            </TabsContent>
            
            <TabsContent value="location" className="mt-0">
              {renderCardList(groupedCards.location, 'No location cards available')}
            </TabsContent>
            
            <TabsContent value="industry" className="mt-0">
              {renderCardList(groupedCards.industry, 'No industry cards available')}
            </TabsContent>
            
            <TabsContent value="wild" className="mt-0">
              {renderCardList(groupedCards.wild, 'No wild cards available')}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      )}

      {!filterEnabled && (
        <ScrollArea className="h-[400px]">
          {renderCardList(allFilteredCards, 'No cards available')}
        </ScrollArea>
      )}
    </div>
  )
}