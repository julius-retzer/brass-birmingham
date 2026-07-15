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
import { refreshEmbeddedTileStats } from '../../store/saveMigration'
import { STEP_SAFETY_BUDGET, aiDecideAndApply } from '../ai/driver'
import {
  gatewayBaseUrl,
  hasAnthropicKey,
  isMockMode,
  providerFor,
} from '../ai/provider'
import {
  AI_TIERS,
  type AiLogEntry,
  type AiTierId,
  type AiUsageTotals,
  emptyUsageTotals,
  isAiTierId,
} from '../ai/types'
import {
  type ChatMessage,
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
  __bbAiRunning?: Set<string>
  __bbAiThinking?: Map<string, number>
}
const bus = (g.__bbMpBus ??= new Map())
const locks = (g.__bbMpLocks ??= new Map())
/** tokens with an AI turn-runner in flight (single runner per game) */
const aiRunning = (g.__bbAiRunning ??= new Set())
/** token → seatId currently waiting on a model decision */
const aiThinking = (g.__bbAiThinking ??= new Map())

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
// ALSO run the save migration here: the SERVER is the authority, and a
// pre-audit game record would otherwise keep playing with stale tile stats
// and no incomeSpace (whose NaN arithmetic reads as income level 30).
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
    // a malformed record fails at actor creation, with better context
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
  kind: 'human' | 'ai'
  /** tier id + display label for AI seats */
  aiTier?: { id: AiTierId; label: string; difficulty: string; model: string }
}

/** Public AI-table facts: rationales and spend are visible to everyone. */
export interface AiView {
  thinkingSeatId: number | null
  log: AiLogEntry[]
  usage: AiUsageTotals
}

export interface GameView {
  token: string
  phase: GameRecord['phase']
  version: number
  you: number | null
  seats: SeatView[]
  /** per-seat filtered engine snapshot; null until seated & playing */
  snapshot: unknown | null
  /** table talk — visible to seated players only */
  messages: ChatMessage[]
  /** present when the table has AI seats */
  ai?: AiView
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
  return game.seats.map((s) => {
    const tier = s.kind === 'ai' && s.aiTier ? AI_TIERS[s.aiTier] : null
    return {
      seatId: s.seatId,
      name: s.name,
      color: s.color,
      claimed: s.claimed,
      kind: s.kind === 'ai' ? ('ai' as const) : ('human' as const),
      ...(tier
        ? {
            aiTier: {
              id: tier.id,
              label: tier.label,
              difficulty: tier.difficulty,
              model: tier.model,
            },
          }
        : {}),
    }
  })
}

const AI_LOG_WIRE_LIMIT = 30

function aiView(game: GameRecord): AiView | undefined {
  if (!game.seats.some((s) => s.kind === 'ai')) return undefined
  const ai = game.ai ?? { log: [], usage: emptyUsageTotals() }
  return {
    thinkingSeatId: aiThinking.get(game.token) ?? null,
    log: ai.log.slice(-AI_LOG_WIRE_LIMIT),
    usage: ai.usage,
  }
}

export function viewFor(
  game: GameRecord,
  seatId: number | null,
  seatSecret: string | null,
): GameView {
  const seat =
    seatId !== null && seatSecret !== null ? game.seats[seatId] : undefined
  const authed = !!seat && secretMatches(seatSecret!, seat.secretHash)
  const ai = aiView(game)
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
    messages: authed ? (game.messages ?? []) : [],
    ...(ai ? { ai } : {}),
  }
}

/* ---------------- lifecycle ---------------- */

export async function createGame(
  hostName: string,
  playerCount: number,
  /** seats 1..n-1: 'human' keeps the seat open for a join; a tier id
   *  seats an AI opponent driven by the server */
  opponents: Array<'human' | AiTierId> = [],
): Promise<{ token: string; seatId: number; seatSecret: string }> {
  await sweepStaleGames()
  if (playerCount < 2 || playerCount > 4) throw new Error('2–4 players')
  const hasAi = opponents.some((o) => o !== 'human')
  if (hasAi && !hasAnthropicKey() && !isMockMode()) {
    throw new Error(
      'AI opponents are not available: the server has no ANTHROPIC_API_KEY.',
    )
  }
  const needsGateway = opponents.some(
    (o) => o !== 'human' && isAiTierId(o) && AI_TIERS[o].wire === 'openai',
  )
  if (needsGateway && !gatewayBaseUrl() && !isMockMode()) {
    throw new Error(
      'That AI rival is served by a model gateway: set ANTHROPIC_BASE_URL on the server.',
    )
  }
  const token = newToken()
  const secret = newSecret()
  const now = new Date().toISOString()
  const seats: SeatRecord[] = Array.from({ length: playerCount }, (_, i) => {
    const opponent = i === 0 ? 'human' : (opponents[i - 1] ?? 'human')
    if (opponent !== 'human') {
      if (!isAiTierId(opponent)) throw new Error('Unknown AI difficulty')
      const tier = AI_TIERS[opponent]
      return {
        seatId: i,
        name: tier.label,
        color: COLORS[i]!,
        character: CHARACTERS[i]!,
        claimed: true,
        secretHash: null,
        kind: 'ai' as const,
        aiTier: tier.id,
      }
    }
    return {
      seatId: i,
      name: i === 0 ? hostName.slice(0, 24) || 'Host' : null,
      color: COLORS[i]!,
      character: CHARACTERS[i]!,
      claimed: i === 0,
      secretHash: i === 0 ? hash(secret) : null,
      kind: 'human' as const,
    }
  })
  const game: GameRecord = {
    token,
    phase: 'lobby',
    createdAt: now,
    updatedAt: now,
    version: 1,
    seats,
    snapshot: null,
    ...(hasAi ? { ai: { log: [], usage: emptyUsageTotals() } } : {}),
  }
  if (game.seats.every((s) => s.claimed)) {
    startEngine(game)
  }
  await saveGame(game)
  kickAiTurns(token)
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
    kickAiTurns(token)
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
    if (seat.kind === 'ai') throw new Error('AI seats cannot be released')
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
    kickAiTurns(token)
    return { ok: true }
  })
}

export const CHAT_MAX_LENGTH = 500
export const CHAT_HISTORY_CAP = 200

export async function sendChat(
  token: string,
  seatId: number,
  seatSecret: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withGameLock(token, async () => {
    const game = await loadGame(token)
    if (!game) return { ok: false, error: 'Game not found' }
    const seat = game.seats[seatId]
    if (!seat || !secretMatches(seatSecret, seat.secretHash)) {
      return { ok: false, error: 'Not your seat' }
    }
    const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH)
    if (trimmed.length === 0) {
      return { ok: false, error: 'Empty message' }
    }
    const messages = game.messages ?? []
    const message: ChatMessage = {
      id: (messages[messages.length - 1]?.id ?? 0) + 1,
      seatId,
      name: seat.name ?? `Player ${seatId + 1}`,
      text: trimmed,
      at: new Date().toISOString(),
    }
    game.messages = [...messages, message].slice(-CHAT_HISTORY_CAP)
    game.version++
    game.updatedAt = new Date().toISOString()
    await saveGame(game)
    broadcast(token)
    return { ok: true }
  })
}

/* ---------------- the AI turn runner ---------------- */

/**
 * Start the AI turn-runner for this game unless one is already in flight.
 * Safe to call from anywhere (create/join/act/stream-connect) — it no-ops
 * instantly when the current player is human or the game is over.
 */
export function kickAiTurns(token: string): void {
  if (aiRunning.has(token)) return
  aiRunning.add(token)
  void runAiTurns(token)
    .catch(() => {
      // the runner never propagates — a failed decision is logged in-game
    })
    .finally(() => {
      aiRunning.delete(token)
      if (aiThinking.delete(token)) broadcast(token)
    })
}

/** Model calls per AI turn before the driver goes safety-first (cost cap). */
const MODEL_CALL_TURN_BUDGET = 30

async function runAiTurns(token: string): Promise<void> {
  let stepsThisTurn = 0
  let modelCallsThisTurn = 0
  let lastSeat = -1
  // Turn-local memory for the model: each decision is a fresh
  // conversation, so without these notes the AI forgets a plan it just
  // cancelled and loops on it (captain playtest finding).
  let turnNotes: string[] = []
  for (;;) {
    // Peek outside the lock: is it an AI's turn at all?
    const peek = await loadGame(token)
    if (!peek || peek.phase !== 'playing' || peek.snapshot === null) return
    const ctx = (peek.snapshot as { context: { currentPlayerIndex: number } })
      .context
    const seat = peek.seats[ctx.currentPlayerIndex]
    if (!seat || seat.kind !== 'ai' || !seat.aiTier) return

    if (seat.seatId !== lastSeat) {
      lastSeat = seat.seatId
      stepsThisTurn = 0
      modelCallsThisTurn = 0
      turnNotes = []
    }
    stepsThisTurn += 1

    // Publish "thinking" so every client shows the state immediately.
    aiThinking.set(token, seat.seatId)
    broadcast(token)

    const tier = AI_TIERS[seat.aiTier]
    let outcome
    try {
      // The decision (incl. the model call) runs outside the game lock —
      // it is this seat's turn, so no competing writer exists; the apply
      // below re-validates against the freshest record under the lock.
      outcome = await aiDecideAndApply({
        persisted: peek.snapshot,
        seatIndex: seat.seatId,
        provider: providerFor(tier),
        tier,
        turnNotes,
        forceSafe:
          stepsThisTurn > STEP_SAFETY_BUDGET ||
          modelCallsThisTurn > MODEL_CALL_TURN_BUDGET,
      })
      modelCallsThisTurn += outcome.usage.calls
      turnNotes.push(
        `${outcome.move.label}${
          outcome.rationale ? ` — your reasoning: "${outcome.rationale}"` : ''
        }${
          outcome.fallback
            ? ' [your picks were refused by the rules; a safe default was played]'
            : ''
        }`,
      )
      if (turnNotes.length > 16) turnNotes = turnNotes.slice(-16)
    } catch (err) {
      // Surface driver failures in the server log — the game itself stays
      // consistent (nothing was applied) and a reconnect re-kicks the turn.
      console.error('[ai] turn runner stopped:', err)
      aiThinking.delete(token)
      broadcast(token)
      return
    }

    const done = await withGameLock(token, async () => {
      const game = await loadGame(token)
      if (!game || game.phase !== 'playing' || game.snapshot === null) {
        return true
      }
      // the world moved while we were thinking (release, restart, …)
      if (game.version !== peek.version) return false
      game.snapshot = outcome.snapshot
      const after = outcome.snapshot as {
        status?: string
        context: { era: string; round: number }
      }
      const engineDone = after.status === 'done'
      if (engineDone) game.phase = 'over'
      const ai = (game.ai ??= { log: [], usage: emptyUsageTotals() })
      ai.log.push({
        seatId: seat.seatId,
        era: after.context.era,
        round: after.context.round,
        eventType: outcome.move.event.type,
        label: outcome.move.label,
        rationale: outcome.rationale,
        fallback: outcome.fallback,
        at: new Date().toISOString(),
      })
      if (ai.log.length > 500) ai.log = ai.log.slice(-400)
      ai.usage.calls += outcome.usage.calls
      ai.usage.inputTokens += outcome.usage.inputTokens
      ai.usage.outputTokens += outcome.usage.outputTokens
      ai.usage.costUsd += outcome.usage.costUsd
      ai.usage.fallbacks += outcome.usage.fallbacks
      game.version++
      game.updatedAt = new Date().toISOString()
      await saveGame(game)
      aiThinking.delete(token)
      broadcast(token)
      return engineDone
    })
    if (done) return
  }
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
