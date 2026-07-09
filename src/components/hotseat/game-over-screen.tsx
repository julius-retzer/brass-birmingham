'use client'

import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { type Player } from '~/store/gameStore'

interface GameOverScreenProps {
  players: Player[]
  winners: string[]
  onRestart: () => void
}

export function GameOverScreen({
  players,
  winners,
  onRestart,
}: GameOverScreenProps) {
  const ranked = [...players].sort(
    (a, b) =>
      b.victoryPoints - a.victoryPoints ||
      b.income - a.income ||
      b.money - a.money,
  )
  const winnerNames = players
    .filter((p) => winners.includes(p.id))
    .map((p) => p.name)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-center text-3xl">
            {winnerNames.length === 1
              ? `🏆 ${winnerNames[0]} wins!`
              : `🏆 Draw: ${winnerNames.join(' & ')}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1">Player</th>
                <th className="py-1 text-right">VP</th>
                <th className="py-1 text-right">Income</th>
                <th className="py-1 text-right">Money</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => (
                <tr
                  key={p.id}
                  className={
                    winners.includes(p.id) ? 'font-semibold' : undefined
                  }
                >
                  <td className="py-1">{p.name}</td>
                  <td className="py-1 text-right">{p.victoryPoints}</td>
                  <td className="py-1 text-right">{p.income}</td>
                  <td className="py-1 text-right">£{p.money}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="w-full" onClick={onRestart}>
            New game
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
