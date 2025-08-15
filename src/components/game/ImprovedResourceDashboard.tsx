'use client'

import { 
  ChevronDown, 
  ChevronRight, 
  Coins, 
  Factory, 
  Zap, 
  Beer, 
  TrendingUp,
  Users,
  Clock,
  Target,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react'
import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Progress } from '../ui/progress'
import { Separator } from '../ui/separator'
import { cn } from '~/lib/utils'
import { type Player, type GameStoreSnapshot } from '~/store/gameStore'

interface ImprovedResourceDashboardProps {
  snapshot: GameStoreSnapshot
  currentPlayer: Player
  className?: string
}

interface ResourceSection {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  isOpen: boolean
  hasUpdates?: boolean
  urgency?: 'low' | 'medium' | 'high'
}

export function ImprovedResourceDashboard({
  snapshot,
  currentPlayer,
  className
}: ImprovedResourceDashboardProps) {
  const [sections, setSections] = React.useState<Record<string, boolean>>({
    player: true,
    resources: true,
    markets: false,
    merchants: false,
    game: false
  })

  const [isMinimized, setIsMinimized] = React.useState(false)

  const toggleSection = (sectionId: string) => {
    setSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  const { 
    resources, 
    coalMarket, 
    ironMarket, 
    merchants, 
    era, 
    round, 
    actionsRemaining,
    players
  } = snapshot.context

  // Calculate resource availability percentages
  const maxCoal = 24
  const maxIron = 10
  const maxBeer = 24
  
  const coalPercentage = (resources.coal / maxCoal) * 100
  const ironPercentage = (resources.iron / maxIron) * 100
  const beerPercentage = (resources.beer / maxBeer) * 100

  // Determine urgency levels
  const getResourceUrgency = (percentage: number) => {
    if (percentage < 20) return 'high'
    if (percentage < 50) return 'medium'
    return 'low'
  }

  const urgencyColors = {
    low: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
    high: 'bg-red-100 text-red-800 border-red-200'
  }

  const resourceSections: ResourceSection[] = [
    {
      id: 'player',
      title: 'Player Status',
      icon: Users,
      isOpen: sections.player,
      hasUpdates: false,
      urgency: currentPlayer.money < 10 ? 'high' : 'low'
    },
    {
      id: 'resources',
      title: 'Market Resources',
      icon: Factory,
      isOpen: sections.resources,
      hasUpdates: false,
      urgency: Math.min(coalPercentage, ironPercentage, beerPercentage) < 30 ? 'high' : 'low'
    },
    {
      id: 'markets',
      title: 'Markets',
      icon: TrendingUp,
      isOpen: sections.markets,
      hasUpdates: coalMarket.length > 0 || ironMarket.length > 0,
      urgency: 'medium'
    },
    {
      id: 'merchants',
      title: `Merchants (${merchants.length})`,
      icon: Coins,
      isOpen: sections.merchants,
      hasUpdates: merchants.length > 0,
      urgency: merchants.length > 0 ? 'medium' : 'low'
    },
    {
      id: 'game',
      title: 'Game Info',
      icon: Settings,
      isOpen: sections.game,
      hasUpdates: false,
      urgency: 'low'
    }
  ]

  if (isMinimized) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Factory className="h-4 w-4" />
              Resources
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(false)}
              className="h-6 w-6 p-0"
            >
              <Eye className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="font-medium">£{currentPlayer.money}</div>
              <div className="text-muted-foreground">Money</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{resources.coal}</div>
              <div className="text-muted-foreground">Coal</div>
            </div>
            <div className="text-center">
              <div className="font-medium">{resources.iron}</div>
              <div className="text-muted-foreground">Iron</div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Resource Dashboard
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(true)}
            className="h-6 w-6 p-0"
          >
            <EyeOff className="h-3 w-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {resourceSections.map((section, index) => {
          const IconComponent = section.icon
          
          return (
            <Collapsible
              key={section.id}
              open={section.isOpen}
              onOpenChange={() => toggleSection(section.id)}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-2 h-auto hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      {section.isOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <span className="font-medium text-sm">{section.title}</span>
                    {section.hasUpdates && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        New
                      </Badge>
                    )}
                    {section.urgency === 'high' && (
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </div>
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="mt-2">
                {section.id === 'player' && (
                  <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Money</div>
                        <div className="font-semibold text-lg flex items-center gap-1">
                          <Coins className="h-4 w-4 text-yellow-600" />
                          £{currentPlayer.money}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Income</div>
                        <div className="font-semibold text-lg flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          £{currentPlayer.income}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Victory Points</div>
                      <div className="font-semibold text-lg flex items-center gap-1">
                        <Target className="h-4 w-4 text-purple-600" />
                        {currentPlayer.victoryPoints} VP
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Hand</div>
                      <div className="text-sm">{currentPlayer.hand.length} cards</div>
                    </div>
                  </div>
                )}

                {section.id === 'resources' && (
                  <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          ⚫ Coal
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {resources.coal}/{maxCoal}
                        </Badge>
                      </div>
                      <Progress value={coalPercentage} className="h-2" />
                      <div className={cn(
                        "text-xs px-2 py-1 rounded border",
                        urgencyColors[getResourceUrgency(coalPercentage)]
                      )}>
                        {coalPercentage < 20 ? 'Low Supply' : coalPercentage < 50 ? 'Medium Supply' : 'Good Supply'}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          🔩 Iron
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {resources.iron}/{maxIron}
                        </Badge>
                      </div>
                      <Progress value={ironPercentage} className="h-2" />
                      <div className={cn(
                        "text-xs px-2 py-1 rounded border",
                        urgencyColors[getResourceUrgency(ironPercentage)]
                      )}>
                        {ironPercentage < 20 ? 'Low Supply' : ironPercentage < 50 ? 'Medium Supply' : 'Good Supply'}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          <Beer className="h-4 w-4" />
                          Beer
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {resources.beer}/{maxBeer}
                        </Badge>
                      </div>
                      <Progress value={beerPercentage} className="h-2" />
                      <div className={cn(
                        "text-xs px-2 py-1 rounded border",
                        urgencyColors[getResourceUrgency(beerPercentage)]
                      )}>
                        {beerPercentage < 20 ? 'Low Supply' : beerPercentage < 50 ? 'Medium Supply' : 'Good Supply'}
                      </div>
                    </div>
                  </div>
                )}

                {section.id === 'markets' && (
                  <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
                    <div>
                      <div className="text-sm font-medium mb-2">Coal Market</div>
                      {coalMarket.length > 0 ? (
                        <div className="grid grid-cols-2 gap-1">
                          {coalMarket.map((price, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              £{price}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Empty</div>
                      )}
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium mb-2">Iron Market</div>
                      {ironMarket.length > 0 ? (
                        <div className="grid grid-cols-2 gap-1">
                          {ironMarket.map((price, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              £{price}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Empty</div>
                      )}
                    </div>
                  </div>
                )}

                {section.id === 'merchants' && (
                  <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
                    {merchants.length > 0 ? (
                      merchants.map((merchant, index) => (
                        <div key={index} className="p-2 bg-background rounded border">
                          <div className="font-medium text-sm capitalize">
                            {merchant.location}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {merchant.industryIcons.join(', ')} • 
                            {merchant.hasBeer ? ' Has Beer' : ' No Beer'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No active merchants
                      </div>
                    )}
                  </div>
                )}

                {section.id === 'game' && (
                  <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Era</div>
                        <div className="font-medium capitalize">{era}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Round</div>
                        <div className="font-medium">{round}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Actions Remaining</div>
                      <div className="font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {actionsRemaining}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Players</div>
                      <div className="text-sm">{players.length} players</div>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
              
              {index < resourceSections.length - 1 && <Separator className="my-2" />}
            </Collapsible>
          )
        })}
      </CardContent>
    </Card>
  )
}