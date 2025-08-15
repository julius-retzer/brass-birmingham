'use client'

import { createBrowserInspector } from '@statelyai/inspect'
import { useMachine } from '@xstate/react'
import { useEffect, useState } from 'react'
import { Board } from '../components/Board/Board'
import { GameLog } from '../components/GameLog'
import { IndustryTilesDisplay } from '../components/IndustryTilesDisplay'
import { EraTransition } from '../components/game/EraTransition'
import { ErrorDisplay } from '../components/game/ErrorDisplay'
import { GameHeader } from '../components/game/GameHeader'
import { MerchantDisplay } from '../components/game/MerchantDisplay'
import { QuickStatusBar } from '../components/game/QuickStatusBar'
import { ResourceMarkets } from '../components/game/ResourceMarkets'
import { ResourcesDisplay } from '../components/game/ResourcesDisplay'
import { TurnOrderTracker } from '../components/game/TurnOrderTracker'
import { type CityId } from '../data/board'
import { type IndustryType } from '../data/cards'
import { getInitialPlayerIndustryTiles } from '../data/industryTiles'
import { gameStore } from '../store/gameStore'
import { ImprovedGameInterface } from '../components/game/ImprovedGameInterface'
import { Toaster } from '../components/ui/sonner'

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
    spentMoney,
    selectedLocation,
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

  // Detect era transition conditions
  const isEraEnd =
    era === 'canal' &&
    snapshot.context.drawPile.length === 0 &&
    players.every((player) => player.hand.length === 0)

  const shouldShowEraTransition = isEraEnd




  const handleCitySelect = (cityId: CityId) => {
    setSelectedCity(cityId)
    send({ type: 'SELECT_LOCATION', cityId })
  }

  const handleIndustryTypeSelect = (industryType: IndustryType) => {
    send({ type: 'SELECT_INDUSTRY_TYPE', industryType })
  }

  const handleErrorDismiss = () => {
    send({ type: 'CLEAR_ERROR' })
  }

  // Sync local selectedCity with game state's selectedLocation
  useEffect(() => {
    setSelectedCity(selectedLocation)
  }, [selectedLocation])

  return (
    <main className="min-h-screen p-6 lg:p-8 bg-background text-foreground">
      {/* Quick Status Bar */}
      <div className="mb-4">
        {currentPlayer && (
          <QuickStatusBar
            currentPlayer={currentPlayer}
            actionsRemaining={actionsRemaining}
            era={era}
            round={round}
            spentMoney={spentMoney}
          />
        )}
      </div>

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

        <div className="grid xl:grid-cols-5 lg:grid-cols-3 md:grid-cols-2 gap-8 lg:gap-10 xl:gap-12">
          {/* Column 1: Game Board */}
          <div className="xl:col-span-3 lg:col-span-2 space-y-6">
            <Board
              isNetworking={snapshot.matches({ playing: { action: { networking: 'selectingLink' } } })}
              isBuilding={snapshot.matches({ playing: { action: { building: 'selectingLocation' } } })}
              era={era}
              onLinkSelect={(from, to) => {
                // Handle link selection for network wizard
                send({ type: 'SELECT_LINK', from, to })
              }}
              onCitySelect={handleCitySelect}
              selectedLink={snapshot.context.selectedLink}
              selectedCity={selectedCity}
              players={players}
              currentPlayerIndex={currentPlayerIndex}
              selectedIndustryType={snapshot.context.selectedIndustryTile?.type || null}
              selectedCard={snapshot.context.selectedCard}
              gameContext={snapshot.context}
              showSelectionFeedback={
                snapshot.matches({ playing: { action: { networking: 'selectingLink' } } }) ||
                snapshot.matches({ playing: { action: { building: 'selectingLocation' } } })
              }
            />
          </div>

          {/* Column 2: Game Interface */}
          <div className="space-y-8">
            <ImprovedGameInterface
              snapshot={snapshot}
              send={send}
              onCitySelect={handleCitySelect}
              onIndustryTypeSelect={handleIndustryTypeSelect}
            />
          </div>

          {/* Column 3: Game State & Resources */}
          <div className="space-y-8">
            <ResourcesDisplay resources={resources} />

            <ResourceMarkets coalMarket={coalMarket} ironMarket={ironMarket} />

            {/* Merchants */}
            <MerchantDisplay merchants={merchants} />

            {/* Industry Tiles */}
            {currentPlayer && (
              <IndustryTilesDisplay
                industryTiles={currentPlayer.industryTilesOnMat}
                selectedTile={null}
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

      {/* Toast Notifications */}
      <Toaster />
    </main>
  )
}
