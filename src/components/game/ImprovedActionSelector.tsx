'use client'

import { 
  Factory, 
  Wrench, 
  DollarSign, 
  Banknote, 
  Eye, 
  Network, 
  SkipForward,
  Coins,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'
import React from 'react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'
import { Alert, AlertDescription } from '../ui/alert'
import { Separator } from '../ui/separator'
import { cn } from '~/lib/utils'
import { type GameStoreSnapshot } from '~/store/gameStore'
import { ContextualHelp } from './ContextualHelp'

interface ActionInfo {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  hoverColor: string
  cost?: string
  requirements?: string[]
  isAvailable: boolean
  isRecommended?: boolean
  disabledReason?: string
}

interface ImprovedActionSelectorProps {
  snapshot: GameStoreSnapshot
  onActionSelect: (actionType: string) => void
  showRecommendations?: boolean
  showCosts?: boolean
  showRequirements?: boolean
}

function ActionCard({
  action,
  onSelect,
  showCosts = true,
  showRequirements = true
}: {
  action: ActionInfo
  onSelect: () => void
  showCosts?: boolean
  showRequirements?: boolean
}) {
  const IconComponent = action.icon

  const cardContent = (
    <Card 
      className={cn(
        'transition-all duration-200 cursor-pointer border-2',
        action.isAvailable 
          ? `hover:${action.hoverColor} hover:shadow-md` 
          : 'opacity-60 cursor-not-allowed border-gray-200',
        action.isRecommended && action.isAvailable && 'ring-2 ring-green-400 ring-offset-2'
      )}
      onClick={action.isAvailable ? onSelect : undefined}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-base">
          <div className={cn(
            'p-2 rounded-lg',
            action.isAvailable ? action.color : 'bg-gray-100'
          )}>
            <IconComponent className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {action.title}
              {action.isRecommended && action.isAvailable && (
                <Badge variant="default" className="bg-green-600 text-xs">
                  Recommended
                </Badge>
              )}
            </div>
            {showCosts && action.cost && (
              <div className="text-xs text-muted-foreground font-normal mt-1">
                {action.cost}
              </div>
            )}
          </div>
          {action.isAvailable ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-3">
          {action.description}
        </p>

        {!action.isAvailable && action.disabledReason && (
          <Alert className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {action.disabledReason}
            </AlertDescription>
          </Alert>
        )}

        {showRequirements && action.requirements && action.requirements.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Requirements:</div>
            <div className="space-y-1">
              {action.requirements.map((req, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <span>{req}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {cardContent}
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-80">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', action.color)}>
              <IconComponent className="h-5 w-5 text-white" />
            </div>
            <div>
              <h4 className="font-semibold">{action.title}</h4>
              <p className="text-sm text-muted-foreground">{action.description}</p>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-3 text-sm">
            {action.cost && (
              <div>
                <span className="font-medium">Cost: </span>
                <span className="text-muted-foreground">{action.cost}</span>
              </div>
            )}
            
            {action.requirements && action.requirements.length > 0 && (
              <div>
                <span className="font-medium">Requirements:</span>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {action.requirements.map((req, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                      <span className="text-xs">{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {!action.isAvailable && action.disabledReason && (
              <div>
                <span className="font-medium text-red-600 dark:text-red-400">Why not available:</span>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{action.disabledReason}</p>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

export function ImprovedActionSelector({
  snapshot,
  onActionSelect,
  showRecommendations = true,
  showCosts = true,
  showRequirements = true
}: ImprovedActionSelectorProps) {
  const currentPlayer = snapshot.context.players[snapshot.context.currentPlayerIndex]
  const actionsRemaining = snapshot.context.actionsRemaining

  // Helper function to check action availability
  const checkActionAvailability = (actionType: string) => {
    try {
      return snapshot.can({ type: actionType.toUpperCase() as any })
    } catch (e) {
      return false
    }
  }

  const actions: ActionInfo[] = React.useMemo(() => [
    {
      id: 'build',
      title: 'Build',
      description: 'Build industry or develop existing infrastructure',
      icon: Factory,
      color: 'bg-blue-600',
      hoverColor: 'border-blue-400',
      cost: 'Varies by industry type',
      requirements: [
        'Must have a valid location or industry card',
        'Must have sufficient money for building costs',
        'Available industry tiles on player mat'
      ],
      isAvailable: checkActionAvailability('BUILD'),
      isRecommended: (currentPlayer?.money || 0) > 20 && (currentPlayer?.hand?.length || 0) > 0,
      disabledReason: !checkActionAvailability('BUILD') ? 'No valid cards or insufficient resources' : undefined
    },
    {
      id: 'develop',
      title: 'Develop',
      description: 'Remove industry tiles to access higher level tiles',
      icon: Wrench,
      color: 'bg-green-600',
      hoverColor: 'border-green-400',
      cost: '1 iron per industry developed',
      requirements: [
        'Must have an industry card',
        'Must have developable industries on player mat',
        'Need iron for development cost'
      ],
      isAvailable: checkActionAvailability('DEVELOP'),
      disabledReason: !checkActionAvailability('DEVELOP') ? 'No developable industries or no industry cards' : undefined
    },
    {
      id: 'sell',
      title: 'Sell',
      description: 'Sell goods to merchants for money and bonuses',
      icon: DollarSign,
      color: 'bg-yellow-600',
      hoverColor: 'border-yellow-400',
      cost: 'Discard 1 card',
      requirements: [
        'Must have a card to discard',
        'Must have produced goods to sell',
        'Available merchants on board'
      ],
      isAvailable: checkActionAvailability('SELL'),
      disabledReason: !checkActionAvailability('SELL') ? 'No cards to discard or no sellable goods' : undefined
    },
    {
      id: 'loan',
      title: 'Take Loan',
      description: 'Get £30 but reduce income by 3',
      icon: Banknote,
      color: 'bg-red-600',
      hoverColor: 'border-red-400',
      cost: 'Discard 1 card, -3 income permanently',
      requirements: [
        'Must have a card to discard',
        'Income must be positive after reduction'
      ],
      isAvailable: checkActionAvailability('TAKE_LOAN'),
      isRecommended: (currentPlayer?.money || 0) < 10 && (currentPlayer?.income || 0) > 5,
      disabledReason: !checkActionAvailability('TAKE_LOAN') ? 'No cards to discard or income too low' : undefined
    },
    {
      id: 'scout',
      title: 'Scout',
      description: 'Discard 3 cards to draw 1 card',
      icon: Eye,
      color: 'bg-orange-600',
      hoverColor: 'border-orange-400',
      cost: 'Discard exactly 3 cards',
      requirements: [
        'Must have at least 3 cards in hand'
      ],
      isAvailable: checkActionAvailability('SCOUT'),
      disabledReason: !checkActionAvailability('SCOUT') ? 'Need at least 3 cards in hand' : undefined
    },
    {
      id: 'network',
      title: 'Network',
      description: 'Build canal or rail connections',
      icon: Network,
      color: 'bg-purple-600',
      hoverColor: 'border-purple-400',
      cost: snapshot.context.era === 'canal' ? '£3 per canal' : '£5 + coal per rail',
      requirements: [
        'Must have a card to discard',
        'Must have money for connection cost',
        snapshot.context.era === 'rail' ? 'Need coal for rail connections' : 'Canal era connections available'
      ],
      isAvailable: checkActionAvailability('NETWORK'),
      disabledReason: !checkActionAvailability('NETWORK') ? 'No cards to discard or insufficient resources' : undefined
    },
    {
      id: 'pass',
      title: 'Pass',
      description: 'End your turn and gain income',
      icon: SkipForward,
      color: 'bg-gray-600',
      hoverColor: 'border-gray-400',
      cost: 'No cost',
      requirements: [
        'Always available'
      ],
      isAvailable: checkActionAvailability('PASS')
    }
  ], [snapshot, currentPlayer])

  const availableActions = actions.filter(a => a.isAvailable)
  const unavailableActions = actions.filter(a => !a.isAvailable)
  const recommendedActions = actions.filter(a => a.isRecommended && a.isAvailable)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          Choose Your Action
          <Badge variant="secondary">
            {actionsRemaining} action{actionsRemaining !== 1 ? 's' : ''} remaining
          </Badge>
          <ContextualHelp topic="build" context="action" variant="button" className="ml-auto" />
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select an action to continue your turn. Hover over actions for detailed information.
        </p>
      </div>

      {/* Recommended Actions */}
      {showRecommendations && recommendedActions.length > 0 && (
        <div>
          <h3 className="font-semibold text-green-600 dark:text-green-400 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Recommended Actions
          </h3>
          <div className="space-y-3">
            {recommendedActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onSelect={() => onActionSelect(action.id)}
                showCosts={showCosts}
                showRequirements={showRequirements}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available Actions */}
      <div>
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          Available Actions ({availableActions.length})
        </h3>
        <div className="space-y-3">
          {availableActions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onSelect={() => onActionSelect(action.id)}
              showCosts={showCosts}
              showRequirements={showRequirements}
            />
          ))}
        </div>
      </div>

      {/* Unavailable Actions */}
      {unavailableActions.length > 0 && (
        <div>
          <h3 className="font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Currently Unavailable ({unavailableActions.length})
          </h3>
          <div className="space-y-3">
            {unavailableActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onSelect={() => {}} // Disabled
                showCosts={showCosts}
                showRequirements={showRequirements}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}