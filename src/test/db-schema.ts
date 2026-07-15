// Apply the shipped Drizzle migrations to the connected DB for tests.
//
// The multiplayer suites run against a real (Neon/Postgres) database — set
// DATABASE_URL to a dev branch. Rather than depend on a driver-specific
// runtime migrator, we execute the generated migration SQL directly, which is
// robust across drivers and exercises the exact SQL that ships. Re-running is
// safe: an "already exists" error on the CREATE TABLE is ignored so tests can
// share a persistent dev branch across runs.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '~/server/db'

let applied: Promise<void> | null = null

async function apply(): Promise<void> {
  const dir = path.resolve(process.cwd(), 'drizzle')
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const text = await fs.readFile(path.join(dir, file), 'utf8')
    for (const statement of text.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (!trimmed) continue
      try {
        await db.execute(sql.raw(trimmed))
      } catch (err) {
        // Idempotent: the table may already exist on a shared dev branch.
        if (!/already exists/i.test(String(err))) throw err
      }
    }
  }
}

/** Idempotent, memoized per worker: ensure the `games` table exists. */
export function ensureTestSchema(): Promise<void> {
  applied ??= apply()
  return applied
}
