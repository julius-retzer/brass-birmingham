'use client'

// v2 hotseat shell — drives the proven gameStore machine directly.
// Boots into a real engine-generated mid-game state (demo mode) so the
// table is alive immediately; "New game" starts a fresh charter.
import { useMachine } from '@xstate/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Toaster } from '~/components/ui/sonner'
import { type CityId, cities, connections } from '~/data/board'
import {
  type GameStoreSnapshot,
  type Player,
  gameStore,
} from '~/store/gameStore'
import { ActionDock, getHandSelection } from './action-dock'
import { linkKey } from './board/board-data'
import { BoardMap } from './board/board-map'
import { demoSnapshot } from './demo/demo-snapshot'
import { HandTray } from './hand-tray'
import { GameOverScreen, PassGate } from './overlays'
import { PlayerRail } from './player-rail'
import { SetupScreen } from './setup-screen'
import { JournalPanel, MarketsPanel } from './side-panels'

type Mode = 'demo' | 'fresh'

const demoCurrentPlayerId = (): string | null => {
  const ctx = (
    demoSnapshot as {
      context: { players: Player[]; currentPlayerIndex: number }
    }
  ).context
  return ctx.players[ctx.currentPlayerIndex]?.id ?? null
}

export function V2Game() {
  const [mode, setMode] = useState<Mode>('demo')
  const [key, setKey] = useState(0)
  return (
    <V2GameInner
      key={`${mode}-${key}`}
      mode={mode}
      onNewGame={() => {
        setMode('fresh')
        setKey((k) => k + 1)
      }}
    />
  )
}

function V2GameInner({
  mode,
  onNewGame,
}: {
  mode: Mode
  onNewGame: () => void
}) {
  const [state, send] = useMachine(
    gameStore,
    mode === 'demo' ? { snapshot: demoSnapshot as never } : undefined,
  )
  const [revealedFor, setRevealedFor] = useState<string | null>(() =>
    mode === 'demo' ? demoCurrentPlayerId() : null,
  )

  const ctx = state.context
  const currentPlayer: Player | undefined = ctx.players[ctx.currentPlayerIndex]

  // Surface recoverable engine errors, then clear them.
  useEffect(() => {
    if (ctx.lastError) {
      toast.error(ctx.lastError)
      send({ type: 'CLEAR_ERROR' })
    }
  }, [ctx.lastError, send])

  const is = (path: string) => state.matches(path as never)

  /* ---------- board interaction state ---------- */

  const pickingSite = is('playing.action.building.selectingLocation')
  const pickingLink = is('playing.action.networking.selectingLink')
  const pickingSecondLink = is('playing.action.networking.selectingSecondLink')

  const legalCities = useMemo(() => {
    if (!pickingSite) return null
    const set = new Set<string>()
    for (const id of Object.keys(cities) as CityId[]) {
      if (state.can({ type: 'SELECT_LOCATION', cityId: id })) set.add(id)
    }
    return set
  }, [pickingSite, state])

  const legalLinks = useMemo(() => {
    if (!pickingLink && !pickingSecondLink) return null
    const set = new Set<string>()
    for (const conn of connections) {
      const ev = pickingSecondLink
        ? ({
            type: 'SELECT_SECOND_LINK',
            from: conn.from,
            to: conn.to,
          } as const)
        : ({ type: 'SELECT_LINK', from: conn.from, to: conn.to } as const)
      if (state.can(ev)) {
        set.add(linkKey(conn.from, conn.to))
        set.add(linkKey(conn.to, conn.from))
      }
    }
    return set
  }, [pickingLink, pickingSecondLink, state])

  const boardPrompt = useMemo(() => {
    if (pickingSite) {
      const t = ctx.selectedIndustryTile?.type
      const n = legalCities?.size ?? 0
      return `Choose a site for your ${t === 'manufacturer' ? 'goods works' : (t ?? 'industry')} — ${n} legal ${n === 1 ? 'city' : 'cities'}`
    }
    if (pickingLink || pickingSecondLink) {
      const n = (legalLinks?.size ?? 0) / 2
      return `Choose ${pickingSecondLink ? 'a second' : 'a'} ${ctx.era} route — ${n} available`
    }
    return null
  }, [
    pickingSite,
    pickingLink,
    pickingSecondLink,
    legalCities,
    legalLinks,
    ctx.selectedIndustryTile?.type,
    ctx.era,
  ])

  const onCityClick = (cityId: CityId) => {
    if (state.can({ type: 'SELECT_LOCATION', cityId })) {
      send({ type: 'SELECT_LOCATION', cityId })
    } else {
      toast.error(
        `${cities[cityId]?.name ?? cityId} is not a legal site for this build.`,
      )
    }
  }

  const onLinkClick = (from: CityId, to: CityId) => {
    if (pickingSecondLink) {
      if (state.can({ type: 'SELECT_SECOND_LINK', from, to })) {
        send({ type: 'SELECT_SECOND_LINK', from, to })
      } else {
        toast.error('That route cannot be your second rail.')
      }
      return
    }
    if (state.can({ type: 'SELECT_LINK', from, to })) {
      send({ type: 'SELECT_LINK', from, to })
    } else {
      toast.error('That route cannot be claimed right now.')
    }
  }

  const selectedLinks = [
    ...(ctx.selectedLink ? [ctx.selectedLink] : []),
    ...(ctx.selectedSecondLink ? [ctx.selectedSecondLink] : []),
  ]

  /* ---------- hand selection ---------- */

  const handSel = getHandSelection(state as GameStoreSnapshot)

  /* ---------- top-level screens ---------- */

  if (state.matches('setup')) {
    return (
      <>
        <SetupScreen
          onStart={(players) => {
            send({ type: 'START_GAME', players })
            setRevealedFor(players[0]?.id ?? null)
          }}
        />
        <Toaster theme="dark" position="top-right" />
      </>
    )
  }

  if (state.matches('gameOver')) {
    return (
      <GameOverScreen
        players={ctx.players}
        winners={ctx.winners ?? []}
        onRestart={onNewGame}
      />
    )
  }

  if (!currentPlayer) return null

  const needsReveal = revealedFor !== currentPlayer.id
  const maxActions = ctx.round === 1 && ctx.era === 'canal' ? 1 : 2

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ---------- masthead ---------- */}
      <header className="flex items-center gap-4 px-4 pb-2 pt-3">
        <div className="flex items-baseline gap-2">
          <span
            className="bb2-display text-[22px] font-black leading-none tracking-[0.14em]"
            style={{ color: 'var(--bb-brass-bright)' }}
          >
            BRASS
          </span>
          <span
            className="bb2-display text-[13px] italic"
            style={{ color: 'rgba(231,215,177,.55)' }}
          >
            Birmingham
          </span>
        </div>

        <span
          className={`bb2-era-plate ${ctx.era === 'canal' ? 'bb2-era-canal' : 'bb2-era-rail'}`}
        >
          {ctx.era} era
        </span>
        <span className="bb2-chip">Round {ctx.round}</span>
        <span className="bb2-chip">
          Actions
          <span className="flex items-center gap-1">
            {Array.from({ length: maxActions }, (_, i) => (
              <span
                key={i}
                className="bb2-pip"
                data-spent={i >= ctx.actionsRemaining}
              />
            ))}
          </span>
        </span>
        {mode === 'demo' && (
          <span
            className="bb2-chip"
            style={{ color: 'var(--bb-brass)', borderStyle: 'dashed' }}
          >
            Demonstration ledger
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button type="button" className="bb2-ghost-btn" onClick={onNewGame}>
            New game
          </button>
        </div>
      </header>

      {/* ---------- player rail ---------- */}
      <PlayerRail
        players={ctx.players}
        currentPlayerId={currentPlayer.id}
        turnOrder={ctx.turnOrder}
        playerSpending={ctx.playerSpending}
      />

      {/* ---------- main: board + dock ---------- */}
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
        <div className="bb2-board-frame min-h-0 flex-1">
          <div className="bb2-board-inner" style={{ paddingBottom: 84 }}>
            <BoardMap
              players={ctx.players}
              era={ctx.era}
              merchants={ctx.merchants}
              legalCities={legalCities}
              legalLinks={legalLinks}
              selectedCity={ctx.selectedLocation}
              selectedLinks={selectedLinks}
              prompt={boardPrompt}
              onCityClick={onCityClick}
              onLinkClick={onLinkClick}
            />
          </div>
        </div>

        <aside className="flex w-[380px] flex-none flex-col gap-3 overflow-y-auto">
          <div className="bb2-panel p-4">
            {!needsReveal && (
              <ActionDock
                snapshot={state as GameStoreSnapshot}
                send={send}
                currentPlayer={currentPlayer}
              />
            )}
          </div>
          <MarketsPanel
            coalMarket={ctx.coalMarket}
            ironMarket={ctx.ironMarket}
          />
          <JournalPanel logs={ctx.logs} />
        </aside>
      </div>

      {/* ---------- hand tray ---------- */}
      {!needsReveal && (
        <HandTray
          hand={currentPlayer.hand}
          canSelect={
            handSel
              ? (cardId) => state.can({ type: 'SELECT_CARD', cardId })
              : null
          }
          onSelect={(cardId) => send({ type: 'SELECT_CARD', cardId })}
          selectedIds={handSel?.selectedIds ?? []}
          hint={handSel?.hint ?? null}
        />
      )}

      {/* ---------- pass-the-device curtain ---------- */}
      {needsReveal && (
        <PassGate
          player={currentPlayer}
          round={ctx.round}
          era={ctx.era}
          onReveal={() => setRevealedFor(currentPlayer.id)}
        />
      )}

      <Toaster theme="dark" position="top-right" />
    </div>
  )
}
