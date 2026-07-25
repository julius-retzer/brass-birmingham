'use client'

// Networked multiplayer shell — the online twin of the hotseat surface.
//
// The server is the only authority: this component renders the per-seat
// FILTERED view it receives over SSE and sends machine events as intents
// via POST /api/mp/act. A read-only local actor is rebuilt from each
// broadcast purely so the existing dock/board components can keep using
// `snapshot.matches` / `snapshot.can`; it never executes actions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createActor } from 'xstate'
import { Toaster } from '~/components/ui/sonner'
import { type CityId, cities } from '~/data/board'
import type { Card } from '~/data/cards'
import { roundsInEra } from '~/data/cards'
import {
  type GameStoreSnapshot,
  type Player,
  gameStore,
} from '~/store/gameStore'
import { explainRefusal } from '~/store/refusal'
import { refreshEmbeddedTileStats } from '~/store/saveMigration'
import { ActionDock, SELLABLE, getHandSelection } from '../action-dock'
import { BoardMap, PLAYER_FILL, playerNetworkCities } from '../board/board-map'
import { CommandPalette } from '../command-palette'
import { developMatView } from '../develop-mat'
import { useHandOrder } from '../hand-order'
import { HandTray } from '../hand-tray'
import { computeHoverCities, focusCityFor } from '../hover-highlight'
import { JournalPanel } from '../journal'
import { legalCityTargets, legalLinkTargets } from '../legal-targets'
import { LocateCityProvider, useLocateCityState } from '../locate'
import { GameOverScreen, RoundCurtain } from '../overlays'
import { OpenMatButton, PlayerLedger } from '../player-ledger'
import { PlayerRail } from '../player-rail'
import {
  CollapsiblePanel,
  MarketsPanel,
  SidePanelRail,
  usePanelCollapsed,
} from '../side-panels'
import { sourceCandidateCities } from '../source-spotlight'
import { consumeRecoveryLink, credsKey } from './recovery-link'
import { UNREACHABLE, refusalToShow } from './refusal'
import { SeatKeyButton, SeatKeyModal, SeatKeyNotice } from './seat-key'
import { didBecomeMyTurn, playTurnChime, titleForTurn } from './turnNotify'
import { useInFlight } from './use-in-flight'

/* ---------------- wire types ---------------- */

interface SeatView {
  seatId: number
  name: string | null
  color: string
  claimed: boolean
  ready?: boolean
  kind?: 'human' | 'ai'
  aiTier?: { id: string; label: string; difficulty: string; model: string }
}

interface AiLogEntryWire {
  seatId: number
  era: string
  round: number
  eventType: string
  label: string
  rationale: string | null
  fallback: boolean
  at: string
}

interface AiViewWire {
  thinkingSeatId: number | null
  log: AiLogEntryWire[]
  usage: {
    calls: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    fallbacks: number
  }
}

interface ChatMessageWire {
  id: number
  seatId: number
  name: string
  text: string
  at: string
}

interface GameViewWire {
  token: string
  phase: 'lobby' | 'playing' | 'over'
  /** table name, or '' when unnamed */
  name?: string
  /** true once the game is archived (swept dead lobby, or host-removed) */
  archived?: boolean
  version: number
  you: number | null
  /** seat currently holding host powers (usually 0; transfers if 0 is vacated) */
  hostSeatId: number | null
  seats: SeatView[]
  snapshot: unknown | null
  messages?: ChatMessageWire[]
  ai?: AiViewWire
}

/** A chat increment pushed on the `event: chat` SSE frame (see stream route). */
interface ChatDeltaWire {
  version: number
  chatSeq: number
  messages: ChatMessageWire[]
}

interface Creds {
  seatId: number
  seatSecret: string
}

/** Keep the client's chat memory bounded; the recent tail on a full frame is
 *  smaller than this, so a reconnect never loses already-seen lines. */
const CLIENT_CHAT_CAP = 200

/**
 * How long the round-end curtain hangs before lifting itself. Nobody hands
 * this device on, so the curtain must never be the reason a live turn stalls.
 */
const MP_CURTAIN_MS = 6000

/**
 * Merge chat lines by `id` (== per-game seq): idempotent union, sorted, capped.
 * Returns the SAME array reference when nothing new arrived so callers can
 * no-op. This is why a duplicated/reordered chat frame (delta or full-frame
 * tail) is harmless — the id set converges regardless of arrival order.
 */
function mergeChat(
  current: ChatMessageWire[] = [],
  incoming: ChatMessageWire[] = [],
): ChatMessageWire[] {
  if (incoming.length === 0) return current
  const byId = new Map<number, ChatMessageWire>()
  for (const m of current) byId.set(m.id, m)
  let changed = false
  for (const m of incoming) {
    if (!byId.has(m.id)) {
      byId.set(m.id, m)
      changed = true
    }
  }
  if (!changed) return current
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-CLIENT_CHAT_CAP)
}

function loadCreds(token: string): Creds | null {
  try {
    const raw = localStorage.getItem(credsKey(token))
    if (!raw) return null
    const c = JSON.parse(raw) as Creds
    return typeof c.seatId === 'number' && typeof c.seatSecret === 'string'
      ? c
      : null
  } catch {
    return null
  }
}

// JSON turns the markets' Infinity capacities into null — restore before
// the local read-only actor sees the snapshot (same fix as everywhere).
function rehydrate(snapshot: unknown): unknown {
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
    // tolerate malformed frames — the server remains authoritative
  }
  return clone
}

/* ================================================================ */

export function MpGame({ token }: { token: string }) {
  const [creds, setCreds] = useState<Creds | null>(null)
  const [credsLoaded, setCredsLoaded] = useState(false)
  // Set while a seat restored from a recovery link is still unverified, so the
  // stream's ordinary accept/reject can be reported to the player who pasted
  // it (otherwise a bad link silently shows the join screen). Verification is
  // the EXISTING seat-secret check on the server — nothing new authenticates
  // here, and the refusal never says which half of the link was wrong.
  const recoveryPending = useRef(false)
  // Credentials parsed from a recovery link, held UNPERSISTED until the server
  // authenticates the seat. Only then are they written to storage — a bad or
  // stale link must never overwrite a working seat's stored secret.
  const recoveredCreds = useRef<Creds | null>(null)
  // Whatever valid credentials this browser already held for the game before a
  // recovery link was opened. If the link fails to authenticate, these are
  // restored so the player keeps the seat they were already in.
  const priorCreds = useRef<Creds | null>(null)
  /** A consumed recovery link the server would not authenticate. Rendered as
   *  ONE message on the join screen for every failure mode (wrong seat,
   *  tampered secret, seat since released) — it must not narrow down which. */
  const [recoveryRejected, setRecoveryRejected] = useState(false)
  // Set ONLY for a seat claimed mid-game (a released seat re-taken), which
  // skips the lobby and therefore the inline SeatKeyNotice. A lobby joiner
  // must NOT set this: the flag would survive into the started game and put a
  // full-screen modal over the board on the first turn.
  const [seatKeyAtClaim, setSeatKeyAtClaim] = useState(false)
  const [view, setView] = useState<GameViewWire | null>(null)
  const [streamFailing, setStreamFailing] = useState(false)
  // The SSE stream drives a ~1.2s server-side DB poll for its whole lifetime.
  // A tab left open on a dormant game therefore keeps polling Neon forever —
  // the bulk of the egress leak. Close the stream once the tab has been hidden
  // for a grace period and reopen it when the tab is shown again; the first
  // frame on reopen is the full current view, so nothing is missed.
  const [streamPaused, setStreamPaused] = useState(false)

  // FIRST effect on purpose: a recovery link must be consumed — the secret
  // stripped out of the address bar — before the stream effect below opens an
  // EventSource, so the secret can never ride a request or a Referer header.
  // The strip is synchronous inside `consumeRecoveryLink`; the recovered creds
  // stay unpersisted until the stream authenticates the seat (see below).
  useEffect(() => {
    const recovered = consumeRecoveryLink(window)
    const existing = loadCreds(token)
    if (recovered) {
      recoveryPending.current = true
      recoveredCreds.current = recovered
      priorCreds.current = existing
      setCreds(recovered)
    } else {
      setCreds(existing)
    }
    setCredsLoaded(true)
  }, [token])

  // Pause the live stream on a persistently hidden tab (60s grace, so a quick
  // tab switch doesn't churn the connection). Resume immediately on show.
  useEffect(() => {
    if (typeof document === 'undefined') return
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const onVisibility = () => {
      if (document.hidden) {
        hideTimer = setTimeout(() => setStreamPaused(true), 60_000)
      } else {
        if (hideTimer) clearTimeout(hideTimer)
        setStreamPaused(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (hideTimer) clearTimeout(hideTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Single apply path for every authoritative full view — SSE `data:` frames
  // AND the fresh view returned by an act/chat POST. The engine snapshot is
  // guarded by `version` (only a strictly newer view replaces it, so a
  // late/duplicate frame can never regress state); chat merges by id at ANY
  // version, since a chat line no longer bumps the engine version.
  const applyView = useCallback((incoming: GameViewWire) => {
    setView((cur) => {
      if (!cur) return incoming
      if (incoming.version > cur.version) {
        return {
          ...incoming,
          messages: mergeChat(cur.messages, incoming.messages),
        }
      }
      // same-or-older engine version: only the chat tail may carry news
      const merged = mergeChat(cur.messages, incoming.messages)
      return merged === cur.messages ? cur : { ...cur, messages: merged }
    })
  }, [])

  // A chat increment (`event: chat`) — merge its messages into the current
  // view without touching the engine snapshot/version. Ignored before the
  // first full frame (the stream always sends that full frame first).
  const applyChatDelta = useCallback((delta: ChatDeltaWire) => {
    setView((cur) => {
      if (!cur) return cur
      const merged = mergeChat(cur.messages, delta.messages)
      return merged === cur.messages ? cur : { ...cur, messages: merged }
    })
  }, [])

  // Live view over SSE; EventSource reconnects on its own after drops and
  // dev-server restarts (the game itself is durable on disk). The stream is
  // (re)opened whenever the credentials change; only THIS stream may decide
  // the seat was lost — a late message from the previous unauthenticated
  // stream must never wipe freshly-claimed credentials.
  useEffect(() => {
    if (!credsLoaded) return
    // Hidden-tab pause: hold the connection closed until the tab is shown.
    if (streamPaused) return
    const myCreds = creds
    const qs = new URLSearchParams({ token })
    if (myCreds) {
      qs.set('seat', String(myCreds.seatId))
      qs.set('secret', myCreds.seatSecret)
    }
    const es = new EventSource(`/api/mp/stream?${qs.toString()}`)
    let closed = false
    es.onmessage = (e) => {
      if (closed) return
      setStreamFailing(false)
      const parsed = JSON.parse(e.data as string) as GameViewWire
      if (myCreds && parsed.you === null) {
        // This credentialed stream was rejected: the seat was released or the
        // secret is stale.
        if (recoveryPending.current) {
          recoveryPending.current = false
          const prior = priorCreds.current
          recoveredCreds.current = null
          priorCreds.current = null
          if (prior) {
            // The link did not authenticate, but this browser already held a
            // working seat here — restore it rather than evicting the player.
            // The recovered creds were never persisted, so storage still holds
            // `prior`; rewrite it to be robust and re-open the stream with it.
            localStorage.setItem(credsKey(token), JSON.stringify(prior))
            setCreds(prior)
            return
          }
          // No seat to fall back to: surface the one unrevealing notice.
          localStorage.removeItem(credsKey(token))
          setRecoveryRejected(true)
          setCreds(null)
          return
        }
        // Ordinary mid-session rejection (seat released or secret stale) →
        // back to claiming.
        localStorage.removeItem(credsKey(token))
        setCreds(null)
        return
      }
      // The link was accepted. Persist the recovered creds now that the server
      // has authenticated the seat, and disarm so that a LATER rejection on
      // this same session — a peer releasing the seat mid-game — reports itself
      // the ordinary way instead of blaming a recovery link that in fact
      // worked.
      if (recoveryPending.current && parsed.you !== null) {
        recoveryPending.current = false
        const rec = recoveredCreds.current
        recoveredCreds.current = null
        priorCreds.current = null
        if (rec) localStorage.setItem(credsKey(token), JSON.stringify(rec))
      }
      applyView(parsed)
    }
    // Bounded chat increments arrive on their own event so a chat line never
    // rides a full-state frame (see stream route). Merged by id, idempotent.
    es.addEventListener('chat', (e) => {
      if (closed) return
      setStreamFailing(false)
      applyChatDelta(
        JSON.parse((e as MessageEvent).data as string) as ChatDeltaWire,
      )
    })
    es.onerror = () => {
      if (!closed) setStreamFailing(true)
    }
    return () => {
      closed = true
      es.close()
    }
  }, [token, creds, credsLoaded, streamPaused, applyView, applyChatDelta])

  if (!credsLoaded || (!view && !streamFailing)) {
    return (
      <Centered>
        <span
          className="bb2-display text-3xl font-black tracking-[0.3em]"
          style={{ color: 'var(--bb-brass-dim)' }}
        >
          BRASS
        </span>
        <p className="text-[13px]" style={{ color: 'rgba(231,215,177,.55)' }}>
          Connecting to the game…
        </p>
      </Centered>
    )
  }

  if (!view) {
    return (
      <Centered>
        <span
          className="bb2-display text-2xl font-bold"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          No game at this address
        </span>
        <p className="text-[13px]" style={{ color: 'rgba(231,215,177,.55)' }}>
          The link may be mistyped, or the game has expired (games are kept for
          7 days).
        </p>
      </Centered>
    )
  }

  // Archived = the game is gone (swept dead lobby, or the host removed it).
  // Show a clear "no longer exists" dead-end with a create-new call to action,
  // for EVERYONE (a would-be joiner opening the link, a co-player still on the
  // lobby) — never the confusing "all seats taken" join screen. Checked before
  // join/lobby so it wins.
  if (view.archived) {
    return <GoneScreen />
  }

  if (view.you === null) {
    return (
      <JoinScreen
        token={token}
        view={view}
        recoveryRejected={recoveryRejected}
        onJoined={(c) => {
          localStorage.setItem(credsKey(token), JSON.stringify(c))
          setCreds(c)
          setRecoveryRejected(false)
          setSeatKeyAtClaim(view.phase !== 'lobby')
        }}
      />
    )
  }

  if (view.phase === 'lobby') {
    // The lobby carries the claim-time nudge inline (SeatKeyNotice) for every
    // seated player, host included — no modal needed, and nothing on top of
    // the ready/start controls.
    return <LobbyScreen token={token} view={view} creds={creds} />
  }

  return (
    <>
      <MpTable token={token} view={view} creds={creds!} applyView={applyView} />
      {/* Claiming a seat MID-GAME (a released seat re-taken) skips the lobby
          entirely, so that one path gets the modal instead. Dismissible, and
          the Seat key button in the masthead brings it back. */}
      {seatKeyAtClaim && creds && (
        <SeatKeyModal
          token={token}
          creds={creds}
          atClaim
          onClose={() => setSeatKeyAtClaim(false)}
        />
      )}
    </>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
    </div>
  )
}

/** Clear dead-end for a game that no longer exists — swept as a dead lobby or
 *  removed by its host. Distinct from a genuinely full table: a create-new CTA
 *  instead of "all seats taken". */
function GoneScreen() {
  return (
    <Centered>
      <span
        className="bb2-display text-2xl font-bold"
        style={{ color: 'var(--bb-parchment-bright)' }}
        data-testid="game-gone"
      >
        This game no longer exists
      </span>
      <p className="text-[13px]" style={{ color: 'rgba(231,215,177,.55)' }}>
        The table was closed or removed. Start a fresh one — it only takes a
        moment.
      </p>
      <a href="/" className="bb2-confirm mt-2" data-testid="gone-host-new">
        Host a new game
      </a>
    </Centered>
  )
}

/* ---------------- join & lobby ---------------- */

function JoinScreen({
  token,
  view,
  recoveryRejected,
  onJoined,
}: {
  token: string
  view: GameViewWire
  recoveryRejected: boolean
  onJoined: (creds: Creds) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const open = view.seats.filter((s) => !s.claimed)

  const join = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/mp/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name }),
      })
      const body = (await res.json()) as Creds & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Could not join')
      onJoined({ seatId: body.seatId, seatSecret: body.seatSecret })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not join')
      setBusy(false)
    }
  }

  return (
    <Centered>
      <span
        className="text-[12px] font-semibold uppercase tracking-[0.4em]"
        style={{ color: 'var(--bb-brass)' }}
      >
        You are invited to the table
      </span>
      <h1
        className="bb2-display text-6xl font-black tracking-wide"
        style={{ color: 'var(--bb-parchment-bright)' }}
      >
        BRASS
      </h1>
      <div className="bb2-panel mt-4 flex w-full max-w-sm flex-col gap-4 p-6">
        <span className="bb2-panel-title">Claim a seat</span>
        {recoveryRejected && (
          <p
            className="rounded border px-3 py-2 text-[12.5px]"
            data-testid="recovery-rejected"
            style={{
              borderColor: 'rgba(214, 92, 62, .55)',
              background: 'rgba(214, 92, 62, .12)',
              color: 'var(--bb-parchment-bright)',
            }}
          >
            That seat key did not work for this table. Take an open seat below,
            or ask a player at the table to release yours first.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {view.seats.map((s) => (
            <div
              key={s.seatId}
              className="flex items-center gap-2 text-[13px]"
              style={{ color: 'var(--bb-parchment)' }}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: `var(--bb-player-${s.color})` }}
              />
              {s.claimed ? (
                <span>{s.name}</span>
              ) : (
                <span style={{ color: 'rgba(231,215,177,.45)' }}>
                  open seat
                </span>
              )}
            </div>
          ))}
        </div>
        {open.length > 0 ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              data-testid="join-name"
              className="w-full rounded border bg-transparent px-3 py-2 text-[14px] outline-none"
              style={{
                borderColor: 'rgba(231,215,177,.2)',
                color: 'var(--bb-parchment-bright)',
              }}
            />
            <button
              type="button"
              className="bb2-confirm"
              data-testid="join-seat"
              disabled={busy || name.trim().length === 0}
              onClick={() => void join()}
            >
              Take a seat
            </button>
          </>
        ) : (
          <p
            className="text-[12.5px]"
            style={{ color: 'rgba(231,215,177,.6)' }}
          >
            All seats are taken. If one of them is yours from another browser,
            ask the host to release it, then claim it again here.
          </p>
        )}
      </div>
      <Toaster theme="dark" position="top-right" />
    </Centered>
  )
}

function LobbyScreen({
  token,
  view,
  creds,
}: {
  token: string
  view: GameViewWire
  creds: Creds | null
}) {
  const [busy, setBusy] = useState(false)
  const isHost = view.you !== null && view.you === view.hostSeatId
  const isSeated = view.you !== null
  const mySeat =
    view.you !== null
      ? view.seats.find((s) => s.seatId === view.you)
      : undefined
  const openSeats = view.seats.filter((s) => !s.claimed).length
  const allClaimed = view.seats.every((s) => s.claimed)
  const allReady = view.seats.every((s) => s.ready)
  const canStart = allClaimed && allReady
  const readyCount = view.seats.filter((s) => s.ready).length

  const toggleReady = async () => {
    if (!creds || !mySeat) return
    setBusy(true)
    try {
      const res = await fetch('/api/mp/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          seatId: creds.seatId,
          seatSecret: creds.seatSecret,
          ready: !mySeat.ready,
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Could not update ready state')
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not update ready state',
      )
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    if (!creds) return
    setBusy(true)
    try {
      const res = await fetch('/api/mp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, seatSecret: creds.seatSecret }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Could not start the game')
      }
      // the SSE poll delivers the 'playing' view; no local navigation needed
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the game')
    } finally {
      setBusy(false)
    }
  }

  const removeGame = async () => {
    if (!creds) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Remove this table? It disappears from the lobby for everyone. This cannot be undone here.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/mp/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, seatSecret: creds.seatSecret }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Could not remove the game')
      }
      // The table is gone — take the host home to start a new one.
      if (typeof window !== 'undefined') window.location.assign('/')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the game')
      setBusy(false)
    }
  }

  const startHint = !allClaimed
    ? 'Waiting for every seat to be claimed…'
    : !allReady
      ? 'Waiting for every player to ready up…'
      : 'Everyone is ready — start the game!'

  return (
    <Centered>
      <span
        className="text-[12px] font-semibold uppercase tracking-[0.4em]"
        style={{ color: 'var(--bb-brass)' }}
      >
        The charter is signed
      </span>
      <h1
        className="bb2-display text-5xl font-black"
        style={{ color: 'var(--bb-parchment-bright)' }}
      >
        {view.name?.trim() ? view.name : 'Waiting to begin'}
      </h1>
      {/* While seats are open, filling them IS the task — so the invite is the
          lobby's primary affordance, outranking the seat key below it. Once
          the table is full there is nobody left to invite and it drops back to
          the compact chip. See the note on InviteCallout. */}
      {openSeats > 0 ? <InviteCallout openSeats={openSeats} /> : <ShareLink />}
      <div
        className="text-[12px]"
        style={{ color: 'rgba(231,215,177,.55)' }}
        data-testid="lobby-ready-count"
      >
        {readyCount} of {view.seats.length} ready
      </div>
      <div className="bb2-panel mt-2 flex w-full max-w-sm flex-col gap-2 p-5">
        {view.seats.map((s) => (
          <div
            key={s.seatId}
            className="flex items-center gap-3 text-[14px]"
            style={{ color: 'var(--bb-parchment)' }}
            data-testid={`lobby-seat-${s.seatId}`}
            data-ready={s.ready ? 'true' : 'false'}
          >
            <span
              className="h-3 w-3 flex-none rounded-full"
              style={{ background: `var(--bb-player-${s.color})` }}
            />
            {s.claimed ? (
              <span className="font-semibold">{s.name}</span>
            ) : (
              <span style={{ color: 'rgba(231,215,177,.4)' }}>
                waiting for a player…
              </span>
            )}
            {s.seatId === 0 && (
              <span
                className="text-[9px] font-bold uppercase tracking-[0.16em]"
                style={{ color: 'rgba(231,215,177,.5)' }}
              >
                host
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {s.seatId === view.you && (
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--bb-brass-bright)' }}
                >
                  you
                </span>
              )}
              {s.claimed && (
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{
                    color: s.ready
                      ? 'var(--bb-brass-bright)'
                      : 'rgba(231,215,177,.4)',
                  }}
                  data-testid={`lobby-ready-badge-${s.seatId}`}
                >
                  {s.ready ? '✓ ready' : 'not ready'}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {mySeat && mySeat.kind !== 'ai' && (
        <button
          type="button"
          className="bb2-confirm w-full max-w-sm"
          data-testid="lobby-ready-toggle"
          disabled={busy}
          onClick={() => void toggleReady()}
          style={
            mySeat.ready
              ? { opacity: 0.7, filter: 'grayscale(0.3)' }
              : undefined
          }
        >
          {mySeat.ready ? 'Not ready' : "I'm ready"}
        </button>
      )}

      {isHost && (
        <div className="flex w-full max-w-sm flex-col gap-2">
          <button
            type="button"
            className="bb2-confirm w-full"
            data-testid="lobby-start"
            disabled={busy || !canStart}
            onClick={() => void start()}
          >
            Start the game
          </button>
          <p
            className="text-center text-[12px]"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            {startHint}
          </p>
          <button
            type="button"
            className="bb2-ghost-btn w-full"
            data-testid="lobby-remove"
            disabled={busy}
            onClick={() => void removeGame()}
          >
            Remove this table
          </button>
        </div>
      )}

      {isSeated && creds && (
        <>
          <SeatKeyNotice token={token} creds={creds} />
          <div className="flex items-start gap-2">
            <SeatsButton token={token} creds={creds} seats={view.seats} />
            <SeatKeyButton token={token} creds={creds} />
          </div>
        </>
      )}

      {!isHost && (
        <p className="text-[12px]" style={{ color: 'rgba(231,215,177,.45)' }}>
          The host starts the game once everyone is ready.
        </p>
      )}
      <Toaster theme="dark" position="top-right" />
    </Centered>
  )
}

/** Any seated player: release a seat whose owner lost their secret (including
 *  the host seat) so it can be re-claimed from the join screen. This is the
 *  recovery path for a host who cleared their browser storage — a peer frees
 *  seat 0 and the host claims it again. */
function SeatsButton({
  token,
  creds,
  seats,
}: {
  token: string
  creds: Creds
  seats: SeatView[]
}) {
  const [open, setOpen] = useState(false)
  const release = async (seatId: number) => {
    const res = await fetch('/api/mp/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        seatSecret: creds.seatSecret,
        targetSeatId: seatId,
      }),
    })
    const body = (await res.json()) as { ok: boolean; error?: string }
    if (!body.ok) toast.error(body.error ?? 'Release failed')
    else toast(`Seat ${seatId + 1} released — it can be claimed again.`)
  }
  return (
    <div className="relative">
      <button
        type="button"
        className="bb2-ghost-btn"
        data-testid="seats-button"
        onClick={() => setOpen((o) => !o)}
      >
        Seats
      </button>
      {open && (
        <div
          className="bb2-panel absolute right-0 top-full z-50 mt-2 flex w-64 flex-col gap-2 p-3"
          data-testid="seats-overlay"
        >
          {seats.map((s) => (
            <div
              key={s.seatId}
              className="flex items-center gap-2 text-[13px]"
              style={{ color: 'var(--bb-parchment)' }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: `var(--bb-player-${s.color})` }}
              />
              <span className="truncate">
                {s.claimed ? (s.name ?? '—') : 'open'}
              </span>
              {s.claimed && s.kind !== 'ai' && s.seatId !== creds.seatId && (
                <button
                  type="button"
                  className="bb2-ghost-btn ml-auto !px-2 !py-1 text-[10px]"
                  data-testid={`release-${s.seatId}`}
                  onClick={() => void release(s.seatId)}
                >
                  Release
                </button>
              )}
            </div>
          ))}
          <p
            className="text-[10.5px]"
            style={{ color: 'rgba(231,215,177,.45)' }}
          >
            A player who still has their seat key can just open it to get back
            in. Release a seat only when that is gone too — even the host's — so
            it can be claimed again from the invite link.
          </p>
        </div>
      )}
    </div>
  )
}

/** The public invite URL for the current game: origin + path only, so it can
 *  never carry a recovery fragment or a stray query. A malformed recovery link
 *  that survived in the address bar must not leak into the invite affordance. */
function inviteUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}`
}

function ShareLink({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false)
  const url = inviteUrl()
  return (
    <button
      type="button"
      className={`bb2-chip ${className ?? ''}`}
      data-testid="share-link"
      style={{ cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
      onClick={() => {
        void navigator.clipboard?.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      title="Copy the invite link — safe to share, it only offers an open seat"
    >
      {/* The ONLY bare URL on screen is this public one, so "the link you can
          grab" is always the safe one; the private seat key lives behind a
          button and a reveal (see seat-key.tsx). The label makes the pair
          textually distinct rather than two lookalike URLs side by side. */}
      <span
        className="flex-none text-[9px] font-bold uppercase tracking-[0.16em]"
        style={{ color: 'var(--bb-brass-bright)' }}
      >
        Invite
      </span>
      {/* The invite URL can be long (token + a deploy-preview host). Let it
          ellipsis-truncate on phones so it can never force the masthead wider
          than the viewport; the full URL still shows from lg up (unchanged)
          and is always copied in full. */}
      <span className="min-w-0 truncate">
        {copied ? 'Invite link copied!' : url}
      </span>
    </button>
  )
}

/**
 * The lobby's PRIMARY affordance while seats are still open: a real card with
 * the invite URL and an obvious copy button.
 *
 * WHY IT OUTRANKS THE SEAT KEY (2026-07-24 review). Prominence has to track
 * SHAREABILITY. When the seat key was the biggest gold panel on the lobby and
 * the invite was a thin pill, the layout taught the wrong safety lesson — the
 * credential looked like the thing to send and the genuinely shareable link
 * looked like a footnote. That is the same invite-vs-recovery confusion this
 * feature guards against in its copy, showing up as styling. So: the invite
 * looks shareable, the seat key looks guarded (SeatKeyNotice is deliberately
 * calm — do not re-promote it here).
 *
 * Scoped to the lobby. In the live game the invite is no longer the call to
 * action and the compact masthead `ShareLink` chip is right.
 */
function InviteCallout({ openSeats }: { openSeats: number }) {
  const [copied, setCopied] = useState(false)
  const url = inviteUrl()
  return (
    <div
      className="bb2-panel bb2-panel-active mt-1 flex w-full max-w-sm flex-col gap-2.5 p-5"
      data-testid="invite-callout"
    >
      <span className="bb2-panel-title">
        Invite {openSeats === 1 ? 'a player' : 'players'}
      </span>
      <p className="text-[12.5px]" style={{ color: 'var(--bb-parchment)' }}>
        {openSeats === 1
          ? 'One seat is still open.'
          : `${openSeats} seats are still open.`}{' '}
        Send this link — whoever opens it claims a seat.
      </p>
      <code
        className="block break-all rounded border px-3 py-2 text-[11.5px] leading-snug"
        data-testid="invite-link-text"
        style={{
          borderColor: 'rgba(231,215,177,.18)',
          background: 'rgba(0,0,0,.25)',
          color: 'var(--bb-parchment)',
        }}
      >
        {url}
      </code>
      <button
        type="button"
        className="bb2-confirm w-full"
        data-testid="share-link"
        onClick={() => {
          void navigator.clipboard?.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? 'Invite link copied!' : 'Copy invite link'}
      </button>
      <p className="text-[11.5px]" style={{ color: 'rgba(231,215,177,.5)' }}>
        Safe to share anywhere — it only offers an open seat, never anyone
        else's.
      </p>
    </div>
  )
}

/* ---------------- the live table ---------------- */

/* ---------------- chat ---------------- */

function ChatPanel({
  messages,
  you,
  seats,
  onSend,
}: {
  messages: ChatMessageWire[]
  you: number
  seats: SeatView[]
  onSend: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [lastSeenId, setLastSeenId] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const latestId = messages[messages.length - 1]?.id ?? 0
  const unread = open ? 0 : messages.filter((m) => m.id > lastSeenId).length

  // Reading happens while the panel is open — remember the newest id.
  useEffect(() => {
    if (open) {
      setLastSeenId(latestId)
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [open, latestId])

  const seatColor = (seatId: number) =>
    PLAYER_FILL[(seats[seatId]?.color ?? 'red') as keyof typeof PLAYER_FILL]

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <div className="bb2-panel flex flex-col gap-2 p-3">
      <button
        type="button"
        className="flex items-center justify-between"
        data-testid="chat-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="bb2-panel-title">Table talk</span>
        <span className="flex items-center gap-2">
          {unread > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
              data-testid="chat-unread"
              style={{ background: 'var(--bb-brass)', color: '#241a08' }}
            >
              {unread}
            </span>
          )}
          <span style={{ color: 'rgba(231,215,177,.5)', fontSize: 11 }}>
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>
      {open && (
        <>
          <div
            ref={listRef}
            className="flex max-h-48 min-h-0 flex-col gap-1 overflow-y-auto pr-1"
            data-testid="chat-list"
          >
            {messages.map((m) => (
              <div key={m.id} className="text-[13px] leading-snug">
                <b style={{ color: seatColor(m.seatId) }}>
                  {m.seatId === you ? 'You' : m.name}
                </b>{' '}
                <span style={{ color: 'var(--bb-parchment)' }}>{m.text}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <p
                className="text-[12px]"
                style={{ color: 'rgba(231,215,177,.4)' }}
              >
                No messages yet — say hello.
              </p>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input
              className="min-w-0 flex-1 rounded border bg-transparent px-3 py-1.5 text-[13px] outline-none"
              style={{
                borderColor: 'rgba(231,215,177,.25)',
                color: 'var(--bb-parchment-bright)',
              }}
              data-testid="chat-input"
              value={draft}
              maxLength={500}
              placeholder="Message your opponent…"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              className="bb2-ghost-btn"
              data-testid="chat-send"
              disabled={draft.trim().length === 0}
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  )
}

function MpTable({
  token,
  view,
  creds,
  applyView,
}: {
  token: string
  view: GameViewWire
  creds: Creds
  applyView: (view: GameViewWire) => void
}) {
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)
  // Develop-mode mat modal (see devView below) — open while the machine sits
  // on a develop tile step of MY turn; closable, the dock reopens it.
  const [developMatOpen, setDevelopMatOpen] = useState(false)
  const [panelCollapsed, togglePanel] = usePanelCollapsed()
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null)
  // Hover-a-name spotlight: the player whose rail mat is hovered/focused right
  // now — the board lights up their network (links + tiles) and recedes the rest.
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null)
  // Hover-to-locate: which city's NAME (journal, pickers, ledger…) is under
  // the cursor/focus right now — its plate gets the map's surveyor's mark.
  const locateState = useLocateCityState()

  // Read-only actor per broadcast: gives the dock/board the snapshot shape
  // (`matches`, `can`, context) they already understand.
  const state = useMemo(() => {
    if (!view.snapshot) return null
    const actor = createActor(gameStore, {
      snapshot: rehydrate(view.snapshot) as never,
    })
    actor.start()
    const snap = actor.getSnapshot()
    actor.stop()
    return snap as GameStoreSnapshot
  }, [view.snapshot])

  // In-flight tracking: an intent is "pending" from the moment it POSTs until
  // the settling SSE frame lands (a higher server version) or the POST errors.
  // Drives the global sync bar + the dock/board pending states below.
  const { inFlight, begin } = useInFlight(view.version)

  const send = useMemo(
    () => (event: { type: string } & Record<string, unknown>) => {
      const settle = begin()
      void (async () => {
        try {
          const res = await fetch('/api/mp/act', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              seatId: creds.seatId,
              seatSecret: creds.seatSecret,
              event,
            }),
          })
          const body = (await res.json()) as {
            ok: boolean
            error?: string
            view?: GameViewWire
            version?: number
          }
          if (!body.ok) {
            // The server refused the intent — no frame is coming, so settle
            // now and show the server's EXACT reason (what is missing: the
            // money, the beer, the connection, whose turn it is).
            settle()
            const refusal = refusalToShow(body, event.type)
            if (refusal) toast.error(refusal)
          } else if (body.view) {
            // Server-authoritative fast path: apply the engine's OWN fresh view
            // from the POST response (same version-guarded apply path as an SSE
            // frame — NOT an optimistic update). The version bump this causes
            // settles the in-flight intent immediately (~1s), so the actor no
            // longer waits for the next poll tick.
            applyView(body.view)
          }
          // If success carried no view (older server), we leave the intent
          // pending: the resulting SSE frame settles it via the version bump.
        } catch {
          settle()
          toast.error(UNREACHABLE)
        }
      })()
    },
    [token, creds, begin, applyView],
  )

  const ctx = state?.context
  const you = view.you!
  const myTurn = !!ctx && ctx.currentPlayerIndex === you
  const currentPlayer: Player | undefined = ctx?.players[ctx.currentPlayerIndex]
  const me: Player | undefined = ctx?.players[you]

  // Develop picks its tiles ON the player mat. The machine's state value is
  // shared with every seat, so gate HARD on it being MY turn — a rival's
  // develop must never open my mat.
  const devView = state && myTurn ? developMatView(state) : null
  const inDevelopTileSteps = devView !== null
  useEffect(() => {
    setDevelopMatOpen(inDevelopTileSteps)
  }, [inDevelopTileSteps])

  // My fan's order is my own arrangement — a view permutation over the hand
  // the server sent me, never a write to it (hand-order.ts).
  const handOrder = useHandOrder(me?.id ?? '')
  const arrangedHand = useMemo(
    () => handOrder.arrange(me?.hand ?? []),
    [handOrder.arrange, me?.hand],
  )

  // Surface engine errors from my own confirmed actions, then clear them.
  useEffect(() => {
    if (ctx?.lastError && myTurn) {
      toast.error(ctx.lastError)
      send({ type: 'CLEAR_ERROR' })
    }
  }, [ctx?.lastError, myTurn, send])

  // ---------- turn notifications ----------
  // Driven off the SSE frames: when the turn TRANSFERS to this seat,
  // buzz the player — a browser Notification if the tab is hidden, a
  // title-bar cue + soft chime if visible. Permission is only ever
  // requested from the bell button (a user gesture), never on load.
  const prevTurnIndex = useRef<number | null>(null)
  const [notifyPermission, setNotifyPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof Notification === 'undefined'
      ? 'unsupported'
      : Notification.permission,
  )
  useEffect(() => {
    const next = ctx ? ctx.currentPlayerIndex : null
    const became = didBecomeMyTurn(prevTurnIndex.current, next, you)
    prevTurnIndex.current = next
    if (!became || view.phase !== 'playing') return
    if (document.hidden) {
      if (notifyPermission === 'granted') {
        try {
          const n = new Notification('Your turn — Brass', {
            body: 'The table is waiting on you.',
            tag: `bb-turn-${token}`,
          })
          n.onclick = () => window.focus()
        } catch {
          // notification failures are never errors
        }
      }
    } else {
      playTurnChime()
      toast('Your turn.', { duration: 3000 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.currentPlayerIndex])

  // Title-bar cue: '● Your turn — …' while it is on you, restored after.
  useEffect(() => {
    const base = 'Brass: Birmingham'
    document.title = titleForTurn(base, myTurn && view.phase === 'playing')
    return () => {
      document.title = base
    }
  }, [myTurn, view.phase])

  // Round-end curtain. Seeded from the first view we see, so joining or
  // refreshing mid-game never replays the curtain for an already-finished
  // round — only a round ending live bumps roundSummary.round past the seed.
  const [curtainSeen, setCurtainSeen] = useState<number | null>(null)
  const curtainSeed = useRef<number | null | undefined>(undefined)
  if (curtainSeed.current === undefined && ctx) {
    curtainSeed.current = ctx.roundSummary?.round ?? null
  }
  const seenRound = curtainSeen ?? curtainSeed.current ?? null

  // Era turnover announcement.
  const prevEra = useRef(ctx?.era)
  useEffect(() => {
    if (!ctx) return
    if (prevEra.current && prevEra.current !== ctx.era && ctx.era === 'rail') {
      toast('The Canal Era has ended — welcome to the Age of Rail.', {
        duration: 6000,
      })
    }
    prevEra.current = ctx.era
  }, [ctx, ctx?.era])

  /* ---- board interaction (only meaningful on my turn) ---- */

  const is = (path: string) =>
    !!state &&
    (state as { matches: (p: never) => boolean }).matches(path as never)

  const pickingSite = myTurn && is('playing.action.building.selectingLocation')
  const pickingLink = myTurn && is('playing.action.networking.selectingLink')
  const pickingSecondLink =
    myTurn && is('playing.action.networking.selectingSecondLink')

  // Candidates only — the machine owns legality (shared with the hotseat
  // surface, so the two can never offer different sets).
  const legalCities = useMemo(
    () => (pickingSite && state ? legalCityTargets(state) : null),
    [pickingSite, state],
  )

  // Hovering a card in my hand previews its build targets on the map,
  // scoped to my own network — the same soft hint as the hotseat surface
  // (shared via computeHoverCities). The tray only ever shows my hand, so
  // the preview always reflects where I could build.
  const hoverCities = useMemo(
    () => computeHoverCities(hoveredCard, me ? playerNetworkCities(me) : null),
    [hoveredCard, me],
  )

  const legalLinks = useMemo(
    () =>
      (pickingLink || pickingSecondLink) && state
        ? legalLinkTargets(state, pickingSecondLink)
        : null,
    [pickingLink, pickingSecondLink, state],
  )

  // While the engine is asking WHERE a resource comes from, the answers are
  // places — so the map lights them, exactly as on the hotseat surface. A
  // bystander's view carries no staged selection, so nothing lights for them.
  const sourceCities = useMemo(
    () => (state ? sourceCandidateCities(state) : null),
    [state],
  )

  const boardPrompt = useMemo(() => {
    if (!ctx) return null
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
    ctx,
    pickingSite,
    pickingLink,
    pickingSecondLink,
    legalCities,
    legalLinks,
  ])

  // Exact sale probe on my own filtered snapshot (my hand is real in it).
  const canSellAnything = useMemo(() => {
    if (!myTurn || !state || !me || !ctx) return true
    // Both choosers show the Sell plaque: idle and card-first (from
    // cardSelected the probe's SELL skips the card step; the stray
    // SELECT_CARD below is simply ignored there).
    if (
      !is('playing.action.selectingAction') &&
      !is('playing.action.cardSelected')
    )
      return true
    const sellable = me.industries.filter(
      (i) => !i.flipped && SELLABLE.includes(i.type),
    )
    if (sellable.length === 0 || me.hand.length === 0) return false
    try {
      const probe = createActor(gameStore, {
        snapshot: rehydrate(view.snapshot) as never,
      })
      probe.start()
      probe.send({ type: 'SELL' } as never)
      const first = me.hand[0]
      if (first) probe.send({ type: 'SELECT_CARD', cardId: first.id } as never)
      const snap = probe.getSnapshot() as { can: (e: never) => boolean }
      let ok = false
      outer: for (const ind of sellable) {
        for (const m of ctx.merchants) {
          if (
            snap.can({
              type: 'SELECT_SALE',
              location: ind.location,
              industryType: ind.type,
              merchant: m.location,
            } as never)
          ) {
            ok = true
            break outer
          }
        }
      }
      probe.stop()
      return ok
    } catch {
      return true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, state, view.snapshot])

  if (!state || !ctx || !currentPlayer || !me) {
    return (
      <Centered>
        <p style={{ color: 'rgba(231,215,177,.6)' }}>Loading the table…</p>
      </Centered>
    )
  }

  if (view.phase === 'over' || state.matches('gameOver')) {
    return (
      <GameOverScreen
        players={ctx.players}
        winners={ctx.winners ?? []}
        era={ctx.era}
        merchants={ctx.merchants}
        onRestart={() => {
          window.location.href = '/'
        }}
      />
    )
  }

  const onCityClick = (cityId: CityId) => {
    if (!myTurn || inFlight) return
    const event = { type: 'SELECT_LOCATION', cityId } as const
    if (state.can(event)) {
      send(event)
    } else {
      toast.error(
        explainRefusal(state, event) ??
          `${cities[cityId]?.name ?? cityId} is not a legal site for this build.`,
      )
    }
  }

  const onLinkClick = (from: CityId, to: CityId) => {
    if (!myTurn || inFlight) return
    // The client gates the click itself, so the server's refusal reason would
    // never be reached for an illegal route. Ask the SAME explainer the server
    // uses — everything it needs (money, links, era) is public state already
    // in this frame — so the player is told what is missing either way.
    if (pickingSecondLink) {
      const event = { type: 'SELECT_SECOND_LINK', from, to } as const
      if (state.can(event)) send(event)
      else {
        toast.error(
          explainRefusal(state, event) ??
            'That route cannot be your second rail.',
        )
      }
      return
    }
    const event = { type: 'SELECT_LINK', from, to } as const
    if (state.can(event)) send(event)
    else {
      toast.error(
        explainRefusal(state, event) ??
          'That route cannot be claimed right now.',
      )
    }
  }

  const selectedLinks = [
    ...(ctx.selectedLink ? [ctx.selectedLink] : []),
    ...(ctx.selectedSecondLink ? [ctx.selectedSecondLink] : []),
  ]

  const handSel = myTurn ? getHandSelection(state) : null
  const maxActions = ctx.round === 1 && ctx.era === 'canal' ? 1 : 2
  const ledgerPlayer = ledgerFor
    ? ctx.players.find((p) => p.id === ledgerFor)
    : null

  const currentSeat = view.seats[ctx.currentPlayerIndex]
  const aiTurn = currentSeat?.kind === 'ai'
  const aiIsThinking = aiTurn && view.ai?.thinkingSeatId === currentSeat?.seatId

  return (
    <LocateCityProvider value={locateState}>
      <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
        {/* Global in-flight cue: a slim indeterminate bar + a polite live region
          announcing that the last move is syncing with the server. */}
        {inFlight && <div className="bb2-syncbar" aria-hidden="true" />}
        <div className="sr-only" role="status" aria-live="polite">
          {inFlight ? 'Syncing your move with the table…' : ''}
        </div>
        {/* masthead */}
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
              {view.name?.trim() ? view.name : 'Birmingham · online'}
            </span>
          </div>
          <span
            className={`bb2-era-plate ${ctx.era === 'canal' ? 'bb2-era-canal' : 'bb2-era-rail'}`}
            data-testid="era-plate"
          >
            {ctx.era} era
          </span>
          <span className="bb2-chip" data-testid="round-chip">
            Round {ctx.round}/{roundsInEra(ctx.players.length, ctx.era)}
          </span>
          <span className="bb2-chip" data-testid="deck-chip">
            Deck {ctx.drawPile.length}
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
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-nowrap lg:gap-3">
            <CommandPalette />
            {inFlight && (
              <span className="bb2-sync-pill" data-testid="mp-syncing">
                <span className="bb2-sync-dot" />
                Syncing
              </span>
            )}
            {notifyPermission === 'default' && (
              <button
                type="button"
                className="bb2-ghost-btn"
                data-testid="notify-enable"
                title="Get a browser notification when it becomes your turn while this tab is in the background"
                onClick={() => {
                  void Notification.requestPermission().then(
                    setNotifyPermission,
                  )
                }}
              >
                🔔 Turn alerts
              </button>
            )}
            {you !== null && (
              <>
                <SeatsButton token={token} creds={creds} seats={view.seats} />
                <SeatKeyButton token={token} creds={creds} />
              </>
            )}
            <ShareLink className="max-w-[52vw] sm:max-w-[240px] lg:max-w-none" />
          </div>
        </header>

        <PlayerRail
          players={ctx.players}
          currentPlayerId={currentPlayer.id}
          turnOrder={ctx.turnOrder}
          playerSpending={ctx.playerSpending}
          onOpenLedger={(id) => setLedgerFor(id)}
          onHoverPlayer={setHoveredPlayerId}
        />

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
                prompt={myTurn ? boardPrompt : null}
                onCityClick={onCityClick}
                onLinkClick={onLinkClick}
                networkCities={me ? playerNetworkCities(me) : null}
                networkColor={me ? PLAYER_FILL[me.color] : null}
                hoverCities={sourceCities ?? hoverCities}
                locatedCities={locateState.locatedCities}
                focusCity={
                  locateState.spotlightFocus ?? focusCityFor(hoveredCard)
                }
                highlightPlayerId={hoveredPlayerId}
              />
            </div>
          </div>

          <SidePanelRail collapsed={panelCollapsed} onToggle={togglePanel} />

          <aside
            data-testid="side-panel"
            data-collapsed={panelCollapsed}
            className={`flex w-full flex-none flex-col pb-44 transition-[width] duration-300 ease-in-out lg:pb-0 ${
              panelCollapsed
                ? 'lg:w-0 lg:overflow-hidden'
                : 'lg:w-[416px] lg:overflow-y-auto'
            }`}
          >
            {/* Inner keeps its full width so a collapse clips the column to
                the edge instead of squashing its contents mid-animation. */}
            <div className="flex w-full flex-col gap-3 lg:w-[416px]">
              <div
                className={`bb2-panel bb2-panel-active flex flex-col gap-3 p-5 ${myTurn && inFlight ? 'bb2-busy' : ''}`}
                aria-busy={myTurn && inFlight}
              >
                {myTurn ? (
                  <ActionDock
                    snapshot={state}
                    send={send as never}
                    currentPlayer={currentPlayer}
                    canSellAnything={canSellAnything}
                    actionsLeft={{
                      remaining: ctx.actionsRemaining,
                      max: maxActions,
                    }}
                    developMat={
                      devView
                        ? {
                            open: developMatOpen,
                            onOpen: () => setDevelopMatOpen(true),
                          }
                        : null
                    }
                  />
                ) : aiTurn ? (
                  <div className="flex flex-col gap-2" data-testid="ai-panel">
                    <span className="bb2-panel-title">
                      The rival&rsquo;s desk
                    </span>
                    <p
                      className="text-[14px]"
                      style={{ color: 'var(--bb-parchment)' }}
                    >
                      <b style={{ color: 'var(--bb-brass-bright)' }}>
                        {currentPlayer.name}
                      </b>{' '}
                      <span
                        className="text-[11px] uppercase tracking-[0.12em]"
                        style={{ color: 'rgba(231,215,177,.5)' }}
                      >
                        ({currentSeat?.aiTier?.difficulty ?? 'ai'})
                      </span>{' '}
                      {aiIsThinking ? (
                        <span
                          className="animate-pulse"
                          data-testid="ai-thinking"
                        >
                          is thinking…
                        </span>
                      ) : (
                        <span>is moving…</span>
                      )}
                    </p>
                    <p
                      className="text-[12px]"
                      style={{ color: 'rgba(231,215,177,.5)' }}
                    >
                      Its moves and reasoning appear in the rival&rsquo;s
                      journal below.
                    </p>
                  </div>
                ) : (
                  <div
                    className="flex flex-col gap-2"
                    data-testid="waiting-panel"
                  >
                    <span className="bb2-panel-title">The table</span>
                    <p
                      className="text-[14px]"
                      style={{ color: 'var(--bb-parchment)' }}
                    >
                      Waiting for{' '}
                      <b style={{ color: 'var(--bb-brass-bright)' }}>
                        {currentPlayer.name}
                      </b>{' '}
                      to act…
                    </p>
                    <p
                      className="text-[12px]"
                      style={{ color: 'rgba(231,215,177,.5)' }}
                    >
                      Moves appear here live. Your hand stays private below.
                    </p>
                  </div>
                )}
                {/* Always yours, never the seat that happens to be acting. */}
                {me && (
                  <OpenMatButton
                    onClick={() =>
                      devView ? setDevelopMatOpen(true) : setLedgerFor(me.id)
                    }
                  />
                )}
              </div>
              {view.ai && <AiMindPanel ai={view.ai} seats={view.seats} />}
              <MarketsPanel
                coalMarket={ctx.coalMarket}
                ironMarket={ctx.ironMarket}
              />
              <ChatPanel
                messages={view.messages ?? []}
                you={you}
                seats={view.seats}
                onSend={(text) => {
                  void (async () => {
                    try {
                      const res = await fetch('/api/mp/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          token,
                          seatId: creds.seatId,
                          seatSecret: creds.seatSecret,
                          text,
                        }),
                      })
                      const body = (await res.json()) as {
                        ok: boolean
                        view?: GameViewWire
                        error?: string
                      }
                      // Apply the sender's fresh view (with the new message) at once,
                      // same version-guarded path as an SSE frame.
                      if (body.ok && body.view) applyView(body.view)
                      // A refusal (rate limit, bad seat) must never look like a
                      // silent drop — name it, the same way join does.
                      else if (!body.ok) {
                        toast.error(body.error ?? 'Could not send the message')
                      }
                    } catch {
                      toast.error('Could not send the message')
                    }
                  })()
                }}
              />
              <JournalPanel logs={ctx.logs} players={ctx.players} />
            </div>
          </aside>
        </div>

        {/* my hand — always mine, never anyone else's */}
        <HandTray
          hand={arrangedHand}
          canSelect={
            handSel && !inFlight
              ? (cardId) => state.can({ type: 'SELECT_CARD', cardId })
              : null
          }
          onSelect={(cardId) => send({ type: 'SELECT_CARD', cardId })}
          selectedIds={handSel?.selectedIds ?? []}
          hint={handSel?.hint ?? null}
          onHoverCard={setHoveredCard}
          panelCollapsed={panelCollapsed}
          onReorder={(cardId, toIndex) =>
            handOrder.reorder(me.hand, cardId, toIndex)
          }
        />

        {/* Develop mode: my mat as the tile picker (my turn only). */}
        {devView && developMatOpen && me && (
          <PlayerLedger
            player={me}
            era={ctx.era}
            isCurrent
            onClose={() => setDevelopMatOpen(false)}
            develop={{ view: devView, send: send as never, busy: inFlight }}
          />
        )}
        {ledgerPlayer && !(devView && developMatOpen) && (
          <PlayerLedger
            player={ledgerPlayer}
            era={ctx.era}
            isCurrent={ledgerPlayer.id === currentPlayer.id}
            onClose={() => setLedgerFor(null)}
          />
        )}

        {/* Round end: spends + the order switch. Auto-lifts so it can never
          stall the next player's turn on a shared, live board. */}
        {ctx.roundSummary && ctx.roundSummary.round !== seenRound && (
          <RoundCurtain
            summary={ctx.roundSummary}
            players={ctx.players}
            autoDismissMs={MP_CURTAIN_MS}
            onDismiss={() => setCurtainSeen(ctx.roundSummary!.round)}
          />
        )}

        <Toaster theme="dark" position="top-right" />
      </div>
    </LocateCityProvider>
  )
}

/** The AI's public journal: one-line rationales per move + the spend meter. */
function AiMindPanel({
  ai,
  seats,
}: {
  ai: AiViewWire
  seats: SeatView[]
}) {
  const nameOf = (seatId: number) =>
    seats.find((s) => s.seatId === seatId)?.name ?? `Seat ${seatId + 1}`
  // Steps the model reasoned about, plus fallbacks (worth flagging) —
  // silent auto-steps (confirms, single legal moves) stay out of the way.
  const entries = ai.log
    .filter((e) => e.rationale !== null || e.fallback)
    .slice(-8)
  return (
    <CollapsiblePanel
      title="The rival’s journal"
      testId="ai-mind-toggle"
      panelTestId="ai-mind"
    >
      {entries.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'rgba(231,215,177,.45)' }}>
          The AI has not moved yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries
            .slice()
            .reverse()
            .map((e, i) => (
              <div
                key={`${e.at}-${i}`}
                className="text-[12px] leading-snug"
                data-testid="ai-rationale"
                style={{ color: 'var(--bb-parchment)' }}
              >
                <span style={{ color: 'var(--bb-brass)' }}>
                  {nameOf(e.seatId)}
                </span>{' '}
                — {e.label}
                <br />
                {e.rationale !== null && (
                  <span
                    className="italic"
                    style={{ color: 'rgba(231,215,177,.6)' }}
                  >
                    &ldquo;{e.rationale}&rdquo;
                  </span>
                )}
                {e.fallback && (
                  <span
                    className="ml-1 text-[10px] uppercase"
                    style={{ color: 'rgba(231,215,177,.4)' }}
                    title="The model's picks were illegal; a safe default move was played"
                  >
                    (fallback)
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
      <p
        className="text-[11px]"
        data-testid="ai-cost"
        style={{ color: 'rgba(231,215,177,.45)' }}
      >
        AI spend: ${ai.usage.costUsd.toFixed(4)} · {ai.usage.calls} model{' '}
        {ai.usage.calls === 1 ? 'call' : 'calls'}
        {ai.usage.fallbacks > 0 ? ` · ${ai.usage.fallbacks} fallbacks` : ''}
      </p>
    </CollapsiblePanel>
  )
}
