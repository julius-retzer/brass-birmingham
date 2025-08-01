import {
  Coins,
  Factory,
  Route,
  ScrollText,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { cities } from '../data/board'
import { type Player } from '../store/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface PlayerCardProps {
  player: Player
  isCurrentPlayer: boolean
}

export function PlayerCard({ player, isCurrentPlayer }: PlayerCardProps) {
  return (
    <Card className={isCurrentPlayer ? 'ring-2 ring-primary bg-primary/5' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border"
              style={{
                backgroundColor: player.color,
                borderColor: player.color,
              }}
            />
            <span>{player.name}</span>
          </div>
          {isCurrentPlayer && (
            <span className="text-sm font-medium text-primary bg-primary/20 px-2 py-1 rounded">
              Current Turn
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="flex flex-col items-center">
            <Coins className="h-6 w-6 text-yellow-500" />
            <span className="text-sm font-medium">Money</span>
            <span className="text-lg">£{player.money}</span>
          </div>
          <div className="flex flex-col items-center">
            <Trophy className="h-6 w-6 text-purple-500" />
            <span className="text-sm font-medium">VP</span>
            <span className="text-lg">{player.victoryPoints}</span>
          </div>
          <div className="flex flex-col items-center">
            <TrendingUp className="h-6 w-6 text-green-500" />
            <span className="text-sm font-medium">Income</span>
            <span className="text-lg">{player.income}</span>
          </div>
        </div>

        {/* Cards */}
        <div>
          <h4 className="text-sm font-medium mb-2">Cards</h4>
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            <span className="text-sm">Hand: {player.hand.length}</span>
          </div>
        </div>

        {/* Links */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Links ({player.links.length})
          </h4>
          <div className="space-y-1">
            {player.links.map((link, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Route
                  className={`h-4 w-4 ${link.type === 'canal' ? 'text-blue-500' : 'text-orange-500'}`}
                />
                <span>
                  {cities[link.from].name} → {cities[link.to].name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Industries */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Industries ({player.industries.length})
          </h4>
          <div className="space-y-1">
            {player.industries.map((industry, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Factory
                  className={`h-4 w-4 ${industry.flipped ? 'text-green-500' : 'text-gray-500'}`}
                />
                <span>
                  {industry.type} (L{industry.level}) at{' '}
                  {cities[industry.location].name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
