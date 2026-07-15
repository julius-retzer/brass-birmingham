import { integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import type { ChatMessage, GameRecord, SeatRecord } from '../mp/store'

/**
 * One row per networked multiplayer game, keyed by its unguessable token.
 *
 * The whole `GameRecord` lives here: scalar columns for the fields we might
 * ever query/sweep on (phase, version, timestamps) and `jsonb` columns for
 * the structured payloads — the persisted XState `snapshot`, the `seats`, the
 * chat `messages`, and the AI move-log/usage. Chat lives IN the row (not a
 * separate table) because the store's public interface loads/saves the whole
 * record atomically: a single upsert keeps that seam intact and every write
 * consistent. Timestamps are ISO-8601 `text` (not `timestamp`) so the row
 * maps 1:1 onto `GameRecord`, whose fields are strings — no Date<->string
 * conversion in the store, and ISO strings sort chronologically for the TTL
 * sweep.
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
  /** per-game table talk (null in records from before the chat feature) */
  messages: jsonb('messages').$type<ChatMessage[]>(),
  /** present when the table has AI seats: their move log + spend counter */
  ai: jsonb('ai').$type<GameRecord['ai']>(),
})
