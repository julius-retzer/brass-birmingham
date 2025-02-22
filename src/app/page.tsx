"use client";

import { useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { gameStore, type Player, type Card } from '../store/gameStore';
import { GameLog } from '../components/GameLog';
import { Card as CardUI, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Coins, Trophy, TrendingUp, CircleDot, Factory, Beer } from 'lucide-react';
import { Board } from '../components/Board';
import { PlayerHand } from '../components/PlayerHand';

export default function Home() {
  const [state, send] = useMachine(gameStore);
  const { players, currentPlayerIndex, era, round, actionsRemaining, resources, logs, selectedCard } = state.context;

  // Start a new game with 2 players for testing
  useEffect(() => {
    if (state.value === 'setup') {
      const initialPlayers = [
        { id: '1', name: 'Player 1', money: 30, victoryPoints: 0, income: 10 },
        { id: '2', name: 'Player 2', money: 30, victoryPoints: 0, income: 10 },
      ];
      send({ type: 'START_GAME', players: initialPlayers });
    }
  }, [state, send]);

  const currentPlayer = players[currentPlayerIndex];

  const handleCardSelect = (card: Card) => {
    send({ type: 'SELECT_CARD', cardId: card.id });
  };

  const handleAction = (action: 'BUILD' | 'DEVELOP' | 'SELL' | 'TAKE_LOAN' | 'SCOUT') => {
    send({ type: 'SELECT_ACTION', action });
  };

  return (
    <main className="min-h-screen p-8 bg-background text-foreground">
      {/* Game Header */}
      <CardUI className="mb-8">
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
      </CardUI>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Game Board */}
          <CardUI>
            <CardHeader>
              <CardTitle>Game Board</CardTitle>
            </CardHeader>
            <CardContent>
              <Board />
            </CardContent>
          </CardUI>

          {/* Player Hands */}
          <div className="space-y-4">
            {players.map((player, index) => (
              <PlayerHand
                key={player.id}
                player={player}
                isCurrentPlayer={index === currentPlayerIndex}
                selectedCard={selectedCard}
                onCardSelect={index === currentPlayerIndex ? handleCardSelect : undefined}
              />
            ))}
          </div>

          {/* Resources */}
          <CardUI>
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
          </CardUI>

          {/* Actions */}
          {state.value === 'playing' && (
            <CardUI>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <Button
                    onClick={() => handleAction('BUILD')}
                    disabled={!state.can({ type: 'SELECT_ACTION', action: 'BUILD' })}
                    variant="secondary"
                  >
                    Build
                  </Button>
                  <Button
                    onClick={() => handleAction('DEVELOP')}
                    disabled={!state.can({ type: 'SELECT_ACTION', action: 'DEVELOP' })}
                    variant="secondary"
                  >
                    Develop
                  </Button>
                  <Button
                    onClick={() => handleAction('SELL')}
                    disabled={!state.can({ type: 'SELECT_ACTION', action: 'SELL' })}
                    variant="secondary"
                  >
                    Sell
                  </Button>
                  <Button
                    onClick={() => handleAction('TAKE_LOAN')}
                    disabled={!state.can({ type: 'SELECT_ACTION', action: 'TAKE_LOAN' })}
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
            </CardUI>
          )}
        </div>

        {/* Game Log */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <CardUI>
              <CardHeader>
                <CardTitle>Game Log</CardTitle>
              </CardHeader>
              <CardContent>
                <GameLog logs={logs} />
              </CardContent>
            </CardUI>
          </div>
        </div>
      </div>

      {/* Game Over State */}
      {state.value === 'gameOver' && (
        <CardUI className="mt-8">
          <CardContent className="text-center py-8">
            <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
            {/* Add victory points display and winner announcement here */}
          </CardContent>
        </CardUI>
      )}
    </main>
  );
}
