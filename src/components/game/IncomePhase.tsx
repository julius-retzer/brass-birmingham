import { AlertTriangle, CheckCircle, Coins, TrendingUp } from 'lucide-react'
import React from 'react'
import { cn } from '~/lib/utils'
import { type Player } from '~/store/gameStore'
import { Alert, AlertDescription } from '../ui/alert'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface IncomePhaseProps {
  players: Player[]
  round: number
  era: 'canal' | 'rail'
  onCompleteIncomePhase: () => void
}

interface PlayerIncomeInfo {
  player: Player
  incomeAmount: number
  hasShortfall: boolean
  shortfallAmount: number
  industriesToSell: string[]
}

function PlayerIncomeCard({
  playerInfo,
}: {
  playerInfo: PlayerIncomeInfo
}) {
  const { player, incomeAmount, hasShortfall, shortfallAmount } = playerInfo

  const getPlayerColorStyle = (color: string) => {
    return {
      backgroundColor: color,
      borderColor: color,
    }
  }

  const newBalance = player.money + incomeAmount

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-4 rounded-lg border',
        hasShortfall
          ? 'border-red-300 bg-red-50'
          : 'border-green-300 bg-green-50',
      )}
    >
      {/* Player avatar */}
      <Avatar className="h-10 w-10">
        <AvatarFallback
          className="text-white font-semibold text-sm"
          style={getPlayerColorStyle(player.color)}
        >
          {player.name.charAt(0)}
        </AvatarFallback>
      </Avatar>

      {/* Player info */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{player.name}</span>
          {hasShortfall ? (
            <Badge variant="destructive" className="text-xs">
              Shortfall
            </Badge>
          ) : (
            <Badge variant="default" className="text-xs">
              Income
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          Income level: £{player.income}
        </div>
      </div>

      {/* Income calculation */}
      <div className="text-right space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span>£{player.money}</span>
          <span
            className={cn(hasShortfall ? 'text-red-600' : 'text-green-600')}
          >
            {incomeAmount >= 0 ? '+' : ''}£{incomeAmount}
          </span>
          <span>=</span>
          <span className="font-semibold">£{newBalance}</span>
        </div>

        {hasShortfall && (
          <div className="text-xs text-red-600">
            Must sell industries worth £{shortfallAmount}
          </div>
        )}
      </div>

      {/* Status indicator */}
      <div className="ml-2">
        {hasShortfall ? (
          <AlertTriangle className="h-5 w-5 text-red-500" />
        ) : (
          <CheckCircle className="h-5 w-5 text-green-500" />
        )}
      </div>
    </div>
  )
}

export function IncomePhase({
  players,
  round,
  era,
  onCompleteIncomePhase,
}: IncomePhaseProps) {
  // Calculate income for each player
  const playerIncomeInfo: PlayerIncomeInfo[] = players.map((player) => {
    const incomeAmount = player.income
    const newBalance = player.money + incomeAmount
    const hasShortfall = newBalance < 0
    const shortfallAmount = hasShortfall ? Math.abs(newBalance) : 0

    return {
      player,
      incomeAmount,
      hasShortfall,
      shortfallAmount,
      industriesToSell: [], // Would be calculated based on player's industries
    }
  })

  const hasAnyShortfalls = playerIncomeInfo.some((info) => info.hasShortfall)
  const totalIncomeChange = playerIncomeInfo.reduce(
    (sum, info) => sum + info.incomeAmount,
    0,
  )

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Income Collection
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              End of Round {round}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {era.charAt(0).toUpperCase() + era.slice(1)} Era
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Each player collects income based on their current income level.
          Players with negative income must pay money or sell industries.
        </div>

        {hasAnyShortfalls && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Some players have negative income and must sell industries to
              cover shortfalls. Each industry sells for half its cost (rounded
              down).
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {playerIncomeInfo.map((playerInfo) => (
            <PlayerIncomeCard
              key={playerInfo.player.id}
              playerInfo={playerInfo}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              <span>
                Total income change: {totalIncomeChange >= 0 ? '+' : ''}£
                {totalIncomeChange}
              </span>
            </div>
          </div>

          <Button onClick={onCompleteIncomePhase}>Complete Income Phase</Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Turn order will be reset for next round</div>
          <div>• Money spent counters will be cleared</div>
          <div>• Players draw cards to refill hands</div>
        </div>
      </CardContent>
    </Card>
  )
}
