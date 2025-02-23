"use client";

import { useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { gameStore, type Player } from '../store/gameStore';
import { type Card } from '../data/cards';
import { type CityId } from '../data/board';
import { GameLog } from '../components/GameLog';
import { Card as CardUI, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Coins, Trophy, TrendingUp, CircleDot, Factory, Beer } from 'lucide-react';
import { Board } from '../components/Board';
import { PlayerHand } from '../components/PlayerHand';
import { PlayerCard } from '../components/PlayerCard';
import { createBrowserInspector } from '@statelyai/inspect';


const { inspect } = createBrowserInspector();

export default function Home() {
  const [state, send] = useMachine(gameStore, {
    inspect
  });

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
    spentMoney,
    selectedLink
  } = state.context;

  console.log(state.context);

  // Start a new game with 2 players for testing
  useEffect(() => {
    if (state.matches('setup')) {
      const initialPlayers = [
        {
          id: '1',
          name: 'Player 1',
          money: 30,
          victoryPoints: 0,
          income: 10,
          links: [],
          industries: []
        },
        {
          id: '2',
          name: 'Player 2',
          money: 30,
          victoryPoints: 0,
          income: 10,
          links: [],
          industries: []
        },
      ];
      send({ type: 'START_GAME', players: initialPlayers });
    }
  }, [state, send]);

  const currentPlayer = players[currentPlayerIndex];
  const isSelectingAction = state.matches({ playing: 'actionSelection' });

  // Helper to safely get the current action and substate
  const getCurrentAction = () => {
    const playingState = state.value as { playing?: { actions?: Record<string, string> } };
    if (!playingState.playing?.actions) return null;

    const [action, states] = Object.entries(playingState.playing.actions)[0] ?? [null, null];
    if (!action || !states) return null;

    return {
      action,
      subState: states
    };
  };

  // Helper to safely check if we're in a specific state
  const isInState = (action: string, subState: string) => {
    const current = getCurrentAction();
    return current?.action === action && current?.subState === subState;
  };

  // Get the description of the current action for the UI
  const getActionDescription = () => {
    const current = getCurrentAction();
    if (!current) return null;

    const { action, subState } = current;

    switch (action) {
      case 'building':
        return subState === 'selectingCard'
          ? 'Select a location or industry card to build'
          : 'Confirm building action';
      case 'developing':
        return subState === 'selectingCard'
          ? 'Select an industry card to develop'
          : 'Confirm development action';
      case 'selling':
        return subState === 'selectingCard'
          ? 'Select a card to sell'
          : 'Confirm selling action';
      case 'takingLoan':
        return subState === 'selectingCard'
          ? 'Select a card to discard to take a loan (£30, -3 income)'
          : 'Confirm loan action';
      case 'scouting':
        return `Select ${2 - selectedCardsForScout.length} cards to discard and get wild cards`;
      case 'networking':
        switch (subState) {
          case 'selectingCard':
            return 'Select a card to discard for networking';
          case 'selectingLink':
            return era === 'canal'
              ? 'Select a canal connection to build (£3)'
              : 'Select a rail connection to build (£5, requires coal)';
          case 'confirmingLink':
            return 'Confirm link building';
          default:
            return null;
        }
      default:
        return null;
    }
  };

  const handleCardSelect = (card: Card) => {
    send({ type: 'SELECT_CARD', cardId: card.id });
  };

  const handleAction = (action: 'BUILD' | 'DEVELOP' | 'SELL' | 'TAKE_LOAN' | 'SCOUT' | 'NETWORK') => {
    send({ type: action });
  };

  const handleConfirmAction = () => {
    send({ type: 'CONFIRM_ACTION' });
  };

  const handleCancelAction = () => {
    send({ type: 'CANCEL_ACTION' });
  };

  const handleLinkSelect = (from: CityId, to: CityId) => {
    send({ type: 'SELECT_LINK', from, to });
  };

  const canConfirmAction = () => {
    const current = getCurrentAction();
    if (!current) return false;

    const { action, subState } = current;

    switch (action) {
      case 'building':
      case 'developing':
      case 'selling':
      case 'takingLoan':
        return subState.startsWith('confirming') && selectedCard !== null;
      case 'scouting':
        return selectedCardsForScout.length === 2;
      case 'networking':
        return subState === 'confirmingLink' && selectedLink !== null;
      default:
        return false;
    }
  };

  const isSelectingCards = () => {
    const current = getCurrentAction();
    if (!current) return false;

    const { action, subState } = current;

    switch (action) {
      case 'building':
      case 'developing':
      case 'selling':
      case 'takingLoan':
      case 'networking':
        return subState === 'selectingCard';
      case 'scouting':
        return subState === 'selectingCards' && selectedCardsForScout.length < 2;
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

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Game Board */}
        <div>
          <Board
            isNetworking={isInState('networking', 'selectingLink')}
            era={era}
            onLinkSelect={handleLinkSelect}
            selectedLink={selectedLink}
            players={players}
          />
        </div>

        {/* Player Info, Hand, and Actions */}
        <div className="space-y-8">
          {/* Players */}
          <div className="grid grid-cols-2 gap-4">
            {players.map((player, index) => (
              <PlayerCard
                key={player.id}
                player={player}
                isCurrentPlayer={index === currentPlayerIndex}
              />
            ))}
          </div>

          {/* Game Status */}
          <CardUI className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Game Status</span>
                <Badge variant={isSelectingAction ? "secondary" : "default"}>
                  {isSelectingAction ? "Select Action" : getCurrentAction()?.action ?? "Unknown"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium">
                {isSelectingAction
                  ? `${currentPlayer?.name}'s turn - ${actionsRemaining} action${actionsRemaining !== 1 ? 's' : ''} remaining`
                  : getActionDescription() ?? "Unknown state"}
              </p>
            </CardContent>
          </CardUI>

          {/* Current Player's Hand */}
          {currentPlayer && (
            <CardUI>
              <CardHeader>
                <CardTitle>Your Hand</CardTitle>
              </CardHeader>
              <CardContent>
                <PlayerHand
                  player={currentPlayer}
                  selectedCard={selectedCard}
                  selectedCards={isInState('scouting', 'selectingCards') ? selectedCardsForScout : undefined}
                  onCardSelect={isSelectingCards() ? handleCardSelect : undefined}
                  currentAction={getCurrentAction()?.action}
                  currentSubState={getCurrentAction()?.subState}
                />
              </CardContent>
            </CardUI>
          )}

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
          {state.matches('playing') && (
            <CardUI>
              <CardHeader>
                <CardTitle>Actions</CardTitle>

              </CardHeader>
              <CardContent>
                {isSelectingAction ? (
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      onClick={() => handleAction('BUILD')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                      className="w-full"
                    >
                      Build
                    </Button>
                    <Button
                      onClick={() => handleAction('DEVELOP')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                      className="w-full"
                    >
                      Develop
                    </Button>
                    <Button
                      onClick={() => handleAction('SELL')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                      className="w-full"
                    >
                      Sell
                    </Button>
                    <Button
                      onClick={() => handleAction('TAKE_LOAN')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                      className="w-full"
                    >
                      Take Loan
                    </Button>
                    <Button
                      onClick={() => handleAction('SCOUT')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                      className="w-full"
                    >
                      Scout
                    </Button>
                    <Button
                      onClick={() => handleAction('NETWORK')}
                      disabled={actionsRemaining <= 0}
                      variant="secondary"
                      className="w-full"
                    >
                      Network
                    </Button>
                    <Button
                      onClick={() => send({ type: 'END_TURN' })}
                      variant="default"
                      className="w-full mt-4"
                    >
                      End Turn
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={handleConfirmAction}
                      disabled={!canConfirmAction()}
                      variant="default"
                      className="w-full"
                    >
                      Confirm
                    </Button>
                    <Button
                      onClick={handleCancelAction}
                      variant="secondary"
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </CardUI>
          )}

          {/* Game Log */}
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
