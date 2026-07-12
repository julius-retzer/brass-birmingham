// Server-authoritative multiplayer service.
//
// Clients send machine events as intents; this module validates the seat
// (token + per-seat secret), checks the event against the machine's own
// guards, executes it on the proven gameStore engine, persists, and
// broadcasts per-seat FILTERED views. A client never receives another
// player's hand, the draw pile contents, or an opponent's in-flight card
// selections — only shapes (counts) that the machine's public guards need.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
import {
  type GameRecord,
  type SeatRecord,
  loadGame,
  saveGame,
  sweepStaleGames,
} from './store'

/* ---------------- identity & crypto ---------------- */

export const newToken = () => randomBytes(16).toString('base64url') // 128 bits
const newSecret = () => randomBytes(16).toString('base64url')
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

function secretMatches(secret: string, secretHash: string | null): boolean {
  if (!secretHash) return false
  const a = Buffer.from(hash(secret))
  const b = Buffer.from(secretHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/* ---------------- HMR-safe singletons ---------------- */

type Listener = () => void
const g = globalThis as unknown as {
  __bbMpBus?: Map<string, Set<Listener>>
  __bbMpLocks?: Map<string, Promise<unknown>>
}
const bus = (g.__bbMpBus ??= new Map())
const locks = (g.__bbMpLocks ??= new Map())

export function subscribe(token: string, fn: Listener): () => void {
  const set = bus.get(token) ?? new Set()
  set.add(fn)
  bus.set(token, set)
  return () => {
    set.delete(fn)
    if (set.size === 0) bus.delete(token)
  }
}

function broadcast(token: string) {
  for (const fn of bus.get(token) ?? []) {
    try {
      fn()
    } catch {
      // a dead SSE writer must not break the others
    }
  }
}

/** Serialize all mutations per game (single-writer). */
async function withGameLock<T>(
  token: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(token) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(
    token,
    next.catch(() => {}),
  )
  return next
}

/* ---------------- engine helpers ---------------- */

// JSON round-trips turn the markets' `maxCubes: Infinity` into null; restore
// it before the engine sees the snapshot (same fix as the client shell).
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
  return clone
}

const COLORS = ['red', 'blue', 'green', 'yellow'] as const
const CHARACTERS = [
  'Eliza Tinsley',
  'Isambard Kingdom Brunel',
  'George Stephenson',
  'Richard Arkwright',
] as const

// Player-facing intents only — TEST_*/TRIGGER_* and lifecycle events are
// server business and must never be accepted off the wire.
const ALLOWED_EVENTS = new Set([
  'BUILD',
  'DEVELOP',
  'SELL',
  'TAKE_LOAN',
  'SCOUT',
  'NETWORK',
  'PASS',
  'SELECT_CARD',
  'SELECT_LOCATION',
  'SELECT_INDUSTRY_TYPE',
  'SELECT_TILES_FOR_DEVELOP',
  'SELECT_SALE',
  'SELECT_LINK',
  'SELECT_SECOND_LINK',
  'CHOOSE_DOUBLE_LINK_BUILD',
  'EXECUTE_DOUBLE_NETWORK_ACTION',
  'BUILD_SECOND_LINK',
  'CONFIRM',
  'CANCEL',
  'CLEAR_ERROR',
])

/* ---------------- views ---------------- */

export interface SeatView {
  seatId: number
  name: string | null
  color: string
  claimed: boolean
}

export interface GameView {
  token: string
  phase: GameRecord['phase']
  version: number
  you: number | null
  seats: SeatView[]
  /** per-seat filtered engine snapshot; null until seated & playing */
  snapshot: unknown | null
}

const hiddenCard = (tag: string, i: number) => ({
  id: `hidden-${tag}-${i}`,
  type: 'location',
  location: 'birmingham',
  color: 'other',
})

/**
 * Redact everything a seat must not know while preserving the SHAPES the
 * machine's public guards rely on (hand sizes, draw-pile size).
 */
export function filterSnapshotForSeat(
  snapshot: unknown,
  seatId: number,
): unknown {
  const clone = structuredClone(snapshot) as {
    context?: {
      players?: Array<{ hand: unknown[] }>
      drawPile?: unknown[]
      currentPlayerIndex?: number
      selectedCard?: unknown
      selectedCardsForScout?: unknown[]
    }
  }
  const ctx = clone.context
  if (!ctx) return clone

  ctx.players?.forEach((p, i) => {
    if (i !== seatId) {
      p.hand = p.hand.map((_, k) => hiddenCard(`p${i}`, k))
    }
  })
  ctx.drawPile = (ctx.drawPile ?? []).map((_, k) => hiddenCard('deck', k))
  if (ctx.currentPlayerIndex !== seatId) {
    if (ctx.selectedCard) ctx.selectedCard = hiddenCard('sel', 0)
    ctx.selectedCardsForScout = (ctx.selectedCardsForScout ?? []).map((_, k) =>
      hiddenCard('scout', k),
    )
  }
  return clone
}

function seatViews(game: GameRecord): SeatView[] {
  return game.seats.map((s) => ({
    seatId: s.seatId,
    name: s.name,
    color: s.color,
    claimed: s.claimed,
  }))
}

export function viewFor(
  game: GameRecord,
  seatId: number | null,
  seatSecret: string | null,
): GameView {
  const seat =
    seatId !== null && seatSecret !== null ? game.seats[seatId] : undefined
  const authed = !!seat && secretMatches(seatSecret!, seat.secretHash)
  return {
    token: game.token,
    phase: game.phase,
    version: game.version,
    you: authed ? seatId : null,
    seats: seatViews(game),
    snapshot:
      authed && game.snapshot !== null
        ? filterSnapshotForSeat(game.snapshot, seatId!)
        : null,
  }
}

/* ---------------- lifecycle ---------------- */

export async function createGame(
  hostName: string,
  playerCount: number,
): Promise<{ token: string; seatId: number; seatSecret: string }> {
  await sweepStaleGames()
  if (playerCount < 2 || playerCount > 4) throw new Error('2–4 players')
  const token = newToken()
  const secret = newSecret()
  const now = new Date().toISOString()
  const seats: SeatRecord[] = Array.from({ length: playerCount }, (_, i) => ({
    seatId: i,
    name: i === 0 ? hostName.slice(0, 24) || 'Host' : null,
    color: COLORS[i]!,
    character: CHARACTERS[i]!,
    claimed: i === 0,
    secretHash: i === 0 ? hash(secret) : null,
  }))
  const game: GameRecord = {
    token,
    phase: 'lobby',
    createdAt: now,
    updatedAt: now,
    version: 1,
    seats,
    snapshot: null,
  }
  await saveGame(game)
  return { token, seatId: 0, seatSecret: secret }
}

function startEngine(game: GameRecord): void {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: game.seats.map((s) => ({
      id: String(s.seatId + 1),
      name: s.name ?? `Player ${s.seatId + 1}`,
      color: s.color,
      character: s.character,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {},
    })),
  } as never)
  game.snapshot = actor.getPersistedSnapshot()
  game.phase = 'playing'
  actor.stop()
}

export async function joinGame(
  token: string,
  name: string,
): Promise<{ seatId: number; seatSecret: string }> {
  return withGameLock(token, async () => {
    const game = await loadGame(token)
    if (!game) throw new Error('Game not found')
    const seat = game.seats.find((s) => !s.claimed)
    if (!seat) throw new Error('No open seats')
    const secret = newSecret()
    seat.claimed = true
    seat.name = name.slice(0, 24) || `Player ${seat.seatId + 1}`
    seat.secretHash = hash(secret)
    if (game.phase === 'lobby' && game.seats.every((s) => s.claimed)) {
      startEngine(game)
    }
    game.version++
    game.updatedAt = new Date().toISOString()
    await saveGame(game)
    broadcast(token)
    return { seatId: seat.seatId, seatSecret: secret }
  })
}

export async function releaseSeat(
  token: string,
  hostSecret: string,
  targetSeatId: number,
): Promise<void> {
  return withGameLock(token, async () => {
    const game = await loadGame(token)
    if (!game) throw new Error('Game not found')
    const host = game.seats[0]
    if (!host || !secretMatches(hostSecret, host.secretHash)) {
      throw new Error('Only the host can release a seat')
    }
    if (targetSeatId === 0) throw new Error('The host seat cannot be released')
    const seat = game.seats[targetSeatId]
    if (!seat) throw new Error('No such seat')
    seat.claimed = false
    seat.secretHash = null
    // the engine player's name is fixed after START_GAME; the seat is
    // simply re-claimable by a new secret
    game.version++
    game.updatedAt = new Date().toISOString()
    await saveGame(game)
    broadcast(token)
  })
}

export async function actInGame(
  token: string,
  seatId: number,
  seatSecret: string,
  event: { type: string } & Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withGameLock(token, async () => {
    const game = await loadGame(token)
    if (!game) return { ok: false, error: 'Game not found' }
    const seat = game.seats[seatId]
    if (!seat || !secretMatches(seatSecret, seat.secretHash)) {
      return { ok: false, error: 'Not your seat' }
    }
    if (game.phase !== 'playing' || game.snapshot === null) {
      return { ok: false, error: 'The game has not started' }
    }
    if (!ALLOWED_EVENTS.has(event.type)) {
      return { ok: false, error: `Event ${event.type} is not allowed` }
    }

    const actor = createActor(gameStore, {
      snapshot: rehydrate(game.snapshot) as never,
    })
    actor.start()
    const before = actor.getSnapshot() as {
      context: { currentPlayerIndex: number }
      can: (e: never) => boolean
      matches: (v: never) => boolean
    }
    if (before.context.currentPlayerIndex !== seatId) {
      actor.stop()
      return { ok: false, error: 'Not your turn' }
    }
    if (!before.can(event as never)) {
      actor.stop()
      return { ok: false, error: 'That action is not legal right now' }
    }
    actor.send(event as never)
    const after = actor.getSnapshot()
    game.snapshot = actor.getPersistedSnapshot()
    if ((after as { matches: (v: string) => boolean }).matches('gameOver')) {
      game.phase = 'over'
    }
    actor.stop()
    game.version++
    game.updatedAt = new Date().toISOString()
    await saveGame(game)
    broadcast(token)
    return { ok: true }
  })
}

export async function getGameView(
  token: string,
  seatId: number | null,
  seatSecret: string | null,
): Promise<GameView | null> {
  const game = await loadGame(token)
  if (!game) return null
  return viewFor(game, seatId, seatSecret)
}
