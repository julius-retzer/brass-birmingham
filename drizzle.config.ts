import type { Config } from 'drizzle-kit'
import { env } from '~/env'

// Migrations must run on the DIRECT (unpooled) Neon connection — DDL and
// session advisory locks don't work reliably through the `-pooler` endpoint
// (Neon connection-pooling docs). Prefer the injected `DATABASE_URL_UNPOOLED`;
// fall back to deriving the direct host from the pooled `DATABASE_URL`. The
// runtime app never reads this file — it keeps using the pooled URL.
function directConnectionUrl(): string | undefined {
  if (env.DATABASE_URL_UNPOOLED) return env.DATABASE_URL_UNPOOLED
  if (!env.DATABASE_URL) return undefined
  try {
    const u = new URL(env.DATABASE_URL)
    u.host = u.host.replace('-pooler.', '.')
    return u.toString()
  } catch {
    return env.DATABASE_URL
  }
}

export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Empty only under SKIP_ENV_VALIDATION (drizzle-kit check/generate —
    // file-only, no DB connection). A real migrate always has a URL here.
    url: directConnectionUrl() ?? '',
  },
  // Pin where the migration journal lives so every tool/env agrees (these are
  // also drizzle-orm's migrator defaults, which the build-time migrate uses).
  migrations: {
    table: '__drizzle_migrations',
    schema: 'drizzle',
  },
} satisfies Config
