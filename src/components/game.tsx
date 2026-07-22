'use client'

// Hotseat shell — drives the proven gameStore machine directly.
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
import { createActor, transition } from 'xstate'
import { Toaster } from '~/components/ui/sonner'
import { type CityId, cities, connections } from '~/data/board'
import { type Card, type IndustryType } from '~/data/cards'
import { type InspectFn, useXstateInspect } from '~/lib/xstate-inspector'
import {
  type GameEvent,
  type GameStoreSnapshot,
  type Merchant,
  type Player,
  gameStore,
} from '~/store/gameStore'
import { refreshEmbeddedTileStats } from '~/store/saveMigration'
import {
  ActionDock,
  type ConfirmOutcome,
  INDUSTRY_TYPES,
  SELLABLE,
  getHandSelection,
} from './action-dock'
import { linkKey } from './board/board-data'
import { BoardMap, PLAYER_FILL, playerNetworkCities } from './board/board-map'
import { demoSnapshot } from './demo/demo-snapshot'
import { demoSnapshotEraEnd } from './demo/demo-snapshot-era-end'
import { demoSnapshotGameEnd } from './demo/demo-snapshot-game-end'
import { demoSnapshotRail } from './demo/demo-snapshot-rail'
import { demoSnapshotBeerChoice } from './demo/demo-snapshot-beer-choice'
import { demoSnapshotDoubleBeer } from './demo/demo-snapshot-double-beer'
import { demoSnapshotIronChoice } from './demo/demo-snapshot-iron-choice'
import { demoSnapshotSell } from './demo/demo-snapshot-sell'
import { demoSnapshotWilds } from './demo/demo-snapshot-wilds'
import { HandTray } from './hand-tray'
import { computeHoverCities, focusCityFor } from './hover-highlight'
import { LocateCityProvider, useLocateCityState } from './locate'
import {
  pendingBeerChoice,
  pendingCoalChoice,
} from '~/store/shared/resourceSources'
import { GameOverScreen, PassGate, RoundCurtain } from './overlays'
import { OpenMatButton, PlayerLedger } from './player-ledger'
import { PlayerRail } from './player-rail'
import { SetupScreen } from './setup-screen'
import { JournalPanel } from './journal'
import { MarketsPanel } from './side-panels'

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
// Saves also embed COPIES of the industry tile stats — refresh them from
// the audited definitions so a pre-audit game doesn't keep playing with
// the old printed values (see saveMigration.ts).
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
  try {
    refreshEmbeddedTileStats(clone)
  } catch {
    // malformed save — let SaveRecoveryBoundary deal with it downstream
  }
  return clone
}

// Detach a probe snapshot from the live actor. This is the only impure step:
// `transition()` needs resolved state nodes, which raw persisted JSON has
// none of. The deep clone still matters — getPersistedSnapshot() can share
// nested references with the live context, so a probe that EXECUTES a confirm
// must not reach engine code holding the real context (rehydrateSnapshot
// structured-clones and keeps the markets' Infinity rows intact).
const probeSnapshot = (actorRef: {
  getPersistedSnapshot: () => unknown
}): GameStoreSnapshot => {
  const actor = createActor(gameStore, {
    snapshot: rehydrateSnapshot(actorRef.getPersistedSnapshot()) as never,
  })
  actor.start()
  const snap = actor.getSnapshot()
  actor.stop()
  return snap
}

// Pure probe step: no actor, no side effects, `always` chains resolved. The
// machine is assign-only, so the unexecuted-actions half of the tuple is
// always empty. Transitions never mutate the snapshot they start from, which
// is what lets one restored snapshot be fanned across many candidate probes.
const probeStep = (snap: GameStoreSnapshot, event: GameEvent) =>
  transition(gameStore, snap as never, event as never)[0] as GameStoreSnapshot

// From a snapshot sitting in building.selectingLocation, can the build be
// COMPLETED at this city? The SELECT_LOCATION guard only checks the slot;
// coal access and payment are validated at CONFIRM (guard + execution), so
// a slot-legal city can still be a dead end (audit follow-up: iron works
// at Coventry pulsed legal, then the confirm refused without a why).
const buildCompletesAt = (
  source: GameStoreSnapshot,
  cityId: CityId,
): boolean => {
  const snap = probeStep(source, { type: 'SELECT_LOCATION', cityId })
  if (!snap.can({ type: 'CONFIRM' })) return false
  return probeStep(snap, { type: 'CONFIRM' }).context.lastError === null
}

const snapshotCurrentPlayerId = (snapshot: unknown): string | null => {
  const ctx = (
    snapshot as { context: { players: Player[]; currentPlayerIndex: number } }
  ).context
  return ctx.players[ctx.currentPlayerIndex]?.id ?? null
}

/**
 * The round a booted snapshot's summary already describes — treated as
 * already-seen, so resuming a save does not replay a curtain for a round the
 * player finished before the refresh.
 */
const snapshotRoundSummaryRound = (snapshot: unknown): number | null => {
  if (!snapshot) return null
  const ctx = (snapshot as { context?: { roundSummary?: { round: number } } })
    .context
  return ctx?.roundSummary?.round ?? null
}

interface Boot {
  kind: GameKind | 'preview-gameover'
  snapshot?: unknown
  resumed: boolean
}

export function Game() {
  const [boot, setBoot] = useState<Boot | null>(null)
  const [generation, setGeneration] = useState(0)
  // Dev-only: wait for the Stately Inspector to attach before creating the
  // actor so its first transitions are captured. `ready` is true from the
  // first render when the inspector is disabled (the default) — no change.
  const { ready: inspectReady, inspect } = useXstateInspect()

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
    const demoParam = params.get('demo')
    if (demoParam !== null) {
      // Named engine-generated fixtures for demos and e2e journeys:
      // ?demo (canal mid-game), ?demo=sell (multi-sale ready),
      // ?demo=eraend (one PASS from the Rail Era),
      // ?demo=gameend (a few PASSes from final scoring),
      // ?demo=beerchoice (a sale whose beer has more than one source),
      // ?demo=ironchoice (a Develop whose iron has more than one works),
      // ?demo=doublebeer (a double rail whose beer has more than one source).
      const fixture =
        demoParam === 'sell'
          ? demoSnapshotSell
          : demoParam === 'eraend'
            ? demoSnapshotEraEnd
            : demoParam === 'gameend'
              ? demoSnapshotGameEnd
              : demoParam === 'wilds'
                ? demoSnapshotWilds
                : demoParam === 'beerchoice'
                  ? demoSnapshotBeerChoice
                  : demoParam === 'ironchoice'
                    ? demoSnapshotIronChoice
                    : demoParam === 'doublebeer'
                      ? demoSnapshotDoubleBeer
                      : demoSnapshot
      setBoot({
        kind: 'demo',
        snapshot: rehydrateSnapshot(fixture),
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

  if (!boot || !inspectReady) {
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
    // Through the migration like every other boot, so an older fixture
    // still yields a reconciling ledger.
    const previewCtx = (
      rehydrateSnapshot(demoSnapshotRail) as {
        context: {
          players: Player[]
          era: 'canal' | 'rail'
          merchants: Merchant[]
        }
      }
    ).context
    const players = previewCtx.players
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
        era={previewCtx.era}
        merchants={previewCtx.merchants}
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

  // Undo (first action of the turn): remount the machine from the
  // turn-start snapshot. resumed:false + snapshot auto-reveals the same
  // player — no pass curtain for the person already holding the device.
  const restoreSnapshot = (snapshot: unknown) => {
    setBoot((prev) => ({
      kind: prev && prev.kind !== 'preview-gameover' ? prev.kind : 'fresh',
      snapshot,
      resumed: false,
    }))
    setGeneration((g) => g + 1)
  }

  return (
    <SaveRecoveryBoundary onRecover={newGame}>
      <GameInner
        key={`${boot.kind}-${boot.resumed}-${generation}`}
        boot={boot}
        inspect={inspect}
        onNewGame={newGame}
        onRestoreSnapshot={restoreSnapshot}
      />
    </SaveRecoveryBoundary>
  )
}

/** If a stale save can't drive the machine, clear it instead of bricking the app. */
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

function GameInner({
  boot,
  inspect,
  onNewGame,
  onRestoreSnapshot,
}: {
  boot: Boot
  inspect?: InspectFn
  onNewGame: () => void
  onRestoreSnapshot: (snapshot: unknown) => void
}) {
  const [state, send, actorRef] = useMachine(gameStore, {
    ...(boot.snapshot ? { snapshot: boot.snapshot as never } : {}),
    ...(inspect ? { inspect } : {}),
  })

  // Demo showcases reveal immediately; resumed & fresh games always gate so
  // a refresh never exposes the incoming player's hand.
  const [revealedFor, setRevealedFor] = useState<string | null>(() =>
    !boot.resumed && boot.snapshot
      ? snapshotCurrentPlayerId(boot.snapshot)
      : null,
  )
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null)
  // Hover-a-name spotlight: the player whose rail mat is hovered/focused right
  // now — the board lights up their network (links + tiles) and recedes the rest.
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null)
  // Hover-to-locate: which city's NAME (journal, pickers, ledger…) is under
  // the cursor/focus right now — its plate gets the map's surveyor's mark.
  const locateState = useLocateCityState()
  // The round the player has already seen the curtain for. Seeded from the
  // booted snapshot so resuming a save mid-game never replays an old round's
  // curtain; a round ending in play bumps roundSummary.round past it.
  const [curtainSeen, setCurtainSeen] = useState<number | null>(() =>
    snapshotRoundSummaryRound(boot.snapshot),
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

  // Escape unwinds the in-flight action exactly like the Cancel button.
  // An open ledger swallows the keypress — PlayerLedger closes itself.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || ledgerFor) return
      const snap = actorRef.getSnapshot()
      if (snap.can({ type: 'CANCEL' })) send({ type: 'CANCEL' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ledgerFor, actorRef, send])

  // ---------- undo (first action of the turn, hotseat) ----------
  // Snapshot the machine when a player's turn begins; while they still
  // have an action remaining they may undo their FIRST action by
  // restoring that snapshot (atomic by construction — money, markets,
  // cards and mats all live in the one snapshot).
  const turnAnchor = useRef<{
    playerId: string
    round: number
    era: string
    actionsRemaining: number
    snapshot: unknown
  } | null>(null)
  useEffect(() => {
    if (!currentPlayer || state.matches('setup') || state.matches('gameOver'))
      return
    const anchor = turnAnchor.current
    if (
      !anchor ||
      anchor.playerId !== currentPlayer.id ||
      anchor.round !== ctx.round ||
      anchor.era !== ctx.era
    ) {
      turnAnchor.current = {
        playerId: currentPlayer.id,
        round: ctx.round,
        era: ctx.era,
        actionsRemaining: ctx.actionsRemaining,
        snapshot: actorRef.getPersistedSnapshot(),
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, ctx.round, ctx.era])

  const canUndo =
    turnAnchor.current !== null &&
    currentPlayer !== undefined &&
    turnAnchor.current.playerId === currentPlayer.id &&
    turnAnchor.current.round === ctx.round &&
    turnAnchor.current.era === ctx.era &&
    ctx.actionsRemaining === turnAnchor.current.actionsRemaining - 1 &&
    is('playing.action.selectingAction')

  const onUndo = () => {
    const anchor = turnAnchor.current
    if (anchor) onRestoreSnapshot(anchor.snapshot)
  }

  /* ---------- board interaction state ---------- */

  const pickingSite = is('playing.action.building.selectingLocation')
  const pickingLink = is('playing.action.networking.selectingLink')
  const pickingSecondLink = is('playing.action.networking.selectingSecondLink')

  // Cities where the build can actually be COMPLETED — slot-legal per the
  // SELECT_LOCATION guard, then a full dry-run for coal access / payment.
  // `slotOnlyCities` keeps the slot-legal-but-uncompletable ones so a click
  // there can explain WHY instead of a generic refusal.
  const [legalCities, slotOnlyCities] = useMemo(() => {
    if (!pickingSite) return [null, null] as const
    const legal = new Set<string>()
    const slotOnly = new Set<string>()
    // One restore, then a pure probe per city. A restore that fails leaves
    // `base` null and every slot-legal city falls open to the guard's answer,
    // exactly as a per-city probe failure always has.
    let base: GameStoreSnapshot | null = null
    try {
      base = probeSnapshot(actorRef)
    } catch {
      base = null
    }
    for (const id of Object.keys(cities) as CityId[]) {
      if (!state.can({ type: 'SELECT_LOCATION', cityId: id })) continue
      try {
        if (!base) throw new Error('no probe')
        if (buildCompletesAt(base, id)) legal.add(id)
        else slotOnly.add(id)
      } catch {
        legal.add(id) // fail open to the guard's answer
      }
    }
    return [legal, slotOnly] as const
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingSite, state, actorRef])

  const legalLinks = useMemo(() => {
    if (!pickingLink && !pickingSecondLink) return null
    const set = new Set<string>()
    for (const conn of connections) {
      // The engine's canBuildLink guard doesn't check the era (documented
      // rules gap) — enforce it here so rail-only ghosts never pulse as
      // legal canals and vice versa.
      if (!(conn.types as readonly string[]).includes(ctx.era)) continue
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
  }, [pickingLink, pickingSecondLink, state, ctx.era])

  // Exact "is any sale possible?" — walk a shadow actor into the sale step
  // and ask the machine's own guards (audit: Sell used to demand a discard
  // before revealing there was nothing to sell).
  const canSellAnything = useMemo(() => {
    // Gates the Sell plaque in both choosers: idle and card-first (from
    // cardSelected the probe's SELL skips the card step; the stray
    // SELECT_CARD below is simply ignored there).
    if (
      !(
        is('playing.action.selectingAction') ||
        is('playing.action.cardSelected')
      ) ||
      !currentPlayer
    )
      return true
    const sellable = currentPlayer.industries.filter(
      (i) => !i.flipped && SELLABLE.includes(i.type),
    )
    if (sellable.length === 0 || currentPlayer.hand.length === 0) return false
    try {
      let snap = probeStep(probeSnapshot(actorRef), { type: 'SELL' })
      const firstCard = currentPlayer.hand[0]
      if (firstCard) {
        snap = probeStep(snap, { type: 'SELECT_CARD', cardId: firstCard.id })
      }
      for (const ind of sellable) {
        for (const m of ctx.merchants) {
          if (
            snap.can({
              type: 'SELECT_SALE',
              location: ind.location,
              industryType: ind.type,
              merchant: m.location,
            })
          ) {
            return true
          }
        }
      }
      return false
    } catch {
      return true // fail open — the flow itself still guards correctly
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, actorRef, currentPlayer, ctx.merchants])

  // Which industries can actually complete a build with the selected card?
  // The machine validates slot compatibility for a REAL location card only
  // inside executeBuildAction (audit: cotton at Coventry sailed through
  // Card → Industry → Confirm and failed at the very end). Walk a detached
  // shadow actor through each industry and keep the ones that survive —
  // the engine's own rules stay the single source of truth.
  const viableIndustries = useMemo(() => {
    if (!is('playing.action.building.selectingIndustryType') || !currentPlayer)
      return null
    try {
      const viable = new Set<IndustryType>()
      // One restore for the whole sweep; each industry is a pure branch off it.
      const base = probeSnapshot(actorRef)
      for (const industryType of INDUSTRY_TYPES) {
        if (!state.can({ type: 'SELECT_INDUSTRY_TYPE', industryType })) continue
        const snap = probeStep(base, {
          type: 'SELECT_INDUSTRY_TYPE',
          industryType,
        })
        if (
          snap.matches({ playing: { action: { building: 'confirmingBuild' } } })
        ) {
          // Location card — the site is fixed, so dry-run the build itself.
          if (
            snap.can({ type: 'CONFIRM' }) &&
            probeStep(snap, { type: 'CONFIRM' }).context.lastError === null
          ) {
            viable.add(industryType)
          }
        } else if (
          snap.matches({
            playing: { action: { building: 'selectingLocation' } },
          })
        ) {
          // Industry / wild card — viable if the build COMPLETES somewhere
          // (a slot-legal city can still lack coal access or funds).
          for (const id of Object.keys(cities) as CityId[]) {
            if (!snap.can({ type: 'SELECT_LOCATION', cityId: id })) continue
            if (buildCompletesAt(snap, id)) {
              viable.add(industryType)
              break
            }
          }
        }
      }
      return viable
    } catch {
      return null // fail open — buttons fall back to the machine's can()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, actorRef, currentPlayer])

  // Dry-run the pending confirm on a shadow actor: surfaces the engine's
  // exact refusal BEFORE the player commits, and prices the action all-in
  // (tile cost plus any coal/iron bought from the market) when it works.
  const confirmOutcome = useMemo((): ConfirmOutcome | null => {
    const confirmEvent: GameEvent | null = is(
      'playing.action.building.confirmingBuild',
    )
      ? { type: 'CONFIRM' }
      : is('playing.action.networking.confirmingLink')
        ? { type: 'CONFIRM' }
        : is('playing.action.networking.confirmingDoubleLink')
          ? { type: 'EXECUTE_DOUBLE_NETWORK_ACTION' }
          : is('playing.action.developing.confirmingDevelop')
            ? { type: 'CONFIRM' }
            : null
    if (!confirmEvent || !currentPlayer) return null
    if (!state.can(confirmEvent)) return null // machine guard already refuses
    try {
      const moneyBefore = currentPlayer.money
      const after = probeStep(probeSnapshot(actorRef), confirmEvent).context
      if (after.lastError !== null) {
        return { ok: false, error: after.lastError }
      }
      const me = after.players.find((p) => p.id === currentPlayer.id)
      if (!me) return null
      // If the probed action closed the round (or the era), the cascade
      // collects round-end income into the same money diff — the action
      // still succeeds, but the price would be wrong, so omit it.
      if (after.round !== ctx.round || after.era !== ctx.era) {
        return { ok: true }
      }
      return { ok: true, cost: moneyBefore - me.money, balanceAfter: me.money }
    } catch {
      return null // fail open — the confirm button keeps its default gating
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, actorRef, currentPlayer])

  // "What belongs to me" at a glance — the viewing player's network, from
  // the same shared helper the engine's guards use (never hand-derived).
  const networkCities = useMemo(
    () => (currentPlayer ? playerNetworkCities(currentPlayer) : null),
    [currentPlayer],
  )

  // Hovering a hand card previews its targets on the map (shared with the
  // networked surface via computeHoverCities): a location card spotlights
  // its city; an industry card spotlights cities with a matching slot
  // inside the player's network. A soft HINT for orientation — build
  // legality proper is still decided by the machine when the flow starts.
  const hoverCities = useMemo(
    () =>
      currentPlayer ? computeHoverCities(hoveredCard, networkCities) : null,
    [hoveredCard, currentPlayer, networkCities],
  )

  // A lingering hover from the previous turn must not haunt the next one.
  useEffect(() => {
    setHoveredCard(null)
  }, [currentPlayer?.id])

  // While the machine is asking WHERE beer comes from — a staged sale's
  // barrels or the double rail's one — spotlight the places it could come
  // from; the choice is about the board, so it belongs on it. Gated on the
  // machine STATE (not on pendingSale) so the double-link beer step lights
  // up too. Both the question and the answers are the engine's.
  const beerCandidateCities = useMemo(() => {
    if (
      !state.matches('playing.action.selling.choosingBeerSource' as never) &&
      !state.matches(
        'playing.action.networking.choosingDoubleLinkBeer' as never,
      )
    ) {
      return null
    }
    const choice = pendingBeerChoice(ctx)
    if (!choice?.hasChoice) return null
    return new Set<string>(
      choice.options.map((option) => option.source.location),
    )
  }, [state, ctx])

  // Same idea for a coal tie: while the machine is asking WHICH equally-close
  // mine to drain (a build, a single or a double rail), spotlight the tied
  // mines on the board. The choice is the engine's; we only render it.
  const coalCandidateCities = useMemo(() => {
    if (
      !state.matches('playing.action.building.choosingCoalSource' as never) &&
      !state.matches('playing.action.networking.choosingLinkCoal' as never) &&
      !state.matches(
        'playing.action.networking.choosingDoubleLinkCoal' as never,
      )
    ) {
      return null
    }
    const choice = pendingCoalChoice(ctx)
    if (!choice?.hasChoice) return null
    return new Set<string>(
      choice.options.map((option) => option.source.location),
    )
  }, [state, ctx])

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
    const name = cities[cityId]?.name ?? cityId
    if (slotOnlyCities?.has(cityId)) {
      // The machine's guard would accept the slot, but the dry run shows
      // the build can never be confirmed there — explain instead of
      // letting the player walk into a dead Confirm step.
      toast.error(
        `${name} has a free slot, but the build can't be completed there — no coal/iron within reach, or you can't pay for it.`,
      )
      return
    }
    if (
      state.can({ type: 'SELECT_LOCATION', cityId }) &&
      (legalCities === null || legalCities.has(cityId))
    ) {
      send({ type: 'SELECT_LOCATION', cityId })
    } else {
      toast.error(`${name} is not a legal site for this build.`)
    }
  }

  const onLinkClick = (from: CityId, to: CityId) => {
    const conn = connections.find(
      (c) =>
        (c.from === from && c.to === to) || (c.from === to && c.to === from),
    )
    if (conn && !(conn.types as readonly string[]).includes(ctx.era)) {
      toast.error(
        ctx.era === 'canal'
          ? 'That corridor only carries rail — not available in the Canal Era.'
          : 'That corridor was canal-only — not available in the Rail Era.',
      )
      return
    }
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

  // Selection highlights only belong to a live flow — after an aborted or
  // failed action the context keeps its last selections, and echoing them
  // would leave a stale brass ring on the map (audit finding).
  const inBuildFlow = is('playing.action.building')
  const inNetworkFlow = is('playing.action.networking')
  const selectedLinks = inNetworkFlow
    ? [
        ...(ctx.selectedLink ? [ctx.selectedLink] : []),
        ...(ctx.selectedSecondLink ? [ctx.selectedSecondLink] : []),
      ]
    : []

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
        era={ctx.era}
        merchants={ctx.merchants}
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
    <LocateCityProvider value={locateState}>
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
            data-testid="era-plate"
          >
            {ctx.era} era
          </span>
          <span className="bb2-chip" data-testid="round-chip">
            Round {ctx.round}
          </span>
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
          onHoverPlayer={setHoveredPlayerId}
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
                selectedCity={inBuildFlow ? ctx.selectedLocation : null}
                selectedLinks={selectedLinks}
                prompt={boardPrompt}
                onCityClick={onCityClick}
                onLinkClick={onLinkClick}
                networkCities={needsReveal ? null : networkCities}
                networkColor={
                  needsReveal ? null : PLAYER_FILL[currentPlayer.color]
                }
                hoverCities={
                  needsReveal
                    ? null
                    : (beerCandidateCities ??
                      coalCandidateCities ??
                      hoverCities)
                }
                locatedCity={locateState.locatedCity}
                focusCity={needsReveal ? null : focusCityFor(hoveredCard)}
                highlightPlayerId={needsReveal ? null : hoveredPlayerId}
              />
            </div>
          </div>

          <aside className="flex w-full flex-none flex-col gap-3 pb-44 lg:w-[416px] lg:overflow-y-auto lg:pb-0">
            <div className="bb2-panel bb2-panel-active flex flex-col gap-3 p-5">
              {!needsReveal && (
                <ActionDock
                  snapshot={state as GameStoreSnapshot}
                  send={send}
                  currentPlayer={currentPlayer}
                  canSellAnything={canSellAnything}
                  viableIndustries={viableIndustries}
                  confirmOutcome={confirmOutcome}
                  actionsLeft={{
                    remaining: ctx.actionsRemaining,
                    max: maxActions,
                  }}
                  legalSiteCount={pickingSite ? (legalCities?.size ?? 0) : null}
                  onUndo={canUndo ? onUndo : null}
                />
              )}
              {!needsReveal && (
                <OpenMatButton onClick={() => setLedgerFor(currentPlayer.id)} />
              )}
            </div>
            <MarketsPanel
              coalMarket={ctx.coalMarket}
              ironMarket={ctx.ironMarket}
            />
            <JournalPanel logs={ctx.logs} players={ctx.players} />
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
            onHoverCard={setHoveredCard}
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

        {/* Round end announces itself above the pass gate: what everyone spent
          and how the turn order moved because of it. */}
        {ctx.roundSummary && ctx.roundSummary.round !== curtainSeen && (
          <RoundCurtain
            summary={ctx.roundSummary}
            players={ctx.players}
            onDismiss={() => setCurtainSeen(ctx.roundSummary!.round)}
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
    </LocateCityProvider>
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
