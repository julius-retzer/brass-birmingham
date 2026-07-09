'use client'

import { useMachine } from '@xstate/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Board } from '~/components/Board/Board'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Toaster } from '~/components/ui/sonner'
import { type CityId } from '~/data/board'
import { type Player, gameStore } from '~/store/gameStore'
import { ActionPanel } from './action-panel'
import { GameLog } from './game-log'
import { GameOverScreen } from './game-over-screen'
import { PlayerPanel } from './player-panel'
import { SetupScreen } from './setup-screen'

export function HotseatGame() {
  const [key, setKey] = useState(0)
  return <HotseatGameInner key={key} onRestart={() => setKey((k) => k + 1)} />
}

function HotseatGameInner({ onRestart }: { onRestart: () => void }) {
  const [state, send] = useMachine(gameStore)
  const [revealedFor, setRevealedFor] = useState<string | null>(null)

  const ctx = state.context
  const currentPlayer: Player | undefined = ctx.players[ctx.currentPlayerIndex]

  // Surface recoverable engine errors as toasts.
  useEffect(() => {
    if (ctx.lastError) {
      toast.error(ctx.lastError)
      send({ type: 'CLEAR_ERROR' })
    }
  }, [ctx.lastError, send])

  if (state.matches('setup')) {
    return (
      <>
        <SetupScreen
          onStart={(players) => {
            send({ type: 'START_GAME', players })
            setRevealedFor(players[0]?.id ?? null)
          }}
        />
        <Toaster />
      </>
    )
  }

  if (state.matches('gameOver')) {
    return (
      <GameOverScreen
        players={ctx.players}
        winners={ctx.winners ?? []}
        onRestart={onRestart}
      />
    )
  }

  if (!currentPlayer) return null

  const matches = (path: string) => state.matches(path as never)
  const isBuilding = matches('playing.action.building.selectingLocation')
  const isSelectingLink = matches('playing.action.networking.selectingLink')
  const isSelectingSecondLink = matches(
    'playing.action.networking.selectingSecondLink',
  )
  const isNetworking = isSelectingLink || isSelectingSecondLink

  const handleCitySelect = (cityId: CityId) => {
    if (state.can({ type: 'SELECT_LOCATION', cityId })) {
      send({ type: 'SELECT_LOCATION', cityId })
    } else {
      toast.error(`Cannot build at ${cityId} with the current selection.`)
    }
  }

  const handleLinkSelect = (from: CityId, to: CityId) => {
    if (isSelectingSecondLink) {
      if (state.can({ type: 'SELECT_SECOND_LINK', from, to })) {
        send({ type: 'SELECT_SECOND_LINK', from, to })
      } else {
        toast.error(`Cannot build a second link between ${from} and ${to}.`)
      }
      return
    }
    if (state.can({ type: 'SELECT_LINK', from, to })) {
      send({ type: 'SELECT_LINK', from, to })
    } else {
      toast.error(`Cannot build a link between ${from} and ${to}.`)
    }
  }

  const selectedCardForBoard = ctx.selectedCard
    ? {
        id: ctx.selectedCard.id,
        type: ctx.selectedCard.type,
        location:
          ctx.selectedCard.type === 'location'
            ? ctx.selectedCard.location
            : undefined,
      }
    : null

  const needsReveal = revealedFor !== currentPlayer.id

  return (
    <div className="min-h-screen bg-background p-3">
      {/* Header */}
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Brass Birmingham</h1>
        <Badge variant="secondary" className="capitalize">
          {ctx.era} era
        </Badge>
        <Badge variant="outline">Round {ctx.round}</Badge>
        <Badge variant="outline">Actions left: {ctx.actionsRemaining}</Badge>
        <div className="ml-auto flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-primary-foreground">
          <span className="text-sm font-semibold">
            {currentPlayer.name}&rsquo;s turn
          </span>
        </div>
      </header>

      {/* Player panels */}
      <div
        className="mb-3 grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${ctx.players.length}, minmax(0, 1fr))`,
        }}
      >
        {ctx.players.map((p) => (
          <PlayerPanel
            key={p.id}
            player={p}
            isCurrent={p.id === currentPlayer.id}
            turnPosition={ctx.turnOrder.indexOf(p.id)}
          />
        ))}
      </div>

      {/* Main grid: board + control column */}
      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <Card className="h-[600px] overflow-hidden p-0">
          <Board
            players={ctx.players}
            currentPlayerIndex={ctx.currentPlayerIndex}
            era={ctx.era}
            isBuilding={isBuilding}
            isNetworking={isNetworking}
            onCitySelect={handleCitySelect}
            onLinkSelect={handleLinkSelect}
            selectedCity={ctx.selectedLocation}
            selectedLink={ctx.selectedLink}
            selectedIndustryType={ctx.selectedIndustryTile?.type ?? null}
            selectedCard={selectedCardForBoard}
            gameContext={ctx}
            showSelectionFeedback
          />
        </Card>

        <div className="space-y-3">
          <Card className="relative p-4">
            {needsReveal ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Pass the device to
                </p>
                <p className="text-2xl font-bold">{currentPlayer.name}</p>
                <Button onClick={() => setRevealedFor(currentPlayer.id)}>
                  I&rsquo;m ready &mdash; reveal my turn
                </Button>
              </div>
            ) : (
              <ActionPanel
                snapshot={state}
                send={send}
                currentPlayer={currentPlayer}
              />
            )}
          </Card>

          <div>
            <h2 className="mb-1 text-sm font-semibold">Game log</h2>
            <GameLog logs={ctx.logs} />
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  )
}
