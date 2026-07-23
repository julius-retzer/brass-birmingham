// Server-authoritative multiplayer service.
//
// Clients send machine events as intents; this module validates the seat
// (token + per-seat secret), checks the event against the machine's own
// guards, executes it on the proven gameStore engine, persists, and
// broadcasts per-seat FILTERED views. A client never receives another
// player's hand, the draw pile contents, or an opponent's in-flight
// selections (held card, site, route, staged sale, resource picks) — only
// shapes (counts) that the machine's public guards need.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
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
import { applyIntent, eraCheckpoint, rehydrate } from './intent'
import {
  type AiPeek,
  type ChatMessage,
  type GameRecord,
  type LobbySummary,
  type SeatRecord,
  appendChatMessage,
  loadAiPeek,
  loadChatSince,
  loadGame,
  loadOpenLobbies,
  loadRecentChat,
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
  __bbAiPromise?: Map<string, Promise<void>>
}
const bus = (g.__bbMpBus ??= new Map())
const locks = (g.__bbMpLocks ??= new Map())
/** tokens with an AI turn-runner in flight (single runner per game) */
const aiRunning = (g.__bbAiRunning ??= new Set())
/** token → the in-flight runner promise, so a route can `waitUntil` it */
const aiPromise = (g.__bbAiPromise ??= new Map())
/** token → seatId currently waiting on a model decision */
const aiThinking = (g.__bbAiThinking ??= new Map())

// The change bus is per-process and therefore only a FAST PATH: it fans out
// writes made by THIS instance to SSE streams living on the same instance
// (common under Fluid compute). It is NOT the delivery guarantee — on
// serverless the POST that bumps the version and the SSE stream watching for
// it routinely land on different instances. The guarantee is the stream's
// ~1.2s `loadVersion` DB poll (see stream/route.ts); the bus just delivers the
// same-instance case with zero latency.
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
    next.catch(() => {
      /* per-token lock: swallow rejection so the chain never wedges */
    }),
  )
  return next
}

/* ---------------- engine helpers ---------------- */

const COLORS = ['red', 'blue', 'green', 'yellow'] as const
const CHARACTERS = [
  'Eliza Tinsley',
  'Isambard Kingdom Brunel',
  'George Stephenson',
  'Richard Arkwright',
] as const

/* ---------------- views ---------------- */

export interface SeatView {
  seatId: number
  name: string | null
  color: string
  claimed: boolean
  kind: 'human' | 'ai'
  /** lobby ready state — public (readiness at a table is not hidden info) */
  ready: boolean
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
      selectedLink?: unknown
      selectedSecondLink?: unknown
      selectedLocation?: unknown
      selectedIndustryTile?: unknown
      selectedTilesForDevelop?: unknown[]
      pendingSale?: unknown
      chosenBeerSources?: unknown[]
      chosenIronSources?: unknown[]
      chosenCoalSources?: unknown[]
      pendingIronStep?: unknown
      pendingCoalStep?: unknown
      lastError?: string | null
      errorContext?: string | null
    }
  }
  const ctx = clone.context
  if (!ctx) return clone

  // A refusal reason belongs to the player who caused it. `applyIntent` never
  // persists one, so this is belt-and-braces: if any path ever does, it must
  // not ride out in a bystander's frame.
  if (ctx.currentPlayerIndex !== seatId) {
    ctx.lastError = null
    ctx.errorContext = null
  }

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
    // Every step of an action is a persisted intent that bumps `version` and
    // broadcasts, so an unredacted in-progress selection let opponents WATCH
    // the acting player pick their route/site/sources live (the board renders
    // `selectedLocation`/`selectedLink`). None of these is public until the
    // action is confirmed and logged, so they are emptied wholesale rather
    // than shape-preserved: unlike hand/deck sizes, nothing a bystander
    // renders or any guard they evaluate reads them, and a placeholder value
    // would light a FALSE plate on their board. Restoring a snapshot never
    // re-runs the `always` chains (`StateMachine.start` only starts children),
    // so the read-only client actor stays parked in its step regardless.
    ctx.selectedLink = null
    ctx.selectedSecondLink = null
    ctx.selectedLocation = null
    ctx.selectedIndustryTile = null
    ctx.selectedTilesForDevelop = []
    ctx.pendingSale = null
    ctx.chosenBeerSources = []
    ctx.chosenIronSources = []
    ctx.chosenCoalSources = []
    ctx.pendingIronStep = null
    ctx.pendingCoalStep = null
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
      ready: seatIsReady(s),
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
  /** the recent chat tail (loaded from `chat_messages`); shown to seated
   *  players only — chat is public to the table but not to spectators */
  chatTail: ChatMessage[] = [],
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
    messages: authed ? chatTail : [],
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
  // A started engine writes the intent log's 'setup' record atomically with
  // the row: setup shuffles are random, so replay must start from this exact
  // captured snapshot (see replay.ts).
  await saveGame(
    game,
    game.snapshot !== null
      ? { kind: 'setup', seatId: null, payload: game.snapshot }
      : undefined,
  )
  void kickAiTurns(token)
  return { token, seatId: 0, seatSecret: secret }
}

/** The public list of joinable lobbies, newest first. The stale-game sweep is
 *  retained here as a lazy trigger but is disabled by default (see
 *  `sweepStaleGames` — we keep all games for analytics); it is a no-op unless
 *  `BB_ENABLE_TTL_SWEEP=1`. */
export async function listLobbies(): Promise<LobbySummary[]> {
  await sweepStaleGames()
  return loadOpenLobbies()
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
    // Join takes the first OPEN human seat. This is what makes both races safe
    // under the per-game lock: a started game has every seat claimed (startGame
    // requires it), and two players racing the last open seat serialize here —
    // the loser finds nothing open. A seat freed by the host mid-game (reclaim)
    // is intentionally still joinable, which is why this gates on seat
    // availability, not on `phase`.
    const seat = game.seats.find((s) => s.kind !== 'ai' && !s.claimed)
    if (!seat) throw new Error('No open seats')
    const secret = newSecret()
    seat.claimed = true
    seat.ready = false
    seat.name = name.slice(0, 24) || `Player ${seat.seatId + 1}`
    seat.secretHash = hash(secret)
    // NB: joining no longer auto-starts the engine — the lobby now waits for
    // every seat to ready up and the host to press start (see `startGame`).
    game.version++
    game.updatedAt = new Date().toISOString()
    await saveGame(game)
    broadcast(token)
    return { seatId: seat.seatId, seatSecret: secret }
  })
}

/** A seat is "ready" for the start when it is claimed and either an AI (always
 *  ready) or a human that has toggled ready. Unclaimed seats are never ready. */
function seatIsReady(seat: SeatRecord): boolean {
  if (!seat.claimed) return false
  return seat.kind === 'ai' ? true : !!seat.ready
}

/**
 * Toggle a human seat's lobby ready flag. Authenticated by the seat secret,
 * only meaningful while the game is still a lobby. Returns the fresh per-seat
 * view so the caller applies its authoritative result immediately (the ~1.2s
 * poll converges everyone else).
 */
export async function setSeatReady(
  token: string,
  seatId: number,
  seatSecret: string,
  ready: boolean,
): Promise<
  { ok: true; view: GameView; version: number } | { ok: false; error: string }
> {
  return withGameLock(token, async () => {
    const game = await loadGame(token)
    if (!game) return { ok: false, error: 'Game not found' }
    const seat = game.seats[seatId]
    if (!seat || !secretMatches(seatSecret, seat.secretHash)) {
      return { ok: false, error: 'Not your seat' }
    }
    if (game.phase !== 'lobby') {
      return { ok: false, error: 'The game has already started' }
    }
    seat.ready = ready
    game.version++
    game.updatedAt = new Date().toISOString()
    await saveGame(game)
    broadcast(token)
    return {
      ok: true,
      view: viewFor(game, seatId, seatSecret),
      version: game.version,
    }
  })
}

/**
 * Host-only explicit start. Replaces the old auto-start-on-full behaviour: the
 * lobby now hands off into the game only when the host presses start AND the
 * start conditions hold — every seat claimed (Brass is played by the exact
 * count chosen at creation, 2–4) and every player ready. Reuses the SAME
 * `startEngine` path as before, so nothing about game initialization forks.
 */
export async function startGame(
  token: string,
  hostSecret: string,
): Promise<
  { ok: true; view: GameView; version: number } | { ok: false; error: string }
> {
  return withGameLock(token, async () => {
    const game = await loadGame(token)
    if (!game) return { ok: false, error: 'Game not found' }
    const host = game.seats[0]
    if (!host || !secretMatches(hostSecret, host.secretHash)) {
      return { ok: false, error: 'Only the host can start the game' }
    }
    if (game.phase !== 'lobby') {
      return { ok: false, error: 'The game has already started' }
    }
    if (!game.seats.every((s) => s.claimed)) {
      return { ok: false, error: 'Every seat must be filled to start' }
    }
    if (!game.seats.every(seatIsReady)) {
      return { ok: false, error: 'Every player must be ready to start' }
    }
    startEngine(game)
    game.version++
    game.updatedAt = new Date().toISOString()
    // Capture the initial snapshot as the intent log's 'setup' record — setup
    // shuffles are random, so replay must start from this exact snapshot.
    await saveGame(game, {
      kind: 'setup',
      seatId: null,
      payload: game.snapshot,
    })
    broadcast(token)
    void kickAiTurns(token)
    return {
      ok: true,
      view: viewFor(game, 0, hostSecret),
      version: game.version,
    }
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
): Promise<
  { ok: true; view: GameView; version: number } | { ok: false; error: string }
> {
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
    // Turn check, legality and execution all live in the pure seam, which
    // returns the EXACT reason for a refusal (see intent.ts). A refusal is
    // never persisted, so the acting player's error can't leak to other seats.
    const outcome = applyIntent(game.snapshot, seatId, event)
    if (!outcome.ok) return { ok: false, error: outcome.error }

    // Log the ACCEPTED event exactly as executed, atomically with the
    // snapshot it produced (refusals never reach here and are not logged —
    // they don't mutate state, so replay doesn't need them). An intent that
    // crossed the era boundary carries the resulting snapshot as a replay
    // checkpoint — the rail deck reshuffle is nondeterministic.
    const checkpoint = eraCheckpoint(game.snapshot, outcome.next)
    game.snapshot = outcome.next
    if (outcome.gameOver) game.phase = 'over'
    game.version++
    game.updatedAt = new Date().toISOString()
    await saveGame(game, {
      kind: 'intent',
      seatId,
      payload: event,
      snapshotAfter: checkpoint,
    })
    broadcast(token)
    void kickAiTurns(token)
    // Return the actor's OWN fresh per-seat view so the client applies its
    // authoritative result in POST time (~1s) instead of waiting for the next
    // SSE poll tick. This is the engine's real result (viewFor filters hidden
    // info exactly as an SSE frame does), NOT an optimistic prediction. The
    // chat tail rides along so the actor's view stays consistent with chat.
    const chatTail = await loadRecentChat(token, CHAT_TAIL_LIMIT)
    return {
      ok: true,
      view: viewFor(game, seatId, seatSecret, chatTail),
      version: game.version,
    }
  })
}

export const CHAT_MAX_LENGTH = 500
/** The recent chat tail carried in a game view — full history stays in the
 *  `chat_messages` table; a frame never ships more than this. */
export const CHAT_TAIL_LIMIT = 50

/** A chat increment pushed on the SSE stream when ONLY chat moved (the engine
 *  `version` is unchanged). The client merges `messages` by `id` (== seq) into
 *  its current view — idempotent, so a dropped/duplicated/reordered delta is
 *  harmless, exactly like the version-guarded full frame. */
export interface ChatDelta {
  version: number
  chatSeq: number
  messages: ChatMessage[]
}

export async function sendChat(
  token: string,
  seatId: number,
  seatSecret: string,
  text: string,
): Promise<
  { ok: true; view: GameView; version: number } | { ok: false; error: string }
> {
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
    // Append ONE small row — this does NOT rewrite the game row nor bump the
    // engine `version`, so it triggers a bounded chat increment rather than a
    // full-state frame to every viewer.
    await appendChatMessage(
      token,
      seatId,
      seat.name ?? `Player ${seatId + 1}`,
      trimmed,
      new Date().toISOString(),
    )
    // Same-instance fast path: nudge any co-located streams to push the
    // increment now; the ~1.2s (version, maxSeq) poll is the guarantee.
    broadcast(token)
    // The sender applies its own fresh view (with the new message in the tail)
    // immediately. `version` is unchanged; the client merges chat by id.
    const chatTail = await loadRecentChat(token, CHAT_TAIL_LIMIT)
    return {
      ok: true,
      view: viewFor(game, seatId, seatSecret, chatTail),
      version: game.version,
    }
  })
}

/**
 * The chat increment for a seat since `sinceSeq` — authenticated (chat is for
 * seated players only, never spectators), bounded to `limit`. Returns null
 * when the caller isn't a valid seat or there is nothing new, so the stream
 * pushes only real, authorized increments.
 */
export async function getChatDelta(
  token: string,
  seatId: number | null,
  seatSecret: string | null,
  sinceSeq: number,
  limit: number,
): Promise<ChatDelta | null> {
  const game = await loadGame(token)
  if (!game) return null
  const seat =
    seatId !== null && seatSecret !== null ? game.seats[seatId] : undefined
  const authed = !!seat && secretMatches(seatSecret!, seat.secretHash)
  if (!authed) return null
  const messages = await loadChatSince(token, sinceSeq, limit)
  if (messages.length === 0) return null
  return {
    version: game.version,
    chatSeq: messages[messages.length - 1]!.id,
    messages,
  }
}

/* ---------------- the AI turn runner ---------------- */

/**
 * Decide, from the CHEAP peek (no snapshot jsonb), whether the AI turn-runner
 * should even start: only when the game is actively playing, has an AI seat,
 * and the current player is that AI seat. A human-turn, lobby, finished, or
 * all-human game returns false — so the caller never pays the full-row read.
 */
export function isAiSeatTurn(peek: AiPeek | null): boolean {
  if (!peek) return false
  if (peek.phase !== 'playing') return false
  if (peek.currentPlayerIndex === null) return false
  if (!peek.seats.some((s) => s.kind === 'ai')) return false
  const seat = peek.seats[peek.currentPlayerIndex]
  return !!seat && seat.kind === 'ai' && !!seat.aiTier
}

/**
 * Start the AI turn-runner for this game unless one is already in flight, and
 * return the promise that settles when the current run finishes. Safe to call
 * from anywhere (create/join/act/stream-connect) — it no-ops instantly when
 * the current player is human or the game is over. Callers on a serverless
 * request path should `waitUntil(kickAiTurns(token))` so the instance isn't
 * frozen out from under the (detached) runner after the response returns.
 *
 * EGRESS: the poll (`stream/route.ts`) re-kicks every ~1.2s per open tab. The
 * gate below is a CHEAP peek (`loadAiPeek`, <1KB) — the full-row `loadGame`
 * inside `runAiTurns` (28–65KB) is paid ONLY when it is genuinely an AI's
 * turn. Before this, every idle tick read the whole snapshot and discarded it.
 */
export function kickAiTurns(token: string): Promise<void> {
  const existing = aiPromise.get(token)
  if (existing) return existing
  if (aiRunning.has(token)) return Promise.resolve()
  aiRunning.add(token)
  const p = maybeRunAiTurns(token)
    .catch(() => {
      // the runner never propagates — a failed decision is logged in-game
    })
    .finally(() => {
      aiRunning.delete(token)
      aiPromise.delete(token)
      if (aiThinking.delete(token)) broadcast(token)
    })
  aiPromise.set(token, p)
  return p
}

/** Cheap gate → full runner. Reads only the peek unless it's an AI's turn. */
async function maybeRunAiTurns(token: string): Promise<void> {
  const peek = await loadAiPeek(token)
  if (!isAiSeatTurn(peek)) return
  await runAiTurns(token)
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
      // AI moves land in the same intent log as human ones: one applied
      // engine event per decision, attributed to the AI seat (with the same
      // era-boundary replay checkpoint as actInGame).
      await saveGame(game, {
        kind: 'intent',
        seatId: seat.seatId,
        payload: outcome.move.event,
        snapshotAfter: eraCheckpoint(peek.snapshot, outcome.snapshot),
      })
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
  // The full frame (every SSE (re)connect and every act response) carries the
  // recent chat tail so a fresh/reconnecting client starts with current state
  // + recent chat in one frame. `viewFor` discards it for spectators.
  const chatTail = await loadRecentChat(token, CHAT_TAIL_LIMIT)
  return viewFor(game, seatId, seatSecret, chatTail)
}
