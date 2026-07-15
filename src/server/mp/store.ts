// Durable, DB-backed game store for networked multiplayer.
//
// One row per game in the `games` table (Drizzle, keyed by the unguessable
// token). This is the single seam between the multiplayer service and
// persistence: load/save/sweep the whole `GameRecord` by token. Moving off
// per-file JSON to the DB is what lets game state — including chat — survive
// a redeploy on an ephemeral box. The chat `messages` and the AI log live IN
// the row (JSON columns), so a single upsert writes the whole record
// atomically, replacing the old tmp+rename file trick. Swapping the DB engine
// later is a config change in `drizzle.config.ts` + `src/server/db/index.ts`,
// not a rewrite of this module.
import { eq, lt } from 'drizzle-orm'
import { type AiLogEntry, type AiTierId, type AiUsageTotals } from '../ai/types'
import { db } from '../db'
import { games } from '../db/schema'

export interface SeatRecord {
  seatId: number
  name: string | null
  color: string
  character: string
  claimed: boolean
  /** sha256 of the seat secret; the plain secret only ever goes to its owner */
  secretHash: string | null
  /** 'ai' seats are server-driven; absent/'human' seats need a secret */
  kind?: 'human' | 'ai'
  /** difficulty tier for 'ai' seats */
  aiTier?: AiTierId
}

/** One chat line — game id = the enclosing record, plus sender + text +
 * timestamp. Stored as a JSON column on the game row (loaded/saved with the
 * whole record); no separate table because there is exactly one access
 * pattern: the entire record at once. */
export interface ChatMessage {
  id: number
  seatId: number
  name: string
  text: string
  at: string
}

export interface GameRecord {
  token: string
  phase: 'lobby' | 'playing' | 'over'
  createdAt: string
  updatedAt: string
  version: number
  seats: SeatRecord[]
  /** persisted XState snapshot of the authoritative engine (null in lobby) */
  snapshot: unknown | null
  /** per-game table talk (absent in records from before the feature) */
  messages?: ChatMessage[]
  /** present when the table has AI seats: their move log + spend counter */
  ai?: {
    log: AiLogEntry[]
    usage: AiUsageTotals
  }
}

/** Games untouched for this long are garbage-collected. */
export const GAME_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/

type GameRow = typeof games.$inferSelect

function rowToRecord(row: GameRow): GameRecord {
  return {
    token: row.token,
    phase: row.phase,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    seats: row.seats,
    snapshot: row.snapshot ?? null,
    // JSON NULL comes back as null; the record shape uses optional/undefined
    ...(row.messages != null ? { messages: row.messages } : {}),
    ...(row.ai != null ? { ai: row.ai } : {}),
  }
}

function recordToRow(game: GameRecord): GameRow {
  return {
    token: game.token,
    phase: game.phase,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    version: game.version,
    seats: game.seats,
    snapshot: game.snapshot ?? null,
    messages: game.messages ?? null,
    ai: game.ai ?? null,
  }
}

export async function loadGame(token: string): Promise<GameRecord | null> {
  if (!TOKEN_RE.test(token)) return null
  const rows = await db
    .select()
    .from(games)
    .where(eq(games.token, token))
    .limit(1)
  const row = rows[0]
  return row ? rowToRecord(row) : null
}

/**
 * Read ONLY the monotonic `version` for a game — the cheap DB poll that lets
 * the SSE stream act as a "server-side polling loop with an open pipe". This
 * is the delivery guarantee for cross-instance updates on serverless (the
 * in-process bus in `game.ts` is only a same-instance fast path): the stream
 * selects this every ~1.2s and re-derives the full per-seat view on change.
 * Returns null for an unknown/malformed token.
 */
export async function loadVersion(token: string): Promise<number | null> {
  if (!TOKEN_RE.test(token)) return null
  const rows = await db
    .select({ version: games.version })
    .from(games)
    .where(eq(games.token, token))
    .limit(1)
  return rows[0]?.version ?? null
}

export async function saveGame(game: GameRecord): Promise<void> {
  if (!TOKEN_RE.test(game.token)) throw new Error('Malformed game token')
  const row = recordToRow(game)
  // Single atomic upsert replaces the old tmp-file + rename dance; the caller
  // already bumped `version`/`updatedAt`. The `setWhere` guard is optimistic
  // concurrency: the game lock is per-process, so a second server instance
  // can race the same read-modify-write — the writer whose bumped version is
  // no longer ahead of the stored one loses, loudly, instead of silently
  // overwriting the row (which would also erase chat — messages live in it).
  const written = await db
    .insert(games)
    .values(row)
    .onConflictDoUpdate({
      target: games.token,
      set: row,
      setWhere: lt(games.version, row.version),
    })
    .returning({ token: games.token })
  if (written.length === 0) {
    throw new Error('Concurrent write: the game changed under this save')
  }
}

let lastSweep = 0

/** Lazily delete stale games; throttled so it costs nothing per-request. */
export async function sweepStaleGames(now = Date.now()): Promise<void> {
  if (now - lastSweep < 60 * 60 * 1000) return
  lastSweep = now
  // ISO-8601 timestamps sort lexicographically the same as chronologically,
  // so a string `<` comparison is a correct TTL cutoff.
  const cutoff = new Date(now - GAME_TTL_MS).toISOString()
  await db.delete(games).where(lt(games.updatedAt, cutoff))
}
