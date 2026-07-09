'use client'

import { useState } from 'react'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { getInitialPlayerIndustryTilesWithQuantities } from '~/data/industryTiles'
import { type Player } from '~/store/gameStore'

type SetupPlayer = Omit<Player, 'hand' | 'links' | 'industries'>

const PLAYER_COLORS: Player['color'][] = ['red', 'blue', 'green', 'yellow']

const CHARACTERS: Player['character'][] = [
  'Richard Arkwright',
  'Eliza Tinsley',
  'Isambard Kingdom Brunel',
  'George Stephenson',
]

const COLOR_SWATCH: Record<Player['color'], string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
}

interface SetupScreenProps {
  onStart: (players: SetupPlayer[]) => void
}

export function SetupScreen({ onStart }: SetupScreenProps) {
  const [count, setCount] = useState(2)
  const [names, setNames] = useState<string[]>([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
  ])

  const setName = (index: number, value: string) => {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)))
  }

  const handleStart = () => {
    const players: SetupPlayer[] = Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      name: names[i]?.trim() || `Player ${i + 1}`,
      color: PLAYER_COLORS[i]!,
      character: CHARACTERS[i]!,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
    }))
    onStart(players)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-3xl">Brass Birmingham</CardTitle>
          <CardDescription>
            Local hotseat &mdash; pass one device between players.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Number of players</Label>
            <div className="flex gap-2">
              {[2, 3, 4].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={count === n ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setCount(n)}
                >
                  {n} players
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className={`h-5 w-5 shrink-0 rounded-full ${COLOR_SWATCH[PLAYER_COLORS[i]!]}`}
                  aria-hidden
                />
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`player-${i}`} className="text-xs">
                    {CHARACTERS[i]}
                  </Label>
                  <Input
                    id={`player-${i}`}
                    value={names[i] ?? ''}
                    onChange={(e) => setName(i, e.target.value)}
                    placeholder={`Player ${i + 1}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button className="w-full" size="lg" onClick={handleStart}>
            Start game
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
