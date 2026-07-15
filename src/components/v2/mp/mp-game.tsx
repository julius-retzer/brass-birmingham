'use client'

// Networked multiplayer shell — the online twin of the hotseat surface.
//
// The server is the only authority: this component renders the per-seat
// FILTERED view it receives over SSE and sends machine events as intents
// via POST /api/mp/act. A read-only local actor is rebuilt from each
// broadcast purely so the existing dock/board components can keep using
// `snapshot.matches` / `snapshot.can`; it never executes actions.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createActor } from 'xstate'
import { Toaster } from '~/components/ui/sonner'
import { type CityId, cities, connections } from '~/data/board'
import {
  type GameStoreSnapshot,
  type Player,
  gameStore,
} from '~/store/gameStore'
import { refreshEmbeddedTileStats } from '~/store/saveMigration'
import { ActionDock, SELLABLE, getHandSelection } from '../action-dock'
import { linkKey } from '../board/board-data'
import { BoardMap, PLAYER_FILL, playerNetworkCities } from '../board/board-map'
import { HandTray } from '../hand-tray'
import { GameOverScreen } from '../overlays'
import { PlayerLedger } from '../player-ledger'
import { PlayerRail } from '../player-rail'
import { JournalPanel, MarketsPanel } from '../side-panels'
import { didBecomeMyTurn, playTurnChime, titleForTurn } from './turnNotify'

/* ---------------- wire types ---------------- */

interface SeatView {
  seatId: number
  name: string | null
  color: string
  claimed: boolean
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
  version: number
  you: number | null
  seats: SeatView[]
  snapshot: unknown | null
  messages?: ChatMessageWire[]
  ai?: AiViewWire
}

interface Creds {
  seatId: number
  seatSecret: string
}

const credsKey = (token: string) => `bb-mp-${token}`

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
  const [view, setView] = useState<GameViewWire | null>(null)
  const [streamFailing, setStreamFailing] = useState(false)

  useEffect(() => {
    setCreds(loadCreds(token))
    setCredsLoaded(true)
  }, [token])

  // Live view over SSE; EventSource reconnects on its own after drops and
  // dev-server restarts (the game itself is durable on disk). The stream is
  // (re)opened whenever the credentials change; only THIS stream may decide
  // the seat was lost — a late message from the previous unauthenticated
  // stream must never wipe freshly-claimed credentials.
  useEffect(() => {
    if (!credsLoaded) return
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
        // this credentialed stream was rejected: the seat was released or
        // the secret is stale → back to claiming
        localStorage.removeItem(credsKey(token))
        setCreds(null)
        return
      }
      setView(parsed)
    }
    es.onerror = () => {
      if (!closed) setStreamFailing(true)
    }
    return () => {
      closed = true
      es.close()
    }
  }, [token, creds, credsLoaded])

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

  if (view.you === null) {
    return (
      <JoinScreen
        token={token}
        view={view}
        onJoined={(c) => {
          localStorage.setItem(credsKey(token), JSON.stringify(c))
          setCreds(c)
        }}
      />
    )
  }

  if (view.phase === 'lobby') {
    return <LobbyScreen view={view} />
  }

  return <MpTable token={token} view={view} creds={creds!} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
    </div>
  )
}

/* ---------------- join & lobby ---------------- */

function JoinScreen({
  token,
  view,
  onJoined,
}: {
  token: string
  view: GameViewWire
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

function LobbyScreen({ view }: { view: GameViewWire }) {
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
        Waiting for players
      </h1>
      <ShareLink />
      <div className="bb2-panel mt-2 flex w-full max-w-sm flex-col gap-2 p-5">
        {view.seats.map((s) => (
          <div
            key={s.seatId}
            className="flex items-center gap-3 text-[14px]"
            style={{ color: 'var(--bb-parchment)' }}
            data-testid={`lobby-seat-${s.seatId}`}
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: `var(--bb-player-${s.color})` }}
            />
            {s.claimed ? (
              <span className="font-semibold">{s.name}</span>
            ) : (
              <span style={{ color: 'rgba(231,215,177,.4)' }}>
                waiting for a player…
              </span>
            )}
            {s.seatId === view.you && (
              <span
                className="ml-auto text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: 'var(--bb-brass-bright)' }}
              >
                you
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[12px]" style={{ color: 'rgba(231,215,177,.45)' }}>
        The game starts the moment every seat is claimed.
      </p>
    </Centered>
  )
}

/** Host-only: release a seat whose owner lost their secret so it can be
 *  re-claimed from the join screen. */
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
              {s.seatId !== 0 && s.claimed && (
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
            Release a seat if its player lost their link or browser — they can
            then claim it again from the invite link.
          </p>
        </div>
      )}
    </div>
  )
}

function ShareLink() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="bb2-chip"
      data-testid="share-link"
      style={{ cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      title="Copy the invite link"
    >
      {copied ? 'Link copied!' : window.location.href}
    </button>
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
}: {
  token: string
  view: GameViewWire
  creds: Creds
}) {
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)

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

  const send = useMemo(
    () => (event: { type: string } & Record<string, unknown>) => {
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
          const body = (await res.json()) as { ok: boolean; error?: string }
          if (!body.ok && body.error && event.type !== 'CLEAR_ERROR') {
            toast.error(body.error)
          }
        } catch {
          toast.error('Could not reach the game server')
        }
      })()
    },
    [token, creds],
  )

  const ctx = state?.context
  const you = view.you!
  const myTurn = !!ctx && ctx.currentPlayerIndex === you
  const currentPlayer: Player | undefined = ctx?.players[ctx.currentPlayerIndex]
  const me: Player | undefined = ctx?.players[you]

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

  const legalCities = useMemo(() => {
    if (!pickingSite || !state) return null
    const set = new Set<string>()
    for (const id of Object.keys(cities) as CityId[]) {
      if (state.can({ type: 'SELECT_LOCATION', cityId: id })) set.add(id)
    }
    return set
  }, [pickingSite, state])

  const legalLinks = useMemo(() => {
    if ((!pickingLink && !pickingSecondLink) || !state || !ctx) return null
    const set = new Set<string>()
    for (const conn of connections) {
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
  }, [pickingLink, pickingSecondLink, state, ctx])

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
    if (!is('playing.action.selectingAction')) return true
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
        onRestart={() => {
          window.location.href = '/'
        }}
      />
    )
  }

  const onCityClick = (cityId: CityId) => {
    if (!myTurn) return
    if (state.can({ type: 'SELECT_LOCATION', cityId })) {
      send({ type: 'SELECT_LOCATION', cityId })
    } else {
      toast.error(
        `${cities[cityId]?.name ?? cityId} is not a legal site for this build.`,
      )
    }
  }

  const onLinkClick = (from: CityId, to: CityId) => {
    if (!myTurn) return
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
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
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
            Birmingham · online
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
        <span
          className="bb2-chip"
          data-testid="you-chip"
          style={{ color: 'var(--bb-brass)' }}
        >
          You are {me.name}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {notifyPermission === 'default' && (
            <button
              type="button"
              className="bb2-ghost-btn"
              data-testid="notify-enable"
              title="Get a browser notification when it becomes your turn while this tab is in the background"
              onClick={() => {
                void Notification.requestPermission().then(setNotifyPermission)
              }}
            >
              🔔 Turn alerts
            </button>
          )}
          {you === 0 && (
            <SeatsButton token={token} creds={creds} seats={view.seats} />
          )}
          <ShareLink />
        </div>
      </header>

      <PlayerRail
        players={ctx.players}
        currentPlayerId={currentPlayer.id}
        turnOrder={ctx.turnOrder}
        playerSpending={ctx.playerSpending}
        onOpenLedger={(id) => setLedgerFor(id)}
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
            />
          </div>
        </div>

        <aside className="flex w-full flex-none flex-col gap-3 pb-44 lg:w-[380px] lg:overflow-y-auto lg:pb-0">
          <div className="bb2-panel p-4">
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
              />
            ) : aiTurn ? (
              <div className="flex flex-col gap-2" data-testid="ai-panel">
                <span className="bb2-panel-title">The rival&rsquo;s desk</span>
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
                    <span className="animate-pulse" data-testid="ai-thinking">
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
                  Its moves and reasoning appear in the rival&rsquo;s journal
                  below.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2" data-testid="waiting-panel">
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
              void fetch('/api/mp/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token,
                  seatId: creds.seatId,
                  seatSecret: creds.seatSecret,
                  text,
                }),
              }).catch(() => toast.error('Could not send the message'))
            }}
          />
          <JournalPanel logs={ctx.logs} players={ctx.players} />
        </aside>
      </div>

      {/* my hand — always mine, never anyone else's */}
      <HandTray
        hand={me.hand}
        canSelect={
          handSel
            ? (cardId) => state.can({ type: 'SELECT_CARD', cardId })
            : null
        }
        onSelect={(cardId) => send({ type: 'SELECT_CARD', cardId })}
        selectedIds={handSel?.selectedIds ?? []}
        hint={handSel?.hint ?? null}
      />

      {ledgerPlayer && (
        <PlayerLedger
          player={ledgerPlayer}
          era={ctx.era}
          isCurrent={ledgerPlayer.id === currentPlayer.id}
          onClose={() => setLedgerFor(null)}
        />
      )}

      <Toaster theme="dark" position="top-right" />
    </div>
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
    <div className="bb2-panel flex flex-col gap-2 p-4" data-testid="ai-mind">
      <span className="bb2-panel-title">The rival&rsquo;s journal</span>
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
    </div>
  )
}
