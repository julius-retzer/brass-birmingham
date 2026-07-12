'use client'

// v2 hotseat shell — drives the proven gameStore machine directly.
//
// Boot order (decided client-side so localStorage is available):
//   ?preview=gameover  → styled final-scoring preview (dev aid)
//   ?era=rail          → engine-generated rail-era fixture
//   ?fresh=1           → straight to the setup charter
//   saved game         → resume it (a refresh never loses a game)
//   otherwise          → engine-generated canal-era demonstration ledger
//
// Every transition persists the machine snapshot to localStorage; the save
// clears on game over or when a new charter is opened.
import { useMachine } from '@xstate/react'
import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createActor } from 'xstate'
import { Toaster } from '~/components/ui/sonner'
import { type CityId, cities, connections } from '~/data/board'
import {
  type GameStoreSnapshot,
  type Player,
  gameStore,
} from '~/store/gameStore'
import { ActionDock, SELLABLE, getHandSelection } from './action-dock'
import { linkKey } from './board/board-data'
import { BoardMap } from './board/board-map'
import { demoSnapshot } from './demo/demo-snapshot'
import { demoSnapshotRail } from './demo/demo-snapshot-rail'
import { HandTray } from './hand-tray'
import { GameOverScreen, PassGate } from './overlays'
import { PlayerLedger } from './player-ledger'
import { PlayerRail } from './player-rail'
import { SetupScreen } from './setup-screen'
import { JournalPanel, MarketsPanel } from './side-panels'

const SAVE_KEY = 'bb2-save-v1'

type GameKind = 'demo' | 'demo-rail' | 'fresh'

interface SaveBlob {
  version: 1
  kind: GameKind
  savedAt: string
  snapshot: unknown
}

function loadSave(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const blob = JSON.parse(raw) as SaveBlob
    if (
      blob?.version !== 1 ||
      !blob.snapshot ||
      typeof (blob.snapshot as { context?: unknown }).context !== 'object'
    ) {
      return null
    }
    return blob
  } catch {
    return null
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // storage unavailable — nothing to clear
  }
}

// JSON round-trips (localStorage saves, generated fixtures) turn the coal /
// iron markets' `maxCubes: Infinity` fallback rows into `null`, which would
// make the engine's `cubes < maxCubes` refill checks silently fail after a
// resume. Restore Infinity before handing any snapshot to createActor.
function rehydrateSnapshot(snapshot: unknown): unknown {
  const clone = structuredClone(snapshot) as {
    context?: {
      coalMarket?: Array<{ maxCubes: number | null }>
      ironMarket?: Array<{ maxCubes: number | null }>
    }
  }
  for (const market of [clone.context?.coalMarket, clone.context?.ironMarket]) {
    if (!Array.isArray(market)) continue
    for (const row of market) {
      if (row && row.maxCubes === null) row.maxCubes = Infinity
    }
  }
  return clone
}

const snapshotCurrentPlayerId = (snapshot: unknown): string | null => {
  const ctx = (
    snapshot as { context: { players: Player[]; currentPlayerIndex: number } }
  ).context
  return ctx.players[ctx.currentPlayerIndex]?.id ?? null
}

interface Boot {
  kind: GameKind | 'preview-gameover'
  snapshot?: unknown
  resumed: boolean
}

export function V2Game() {
  const [boot, setBoot] = useState<Boot | null>(null)
  const [generation, setGeneration] = useState(0)

  // Boot decision is client-only (localStorage + query params), behind a
  // mount gate so SSR and hydration always agree.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('preview') === 'gameover') {
      setBoot({ kind: 'preview-gameover', resumed: false })
      return
    }
    if (params.get('era') === 'rail') {
      setBoot({
        kind: 'demo-rail',
        snapshot: rehydrateSnapshot(demoSnapshotRail),
        resumed: false,
      })
      return
    }
    if (params.get('demo') !== null) {
      setBoot({
        kind: 'demo',
        snapshot: rehydrateSnapshot(demoSnapshot),
        resumed: false,
      })
      return
    }
    if (params.get('fresh') === '1') {
      setBoot({ kind: 'fresh', resumed: false })
      return
    }
    const save = loadSave()
    if (save) {
      setBoot({
        kind: save.kind,
        snapshot: rehydrateSnapshot(save.snapshot),
        resumed: true,
      })
      return
    }
    // No game in progress — open the charter and start a new one.
    setBoot({ kind: 'fresh', resumed: false })
  }, [])

  if (!boot) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span
          className="bb2-display text-3xl font-black tracking-[0.3em]"
          style={{ color: 'var(--bb-brass-dim)' }}
        >
          BRASS
        </span>
      </div>
    )
  }

  if (boot.kind === 'preview-gameover') {
    const players = (demoSnapshotRail as { context: { players: Player[] } })
      .context.players
    const ranked = [...players].sort(
      (a, b) =>
        b.victoryPoints - a.victoryPoints ||
        b.income - a.income ||
        b.money - a.money,
    )
    return (
      <GameOverScreen
        players={players}
        winners={ranked[0] ? [ranked[0].id] : []}
        onRestart={() => {
          window.location.href = window.location.pathname
        }}
      />
    )
  }

  const newGame = () => {
    clearSave()
    setBoot({ kind: 'fresh', resumed: false })
    setGeneration((g) => g + 1)
  }

  return (
    <SaveRecoveryBoundary onRecover={newGame}>
      <V2GameInner
        key={`${boot.kind}-${boot.resumed}-${generation}`}
        boot={boot}
        onNewGame={newGame}
      />
    </SaveRecoveryBoundary>
  )
}

/** If a stale save can't drive the machine, clear it instead of bricking /v2. */
class SaveRecoveryBoundary extends Component<
  { children: React.ReactNode; onRecover: () => void },
  { errored: boolean }
> {
  state = { errored: false }
  static getDerivedStateFromError() {
    return { errored: true }
  }
  componentDidCatch() {
    clearSave()
  }
  render() {
    if (this.state.errored) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <span
            className="bb2-display text-2xl font-bold"
            style={{ color: 'var(--bb-parchment-bright)' }}
          >
            The ledger could not be reopened
          </span>
          <p className="text-[13px]" style={{ color: 'rgba(231,215,177,.6)' }}>
            The saved game was incompatible and has been cleared.
          </p>
          <button
            type="button"
            className="bb2-confirm max-w-xs"
            onClick={() => {
              this.setState({ errored: false })
              this.props.onRecover()
            }}
          >
            Found a new company
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function V2GameInner({
  boot,
  onNewGame,
}: {
  boot: Boot
  onNewGame: () => void
}) {
  const [state, send, actorRef] = useMachine(
    gameStore,
    boot.snapshot ? { snapshot: boot.snapshot as never } : undefined,
  )
  // Demo showcases reveal immediately; resumed & fresh games always gate so
  // a refresh never exposes the incoming player's hand.
  const [revealedFor, setRevealedFor] = useState<string | null>(() =>
    !boot.resumed && boot.snapshot
      ? snapshotCurrentPlayerId(boot.snapshot)
      : null,
  )
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)

  const ctx = state.context
  const currentPlayer: Player | undefined = ctx.players[ctx.currentPlayerIndex]

  // Surface recoverable engine errors, then clear them.
  useEffect(() => {
    if (ctx.lastError) {
      toast.error(ctx.lastError)
      send({ type: 'CLEAR_ERROR' })
    }
  }, [ctx.lastError, send])

  // Save/resume: persist the machine on every transition of a live game.
  useEffect(() => {
    if (state.matches('setup')) return
    if (state.matches('gameOver')) {
      clearSave()
      return
    }
    try {
      const blob: SaveBlob = {
        version: 1,
        kind: boot.kind as GameKind,
        savedAt: new Date().toISOString(),
        snapshot: actorRef.getPersistedSnapshot(),
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(blob))
    } catch {
      // storage full/unavailable — play on without persistence
    }
  }, [state, actorRef, boot.kind])

  // Announce the era turning over.
  const prevEra = useRef(ctx.era)
  useEffect(() => {
    if (prevEra.current !== ctx.era) {
      prevEra.current = ctx.era
      if (ctx.era === 'rail') {
        toast('The Canal Era has ended — welcome to the Age of Rail.', {
          duration: 6000,
        })
      }
    }
  }, [ctx.era])

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

  // Exact "is any sale possible?" — walk a shadow actor into the sale step
  // and ask the machine's own guards (audit: Sell used to demand a discard
  // before revealing there was nothing to sell).
  const canSellAnything = useMemo(() => {
    if (!is('playing.action.selectingAction') || !currentPlayer) return true
    const sellable = currentPlayer.industries.filter(
      (i) => !i.flipped && SELLABLE.includes(i.type),
    )
    if (sellable.length === 0 || currentPlayer.hand.length === 0) return false
    try {
      const probe = createActor(gameStore, {
        snapshot: actorRef.getPersistedSnapshot() as never,
      })
      probe.start()
      probe.send({ type: 'SELL' })
      const firstCard = currentPlayer.hand[0]
      if (firstCard) probe.send({ type: 'SELECT_CARD', cardId: firstCard.id })
      const snap = probe.getSnapshot()
      let ok = false
      outer: for (const ind of sellable) {
        for (const m of ctx.merchants) {
          if (
            snap.can({
              type: 'SELECT_SALE',
              location: ind.location,
              industryType: ind.type,
              merchant: m.location,
            })
          ) {
            ok = true
            break outer
          }
        }
      }
      probe.stop()
      return ok
    } catch {
      return true // fail open — the flow itself still guards correctly
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, actorRef, currentPlayer, ctx.merchants])

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
  const ledgerPlayer = ledgerFor
    ? ctx.players.find((p) => p.id === ledgerFor)
    : null

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      {/* ---------- masthead ---------- */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 pt-3">
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
        {boot.kind !== 'fresh' && (
          <span
            className="bb2-chip hidden sm:inline-flex"
            style={{ color: 'var(--bb-brass)', borderStyle: 'dashed' }}
          >
            Demonstration ledger
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <NewGameButton onConfirm={onNewGame} />
        </div>
      </header>

      {/* ---------- player rail ---------- */}
      <PlayerRail
        players={ctx.players}
        currentPlayerId={currentPlayer.id}
        turnOrder={ctx.turnOrder}
        playerSpending={ctx.playerSpending}
        onOpenLedger={(id) => setLedgerFor(id)}
      />

      {/* ---------- main: board + dock ---------- */}
      <div className="flex min-h-0 flex-col gap-3 px-3 pb-3 lg:flex-1 lg:flex-row">
        <div className="bb2-board-frame h-[52vh] min-h-[320px] lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="bb2-board-inner pb-9 lg:pb-[84px]">
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

        <aside className="flex w-full flex-none flex-col gap-3 pb-44 lg:w-[380px] lg:overflow-y-auto lg:pb-0">
          <div className="bb2-panel p-4">
            {!needsReveal && (
              <ActionDock
                snapshot={state as GameStoreSnapshot}
                send={send}
                currentPlayer={currentPlayer}
                canSellAnything={canSellAnything}
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

      {/* ---------- overlays ---------- */}
      {ledgerPlayer && (
        <PlayerLedger
          player={ledgerPlayer}
          era={ctx.era}
          isCurrent={ledgerPlayer.id === currentPlayer.id}
          onClose={() => setLedgerFor(null)}
        />
      )}

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

/** Two-step abandon: first tap arms it, second tap within 4s confirms. */
function NewGameButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className="bb2-ghost-btn"
      style={
        armed
          ? { borderColor: 'var(--bb-danger)', color: '#e0968b' }
          : undefined
      }
      onClick={() => {
        if (armed) {
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
    >
      {armed ? 'Abandon this game?' : 'New game'}
    </button>
  )
}
