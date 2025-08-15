'use client'

import { useTransition, useMemo, useState, useEffect } from 'react'
import { sendEventAction } from '~/app/actions'
import { ImprovedGameInterface } from './game/ImprovedGameInterface'
import type { GameStoreSnapshot, GameEvent } from '~/store/gameStore'
import { gameStore } from '~/store/gameStore'
import { createActor } from 'xstate'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Board } from './Board/Board'
import { GameLog } from './GameLog'
import { IndustryTilesDisplay } from './IndustryTilesDisplay'
import { ErrorDisplay } from './game/ErrorDisplay'
import { MerchantDisplay } from './game/MerchantDisplay'
import { QuickStatusBar } from './game/QuickStatusBar'
import { ResourceMarkets } from './game/ResourceMarkets'
import { TurnOrderTracker } from './game/TurnOrderTracker'
import { EraTransition } from './game/EraTransition'
import { type CityId } from '../data/board'
import { type IndustryType } from '../data/cards'
import { Toaster } from './ui/sonner'

// Type for persisted snapshot (JSON-serializable data from server)
interface PersistedGameSnapshot {
  state: unknown
  context: unknown
  [key: string]: unknown
}

interface GameInterfaceProps {
  gameState: PersistedGameSnapshot // Persisted snapshot from server (JSON-serializable)
  gameId: string
  playerIndex: 1 | 2
  playerName: string
}

export function GameInterface({ gameState, gameId, playerIndex, playerName }: GameInterfaceProps) {
  const [isPending, startTransition] = useTransition()
  
  // Local state for city selection (matching home page)
  const [selectedCity, setSelectedCity] = useState<CityId | null>(null)
  
  // Recreate XState actor from persisted snapshot for full compatibility
  const liveSnapshot = useMemo(() => {
    try {
      console.log('🔄 Attempting to recreate actor from persisted snapshot:', gameState)
      
      // Create a new actor and restore it from the persisted snapshot
      const actor = createActor(gameStore, {
        snapshot: gameState
      })
      console.log('✅ Actor created successfully')
      
      actor.start()
      console.log('✅ Actor started successfully')
      
      // Get the current snapshot from the restored actor
      const liveSnapshot = actor.getSnapshot()
      console.log('✅ Live snapshot obtained:', liveSnapshot.value)
      console.log('✅ Live snapshot context keys:', Object.keys(liveSnapshot.context || {}))
      
      return liveSnapshot
    } catch (error) {
      console.error('❌ Error creating live actor from persisted snapshot:', error)
      console.error('❌ Persisted snapshot structure:', JSON.stringify(gameState, null, 2))
      
      // Fallback to mock if restoration fails
      const fallback = {
        ...gameState,
        matches: () => false,
        can: () => true,
        hasTag: () => false,
        toStrings: () => ['unknown']
      } as GameStoreSnapshot
      
      console.warn('⚠️ Using fallback mock snapshot')
      return fallback
    }
  }, [gameState])
  
  const handleEvent = (event: GameEvent) => {
    startTransition(async () => {
      const result = await sendEventAction(gameId, playerIndex, event)
      if (!result.success && result.error) {
        // Show error message - for now just log it
        console.error('Game action failed:', result.error)
        // TODO: Show toast notification or error state
      }
    })
  }

  // City selection handler (matching home page)
  const handleCitySelect = (cityId: CityId) => {
    setSelectedCity(cityId)
    handleEvent({ type: 'SELECT_LOCATION', cityId })
  }

  // Industry type selection handler (matching home page)
  const handleIndustryTypeSelect = (industryType: IndustryType) => {
    handleEvent({ type: 'SELECT_INDUSTRY_TYPE', industryType })
  }

  // Error dismiss handler (matching home page)
  const handleErrorDismiss = () => {
    handleEvent({ type: 'CLEAR_ERROR' })
  }

  // Sync local selectedCity with game state's selectedLocation (matching home page)
  useEffect(() => {
    if (liveSnapshot?.context?.selectedLocation) {
      setSelectedCity(liveSnapshot.context.selectedLocation)
    }
  }, [liveSnapshot?.context?.selectedLocation])
  
  // Access context safely since gameState is a persisted snapshot  
  const context = (gameState as PersistedGameSnapshot)?.context as any
  const isMyTurn = context?.currentPlayerIndex === playerIndex - 1
  
  // Don't render if liveSnapshot failed to create
  if (!liveSnapshot || !liveSnapshot.context) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-auto p-6 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Loading Game...</h1>
          <p className="text-muted-foreground">
            Initializing game state...
          </p>
        </div>
      </div>
    )
  }

  // Extract all needed data from liveSnapshot (like home page)
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
  } = liveSnapshot.context

  const currentGamePlayer = players[currentPlayerIndex]
  const myPlayer = players[playerIndex - 1]
  const opponentPlayer = players[playerIndex === 1 ? 1 : 0]

  // Detect era transition conditions (like home page)
  const isEraEnd =
    era === 'canal' &&
    liveSnapshot.context.drawPile.length === 0 &&
    players.every((player) => player.hand.length === 0)

  const shouldShowEraTransition = isEraEnd

  return (
    <main className="min-h-screen p-6 lg:p-8 bg-background text-foreground">
      {/* Header with player info and turn status */}
      <div className="bg-card border-b p-4 mb-4 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">Brass Birmingham</h1>
            <Badge variant={isMyTurn ? "default" : "secondary"}>
              {isMyTurn ? "Your Turn" : "Waiting for opponent"}
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">You are</p>
            <p className="font-semibold text-lg">{playerName} (Player {playerIndex})</p>
          </div>
        </div>
      </div>

      {/* Quick Status Bar */}
      <div className="mb-4">
        {myPlayer && (
          <QuickStatusBar
            currentPlayer={myPlayer}
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
        {/* Turn Order Tracker - Collapsible */}
        <div className="hidden xl:block">
          <TurnOrderTracker
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            round={round}
            era={era}
            spentMoney={spentMoney}
            playerSpending={liveSnapshot.context.playerSpending}
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
                handleEvent({ type: 'TRIGGER_CANAL_ERA_END' })
              }}
            />
          </div>
        )}

        <div className="grid 2xl:grid-cols-5 gap-8 lg:gap-10 2xl:gap-12">
          {/* Column 1: Game Board */}
          <div className="2xl:col-span-3 space-y-6">
            <Board
              isNetworking={liveSnapshot.matches({ playing: { action: { networking: 'selectingLink' } } })}
              isBuilding={liveSnapshot.matches({ playing: { action: { building: 'selectingLocation' } } })}
              era={era}
              onLinkSelect={(from, to) => {
                // Handle link selection for network wizard
                handleEvent({ type: 'SELECT_LINK', from, to })
              }}
              onCitySelect={handleCitySelect}
              selectedLink={liveSnapshot.context.selectedLink}
              selectedCity={selectedCity}
              players={players}
              currentPlayerIndex={currentPlayerIndex}
              selectedIndustryType={liveSnapshot.context.selectedIndustryTile?.type || null}
              selectedCard={liveSnapshot.context.selectedCard}
              gameContext={liveSnapshot.context}
              showSelectionFeedback={
                liveSnapshot.matches({ playing: { action: { networking: 'selectingLink' } } }) ||
                liveSnapshot.matches({ playing: { action: { building: 'selectingLocation' } } })
              }
            />
          </div>

          {/* Sidebar: Game Interface + Resources (stacked on small screens, columns 2+3 on 2xl+) */}
          <div className="2xl:col-span-2 space-y-10">
            {/* Game Interface */}
            <div>
              <ImprovedGameInterface
                snapshot={liveSnapshot}
                send={handleEvent}
                onCitySelect={handleCitySelect}
                onIndustryTypeSelect={handleIndustryTypeSelect}
                loading={isPending}
                disabled={!isMyTurn}
              />
            </div>

            {/* Resources Section */}
            <div className="grid gap-8 lg:grid-cols-2 2xl:grid-cols-1">
              <div className="space-y-8">
                <ResourceMarkets coalMarket={coalMarket} ironMarket={ironMarket} />
              </div>
              
              <div className="space-y-8">
                {/* Merchants */}
                <MerchantDisplay merchants={merchants} />

                {/* Industry Tiles */}
                {myPlayer && (
                  <IndustryTilesDisplay
                    industryTiles={myPlayer.industryTilesOnMat}
                    selectedTile={null}
                    onTileSelect={() => {
                      // Manual tile selection no longer needed - tiles are auto-selected
                    }}
                    era={era}
                    playerName={myPlayer.name}
                    isSelecting={false}
                  />
                )}

                {/* Game Log */}
                <GameLog logs={logs} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <Toaster />
    </main>
  )
}