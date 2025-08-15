'use client'

import { HelpCircle, BookOpen, Lightbulb, Target, Zap } from 'lucide-react'
import React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { ScrollArea } from '../ui/scroll-area'

interface HelpTopic {
  id: string
  title: string
  content: string
  tips?: string[]
  examples?: string[]
  relatedActions?: string[]
}

interface ContextualHelpProps {
  topic: string
  context?: 'action' | 'rule' | 'strategy' | 'component'
  className?: string
  variant?: 'icon' | 'button' | 'inline'
}

const helpTopics: Record<string, HelpTopic> = {
  build: {
    id: 'build',
    title: 'Build Action',
    content: 'Build industries or infrastructure to expand your network and generate income. You can build on locations shown on cards or use industry cards to build in connected cities.',
    tips: [
      'Building costs vary by industry level and location',
      'Higher level industries provide more income and victory points',
      'Consider network connections when choosing build locations'
    ],
    examples: [
      'Use a location card to build at that specific location',
      'Use an industry card to build in any connected city',
      'Build coal mines near other industries that need coal'
    ],
    relatedActions: ['develop', 'network']
  },
  develop: {
    id: 'develop',
    title: 'Develop Action', 
    content: 'Remove industry tiles from your player mat to access higher level tiles. Each development costs 1 iron and allows you to remove 1-2 industry tiles.',
    tips: [
      'Development costs 1 iron per tile removed',
      'Higher level tiles provide better income and victory points', 
      'You can develop up to 2 tiles per action',
      'Pottery with lightbulb icons cannot be developed'
    ],
    examples: [
      'Remove Level 1 cotton mills to access Level 2-4 mills',
      'Develop breweries to access higher income tiles',
      'Remove outdated industries to make room for better ones'
    ],
    relatedActions: ['build']
  },
  sell: {
    id: 'sell',
    title: 'Sell Action',
    content: 'Sell goods produced by your industries to distant markets. Selling requires beer for transportation and flips industries to provide victory points.',
    tips: [
      'Selling requires beer consumption for transportation',
      'Industries flip when selling, providing victory points',
      'Merchants provide additional bonuses when selling',
      'Different industries sell to different markets'
    ],
    examples: [
      'Sell cotton to Lancashire for £12-16',
      'Use merchant bonuses to gain extra income or victory points', 
      'Consume beer from breweries or the general supply'
    ],
    relatedActions: ['build', 'network']
  },
  network: {
    id: 'network',
    title: 'Network Action',
    content: 'Build canal or rail connections between cities. Canal era connections cost £3, while rail era connections cost £5 plus coal.',
    tips: [
      'Canal era: £3 per connection',
      'Rail era: £5 + 1 coal per connection', 
      'Rail era allows double connections with beer',
      'Networks enable selling and building in distant cities'
    ],
    examples: [
      'Connect Birmingham to Coventry for £3 (Canal era)',
      'Build rail from Worcester to Birmingham for £5 + coal',
      'Use beer to build a second rail connection in same action'
    ],
    relatedActions: ['sell', 'build']
  },
  scout: {
    id: 'scout',
    title: 'Scout Action',
    content: 'Discard 3 cards to draw 1 new card. Use this to cycle through your hand and find better cards for your strategy.',
    tips: [
      'Trade 3 cards for 1 new card',
      'Useful when you have cards you cannot use',
      'Good for finding specific locations or industries',
      'Consider timing - cards are drawn from the deck top'
    ],
    examples: [
      'Discard 3 location cards you cannot reach',
      'Trade unwanted industry cards for potentially better ones',
      'Scout when other players have drawn many cards'
    ],
    relatedActions: []
  },
  loan: {
    id: 'loan',
    title: 'Loan Action',
    content: 'Discard 1 card to receive £30, but reduce your income by £3 permanently. Use loans strategically when you need immediate cash.',
    tips: [
      'Gain £30 immediately',
      'Lose £3 income permanently',
      'Only take loans when absolutely necessary',
      'Consider the long-term income loss'
    ],
    examples: [
      'Take a loan early to afford an expensive build',
      'Emergency loan when you cannot afford required actions',
      'Strategic loan to complete a crucial network connection'
    ],
    relatedActions: []
  },
  resources: {
    id: 'resources',
    title: 'Resources',
    content: 'Coal, iron, and beer are consumed for various actions. Coal and iron have markets with varying prices, while beer is produced by breweries.',
    tips: [
      'Coal: Used for rail connections and some industries',
      'Iron: Required for developing industries', 
      'Beer: Needed for selling and double rail connections',
      'Market prices increase as resources are consumed'
    ],
    examples: [
      'Coal from £3-8 depending on market availability',
      'Iron from £3-7 for development actions',
      'Beer from breweries or general supply at £5 each'
    ],
    relatedActions: ['develop', 'network', 'sell']
  },
  era_transition: {
    id: 'era_transition',
    title: 'Era Transition',
    content: 'When the Canal era ends, players score victory points and transition to the Rail era with new mechanics and higher-level industries.',
    tips: [
      'Canal era ends when all cards are drawn and played',
      'Score victory points for networks and flipped industries',
      'Level 1 industries are removed from the board',
      'Rail era introduces new connection rules and costs'
    ],
    examples: [
      'Canal networks score 1 VP per connection',
      'Flipped industries score their printed victory points',
      'All player links are removed between eras',
      'New deck of cards for Rail era'
    ],
    relatedActions: ['network', 'build']
  }
}

const ruleTopics: Record<string, HelpTopic> = {
  income: {
    id: 'income',
    title: 'Income Track',
    content: 'Your income determines how much money you receive when passing or at the end of rounds. Income can be increased by building industries or decreased by taking loans.',
    tips: [
      'Income gained when passing your turn',
      'Higher income provides more money per round',
      'Some industries increase income when built',
      'Loans permanently reduce income by £3'
    ]
  },
  victory_points: {
    id: 'victory_points', 
    title: 'Victory Points',
    content: 'Victory points are scored throughout the game and determine the winner. Points come from flipped industries, networks, and end-game bonuses.',
    tips: [
      'Industries score points when flipped (by selling)',
      'Networks score points at era transitions',
      'Final scoring includes additional bonuses',
      'Most victory points wins the game'
    ]
  }
}

export function ContextualHelp({ 
  topic, 
  context = 'action',
  className = '',
  variant = 'icon' 
}: ContextualHelpProps) {
  const helpContent = helpTopics[topic] || ruleTopics[topic]
  
  if (!helpContent) {
    return null
  }

  const getTriggerComponent = () => {
    switch (variant) {
      case 'button':
        return (
          <Button variant="outline" size="sm" className={className}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
        )
      case 'inline':
        return (
          <span className={`text-muted-foreground hover:text-foreground cursor-help ${className}`}>
            <HelpCircle className="h-3 w-3" />
          </span>
        )
      default:
        return (
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-6 w-6 p-0 text-muted-foreground hover:text-foreground ${className}`}
          >
            <HelpCircle className="h-3 w-3" />
          </Button>
        )
    }
  }

  const getContextIcon = () => {
    switch (context) {
      case 'strategy': return <Target className="h-4 w-4 text-purple-600" />
      case 'rule': return <BookOpen className="h-4 w-4 text-blue-600" />  
      case 'component': return <Zap className="h-4 w-4 text-orange-600" />
      default: return <Lightbulb className="h-4 w-4 text-yellow-600" />
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {getTriggerComponent()}
      </PopoverTrigger>
      <PopoverContent className="w-96" side="top" align="start">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {getContextIcon()}
              {helpContent.title}
              <Badge variant="outline" className="text-xs ml-auto">
                {context}
              </Badge>
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <ScrollArea className="max-h-64">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {helpContent.content}
                </p>

                {helpContent.tips && helpContent.tips.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
                      <Lightbulb className="h-3 w-3 text-yellow-600" />
                      Tips
                    </h4>
                    <ul className="space-y-1">
                      {helpContent.tips.map((tip, index) => (
                        <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                          <div className="h-1 w-1 rounded-full bg-muted-foreground mt-1.5 flex-shrink-0" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {helpContent.examples && helpContent.examples.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
                      <Target className="h-3 w-3 text-green-600" />
                      Examples  
                    </h4>
                    <ul className="space-y-1">
                      {helpContent.examples.map((example, index) => (
                        <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-green-600 flex-shrink-0">•</span>
                          <span>{example}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {helpContent.relatedActions && helpContent.relatedActions.length > 0 && (
                  <div>
                    <Separator className="my-3" />
                    <h4 className="font-semibold text-sm mb-2">Related Actions</h4>
                    <div className="flex flex-wrap gap-1">
                      {helpContent.relatedActions.map((action) => (
                        <Badge key={action} variant="secondary" className="text-xs capitalize">
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}

// Helper component for quick rule references
export function QuickHelp({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1">
      {children}
      <ContextualHelp topic="general" variant="inline" />
    </div>
  )
}

// Game rules help panel
export function GameRulesHelp() {
  const ruleCategories = [
    { id: 'actions', title: 'Actions', topics: ['build', 'develop', 'sell', 'network', 'scout', 'loan'] },
    { id: 'game', title: 'Game Concepts', topics: ['resources', 'era_transition'] },
    { id: 'scoring', title: 'Scoring', topics: ['income', 'victory_points'] }
  ]

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Game Rules Help
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-6">
            {ruleCategories.map((category) => (
              <div key={category.id}>
                <h3 className="font-semibold mb-3">{category.title}</h3>
                <div className="grid gap-2">
                  {category.topics.map((topic) => {
                    const helpData = helpTopics[topic] || ruleTopics[topic]
                    return (
                      <div key={topic} className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm font-medium capitalize">{helpData?.title || topic}</span>
                        <ContextualHelp topic={topic} variant="icon" />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}