"use client";

import { useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { gameStore, type Player, type GameState } from '../store/gameStore';
import { GameLog } from '../components/GameLog';

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
    <main className="min-h-screen p-8 bg-gray-100">
      {/* Game Header */}
      <div className="mb-8 p-4 bg-white rounded-lg shadow">
        <h1 className="text-3xl font-bold mb-4">Brass Birmingham</h1>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <h2 className="font-semibold">Era</h2>
            <p className="capitalize">{era}</p>
          </div>
          <div>
            <h2 className="font-semibold">Round</h2>
            <p>{round}</p>
          </div>
          <div>
            <h2 className="font-semibold">Actions Left</h2>
            <p>{actionsRemaining}</p>
          </div>
          <div>
            <h2 className="font-semibold">Current Player</h2>
            <p>{currentPlayer?.name ?? 'None'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {/* Resources */}
          <div className="mb-8 p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Resources</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <h3 className="font-semibold">Coal</h3>
                <p>{resources.coal}</p>
              </div>
              <div>
                <h3 className="font-semibold">Iron</h3>
                <p>{resources.iron}</p>
              </div>
              <div>
                <h3 className="font-semibold">Beer</h3>
                <p>{resources.beer}</p>
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="mb-8 p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Players</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {players.map((player: Player, index: number) => (
                <div
                  key={player.id}
                  className={`p-4 rounded-lg ${
                    index === currentPlayerIndex ? 'bg-blue-100' : 'bg-gray-50'
                  }`}
                >
                  <h3 className="font-semibold">{player.name}</h3>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <p className="text-sm text-gray-600">Money</p>
                      <p>£{player.money}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">VP</p>
                      <p>{player.victoryPoints}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Income</p>
                      <p>{player.income}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {state.matches('playing') && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <button
                  onClick={() => send({ type: 'BUILD' })}
                  disabled={!state.can({ type: 'BUILD' })}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                >
                  Build
                </button>
                <button
                  onClick={() => send({ type: 'DEVELOP' })}
                  disabled={!state.can({ type: 'DEVELOP' })}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                >
                  Develop
                </button>
                <button
                  onClick={() => send({ type: 'SELL' })}
                  disabled={!state.can({ type: 'SELL' })}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                >
                  Sell
                </button>
                <button
                  onClick={() => send({ type: 'TAKE_LOAN' })}
                  disabled={!state.can({ type: 'TAKE_LOAN' })}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                >
                  Take Loan
                </button>
                <button
                  onClick={() => send({ type: 'END_TURN' })}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  End Turn
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Game Log */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">Game Log</h2>
              <GameLog logs={logs} />
            </div>
          </div>
        </div>
      </div>

      {/* Game Over State */}
      {state.matches('gameOver') && (
        <div className="p-4 bg-white rounded-lg shadow text-center">
          <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
          {/* Add victory points display and winner announcement here */}
        </div>
      )}
    </main>
  );
}
