// Durable, DB-backed game store for networked multiplayer.
//
// One row per game in the `games` table (Drizzle, keyed by the unguessable
// token). This is the single seam between the multiplayer service and
// persistence: load/save/sweep the whole `GameRecord` by token. Moving off
// per-file JSON to the DB is what lets game state — including chat — survive
// a redeploy on an ephemeral box. The AI log lives IN the row (a JSON column),
// so a single upsert writes the whole record atomically, replacing the old
// tmp+rename file trick. CHAT is the exception: it lives in its OWN append-only
// `chat_messages` table (see below) so a message never rewrites the game row
// nor bumps `version`. Swapping the DB engine later is a config change in
// `drizzle.config.ts` + `src/server/db/index.ts`, not a rewrite of this module.
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  lt,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm'
import { type AiLogEntry, type AiTierId, type AiUsageTotals } from '../ai/types'
import { db } from '../db'
import { chatMessages, gameIntents, games } from '../db/schema'

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
  /** lobby ready-up: a human seat toggles this before the host may start.
   *  AI seats are implicitly ready (their readiness is derived from `kind`),
   *  so the field is only meaningful for claimed human seats. */
  ready?: boolean
}

/** One chat line. `id` is the per-game monotonic `seq` from `chat_messages`
 * (the wire id the client dedupes/orders on); `at` is the ISO created_at. */
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
  /** optional short table name (capped/trimmed at create); '' when unnamed */
  name: string
  /** 'public' games are advertised in the lobby browser; 'private' ones are
   *  invite-link only and never returned by `loadOpenLobbies` */
  visibility: 'public' | 'private'
  /** hidden from discovery but kept for analytics — see the `archived` column.
   *  Set by the weekly archive sweep or a host archiving their own lobby. */
  archived: boolean
  createdAt: string
  updatedAt: string
  version: number
  seats: SeatRecord[]
  /** persisted XState snapshot of the authoritative engine (null in lobby) */
  snapshot: unknown | null
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
    name: row.name,
    visibility: row.visibility,
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    seats: row.seats,
    snapshot: row.snapshot ?? null,
    // `messages` is the vestigial jsonb column — never surfaced on the record
    // anymore (chat lives in `chat_messages`); it exists only for the 0001
    // backfill of pre-migration rows.
    // JSON NULL comes back as null; the record shape uses optional/undefined
    ...(row.ai != null ? { ai: row.ai } : {}),
  }
}

function recordToRow(game: GameRecord): GameRow {
  return {
    token: game.token,
    phase: game.phase,
    name: game.name,
    visibility: game.visibility,
    archived: game.archived,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    version: game.version,
    seats: game.seats,
    snapshot: game.snapshot ?? null,
    // Never write chat back into the game row — it is normalized out. Leaving
    // this null lets any stale backfilled jsonb clear on the next save.
    messages: null,
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
 * Read the cheap poll pair `(version, maxSeq)` for a game in ONE round trip —
 * the game's engine `version` and the highest chat `seq`. This is the delivery
 * guarantee that lets the SSE stream act as a "server-side polling loop with an
 * open pipe" (the in-process bus in `game.ts` is only a same-instance fast
 * path): the stream selects this every ~1.2s and, on change, pushes a full
 * per-seat view when `version` moved or a bounded chat increment when only
 * `maxSeq` moved. Returns null for an unknown/malformed token.
 */
export async function loadVersionAndSeq(
  token: string,
): Promise<{ version: number; maxSeq: number } | null> {
  if (!TOKEN_RE.test(token)) return null
  // Correlated subquery for MAX(seq) built with the query builder (NOT a raw
  // `sql` template): the builder qualifies `chat_messages.token = games.token`,
  // whereas a raw template renders both columns unqualified — a `token=token`
  // tautology that would return the GLOBAL max. Keeps it one round trip;
  // COALESCE folds the no-chat case (NULL) to 0 so the caller never special-cases it.
  const maxSeqSub = db
    .select({ m: sql<number>`coalesce(max(${chatMessages.seq}), 0)` })
    .from(chatMessages)
    .where(eq(chatMessages.token, games.token))
  const rows = await db
    .select({ version: games.version, maxSeq: sql<number>`(${maxSeqSub})` })
    .from(games)
    .where(eq(games.token, token))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { version: row.version, maxSeq: Number(row.maxSeq) }
}

/** The cheap "is it an AI seat's turn?" peek: phase + version + seats + the
 *  current player index, WITHOUT the 28–65KB `snapshot` jsonb. The SSE poll
 *  re-kicks the AI turn-runner every ~1.2s per open tab; before this it read
 *  the whole game row (incl. snapshot) on every tick even for human-turn,
 *  finished, or no-AI games — the bulk of the Neon egress leak. Here we pull
 *  only `snapshot#>>'{context,currentPlayerIndex}'` as a scalar and the small
 *  `seats` array, so a poll tick on an idle game costs <1KB instead of tens of
 *  KB. The full `loadGame` (snapshot included) is paid ONLY once it is
 *  genuinely an AI's turn. Returns null for an unknown/malformed token. */
export interface AiPeek {
  phase: GameRecord['phase']
  version: number
  seats: SeatRecord[]
  /** null in the lobby (no snapshot yet) */
  currentPlayerIndex: number | null
}

export async function loadAiPeek(token: string): Promise<AiPeek | null> {
  if (!TOKEN_RE.test(token)) return null
  const rows = await db
    .select({
      phase: games.phase,
      version: games.version,
      seats: games.seats,
      // Extract the scalar from the jsonb server-side so the (large) snapshot
      // never crosses the wire. `#>>` on a NULL snapshot (lobby) yields NULL.
      currentPlayerIndex: sql<
        number | null
      >`(${games.snapshot} #>> '{context,currentPlayerIndex}')::int`,
    })
    .from(games)
    .where(eq(games.token, token))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    phase: row.phase,
    version: row.version,
    seats: row.seats,
    currentPlayerIndex:
      row.currentPlayerIndex === null ? null : Number(row.currentPlayerIndex),
  }
}

/* ---------------- public activity stats (aggregate, no identifiers) ------- */

/** How recently a game must have been touched to count as "in progress". */
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000

/** Aggregate liveness counts. Deliberately COUNTS ONLY — no tokens, no seat
 *  names — so this can be served to anyone from an unauthenticated endpoint. */
export interface ActivityStats {
  activeGames: number
  activePlayers: number
}

/**
 * Count the games touched within `windowMs` and the seated players in them.
 *
 * EGRESS: one aggregate round trip that pulls exactly two integers. `seats` is
 * jsonb, so the per-row seated count is computed SERVER-side
 * (`jsonb_array_elements` + `sum`) rather than by shipping the seat arrays here
 * to be counted in JS — and the 28–65KB `snapshot` jsonb is never touched at
 * all. Same discipline as `loadAiPeek`: this is a public endpoint that refresh
 * -spam can hit, so it must stay O(bytes), not O(games).
 *
 * `updatedAt` bumps on every version-bumping write (`saveGame`), so it is the
 * liveness signal; ISO-8601 text compares correctly against an ISO cutoff (same
 * property `sweepStaleGames` relies on). Finished games are excluded — a table
 * that ended 2 minutes ago is not "in progress". A seat counts as taken when it
 * has a name, which covers AI seats (named at creation) as well as humans.
 */
export async function loadActivityStats(
  windowMs = ACTIVE_WINDOW_MS,
  now = Date.now(),
): Promise<ActivityStats> {
  const cutoff = new Date(now - windowMs).toISOString()
  // Correlated scalar subquery per row; `sum()` then folds it across the
  // matching games. COALESCE turns the no-active-games case (sum of an empty
  // set is NULL) into 0 so the caller never special-cases it.
  const seated = sql<number>`(
    select count(*) from jsonb_array_elements(${games.seats}) as seat
    where seat->>'name' is not null
  )`
  const rows = await db
    .select({
      activeGames: sql<number>`count(*)`,
      activePlayers: sql<number>`coalesce(sum(${seated}), 0)`,
    })
    .from(games)
    .where(
      and(
        gte(games.updatedAt, cutoff),
        ne(games.phase, 'over'),
        // An archived lobby is not "in progress" even if a host archived it
        // moments ago (item 6 bumps version but keeps the stale updatedAt; a
        // freshly host-archived lobby would otherwise count here).
        eq(games.archived, false),
      ),
    )
  const row = rows[0]
  // Postgres count()/sum() are bigint — they arrive as strings over neon-http.
  return {
    activeGames: Number(row?.activeGames ?? 0),
    activePlayers: Number(row?.activePlayers ?? 0),
  }
}

/* ---------------- open-lobby discovery ---------------- */

/** One row in the public lobby list: enough to render a card and offer a
 *  Join, and NOTHING more — no snapshot, no secrets. `open` is true when at
 *  least one human seat is still unclaimed. */
export interface LobbySummary {
  token: string
  /** the table's name, or '' when the host left it blank */
  name: string
  host: string | null
  capacity: number
  claimed: number
  open: boolean
  createdAt: string
}

/**
 * List the games still in the `lobby` phase, newest first. Used by the public
 * lobby-browser endpoint, so it must stay cheap: the 28–65KB `snapshot` jsonb
 * is never selected — only `token`, `seats`, `created_at`. Seat counts are
 * derived in JS from the small `seats` array (bounded to 4). Only lobbies with
 * a still-open human seat are returned — a full lobby (all seats claimed,
 * waiting on the host to start) is not joinable, so it does not belong on a
 * "join a game" list. AI-only opponent seats never count as open (they are
 * claimed at creation and cannot be joined off the wire).
 *
 * PRIVATE games are excluded at the SQL level: a `private` table is reachable
 * only by its invite link, so its token must never appear on this public list
 * (that is also a small security win — private tokens stay off the public
 * endpoint). `public` is the default, so existing rows keep showing.
 *
 * ARCHIVED games are likewise excluded at the SQL level: the weekly sweep and
 * a host's own "remove from lobby" both flip `archived` true, which drops the
 * table off this list while KEEPING the row for analytics.
 */
export async function loadOpenLobbies(limit = 50): Promise<LobbySummary[]> {
  const rows = await db
    .select({
      token: games.token,
      name: games.name,
      seats: games.seats,
      createdAt: games.createdAt,
    })
    .from(games)
    .where(
      and(
        eq(games.phase, 'lobby'),
        eq(games.visibility, 'public'),
        eq(games.archived, false),
      ),
    )
    .orderBy(desc(games.createdAt))
    .limit(limit)
  return rows
    .map((row) => {
      const humanOpen = row.seats.some((s) => s.kind !== 'ai' && !s.claimed)
      return {
        token: row.token,
        name: row.name,
        host: row.seats[0]?.name ?? null,
        capacity: row.seats.length,
        claimed: row.seats.filter((s) => s.claimed).length,
        open: humanOpen,
        createdAt: row.createdAt,
      }
    })
    .filter((l) => l.open)
}

/* ---------------- chat (normalized out of the game row) ---------------- */

const CHAT_SEQ_RETRIES = 6

function rowToChat(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.seq,
    seatId: row.seatId,
    name: row.name,
    text: row.text,
    at: row.createdAt,
  }
}

function isUniqueViolation(err: unknown): boolean {
  for (let e = err; e; e = (e as { cause?: unknown }).cause) {
    const { code, message } = e as { code?: string; message?: string }
    if (
      code === '23505' ||
      /duplicate key|unique constraint/i.test(message ?? '')
    )
      return true
  }
  return false
}

/**
 * Append one chat line and return it with its allocated per-game `seq`. The
 * next `seq` is `MAX(seq)+1` for the token; the composite PK `(token, seq)`
 * makes a lost race (two instances allocating the same seq) a unique-violation
 * that we simply retry — the per-process game lock already serializes the
 * common same-instance case, so the retry loop only ever fires cross-instance.
 */
export async function appendChatMessage(
  token: string,
  seatId: number,
  name: string,
  text: string,
  createdAt: string,
): Promise<ChatMessage> {
  if (!TOKEN_RE.test(token)) throw new Error('Malformed game token')
  for (let attempt = 0; attempt < CHAT_SEQ_RETRIES; attempt++) {
    const maxRows = await db
      .select({ max: sql<number>`coalesce(max(${chatMessages.seq}), 0)` })
      .from(chatMessages)
      .where(eq(chatMessages.token, token))
    const nextSeq = Number(maxRows[0]?.max ?? 0) + 1
    try {
      const inserted = await db
        .insert(chatMessages)
        .values({ token, seq: nextSeq, seatId, name, text, createdAt })
        .returning()
      return rowToChat(inserted[0]!)
    } catch (err) {
      if (isUniqueViolation(err) && attempt < CHAT_SEQ_RETRIES - 1) continue
      throw err
    }
  }
  throw new Error('Could not allocate a chat sequence number')
}

/** The recent tail (last `limit`, ascending by seq) — the bounded slice the
 *  game view carries so a frame never ships unbounded history. */
export async function loadRecentChat(
  token: string,
  limit: number,
): Promise<ChatMessage[]> {
  if (!TOKEN_RE.test(token)) return []
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.token, token))
    .orderBy(desc(chatMessages.seq))
    .limit(limit)
  return rows.reverse().map(rowToChat)
}

/** Messages strictly newer than `sinceSeq` (ascending, capped at `limit`) —
 *  the increment the stream pushes when only chat moved. */
export async function loadChatSince(
  token: string,
  sinceSeq: number,
  limit: number,
): Promise<ChatMessage[]> {
  if (!TOKEN_RE.test(token)) return []
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.token, token), gt(chatMessages.seq, sinceSeq)))
    .orderBy(asc(chatMessages.seq))
    .limit(limit)
  return rows.map(rowToChat)
}

/* ------------- the intent log (durable, append-only, per game) ------------- */

/** What a state-mutating save appends to the intent log. `'setup'` payloads
 * are the full initial persisted snapshot (setup shuffles are random, so a
 * replay must start from the captured state); `'intent'` payloads are the
 * exact post-whitelist event as executed. */
export interface IntentLogEntry {
  kind: 'setup' | 'intent'
  /** the acting seat (AI seats included); null for the 'setup' record */
  seatId: number | null
  payload: unknown
  /** replay checkpoint: the full resulting snapshot, set only when this
   * intent crossed a nondeterministic engine boundary (the canal→rail
   * transition reshuffles the deck) — see `eraCheckpoint` in intent.ts */
  snapshotAfter?: unknown | null
}

/** One stored intent-log row (see `gameIntents` in the schema). */
export interface IntentLogRow extends IntentLogEntry {
  seq: number
  /** the engine `games.version` this write produced */
  version: number
  at: string
}

/** The full intent log for a game, ascending by seq. Tooling/tests only —
 * never called on the stream poll or any per-request path. */
export async function loadIntentLog(token: string): Promise<IntentLogRow[]> {
  if (!TOKEN_RE.test(token)) return []
  const rows = await db
    .select()
    .from(gameIntents)
    .where(eq(gameIntents.token, token))
    .orderBy(asc(gameIntents.seq))
  return rows.map((r) => ({
    seq: r.seq,
    kind: r.kind,
    seatId: r.seatId,
    payload: r.payload,
    snapshotAfter: r.snapshotAfter ?? null,
    version: r.version,
    at: r.createdAt,
  }))
}

export async function saveGame(
  game: GameRecord,
  /** append this to the intent log ATOMICALLY with the snapshot write */
  intentLog?: IntentLogEntry,
): Promise<void> {
  if (!TOKEN_RE.test(game.token)) throw new Error('Malformed game token')
  const row = recordToRow(game)
  // Single atomic upsert replaces the old tmp-file + rename dance; the caller
  // already bumped `version`/`updatedAt`. The `setWhere` guard is optimistic
  // concurrency: the game lock is per-process, so a second server instance
  // can race the same read-modify-write — the writer whose bumped version is
  // no longer ahead of the stored one loses, loudly, instead of silently
  // overwriting the row (which would also erase chat — messages live in it).
  const upsert = db
    .insert(games)
    .values(row)
    .onConflictDoUpdate({
      target: games.token,
      set: row,
      setWhere: lt(games.version, row.version),
    })
    .returning({ token: games.token })

  if (!intentLog) {
    const written = await upsert
    if (written.length === 0) {
      throw new Error('Concurrent write: the game changed under this save')
    }
    return
  }

  // Snapshot + log in ONE data-modifying-CTE statement, so they cannot
  // diverge: the log INSERT selects FROM the upsert's RETURNING, which is
  // empty exactly when the version guard rejected the write — a lost
  // concurrent save inserts NO log row (no phantom), and a crash can never
  // land between the two (they commit together). The next `seq` is computed
  // inline; concurrent writers for the same token serialize on the `games`
  // row lock taken by the upsert, and the loser's guard failure empties `up`,
  // so the stale max(seq) it may have read is never used.
  const result = await db.execute(sql`
    with up as ${upsert}
    insert into game_intents (token, seq, kind, seat_id, payload, snapshot_after, version, created_at)
    select up.token,
           (select coalesce(max(seq), 0) + 1 from game_intents where token = ${game.token}),
           ${intentLog.kind},
           ${intentLog.seatId}::int,
           ${JSON.stringify(intentLog.payload)}::jsonb,
           ${
             intentLog.snapshotAfter != null
               ? JSON.stringify(intentLog.snapshotAfter)
               : null
           }::jsonb,
           ${game.version},
           ${game.updatedAt}
    from up
    returning token
  `)
  if (result.rows.length === 0) {
    throw new Error('Concurrent write: the game changed under this save')
  }
}

let lastSweep = 0

/**
 * Lazily delete stale games; throttled so it costs nothing per-request.
 *
 * DISABLED BY DEFAULT: the automatic TTL sweep is gated behind
 * `BB_ENABLE_TTL_SWEEP=1` and off in every environment unless that is set. We
 * currently keep all games — finished, abandoned, and lobbies alike — so their
 * snapshots and intent logs stay available for analytics. The function is left
 * intact so the sweep can be re-enabled by flipping the flag (or called
 * directly with the flag set for a one-off manual cleanup) without a code
 * change. The lazy call sites in `game.ts` become no-ops while the flag is off.
 */
export async function sweepStaleGames(now = Date.now()): Promise<void> {
  if (process.env.BB_ENABLE_TTL_SWEEP !== '1') return
  if (now - lastSweep < 60 * 60 * 1000) return
  lastSweep = now
  // ISO-8601 timestamps sort lexicographically the same as chronologically,
  // so a string `<` comparison is a correct TTL cutoff.
  const cutoff = new Date(now - GAME_TTL_MS).toISOString()
  await db.delete(games).where(lt(games.updatedAt, cutoff))
  // Chat and intent-log rows are tied to game lifetime. Since migration 0006
  // both `token` columns are FKs with ON DELETE CASCADE, so the delete above
  // already took them — these anti-joins are now a cheap belt-and-braces pass
  // that also clears any orphan predating the constraint.
  await db
    .delete(chatMessages)
    .where(
      notInArray(
        chatMessages.token,
        db.select({ token: games.token }).from(games),
      ),
    )
  await db
    .delete(gameIntents)
    .where(
      notInArray(
        gameIntents.token,
        db.select({ token: games.token }).from(games),
      ),
    )
}

/** How long a never-started lobby may sit untouched before the weekly sweep
 *  archives it (hides it from discovery, keeps the row). */
export const LOBBY_ARCHIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Archive — NEVER delete — lobbies nobody ever started that have gone stale.
 *
 * This is the weekly Vercel-Cron sweep (item 5). It flips `archived` true on
 * every game still in the `lobby` phase, not already archived, and untouched
 * for `ttlMs`. Started (`playing`) and finished (`over`) games are left alone
 * — only dead never-started lobbies are cleaned up, and even they SURVIVE as
 * rows (with their chat + intent log) for analytics; they simply drop off the
 * public lobby list (`loadOpenLobbies` filters archived) and any client still
 * sitting on one converges to the "game no longer exists" screen via the
 * version bump.
 *
 * A single bulk UPDATE (no per-row load/save). `updatedAt` is deliberately NOT
 * bumped: it is the staleness clock, and a fresh timestamp would both re-hide
 * the row from a future re-sweep check and make it look active. `version` IS
 * bumped so the stream poll notices and refreshes watchers. Returns how many
 * lobbies were archived.
 */
export async function archiveStaleLobbies(
  now = Date.now(),
  ttlMs = LOBBY_ARCHIVE_TTL_MS,
): Promise<number> {
  // ISO-8601 timestamps sort lexicographically the same as chronologically.
  const cutoff = new Date(now - ttlMs).toISOString()
  const archived = await db
    .update(games)
    .set({ archived: true, version: sql`${games.version} + 1` })
    .where(
      and(
        eq(games.phase, 'lobby'),
        eq(games.archived, false),
        lt(games.updatedAt, cutoff),
      ),
    )
    .returning({ token: games.token })
  return archived.length
}
