// Apply the shipped Drizzle migrations to the connected DB for tests.
//
// The multiplayer suites run against a real (Neon/Postgres) database, normally
// the per-run ephemeral branch from src/test/global-db-branch.ts. Rather than
// depend on a driver-specific runtime migrator, we execute the generated
// migration SQL directly, which is robust across drivers and exercises the exact
// SQL that ships. Applying is safe both when the objects already exist and when
// parallel workers create them at the same instant — see isBenignSchemaRace.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '~/server/db'

/**
 * Is this failure just "the object is already there"?
 *
 * Two shapes, both benign:
 *
 *  - The object EXISTS ALREADY (42P07 duplicate_table / 42710 duplicate_object /
 *    42701 duplicate_column for an additive `ALTER TABLE … ADD COLUMN`, or an
 *    "already exists" message when no code surfaces). Re-running the shipped
 *    migrations over a populated branch.
 *
 *  - The object was created CONCURRENTLY, a hair before us. vitest runs the DB
 *    suites in parallel workers against ONE database; when the branch is missing
 *    a table (an ephemeral branch off a `ci` parent that predates the migration)
 *    both workers issue the same CREATE at once. The loser does NOT get 42P07 —
 *    CREATE TABLE isn't atomic against a concurrent twin, so Postgres surfaces
 *    its own catalog unique-index violation (23505 on pg_catalog) instead. The
 *    winner's object is committed by then, so the loser can safely carry on.
 *
 * 23505 is accepted ONLY against pg_catalog: a unique violation on an
 * application table is a real defect and must still throw. drizzle wraps the
 * driver error, so walk the cause chain.
 */
export function isBenignSchemaRace(err: unknown): boolean {
  for (let e = err; e; e = (e as { cause?: unknown }).cause) {
    if (typeof e !== 'object') return false
    const { code, message, schema } = e as {
      code?: string
      message?: string
      schema?: string
    }
    if (code === '42P07' || code === '42710' || code === '42701') return true
    if (code === '23505' && schema === 'pg_catalog') return true
    // Only trust the message when no code pinned the failure — an unrelated
    // error carrying these words shouldn't slip through.
    if (!code && /already exists/i.test(message ?? '')) return true
  }
  return false
}

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
        if (!isBenignSchemaRace(err)) throw err
      }
    }
  }
}

/** Idempotent, memoized per worker: ensure the `games` table exists.
 * A failed attempt (e.g. a transient network error) is NOT memoized, so the
 * next test retries instead of inheriting the stale rejection. */
export function ensureTestSchema(): Promise<void> {
  applied ??= apply().catch((err: unknown) => {
    applied = null
    throw err
  })
  return applied
}
