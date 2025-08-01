import React from 'react'
import { Crown, Coins, TrendingUp, Trophy, Users } from 'lucide-react'
import { type Player } from '~/store/gameStore'
import { cn } from '~/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Avatar, AvatarFallback } from '../ui/avatar'

interface TurnOrderTrackerProps {
  players: Player[]
  currentPlayerIndex: number
  round: number
  era: 'canal' | 'rail'
  spentMoney: number
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
  position 
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
      4: 'outline'
    } as const
    
    const labels = {
      1: '1st',
      2: '2nd', 
      3: '3rd',
      4: '4th'
    }
    
    return (
      <Badge variant={variants[pos as keyof typeof variants] || 'outline'} className="text-xs">
        {labels[pos as keyof typeof labels] || `${pos}th`}
      </Badge>
    )
  }

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border transition-all',
      isCurrentPlayer ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-muted',
      position === 1 && 'border-yellow-400 bg-yellow-50'
    )}>
      {/* Position indicator */}
      <div className="flex items-center justify-center w-8 h-8">
        {position === 1 ? (
          <Crown className="h-5 w-5 text-yellow-600" />
        ) : (
          <span className="font-bold text-lg text-muted-foreground">
            {position}
          </span>
        )}
      </div>

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
          {getPositionBadge(position)}
          {isCurrentPlayer && (
            <Badge variant="default" className="text-xs">
              Current
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {player.character}
        </div>
      </div>

      {/* Player stats */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <Coins className="h-3 w-3" />
          <span>£{player.money}</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          <span>£{player.income}</span>
        </div>
        <div className="flex items-center gap-1">
          <Trophy className="h-3 w-3" />
          <span>{player.victoryPoints}</span>
        </div>
      </div>

      {/* Spent this round */}
      <div className="text-right">
        <div className="text-xs text-muted-foreground">Spent</div>
        <div className="font-semibold">£{spentThisRound}</div>
      </div>
    </div>
  )
}

export function TurnOrderTracker({ 
  players, 
  currentPlayerIndex, 
  round, 
  era,
  spentMoney 
}: TurnOrderTrackerProps) {
  // Calculate player order info
  const playerOrderInfo: PlayerOrderInfo[] = players.map((player, index) => ({
    player,
    index,
    spentThisRound: index === currentPlayerIndex ? spentMoney : 0, // Simplified - should track per player
    isCurrentPlayer: index === currentPlayerIndex,
    projectedPosition: 0 // Will be calculated
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Turn Order
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {era.charAt(0).toUpperCase() + era.slice(1)} Era
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Round {round}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Turn order for next round is determined by money spent this round (least → most).
        </div>
        
        <div className="space-y-2">
          {sortedPlayers.map((playerInfo, index) => (
            <PlayerOrderCard
              key={playerInfo.player.id}
              playerInfo={playerInfo}
              position={index + 1}
            />
          ))}
        </div>

        <div className="pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Income collection happens at end of round</span>
            <span>Turn order resets after money is returned to bank</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}