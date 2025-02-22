"use client";

import { useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { gameStore, type Player, type GameState } from '../store/gameStore';
import { GameLog } from '../components/GameLog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Coins, Trophy, TrendingUp, CircleDot, Factory, Beer } from 'lucide-react';

export default function Home() {
  const [state, send] = useMachine(gameStore);
  const { players, currentPlayerIndex, era, round, actionsRemaining, resources, logs } = state.context;

  // Start a new game with 2 players for testing
  useEffect(() => {
    if (state.matches('setup')) {
      const initialPlayers: Player[] = [
        { id: '1', name: 'Player 1', money: 30, victoryPoints: 0, income: 10 },
        { id: '2', name: 'Player 2', money: 30, victoryPoints: 0, income: 10 },
      ];
      send({ type: 'START_GAME', players: initialPlayers });
    }
  }, [state, send]);

  const currentPlayer = players[currentPlayerIndex];

  return (
    <main className="min-h-screen p-8 bg-background text-foreground">
      {/* Game Header */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-3xl">Brass Birmingham</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <h2 className="text-sm text-muted-foreground">Era</h2>
              <p className="text-xl font-semibold capitalize">{era}</p>
            </div>
            <div>
              <h2 className="text-sm text-muted-foreground">Round</h2>
              <p className="text-xl font-semibold">{round}</p>
            </div>
            <div>
              <h2 className="text-sm text-muted-foreground">Actions Left</h2>
              <p className="text-xl font-semibold">{actionsRemaining}</p>
            </div>
            <div>
              <h2 className="text-sm text-muted-foreground">Current Player</h2>
              <p className="text-xl font-semibold">{currentPlayer?.name ?? 'None'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Resources */}
          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <CircleDot className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Coal</p>
                    <p className="text-xl font-semibold">{resources.coal}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Factory className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Iron</p>
                    <p className="text-xl font-semibold">{resources.iron}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Beer className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Beer</p>
                    <p className="text-xl font-semibold">{resources.beer}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Players */}
          <Card>
            <CardHeader>
              <CardTitle>Players</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {players.map((player: Player, index: number) => (
                  <div
                    key={player.id}
                    className={`p-4 rounded-lg border ${
                      index === currentPlayerIndex ? 'bg-primary/10 border-primary' : 'bg-card border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">{player.name}</h3>
                      {index === currentPlayerIndex && (
                        <Badge variant="secondary">Current Turn</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex items-center space-x-2">
                        <Coins className="h-4 w-4 text-yellow-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Money</p>
                          <p className="font-semibold">£{player.money}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Trophy className="h-4 w-4 text-purple-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">VP</p>
                          <p className="font-semibold">{player.victoryPoints}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Income</p>
                          <p className="font-semibold">{player.income}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {state.matches('playing') && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <Button
                    onClick={() => send({ type: 'BUILD' })}
                    disabled={!state.can({ type: 'BUILD' })}
                    variant="secondary"
                  >
                    Build
                  </Button>
                  <Button
                    onClick={() => send({ type: 'DEVELOP' })}
                    disabled={!state.can({ type: 'DEVELOP' })}
                    variant="secondary"
                  >
                    Develop
                  </Button>
                  <Button
                    onClick={() => send({ type: 'SELL' })}
                    disabled={!state.can({ type: 'SELL' })}
                    variant="secondary"
                  >
                    Sell
                  </Button>
                  <Button
                    onClick={() => send({ type: 'TAKE_LOAN' })}
                    disabled={!state.can({ type: 'TAKE_LOAN' })}
                    variant="secondary"
                  >
                    Take Loan
                  </Button>
                  <Button
                    onClick={() => send({ type: 'END_TURN' })}
                    variant="default"
                  >
                    End Turn
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Game Log */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <Card>
              <CardHeader>
                <CardTitle>Game Log</CardTitle>
              </CardHeader>
              <CardContent>
                <GameLog logs={logs} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Game Over State */}
      {state.matches('gameOver') && (
        <Card className="mt-8">
          <CardContent className="text-center py-8">
            <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
            {/* Add victory points display and winner announcement here */}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
