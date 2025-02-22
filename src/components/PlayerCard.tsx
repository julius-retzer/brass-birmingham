import { type Player } from "~/types/player";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Coins, Trophy, TrendingUp, ScrollText, Factory, Route } from "lucide-react";

interface PlayerCardProps {
  player: Player;
  isCurrentPlayer: boolean;
}

export function PlayerCard({ player, isCurrentPlayer }: PlayerCardProps) {
  return (
    <Card className={`w-72 ${isCurrentPlayer ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader
        className="flex flex-row items-center gap-2 pb-2"
        style={{
          backgroundColor: player.color,
          color: 'white'
        }}
      >
        <div className="flex-1">
          <h3 className="font-bold">{player.name}</h3>
          <p className="text-sm opacity-90">{player.character}</p>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
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

        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Cards</h4>
          <div className="flex justify-between text-sm items-center">
            <div className="flex items-center gap-1">
              <ScrollText className="h-4 w-4" />
              <span>Hand: {player.hand.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <ScrollText className="h-4 w-4" />
              <span>Discard: {player.discardPile.length}</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Built</h4>
          <div className="flex justify-between text-sm items-center">
            <div className="flex items-center gap-1">
              <Factory className="h-4 w-4" />
              <span>Industries: {player.builtIndustries.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Route className="h-4 w-4" />
              <span>Links: {player.links.length}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}