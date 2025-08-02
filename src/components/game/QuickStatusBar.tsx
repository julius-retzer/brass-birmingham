import { Clock, Coins, Crown, TrendingUp, Trophy, Users } from 'lucide-react'
import { type Player } from '~/store/gameStore'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'

interface QuickStatusBarProps {
  currentPlayer: Player
  actionsRemaining: number
  era: 'canal' | 'rail'
  round: number
  spentMoney: number
}

export function QuickStatusBar({
  currentPlayer,
  actionsRemaining,
  era,
  round,
  spentMoney,
}: QuickStatusBarProps) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          {/* Current Player */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full border"
                style={{
                  backgroundColor: currentPlayer.color,
                  borderColor: currentPlayer.color,
                }}
              />
              <span className="font-medium text-sm">{currentPlayer.name}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {actionsRemaining} action{actionsRemaining !== 1 ? 's' : ''}{' '}
                left
              </span>
            </div>
          </div>

          {/* Era & Round */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {era.charAt(0).toUpperCase() + era.slice(1)} Era
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Round {round}
            </Badge>
          </div>

          {/* Player Stats */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <Coins className="h-3 w-3 text-yellow-500" />
              <span className="font-medium">£{currentPlayer.money}</span>
            </div>
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3 text-purple-500" />
              <span className="font-medium">{currentPlayer.victoryPoints}</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="font-medium">{currentPlayer.income}</span>
            </div>
          </div>

          {/* Spending This Round */}
          {spentMoney > 0 && (
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <span>Spent:</span>
              <span className="font-medium">£{spentMoney}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
