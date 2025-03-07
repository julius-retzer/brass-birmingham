'use client'

import { createBrowserInspector } from '@statelyai/inspect'
import { useMachine } from '@xstate/react'
import { useEffect } from 'react'
import { Board } from '../components/Board/Board'
import { GameLog } from '../components/GameLog'
import { PlayerCard } from '../components/PlayerCard'
import { PlayerHand } from '../components/PlayerHand'
import { ActionButtons } from '../components/game/ActionButtons'
import { GameHeader } from '../components/game/GameHeader'
import { GameOver } from '../components/game/GameOver'
import { GameStatus } from '../components/game/GameStatus'
import { ResourcesDisplay } from '../components/game/ResourcesDisplay'
import { type CityId } from '../data/board'
import { type Card } from '../data/cards'
import { gameStore } from '../store/gameStore'

const inspector = createBrowserInspector({
  autoStart: false,
})

export default function Home() {
  const [snapshot, send] = useMachine(gameStore, {
    inspect: inspector.inspect,
  })

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
          links: [],
          industries: [],
        },
        {
          id: '2',
          name: 'Player 2',
          money: 30,
          victoryPoints: 0,
          income: 10,
          color: 'green' as const,
          character: 'Eliza Tinsley' as const,
          links: [],
          industries: [],
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
      return { action: 'build', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { building: 'confirmingBuild' } },
      })
    ) {
      return { action: 'build', subState: 'confirming' }
    }

    // Develop
    if (
      snapshot.matches({
        playing: { action: { developing: 'selectingCard' } },
      })
    ) {
      return { action: 'develop', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { developing: 'confirmingDevelop' } },
      })
    ) {
      return { action: 'develop', subState: 'confirming' }
    }

    // Sell
    if (
      snapshot.matches({
        playing: { action: { selling: 'selectingCard' } },
      })
    ) {
      return { action: 'sell', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { selling: 'confirmingSell' } },
      })
    ) {
      return { action: 'sell', subState: 'confirming' }
    }

    // Loan
    if (
      snapshot.matches({
        playing: { action: { takingLoan: 'selectingCard' } },
      })
    ) {
      return { action: 'loan', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { takingLoan: 'confirmingLoan' } },
      })
    ) {
      return { action: 'loan', subState: 'confirming' }
    }

    // Scout
    if (
      snapshot.matches({
        playing: { action: { scouting: 'selectingCards' } },
      })
    ) {
      return { action: 'scout', subState: 'selectingCards' }
    }

    // Network
    if (
      snapshot.matches({
        playing: { action: { networking: 'selectingCard' } },
      })
    ) {
      return { action: 'network', subState: 'selectingCard' }
    }
    if (
      snapshot.matches({
        playing: { action: { networking: 'selectingLink' } },
      })
    ) {
      return { action: 'network', subState: 'selectingLink' }
    }
    if (
      snapshot.matches({
        playing: { action: { networking: 'confirmingLink' } },
      })
    ) {
      return { action: 'network', subState: 'confirmingLink' }
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
      case 'build':
        return subState === 'selectingCard'
          ? 'Select a location or industry card to build'
          : 'Confirm building action'
      case 'develop':
        return subState === 'selectingCard'
          ? 'Select an industry card to develop'
          : 'Confirm development action'
      case 'sell':
        return subState === 'selectingCard'
          ? 'Select a card to sell'
          : 'Confirm selling action'
      case 'loan':
        return subState === 'selectingCard'
          ? 'Select a card to discard to take a loan (£30, -3 income)'
          : 'Confirm loan action'
      case 'scout':
        return `Select ${2 - selectedCardsForScout.length} cards to discard and get wild cards`
      case 'network':
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
  }

  const handleAction = (
    action: 'BUILD' | 'DEVELOP' | 'SELL' | 'TAKE_LOAN' | 'SCOUT' | 'NETWORK',
  ) => {
    send({ type: action })
  }

  const handleConfirmAction = () => {
    send({ type: 'CONFIRM' })
  }

  const handleCancelAction = () => {
    send({ type: 'CANCEL' })
  }

  const handleLinkSelect = (from: CityId, to: CityId) => {
    send({ type: 'SELECT_LINK', from, to })
  }

  const canConfirmAction = () => {
    const current = getCurrentAction()
    if (!current) return false

    const { action, subState } = current

    switch (action) {
      case 'build':
      case 'develop':
      case 'sell':
      case 'loan':
        return subState.startsWith('confirming') && selectedCard !== null
      case 'scout':
        return selectedCardsForScout.length === 2
      case 'network':
        return subState === 'confirmingLink' && selectedLink !== null
      default:
        return false
    }
  }

  const isSelectingCards = () => {
    const current = getCurrentAction()
    if (!current) return false

    const { action, subState } = current

    switch (action) {
      case 'build':
      case 'develop':
      case 'sell':
      case 'loan':
      case 'network':
        return subState === 'selectingCard'
      case 'scout':
        return subState === 'selectingCards' && selectedCardsForScout.length < 2
      default:
        return false
    }
  }

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

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Game Board */}
        <div>
          <Board
            isNetworking={isInState('network', 'selectingLink')}
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
                isInState('scout', 'selectingCards')
                  ? selectedCardsForScout
                  : undefined
              }
              onCardSelect={isSelectingCards() ? handleCardSelect : undefined}
              currentAction={getCurrentAction()?.action}
              currentSubState={getCurrentAction()?.subState}
            />
          )}

          <ResourcesDisplay resources={resources} />

          {/* Actions */}
          {snapshot.matches('playing') && (
            <ActionButtons
              snapshot={snapshot}
              send={send}
            />
          )}

          {/* Game Log */}
          <div className="sticky top-8">
            <GameLog logs={logs} />
          </div>
        </div>
      </div>

      {/* Game Over State */}
      {snapshot.matches('gameOver') && <GameOver />}
    </main>
  )
}
