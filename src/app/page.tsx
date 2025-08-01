'use client'

import { createBrowserInspector } from '@statelyai/inspect'
import { useMachine } from '@xstate/react'
import { useEffect, useState } from 'react'
import { Board } from '../components/Board/Board'
import { GameLog } from '../components/GameLog'
import { IndustryTilesDisplay } from '../components/IndustryTilesDisplay'
import { PlayerCard } from '../components/PlayerCard'
import { PlayerHand } from '../components/PlayerHand'
import { ActionButtons } from '../components/game/ActionButtons'
import { GameHeader } from '../components/game/GameHeader'
import { GameStatus } from '../components/game/GameStatus'
import { ResourcesDisplay } from '../components/game/ResourcesDisplay'
import { type CityId } from '../data/board'
import { type Card, type LocationCard } from '../data/cards'
import {
  type IndustryTile,
  getInitialPlayerIndustryTiles,
} from '../data/industryTiles'
import { gameStore } from '../store/gameStore'

const inspector = createBrowserInspector({
  autoStart: false,
})

export default function Home() {
  const [snapshot, send] = useMachine(gameStore, {
    inspect: inspector.inspect,
  })

  // Local state for city selection
  const [selectedCity, setSelectedCity] = useState<CityId | null>(null)

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
    selectedLink,
    selectedLocation,
    selectedIndustryTile,
  } = snapshot.context

  console.log('snapshot.context', snapshot.context)
  console.log('snapshot.value', snapshot.value)

  // Start a new game with 2 players for testing
  useEffect(() => {
    if (snapshot.matches('setup')) {
      const initialPlayers = [
        {
          id: '1',
          name: 'Player 1',
          money: 30,
          victoryPoints: 0,
          income: 10,
          color: 'red' as const,
          character: 'Richard Arkwright' as const,
          industryTilesOnMat: getInitialPlayerIndustryTiles(),
        },
        {
          id: '2',
          name: 'Player 2',
          money: 30,
          victoryPoints: 0,
          income: 10,
          color: 'green' as const,
          character: 'Eliza Tinsley' as const,
          industryTilesOnMat: getInitialPlayerIndustryTiles(),
        },
      ]
      send({ type: 'START_GAME', players: initialPlayers })
    }
  }, [snapshot, send])

  const currentPlayer = players[currentPlayerIndex]
  const isActionSelection = snapshot.matches({ playing: 'action' })

  console.log('🚀 ~ Home ~ isActionSelection:', isActionSelection)
  // Get the current action from state matches
  const getCurrentAction = () => {
    // Build
    if (
      snapshot.matches({
        playing: { action: { building: 'selectingCard' } },
      })
    ) {
      return { action: 'building', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { building: 'selectingTile' } },
      })
    ) {
      return { action: 'building', subState: 'selectingTile' }
    }
    if (
      snapshot.matches({
        playing: { action: { building: 'selectingLocation' } },
      })
    ) {
      return { action: 'building', subState: 'selectingLocation' }
    }
    if (
      snapshot.matches({
        playing: { action: { building: 'confirmingBuild' } },
      })
    ) {
      return { action: 'building', subState: 'confirming' }
    }

    // Develop
    if (
      snapshot.matches({
        playing: { action: { developing: 'selectingCard' } },
      })
    ) {
      return { action: 'developing', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { developing: 'confirmingDevelop' } },
      })
    ) {
      return { action: 'developing', subState: 'confirming' }
    }

    // Sell
    if (
      snapshot.matches({
        playing: { action: { selling: 'selectingCard' } },
      })
    ) {
      return { action: 'selling', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { selling: 'confirmingSell' } },
      })
    ) {
      return { action: 'selling', subState: 'confirming' }
    }

    // Loan
    if (
      snapshot.matches({
        playing: { action: { takingLoan: 'selectingCard' } },
      })
    ) {
      return { action: 'takingLoan', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { takingLoan: 'confirmingLoan' } },
      })
    ) {
      return { action: 'takingLoan', subState: 'confirming' }
    }

    // Scout
    if (
      snapshot.matches({
        playing: { action: { scouting: 'selectingCards' } },
      })
    ) {
      return { action: 'scouting', subState: 'selectingCards' }
    }

    // Network
    if (
      snapshot.matches({
        playing: { action: { networking: 'selectingCard' } },
      })
    ) {
      return { action: 'networking', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { networking: 'selectingLink' } },
      })
    ) {
      return { action: 'networking', subState: 'selectingLink' }
    }
    if (
      snapshot.matches({
        playing: { action: { networking: 'confirmingLink' } },
      })
    ) {
      return { action: 'networking', subState: 'confirmingLink' }
    }

    return null
  }

  // Helper to safely check if we're in a specific state
  const isInState = (action: string, subState: string) => {
    const current = getCurrentAction()
    return current?.action === action && current?.subState === subState
  }

  // Get the description of the current action for the UI
  const getActionDescription = () => {
    if (isActionSelection) {
      return `${currentPlayer?.name}'s turn - ${actionsRemaining} action${actionsRemaining !== 1 ? 's' : ''} remaining`
    }

    const current = getCurrentAction()
    if (!current) return null

    const { action, subState } = current

    switch (action) {
      case 'building':
        if (subState === 'selectingCard') {
          return 'Select a location or industry card to build'
        } else if (subState === 'selectingTile') {
          return 'Select an industry tile to build'
        } else if (subState === 'selectingLocation') {
          if (selectedCard?.type === 'location') {
            return `Building at ${(selectedCard as LocationCard).location} - click to confirm location`
          } else if (
            selectedCard?.type === 'industry' &&
            selectedIndustryTile
          ) {
            return `Select a city to build ${selectedIndustryTile.type} Level ${selectedIndustryTile.level}`
          }
          return 'Select a location to build'
        } else if (subState === 'confirming') {
          if (selectedIndustryTile) {
            return `Confirm building ${selectedIndustryTile.type} Level ${selectedIndustryTile.level} at ${selectedLocation}`
          }
          return 'Confirm building action'
        }
        return 'Building...'
      case 'developing':
        return subState === 'selectingCard'
          ? 'Select an industry card to develop'
          : 'Confirm development action'
      case 'selling':
        return subState === 'selectingCard'
          ? 'Select a card to sell'
          : 'Confirm selling action'
      case 'takingLoan':
        return subState === 'selectingCard'
          ? 'Select a card to discard to take a loan (£30, -3 income)'
          : 'Confirm loan action'
      case 'scouting':
        return `Select ${2 - selectedCardsForScout.length} cards to discard and get wild cards`
      case 'networking':
        switch (subState) {
          case 'selectingCard':
            return 'Select a card to discard for networking'
          case 'selectingLink':
            return era === 'canal'
              ? 'Select a canal connection to build (£3)'
              : 'Select a rail connection to build (£5, requires coal)'
          case 'confirmingLink':
            return 'Confirm link building'
          default:
            return null
        }
      default:
        return null
    }
  }

  const handleCardSelect = (card: Card) => {
    send({ type: 'SELECT_CARD', cardId: card.id })
    // Clear city selection when selecting a new card
    setSelectedCity(null)
  }

  const handleLinkSelect = (from: CityId, to: CityId) => {
    send({ type: 'SELECT_LINK', from, to })
  }

  const handleCitySelect = (cityId: CityId) => {
    setSelectedCity(cityId)
    send({ type: 'SELECT_LOCATION', cityId })
  }

  const isSelectingCards = () => {
    const current = getCurrentAction()
    if (!current) return false

    const { action, subState } = current

    switch (action) {
      case 'building':
      case 'developing':
      case 'selling':
      case 'takingLoan':
      case 'networking':
        return subState === 'selectingCard'
      case 'scouting':
        return subState === 'selectingCards' && selectedCardsForScout.length < 2
      default:
        return false
    }
  }

  // Clear local selections when game state changes
  useEffect(() => {
    if (isActionSelection || !getCurrentAction()) {
      setSelectedCity(null)
    }
  }, [isActionSelection, getCurrentAction])

  // Sync local selectedCity with game state's selectedLocation
  useEffect(() => {
    setSelectedCity(selectedLocation)
  }, [selectedLocation])

  return (
    <main className="min-h-screen p-8 bg-background text-foreground">
      <GameHeader
        era={era}
        round={round}
        actionsRemaining={actionsRemaining}
        currentPlayerName={currentPlayer?.name ?? ''}
        spentMoney={spentMoney}
        onStartInspector={() => inspector.start()}
      />

      {/* Current Player Turn Indicator */}
      <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full border-2`}
              style={{
                backgroundColor: currentPlayer?.color,
                borderColor: currentPlayer?.color,
              }}
            />
            <h2 className="text-lg font-semibold">
              {currentPlayer?.name}'s Turn
            </h2>
          </div>
          <div className="text-sm text-muted-foreground">
            {actionsRemaining} action{actionsRemaining !== 1 ? 's' : ''}{' '}
            remaining
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {getActionDescription() || 'Select an action to continue your turn'}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Game Board */}
        <div>
          <Board
            isNetworking={isInState('networking', 'selectingLink')}
            isBuilding={Boolean(isInState('building', 'selectingLocation'))}
            era={era}
            onLinkSelect={handleLinkSelect}
            onCitySelect={handleCitySelect}
            selectedLink={selectedLink}
            selectedCity={selectedCity}
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

          <GameStatus
            isActionSelection={isActionSelection}
            currentAction={getCurrentAction()?.action}
            description={getActionDescription() ?? 'Waiting for action...'}
          />

          {/* Current Player's Hand */}
          {currentPlayer && (
            <PlayerHand
              player={currentPlayer}
              selectedCard={selectedCard}
              selectedCards={
                isInState('scouting', 'selectingCards')
                  ? selectedCardsForScout
                  : undefined
              }
              onCardSelect={isSelectingCards() ? handleCardSelect : undefined}
              currentAction={getCurrentAction()?.action}
              currentSubState={getCurrentAction()?.subState}
            />
          )}

          <ResourcesDisplay resources={resources} />

          {/* Industry Tiles */}
          {currentPlayer && (
            <IndustryTilesDisplay
              industryTiles={currentPlayer.industryTilesOnMat}
              selectedTile={selectedIndustryTile}
              onTileSelect={(tile) => {
                send({ type: 'SELECT_INDUSTRY_TILE', tile })
              }}
              era={era}
              playerName={currentPlayer.name}
              isSelecting={isInState('building', 'selectingTile')}
            />
          )}

          {/* Actions */}
          {snapshot.matches('playing') && (
            <ActionButtons snapshot={snapshot} send={send} />
          )}

          {/* Game Log */}
          <div className="sticky top-8">
            <GameLog logs={logs} />
          </div>
        </div>
      </div>
    </main>
  )
}
