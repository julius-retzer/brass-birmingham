import { Crown, Medal, Trophy, Users } from 'lucide-react'
import { type Player } from '~/store/gameStore'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface GameOverProps {
  players: Player[]
  winner: Player
  onNewGame?: () => void
}

export function GameOver({ players, winner, onNewGame }: GameOverProps) {
  // Sort players by victory points (descending), then by income, then by money
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.victoryPoints !== b.victoryPoints) {
      return b.victoryPoints - a.victoryPoints
    }
    if (a.income !== b.income) {
      return b.income - a.income
    }
    return b.money - a.money
  })

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 0:
        return <Crown className="h-5 w-5 text-yellow-500" />
      case 1:
        return <Medal className="h-5 w-5 text-gray-400" />
      case 2:
        return <Trophy className="h-5 w-5 text-amber-600" />
      default:
        return <Users className="h-5 w-5 text-gray-500" />
    }
  }

  const getPositionLabel = (position: number) => {
    switch (position) {
      case 0:
        return '1st Place - Winner!'
      case 1:
        return '2nd Place'
      case 2:
        return '3rd Place'
      default:
        return `${position + 1}th Place`
    }
  }

  return (
    <Card className="mt-8 border-primary">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-3 text-3xl">
          <Crown className="h-8 w-8 text-yellow-500" />
          Game Over!
          <Crown className="h-8 w-8 text-yellow-500" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Winner Announcement */}
        <div className="text-center p-6 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border border-yellow-200">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div
              className="w-6 h-6 rounded-full border-2"
              style={{
                backgroundColor: winner.color,
                borderColor: winner.color,
              }}
            />
            <h3 className="text-xl font-bold text-yellow-800">
              {winner.name} Wins!
            </h3>
          </div>
          <p className="text-yellow-700 mb-2">
            Congratulations on your victory in Brass Birmingham!
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-yellow-600">
            <span>Victory Points: {winner.victoryPoints}</span>
            <span>Income: £{winner.income}</span>
            <span>Money: £{winner.money}</span>
          </div>
        </div>

        {/* Final Standings */}
        <div>
          <h4 className="text-lg font-semibold mb-3 text-center">
            Final Standings
          </h4>
          <div className="space-y-3">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  index === 0
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                {/* Position */}
                <div className="flex items-center gap-2">
                  {getPositionIcon(index)}
                  <span className="font-medium">{getPositionLabel(index)}</span>
                </div>

                {/* Player info */}
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{
                      backgroundColor: player.color,
                      borderColor: player.color,
                    }}
                  />
                  <span className="font-medium">{player.name}</span>
                  <span className="text-sm text-muted-foreground">
                    ({player.character})
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-lg">
                      {player.victoryPoints}
                    </div>
                    <div className="text-muted-foreground">VP</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">£{player.income}</div>
                    <div className="text-muted-foreground">Income</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">£{player.money}</div>
                    <div className="text-muted-foreground">Money</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">
                      {player.industries.length}
                    </div>
                    <div className="text-muted-foreground">Industries</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">{player.links.length}</div>
                    <div className="text-muted-foreground">Links</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tiebreaker info */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Rankings determined by: Victory Points → Income Level → Money
            Remaining
          </p>
        </div>

        {/* New Game Button */}
        {onNewGame && (
          <div className="text-center pt-4">
            <Button onClick={onNewGame} size="lg">
              Start New Game
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
