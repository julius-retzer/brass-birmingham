import {
  AlertCircle,
  ArrowRight,
  Building2,
  Coins,
  Factory,
  Info,
  MapPin,
  Network,
  Package,
  Sparkles,
  TrendingUp,
  Wallet
} from 'lucide-react'
import { useState } from 'react'
import { type CityId } from '~/data/board'
import { type Card, type IndustryType } from '~/data/cards'
import { cn } from '~/lib/utils'
import { type GameState, type Player } from '~/store/gameStore'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle, Card as UICard } from '../ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '../ui/drawer'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { ScrollArea } from '../ui/scroll-area'
import { Separator } from '../ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Toggle, ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

interface ActionSelectorProps {
  player: Player
  gameState: GameState
  onActionSelect: (action: string) => void
  actionsRemaining: number
  canPerformActions: {
    build: boolean
    network: boolean
    develop: boolean
    sell: boolean
    loan: boolean
    scout: boolean
    pass: boolean
  }
}

export function ImprovedActionSelector({
  player,
  gameState,
  onActionSelect,
  actionsRemaining,
  canPerformActions,
}: ActionSelectorProps) {
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)

  const actions = [
    {
      id: 'build',
      name: 'Build',
      icon: <Building2 className="h-5 w-5" />,
      description: 'Place an industry tile on the board',
      cost: 'Variable cost',
      requirements: 'Location or Industry card',
      color: 'hover:bg-orange-50 hover:border-orange-300',
      disabled: !canPerformActions.build,
    },
    {
      id: 'network',
      name: 'Network',
      icon: <Network className="h-5 w-5" />,
      description: `Build ${gameState.era === 'canal' ? 'canal' : 'rail'} connections`,
      cost: gameState.era === 'canal' ? '£3' : '£5 + coal',
      requirements: 'Any card',
      color: 'hover:bg-blue-50 hover:border-blue-300',
      disabled: !canPerformActions.network,
    },
    {
      id: 'develop',
      name: 'Develop',
      icon: <Factory className="h-5 w-5" />,
      description: 'Remove tiles from mat to access higher levels',
      cost: '1 iron per tile',
      requirements: 'Industry card',
      color: 'hover:bg-purple-50 hover:border-purple-300',
      disabled: !canPerformActions.develop,
    },
    {
      id: 'sell',
      name: 'Sell',
      icon: <Coins className="h-5 w-5" />,
      description: 'Flip cotton, manufacturer, or pottery tiles',
      cost: 'Beer required',
      requirements: 'Any card',
      color: 'hover:bg-green-50 hover:border-green-300',
      disabled: !canPerformActions.sell,
    },
    {
      id: 'loan',
      name: 'Take Loan',
      icon: <Wallet className="h-5 w-5" />,
      description: 'Get £30 but reduce income by 3',
      cost: 'No cost',
      requirements: 'Any card',
      color: 'hover:bg-red-50 hover:border-red-300',
      disabled: !canPerformActions.loan,
    },
    {
      id: 'scout',
      name: 'Scout',
      icon: <Sparkles className="h-5 w-5" />,
      description: 'Exchange 3 cards for wild cards',
      cost: 'No cost',
      requirements: '3 cards to discard',
      color: 'hover:bg-yellow-50 hover:border-yellow-300',
      disabled: !canPerformActions.scout,
    },
  ]

  return (
    <UICard>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Choose Your Action</span>
          <Badge variant="secondary">
            {actionsRemaining} {actionsRemaining === 1 ? 'action' : 'actions'} remaining
          </Badge>
        </CardTitle>
        <CardDescription>
          Select an action to perform. Hover for details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {actions.map((action) => (
            <HoverCard key={action.id} openDelay={200}>
              <HoverCardTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-auto p-4 justify-start transition-all',
                    action.color,
                    action.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                  onClick={() => !action.disabled && onActionSelect(action.id)}
                  disabled={action.disabled}
                  onMouseEnter={() => setHoveredAction(action.id)}
                  onMouseLeave={() => setHoveredAction(null)}
                >
                  <div className="flex items-start gap-3 w-full">
                    <div className="mt-1">{action.icon}</div>
                    <div className="flex-1 text-left">
                      <div className="font-semibold">{action.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {action.description}
                      </div>
                    </div>
                  </div>
                </Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    {action.icon}
                    {action.name}
                  </h4>
                  <p className="text-sm">{action.description}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <Coins className="h-3 w-3" />
                      <span className="font-medium">Cost:</span> {action.cost}
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-3 w-3" />
                      <span className="font-medium">Requires:</span> {action.requirements}
                    </div>
                  </div>
                  {action.disabled && (
                    <Alert className="border-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Cannot perform this action right now
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>

        <Separator className="my-4" />

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => onActionSelect('pass')}
          disabled={!canPerformActions.pass}
        >
          Pass Turn
        </Button>
      </CardContent>
    </UICard>
  )
}

interface CardSelectorProps {
  cards: Card[]
  selectedCard: Card | null
  onCardSelect: (card: Card) => void
  actionType: string
  allowMultiple?: boolean
  selectedCards?: Card[]
}

export function ImprovedCardSelector({
  cards,
  selectedCard,
  onCardSelect,
  actionType,
  allowMultiple = false,
  selectedCards = [],
}: CardSelectorProps) {
  const getCardGroups = () => {
    const groups: Record<string, Card[]> = {
      location: [],
      industry: [],
      wild: [],
    }

    cards.forEach((card) => {
      if (card.type === 'wild_location' || card.type === 'wild_industry') {
        groups.wild.push(card)
      } else if (card.type === 'location') {
        groups.location.push(card)
      } else if (card.type === 'industry') {
        groups.industry.push(card)
      }
    })

    return groups
  }

  const groups = getCardGroups()

  return (
    <UICard>
      <CardHeader>
        <CardTitle>Select Card{allowMultiple ? 's' : ''}</CardTitle>
        <CardDescription>
          Choose which card{allowMultiple ? 's' : ''} to use for your {actionType} action
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All ({cards.length})</TabsTrigger>
            <TabsTrigger value="location">Location ({groups.location.length})</TabsTrigger>
            <TabsTrigger value="industry">Industry ({groups.industry.length})</TabsTrigger>
            <TabsTrigger value="wild">Wild ({groups.wild.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <ScrollArea className="h-[300px]">
              <div className="grid grid-cols-3 gap-2">
                {cards.map((card) => (
                  <CardItem
                    key={card.id}
                    card={card}
                    isSelected={
                      allowMultiple
                        ? selectedCards.some((c) => c.id === card.id)
                        : selectedCard?.id === card.id
                    }
                    onClick={() => onCardSelect(card)}
                  />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {(['location', 'industry', 'wild'] as const).map((type) => (
            <TabsContent key={type} value={type} className="mt-4">
              <ScrollArea className="h-[300px]">
                <div className="grid grid-cols-3 gap-2">
                  {groups[type].map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      isSelected={
                        allowMultiple
                          ? selectedCards.some((c) => c.id === card.id)
                          : selectedCard?.id === card.id
                      }
                      onClick={() => onCardSelect(card)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        {allowMultiple && (
          <div className="mt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Multiple Selection</AlertTitle>
              <AlertDescription>
                Selected {selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </UICard>
  )
}

function CardItem({
  card,
  isSelected,
  onClick,
}: {
  card: Card
  isSelected: boolean
  onClick: () => void
}) {
  const getCardColor = () => {
    switch (card.type) {
      case 'location':
        return 'bg-blue-50 hover:bg-blue-100 border-blue-200'
      case 'industry':
        return 'bg-green-50 hover:bg-green-100 border-green-200'
      case 'wild_location':
      case 'wild_industry':
        return 'bg-purple-50 hover:bg-purple-100 border-purple-200'
      default:
        return 'bg-gray-50 hover:bg-gray-100 border-gray-200'
    }
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border-2 transition-all',
        getCardColor(),
        isSelected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <div className="text-xs font-medium">{card.type}</div>
      <div className="text-sm mt-1 truncate">
        {card.type === 'location' && card.location}
        {card.type === 'industry' && card.industries?.join(', ')}
        {(card.type === 'wild_location' || card.type === 'wild_industry') && 'Wild'}
      </div>
    </button>
  )
}