'use client'

import { createBrowserInspector } from '@statelyai/inspect'
import { useMachine } from '@xstate/react'
import { useEffect, useState } from 'react'
import { Board } from '../components/Board/Board'
import { GameLog } from '../components/GameLog'
import { IndustryTilesDisplay } from '../components/IndustryTilesDisplay'
import { PlayerHand } from '../components/PlayerHand'
import { ActionButtons } from '../components/game/ActionButtons'
import { ActionProgress } from '../components/game/ActionProgress'
import { BuildSecondLink } from '../components/game/BuildSecondLink'
import { DevelopInterface } from '../components/game/DevelopInterface'
import { EraTransition } from '../components/game/EraTransition'
import { ErrorDisplay } from '../components/game/ErrorDisplay'
import { GameHeader } from '../components/game/GameHeader'
import { IndustryTypeSelector } from '../components/game/IndustryTypeSelector'
import { MerchantDisplay } from '../components/game/MerchantDisplay'
import { QuickStatusBar } from '../components/game/QuickStatusBar'
import { ResourceMarkets } from '../components/game/ResourceMarkets'
import { ResourcesDisplay } from '../components/game/ResourcesDisplay'
import { SellInterface } from '../components/game/SellInterface'
import { TurnOrderTracker } from '../components/game/TurnOrderTracker'
import { type CityId } from '../data/board'
import {
  type Card,
  type IndustryCard,
  type IndustryType,
  type LocationCard,
} from '../data/cards'
import { getInitialPlayerIndustryTilesWithQuantities } from '../data/industryTiles'
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
    coalMarket,
    ironMarket,
    logs,
    selectedCard,
    selectedCardsForScout,
    spentMoney,
    selectedLink,
    selectedSecondLink,
    selectedLocation,
    selectedIndustryTile,
    merchants,
    lastError,
    errorContext,
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
          industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
        },
        {
          id: '2',
          name: 'Player 2',
          money: 30,
          victoryPoints: 0,
          income: 10,
          color: 'green' as const,
          character: 'Eliza Tinsley' as const,
          industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
        },
      ]
      send({ type: 'START_GAME', players: initialPlayers })
    }
  }, [snapshot, send])

  const currentPlayer = players[currentPlayerIndex]
  const isActionSelection = snapshot.matches({ playing: 'action' })

  // Detect era transition conditions
  const isEraEnd =
    era === 'canal' &&
    snapshot.context.drawPile.length === 0 &&
    players.every((player) => player.hand.length === 0)

  const shouldShowEraTransition = isEraEnd

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
        playing: { action: { building: 'selectingIndustryType' } },
      })
    ) {
      return { action: 'building', subState: 'selectingIndustryType' }
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
    if (
      snapshot.matches({
        playing: { action: { networking: 'selectingSecondLink' } },
      })
    ) {
      return { action: 'networking', subState: 'selectingSecondLink' }
    }
    if (
      snapshot.matches({
        playing: { action: { networking: 'confirmingDoubleLink' } },
      })
    ) {
      return { action: 'networking', subState: 'confirmingDoubleLink' }
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
        } else if (subState === 'selectingIndustryType') {
          return 'Select which industry type to build'
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
        return `Select ${3 - selectedCardsForScout.length} more cards to discard (${selectedCardsForScout.length}/3 selected)`
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
          case 'selectingSecondLink':
            return 'Select a second rail connection to build (requires beer)'
          case 'confirmingDoubleLink':
            return 'Confirm double link building'
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

  const handleSecondLinkSelect = (from: CityId, to: CityId) => {
    send({ type: 'SELECT_SECOND_LINK', from, to })
  }

  const handleCitySelect = (cityId: CityId) => {
    setSelectedCity(cityId)
    send({ type: 'SELECT_LOCATION', cityId })
  }

  const handleIndustryTypeSelect = (industryType: IndustryType) => {
    send({ type: 'SELECT_INDUSTRY_TYPE', industryType })
  }

  const handleSellSelection = () => {
    // For now, just confirm the sell action
    // In a full implementation, this would store the selection and move to confirmation
    send({ type: 'CONFIRM' })
  }

  const handleDevelopSelection = () => {
    // For now, just confirm the develop action
    // In a full implementation, this would store the selection and enhance the game store
    send({ type: 'CONFIRM' })
  }

  const handleErrorDismiss = () => {
    send({ type: 'CLEAR_ERROR' })
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
        return subState === 'selectingCards' && selectedCardsForScout.length < 3
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
    <main className="min-h-screen p-4 bg-background text-foreground">
      {/* Quick Status Bar - Always Visible */}
      {currentPlayer && (
        <QuickStatusBar
          currentPlayer={currentPlayer}
          actionsRemaining={actionsRemaining}
          era={era}
          round={round}
          spentMoney={spentMoney}
        />
      )}

      {/* Error Display - Show validation errors prominently */}
      <ErrorDisplay
        error={lastError}
        errorContext={errorContext}
        onDismiss={handleErrorDismiss}
      />

      <div className="mt-4 space-y-4">
        {/* Detailed Game Header - Collapsible on smaller screens */}
        <div className="hidden lg:block">
          <GameHeader
            era={era}
            round={round}
            actionsRemaining={actionsRemaining}
            currentPlayerName={currentPlayer?.name ?? ''}
            spentMoney={spentMoney}
            onStartInspector={() => inspector.start()}
          />
        </div>

        {/* Turn Order Tracker - Collapsible */}
        <div className="hidden xl:block">
          <TurnOrderTracker
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            round={round}
            era={era}
            spentMoney={spentMoney}
            playerSpending={snapshot.context.playerSpending}
          />
        </div>

        {/* Era Transition Modal/Overlay */}
        {shouldShowEraTransition && (
          <div className="mb-6">
            <EraTransition
              players={players}
              fromEra="canal"
              toEra="rail"
              onCompleteTransition={() => {
                send({ type: 'TRIGGER_CANAL_ERA_END' })
              }}
            />
          </div>
        )}

        <div className="grid xl:grid-cols-4 lg:grid-cols-3 gap-6">
          {/* Column 1: Game Board & Network */}
          <div className="xl:col-span-2 lg:col-span-2 space-y-6">
<Board
              isNetworking={
                isInState('networking', 'selectingLink') ||
                isInState('networking', 'selectingSecondLink')
              }
              isBuilding={Boolean(isInState('building', 'selectingLocation'))}
              era={era}
              onLinkSelect={
                isInState('networking', 'selectingSecondLink')
                  ? handleSecondLinkSelect
                  : handleLinkSelect
              }
              onCitySelect={handleCitySelect}
              selectedLink={
                isInState('networking', 'selectingSecondLink')
                  ? selectedSecondLink
                  : selectedLink
              }
              selectedCity={selectedCity}
              players={players}
              currentPlayerIndex={currentPlayerIndex}
              selectedIndustryType={selectedIndustryTile?.type || null}
              selectedCard={selectedCard ? {
                id: selectedCard.id,
                type: selectedCard.type,
                location: selectedCard.type === 'location' ? (selectedCard as LocationCard).location : undefined
              } : null}
              gameContext={snapshot.context}
              showSelectionFeedback={Boolean(
                isInState('building', 'selectingLocation') ||
                  isInState('networking', 'selectingLink') ||
                  isInState('networking', 'selectingSecondLink'),
              )}
            />
          </div>

          {/* Column 2: Player Actions & Hand */}
          <div className="space-y-6">
            {/* Action Progress Indicator */}
            <ActionProgress
              actionType={getCurrentAction()?.action || null}
              subState={getCurrentAction()?.subState || null}
              selectedCard={selectedCard}
              selectedLocation={selectedLocation}
              selectedIndustryTile={selectedIndustryTile}
              era={era}
              playerMoney={currentPlayer?.money || 0}
              canAfford={true} // TODO: Calculate based on action
            />

            {/* Current Player Turn Status - Simplified when action is active */}
            {!getCurrentAction() && (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
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
                <p className="text-sm text-muted-foreground">
                  Select an action to continue your turn
                </p>
              </div>
            )}

            {/* Action Interfaces */}
            {isInState('building', 'selectingIndustryType') &&
              currentPlayer &&
              (selectedCard?.type === 'industry' ||
                selectedCard?.type === 'location' ||
                selectedCard?.type === 'wild_location') && (
                <IndustryTypeSelector
                  industryCard={
                    selectedCard?.type === 'industry'
                      ? (selectedCard as IndustryCard)
                      : undefined
                  }
                  locationCard={
                    selectedCard?.type === 'location' ||
                    selectedCard?.type === 'wild_location'
                      ? selectedCard
                      : undefined
                  }
                  player={currentPlayer}
                  gameState={snapshot.context}
                  era={era}
                  onSelectIndustryType={handleIndustryTypeSelect}
                  onCancel={() => send({ type: 'CANCEL' })}
                />
              )}

            {isInState('selling', 'confirming') && currentPlayer && (
              <SellInterface
                player={currentPlayer}
                onSelectSale={handleSellSelection}
                onCancel={() => send({ type: 'CANCEL' })}
              />
            )}

            {isInState('developing', 'confirming') && currentPlayer && (
              <DevelopInterface
                player={currentPlayer}
                onSelectDevelopment={handleDevelopSelection}
                onCancel={() => send({ type: 'CANCEL' })}
              />
            )}

            {(isInState('networking', 'selectingSecondLink') ||
              isInState('networking', 'confirmingDoubleLink')) &&
              currentPlayer &&
              selectedLink && (
                <BuildSecondLink
                  player={currentPlayer}
                  era={era}
                  firstLink={selectedLink}
                  selectedLink={selectedSecondLink}
                  onLinkSelect={handleSecondLinkSelect}
                  onConfirm={() =>
                    send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
                  }
                  onCancel={() => send({ type: 'CANCEL' })}
                  snapshot={snapshot}
                />
              )}

            {/* Actions */}
            {snapshot.matches('playing') && (
              <ActionButtons snapshot={snapshot} send={send} />
            )}

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
          </div>

          {/* Column 3: Game State & Resources */}
          <div className="space-y-6">
            <ResourcesDisplay resources={resources} />

            <ResourceMarkets coalMarket={coalMarket} ironMarket={ironMarket} />

            {/* Merchants */}
            <MerchantDisplay merchants={merchants} />

            {/* Industry Tiles */}
            {currentPlayer && (
              <IndustryTilesDisplay
                industryTiles={currentPlayer.industryTilesOnMat}
                selectedTile={selectedIndustryTile}
                onTileSelect={() => {
                  // Manual tile selection no longer needed - tiles are auto-selected
                }}
                era={era}
                playerName={currentPlayer.name}
                isSelecting={false}
              />
            )}

            {/* Game Log */}
            <GameLog logs={logs} />
          </div>
        </div>
      </div>
    </main>
  )
}
