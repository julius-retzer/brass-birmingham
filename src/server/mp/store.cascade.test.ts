// The `ON DELETE CASCADE` foreign keys added in migration `0006`.
//
// `chat_messages` and `game_intents` used to reference a game by a bare `token`
// column, so deleting a game row (the TTL sweep, or a hand-run DELETE in the
// Neon console) silently ORPHANED its chat and intent-log rows — invisible,
// unreachable, and growing. Both columns are now real FKs onto `games.token`
// with ON DELETE CASCADE.
//
// DB-backed on purpose: cascade is referential-integrity behaviour that only
// the real database can demonstrate — a mock would prove nothing. Rows are
// deleted BY TOKEN in teardown, never blanket-wiped: parallel vitest workers
// share this database.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { ensureTestSchema } from '../../test/db-schema'
import { db } from '../db'
import { chatMessages, gameIntents, games } from '../db/schema'
import { appendChatMessage, saveGame } from './store'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const seeded: string[] = []

beforeAll(async () => {
  await ensureTestSchema()
})

afterEach(async () => {
  for (const token of seeded.splice(0)) {
    await db.delete(games).where(eq(games.token, token))
  }
})

/** A minimal real game row plus one intent-log row, written the way the live
 *  path writes them (one atomic `saveGame`). */
async function seedGameWithChildren(): Promise<string> {
  const token = randomUUID().replace(/-/g, '')
  seeded.push(token)
  const stamp = new Date().toISOString()
  await saveGame(
    {
      token,
      phase: 'playing',
      name: '',
      visibility: 'public',
      archived: false,
      createdAt: stamp,
      updatedAt: stamp,
      version: 1,
      seats: [],
      snapshot: { context: {} },
    },
    { kind: 'setup', seatId: null, payload: { context: {} } },
  )
  await appendChatMessage(token, 0, 'Ada', 'hello', stamp)
  return token
}

const countIntents = async (token: string) =>
  (await db.select().from(gameIntents).where(eq(gameIntents.token, token)))
    .length

const countChat = async (token: string) =>
  (await db.select().from(chatMessages).where(eq(chatMessages.token, token)))
    .length

test('deleting a game cascades away its intent log and chat', async () => {
  const token = await seedGameWithChildren()
  expect(await countIntents(token)).toBe(1)
  expect(await countChat(token)).toBe(1)

  // The bare DELETE a sweep — or a human in the DB console — issues.
  await db.delete(games).where(eq(games.token, token))

  expect(await countIntents(token)).toBe(0)
  expect(await countChat(token)).toBe(0)
})

test('a child row for a nonexistent game is refused by the foreign key', async () => {
  // The other half of the constraint: orphans can no longer be CREATED, which
  // is what makes the one-off cleanup in migration 0006 a one-off.
  const ghost = randomUUID().replace(/-/g, '')
  await expect(
    db.insert(gameIntents).values({
      token: ghost,
      seq: 1,
      kind: 'intent',
      seatId: 0,
      payload: {},
      version: 1,
      createdAt: new Date().toISOString(),
    }),
  ).rejects.toThrow()
  await expect(
    db.insert(chatMessages).values({
      token: ghost,
      seq: 1,
      seatId: 0,
      name: 'Ada',
      text: 'hello',
      createdAt: new Date().toISOString(),
    }),
  ).rejects.toThrow()
})
