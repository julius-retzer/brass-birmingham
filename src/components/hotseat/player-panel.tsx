'use client'

import { Badge } from '~/components/ui/badge'
import { Card } from '~/components/ui/card'
import { cn } from '~/lib/utils'
import { type Player } from '~/store/gameStore'

const COLOR_RING: Record<Player['color'], string> = {
  red: 'ring-red-500',
  blue: 'ring-blue-500',
  green: 'ring-green-500',
  yellow: 'ring-yellow-400',
  purple: 'ring-purple-500',
  orange: 'ring-orange-500',
}

const COLOR_DOT: Record<Player['color'], string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
}

interface PlayerPanelProps {
  player: Player
  isCurrent: boolean
  turnPosition?: number
}

export function PlayerPanel({
  player,
  isCurrent,
  turnPosition,
}: PlayerPanelProps) {
  const unflipped = player.industries.filter((i) => !i.flipped).length
  return (
    <Card
      className={cn(
        'p-3 transition-shadow',
        isCurrent && `ring-2 ${COLOR_RING[player.color]} shadow-md`,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`h-3 w-3 shrink-0 rounded-full ${COLOR_DOT[player.color]}`}
          aria-hidden
        />
        <span className="truncate font-semibold">{player.name}</span>
        {isCurrent && (
          <Badge variant="default" className="ml-auto text-[10px]">
            Current
          </Badge>
        )}
        {!isCurrent && turnPosition !== undefined && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            #{turnPosition + 1}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-sm">
        <Stat label="Money" value={`£${player.money}`} />
        <Stat label="Income" value={player.income} />
        <Stat label="VP" value={player.victoryPoints} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Hand {player.hand.length}</span>
        <span>Links {player.links.length}</span>
        <span>
          Ind {unflipped}/{player.industries.length}
        </span>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-muted/50 py-1">
      <div className="font-bold leading-none">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  )
}
