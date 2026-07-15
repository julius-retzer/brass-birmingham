import { existsSync, readFileSync } from 'node:fs'

// The multiplayer store is DB-backed, so specs that drive the real mp
// service (online multiplayer, versus-AI) need a live DATABASE_URL. The dev
// server reads it from `.env`/`.env.local` (Next loads those itself); the
// playwright process only needs to know whether one is available, so those
// specs can SKIP visibly instead of failing.
export const hasDatabaseUrl =
  !!process.env.DATABASE_URL ||
  ['.env', '.env.local'].some(
    (f) =>
      existsSync(f) && /^\s*DATABASE_URL\s*=/m.test(readFileSync(f, 'utf8')),
  )

export const NEEDS_DB_MESSAGE =
  'needs a live DB — put a Neon DATABASE_URL in .env'
