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

type ActionState = 'building' | 'developing' | 'selling' | 'takingLoan' | 'scouting';

export default function Home() {
  const [state, send] = useMachine(gameStore);
  const {
    players,
    currentPlayerIndex,
    era,
    round,
    actionsRemaining,
    resources,
    logs,
    selectedCard,
    selectedCardsForScout,
    spentMoney
  } = state.context;

  // Start a new game with 2 players for testing
  useEffect(() => {
    if (state.matches('setup')) {
      const initialPlayers = [
        { id: '1', name: 'Player 1', money: 30, victoryPoints: 0, income: 10 },
        { id: '2', name: 'Player 2', money: 30, victoryPoints: 0, income: 10 },
      ];
      send({ type: 'START_GAME', players: initialPlayers });
    }
  }, [state, send]);

  const currentPlayer = players[currentPlayerIndex];
  const isSelectingAction = state.matches({ playing: 'selectingAction' });
  const currentActionState = state.matches('playing') ?
    (['building', 'developing', 'selling', 'takingLoan', 'scouting'] as const)
      .find(action => state.matches({ playing: action }))
    : null;

  const handleCardSelect = (card: Card) => {
    send({ type: 'SELECT_CARD', cardId: card.id });
  };

  const handleAction = (action: 'BUILD' | 'DEVELOP' | 'SELL' | 'TAKE_LOAN' | 'SCOUT') => {
    send({ type: action });
  };

  const handleConfirmAction = () => {
    send({ type: 'CONFIRM_ACTION' });
  };

  const handleCancelAction = () => {
    send({ type: 'CANCEL_ACTION' });
  };

  const getActionDescription = () => {
    if (!currentActionState) return null;

    switch (currentActionState) {
      case 'building':
        return 'Select a location or industry card to build';
      case 'developing':
        return 'Select an industry card to develop';
      case 'selling':
        return 'Select a card to sell';
      case 'takingLoan':
        return 'Taking a loan will give you £30 and decrease your income by 3';
      case 'scouting':
        return `Select ${2 - selectedCardsForScout.length} cards to discard and get wild cards`;
      default:
        return null;
    }
  };

  const canConfirmAction = () => {
    if (!currentActionState) return false;

    switch (currentActionState) {
      case 'building':
      case 'developing':
      case 'selling':
        return selectedCard !== null;
      case 'takingLoan':
        return true;
      case 'scouting':
        return selectedCardsForScout.length === 2;
      default:
        return false;
    }
  };

  return (
    <main className="min-h-screen p-8 bg-background text-foreground">
      {/* Game Header */}
      <CardUI className="mb-8">
        <CardHeader>
          <CardTitle className="text-3xl">Brass Birmingham</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
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
            <div>
              <h2 className="text-sm text-muted-foreground">Money Spent</h2>
              <p className="text-xl font-semibold">£{spentMoney}</p>
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

          {/* Actions */}
          {state.matches('playing') && (
            <CardUI>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                {currentActionState && (
                  <p className="text-sm text-muted-foreground">{getActionDescription()}</p>
                )}
              </CardHeader>
              <CardContent>
                {isSelectingAction ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <Button
                      onClick={() => handleAction('BUILD')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                    >
                      Build
                    </Button>
                    <Button
                      onClick={() => handleAction('DEVELOP')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                    >
                      Develop
                    </Button>
                    <Button
                      onClick={() => handleAction('SELL')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                    >
                      Sell
                    </Button>
                    <Button
                      onClick={() => handleAction('TAKE_LOAN')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                    >
                      Take Loan
                    </Button>
                    <Button
                      onClick={() => handleAction('SCOUT')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                    >
                      Scout
                    </Button>
                    <Button
                      onClick={() => send({ type: 'END_TURN' })}
                      variant="default"
                      className="col-span-full"
                    >
                      End Turn
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-4">
                    <Button
                      onClick={handleCancelAction}
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleConfirmAction}
                      disabled={!canConfirmAction()}
                      variant="default"
                    >
                      Confirm
                    </Button>
                  </div>
                )}
              </CardContent>
            </CardUI>
          )}

          {/* Player Hands */}
          <div className="space-y-4">
            {players.map((player, index) => (
              <PlayerHand
                key={player.id}
                player={player}
                isCurrentPlayer={index === currentPlayerIndex}
                selectedCard={selectedCard}
                selectedCards={currentActionState === 'scouting' ? selectedCardsForScout : undefined}
                onCardSelect={index === currentPlayerIndex && currentActionState ? handleCardSelect : undefined}
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
      {state.matches('gameOver') && (
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
