import { Coins, Crown, TrendingUp, Trophy, Users } from 'lucide-react'
import React from 'react'
import { cn } from '~/lib/utils'
import { type Player } from '~/store/gameStore'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface TurnOrderTrackerProps {
  players: Player[]
  currentPlayerIndex: number
  round: number
  era: 'canal' | 'rail'
  spentMoney: number
  playerSpending: Record<string, number>
}

interface PlayerOrderInfo {
  player: Player
  index: number
  spentThisRound: number
  isCurrentPlayer: boolean
  projectedPosition: number
}

function PlayerOrderCard({
  playerInfo,
  position,
}: {
  playerInfo: PlayerOrderInfo
  position: number
}) {
  const { player, isCurrentPlayer, spentThisRound } = playerInfo

  const getPlayerColorStyle = (color: string) => {
    return {
      backgroundColor: color,
      borderColor: color,
    }
  }

  const getPositionBadge = (pos: number) => {
    const variants = {
      1: 'default',
      2: 'secondary',
      3: 'outline',
      4: 'outline',
    } as const

    const labels = {
      1: '1st',
      2: '2nd',
      3: '3rd',
      4: '4th',
    }

    return (
      <Badge
        variant={variants[pos as keyof typeof variants] || 'outline'}
        className="text-xs"
      >
        {labels[pos as keyof typeof labels] || `${pos}th`}
      </Badge>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
        isCurrentPlayer
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-200 dark:ring-blue-800'
          : 'border-muted bg-card',
      )}
    >
      {/* Position indicator and avatar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-6 h-6">
          {position === 1 ? (
            <Crown className="h-4 w-4 text-yellow-600" />
          ) : (
            <span className="font-bold text-sm text-muted-foreground">
              {position}
            </span>
          )}
        </div>
        <Avatar className="h-8 w-8">
          <AvatarFallback
            className="text-white font-semibold text-xs"
            style={getPlayerColorStyle(player.color)}
          >
            {player.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Player info */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          <span className="font-medium text-sm">{player.name}</span>
          {isCurrentPlayer && (
            <Badge variant="default" className="text-xs">
              Current
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mb-2">
          {player.character}
        </div>

        {/* Player stats - compact version */}
        <div className="flex items-center justify-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <Coins className="h-3 w-3" />
            <span>£{player.money}</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy className="h-3 w-3" />
            <span>{player.victoryPoints}</span>
          </div>
        </div>

        {/* Spent this round */}
        <div className="text-center mt-2">
          <div className="text-xs text-muted-foreground">Spent</div>
          <div className="font-semibold text-sm">£{spentThisRound}</div>
        </div>
      </div>
    </div>
  )
}

export function TurnOrderTracker({
  players,
  currentPlayerIndex,
  round,
  era,
  spentMoney,
  playerSpending,
}: TurnOrderTrackerProps) {
  // Calculate player order info
  const playerOrderInfo: PlayerOrderInfo[] = players.map((player, index) => ({
    player,
    index,
    spentThisRound: playerSpending[player.id] || 0,
    isCurrentPlayer: index === currentPlayerIndex,
    projectedPosition: 0, // Will be calculated
  }))

  // Sort by money spent (least spent goes first)
  const sortedPlayers = [...playerOrderInfo].sort((a, b) => {
    if (a.spentThisRound === b.spentThisRound) {
      // If equal spending, maintain current relative order
      return a.index - b.index
    }
    return a.spentThisRound - b.spentThisRound
  })

  // Assign projected positions
  sortedPlayers.forEach((playerInfo, index) => {
    playerInfo.projectedPosition = index + 1
  })

  return (
    <Card className="mb-6">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5" />
            <span className="font-semibold">Turn Order</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {era.charAt(0).toUpperCase() + era.slice(1)} Era
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Round {round}
              </Badge>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Next round order by money spent (least → most)
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sortedPlayers.map((playerInfo, index) => (
            <PlayerOrderCard
              key={playerInfo.player.id}
              playerInfo={playerInfo}
              position={index + 1}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
