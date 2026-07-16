// Offline unit tests for the schema-application error predicate.
//
// These pin WHICH Postgres failures ensureTestSchema() is allowed to swallow.
// Getting this wrong is expensive in both directions: too narrow and parallel
// DB suites flake (see the pg_type race below); too wide and a genuine broken
// migration passes silently.
import { describe, expect, it } from 'vitest'
import { isBenignSchemaRace } from './db-schema'

/** Shape of the driver error drizzle wraps (fields we actually branch on). */
function pgError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error(String(fields.message ?? 'pg error')), fields)
}

describe('isBenignSchemaRace', () => {
  it('accepts duplicate_table (42P07) — the object already exists', () => {
    expect(isBenignSchemaRace(pgError({ code: '42P07' }))).toBe(true)
  })

  it('accepts an "already exists" message when no code is surfaced', () => {
    expect(
      isBenignSchemaRace(
        pgError({ message: 'relation "games" already exists' }),
      ),
    ).toBe(true)
  })

  it('accepts duplicate_object (42710) — a constraint/index lost the race', () => {
    expect(isBenignSchemaRace(pgError({ code: '42710' }))).toBe(true)
  })

  // The regression this file exists for. Two DB suites run in parallel workers
  // against ONE fresh ephemeral branch; both find `chat_messages` absent and
  // issue CREATE TABLE at the same instant. The loser does NOT get a polite
  // 42P07 — Postgres surfaces the catalog's own unique-index violation.
  it('accepts a concurrent CREATE losing on the pg_catalog unique index', () => {
    expect(
      isBenignSchemaRace(
        pgError({
          code: '23505',
          schema: 'pg_catalog',
          table: 'pg_type',
          constraint: 'pg_type_typname_nsp_index',
          message:
            'duplicate key value violates unique constraint "pg_type_typname_nsp_index"',
        }),
      ),
    ).toBe(true)
  })

  it('unwraps the cause chain drizzle wraps the driver error in', () => {
    const wrapped = Object.assign(new Error('Failed query: CREATE TABLE ...'), {
      cause: pgError({ code: '42P07' }),
    })
    expect(isBenignSchemaRace(wrapped)).toBe(true)
  })

  // Guard the other direction: 23505 is only benign against the CATALOG. A
  // unique violation on an application table is a real bug and must surface.
  it('rejects a 23505 on an application table', () => {
    expect(
      isBenignSchemaRace(
        pgError({
          code: '23505',
          schema: 'public',
          table: 'games',
          constraint: 'games_pkey',
          message:
            'duplicate key value violates unique constraint "games_pkey"',
        }),
      ),
    ).toBe(false)
  })

  it('rejects a genuinely broken migration', () => {
    expect(
      isBenignSchemaRace(
        pgError({ code: '42601', message: 'syntax error at or near "CRAETE"' }),
      ),
    ).toBe(false)
  })

  it('rejects non-Error throws rather than guessing', () => {
    expect(isBenignSchemaRace('boom')).toBe(false)
    expect(isBenignSchemaRace(null)).toBe(false)
  })
})
