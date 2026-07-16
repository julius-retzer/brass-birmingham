import {
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
export const games = pgTable('games', {
  token: text('token').primaryKey(),
  phase: text('phase', { enum: ['lobby', 'playing', 'over'] })
    .notNull()
    .default('lobby'),
  version: integer('version').notNull().default(1),
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
})

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
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    token: text('token').notNull(),
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
