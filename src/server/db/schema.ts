import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core'
import type { ChatMessage, GameRecord, SeatRecord } from '../mp/store'

/**
 * One row per networked multiplayer game, keyed by its unguessable token.
 *
 * The `GameRecord` lives here: scalar columns for the fields we might ever
 * query/sweep on (phase, version, timestamps) and `jsonb` columns for the
 * structured payloads — the persisted XState `snapshot`, the `seats`, and the
 * AI move-log/usage. A single upsert writes the whole record atomically.
 * Timestamps are ISO-8601 `text` (not `timestamp`) so the row maps 1:1 onto
 * `GameRecord`, whose fields are strings — no Date<->string conversion in the
 * store, and ISO strings sort chronologically for the TTL sweep.
 *
 * Chat is deliberately NOT in this row (see `chatMessages` below): it moved to
 * its own append-only table so a chat line no longer rewrites this row nor
 * bumps `version` (which under DB-as-bus sync would fan a full ~26KB per-seat
 * state frame to every viewer). The `messages` jsonb column is VESTIGIAL —
 * kept only so pre-migration rows still parse and their chat can be backfilled
 * (migration `0001`); the live path never reads or writes it, and it can be
 * dropped once all such games have aged out under the 7-day TTL.
 *
 * This is on a real (Neon/Postgres) DB, not local disk, which is the point:
 * game state — including chat — now survives an ephemeral-box redeploy, which
 * the old `.bb-games/*.json` files (and any local SQLite file) never could.
 */
export const games = pgTable(
  'games',
  {
    token: text('token').primaryKey(),
    phase: text('phase', { enum: ['lobby', 'playing', 'over'] })
      .notNull()
      .default('lobby'),
    /** optional short table name captured at create; '' when the host left it
     *  blank (the lobby browser then falls back to "<host>'s table"). Additive,
     *  safe default so existing rows read as unnamed. */
    name: text('name').notNull().default(''),
    /** 'public' tables are advertised by the lobby browser; 'private' tables
     *  are reachable by invite link only and never returned by
     *  `loadOpenLobbies`. Additive with a 'public' default so existing rows
     *  keep their current (listed) behaviour. */
    visibility: text('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('public'),
    version: integer('version').notNull().default(1),
    /** A game hidden from discovery but KEPT for analytics: the weekly archive
     *  sweep flips never-started lobbies here, and a host can archive their own
     *  lobby on demand. Additive, default false → every existing row stays
     *  visible. This is an archive, NOT a delete — the row (and its chat +
     *  intent log) survives. `loadOpenLobbies` filters archived rows out. */
    archived: boolean('archived').notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    seats: jsonb('seats').notNull().$type<SeatRecord[]>(),
    /** persisted XState snapshot of the authoritative engine (null in lobby) */
    snapshot: jsonb('snapshot').$type<unknown>(),
    /** DEPRECATED — chat now lives in `chatMessages`. Retained only for
     *  backfilling pre-migration rows; never read/written by the live path. */
    messages: jsonb('messages').$type<ChatMessage[]>(),
    /** present when the table has AI seats: their move log + spend counter */
    ai: jsonb('ai').$type<GameRecord['ai']>(),
  },
  (t) => [
    // Two PUBLIC, unauthenticated endpoints scan this table, and rows are
    // never swept (kept for analytics) — without these indexes both queries
    // degrade permanently as rows accumulate (attacker-controllable via
    // create spam; see the 2026-07-23 abuse/cost report).
    // `loadOpenLobbies`: WHERE phase = 'lobby' ORDER BY created_at DESC LIMIT n.
    index('games_phase_created_idx').on(t.phase, t.createdAt.desc()),
    // `loadActivityStats`: WHERE updated_at >= cutoff AND phase <> 'over' —
    // a partial index matching its exact predicate.
    index('games_updated_active_idx')
      .on(t.updatedAt)
      .where(sql`${t.phase} <> 'over'`),
  ],
)

/**
 * Table talk, normalized OUT of the game row: one row per chat line, keyed by
 * game `token` + a monotonically increasing per-game `seq`. Appending a
 * message inserts ONE small row — it does not touch the `games` row, so it
 * never bumps the engine `version` and never triggers a full-state SSE frame.
 *
 * The composite PK `(token, seq)` gives the per-game monotonic ordering the
 * client dedupes/orders on (`seq` is the message id on the wire), and the
 * `token` index makes the poll's `MAX(seq)` and the "since seq" tail cheap.
 * Chat is public to seated players; there is no seat-private channel, so no
 * per-seat filtering is needed on the chat rows themselves (the game view
 * still gates whether an unauthenticated viewer sees any chat at all).
 *
 * `token` is a real FOREIGN KEY with ON DELETE CASCADE: chat has no life of
 * its own, so deleting a game — by the TTL sweep or by hand in the DB console
 * — takes its chat with it. Before the FK existed (migration `0006`) such a
 * delete silently orphaned these rows.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    token: text('token')
      .notNull()
      .references(() => games.token, { onDelete: 'cascade' }),
    /** monotonically increasing per game; the message id on the wire */
    seq: integer('seq').notNull(),
    seatId: integer('seat_id').notNull(),
    name: text('name').notNull(),
    text: text('text').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.token, t.seq] }),
    index('chat_messages_token_idx').on(t.token),
  ],
)

/**
 * The durable per-game INTENT LOG: one row per state-mutating engine write,
 * appended in the SAME statement that persists the accepted snapshot (see
 * `saveGame` in `../mp/store.ts`), so log and state cannot diverge — a save
 * that loses the optimistic version guard inserts no log row.
 *
 * Purpose: reliable bug reproduction. The human-readable in-game journal is a
 * rendering; this table is the machine-replayable record. `kind='setup'` rows
 * carry the full initial persisted snapshot (setup shuffles are random, so
 * replay must start from the captured state); `kind='intent'` rows carry the
 * EXACT post-whitelist event as executed (human intents from `actInGame`, AI
 * moves from the turn runner). Refusals are deliberately NOT recorded — they
 * never mutate state, so replay does not need them.
 *
 * Server-side only: never shipped to clients, never read on the stream poll
 * (egress discipline) — only by the replay tooling (`../mp/replay.ts`) and the
 * TTL sweep. Same normalization pattern as `chat_messages`: PK (token, seq),
 * `token` a FOREIGN KEY with ON DELETE CASCADE, so the log dies with its game
 * however the game row is deleted (sweep or DB console) — see `chatMessages`.
 */
export const gameIntents = pgTable(
  'game_intents',
  {
    token: text('token')
      .notNull()
      .references(() => games.token, { onDelete: 'cascade' }),
    /** monotonically increasing per game; allocated inside the save statement */
    seq: integer('seq').notNull(),
    kind: text('kind', { enum: ['setup', 'intent'] }).notNull(),
    /** acting seat (AI seats included); null for the 'setup' system record */
    seatId: integer('seat_id'),
    /** the event as executed ('intent') or the initial snapshot ('setup') */
    payload: jsonb('payload').notNull().$type<unknown>(),
    /** replay checkpoint: the full resulting snapshot, present only when this
     * intent crossed a nondeterministic engine boundary (the canal→rail
     * transition reshuffles the deck), so replay re-bases on it */
    snapshotAfter: jsonb('snapshot_after').$type<unknown>(),
    /** the engine `games.version` this write produced */
    version: integer('version').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.token, t.seq] }),
    index('game_intents_token_idx').on(t.token),
  ],
)
