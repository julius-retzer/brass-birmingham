// Guarded wrapper around `drizzle-kit push`.
//
// WHY: `push` diffs schema.ts straight onto a database and writes NO migration
// journal row. That is exactly what drifted prod (2026-07-21 incident) — the
// journal fell behind reality and every deploy's `migrate` then broke on DDL
// that already existed. So `push` must NEVER touch a long-lived database
// (prod/main/preview/dev). Roll those forward with committed migrations only:
//   pnpm db:generate   # author the migration
//   pnpm db:migrate    # apply it (direct/unpooled connection)
//
// This wrapper allows `push` ONLY against a clearly-disposable target:
//   - a local database (localhost / 127.x / *.localhost — the docker test DB),
//   - or, with an explicit BB_ALLOW_REMOTE_PUSH=1 opt-in, a throwaway Neon
//     branch you have personally confirmed is disposable (loud warning shown).
// Everything else is refused. `push` stays available for rapid local
// prototyping; it is mechanically hard to point at anything long-lived.

import { spawnSync } from 'node:child_process'

/**
 * @param {string} host
 * @returns {boolean}
 */
function isLocalHost(host) {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host.endsWith('.localhost')
  )
}

/**
 * Pure decision: may `drizzle-kit push` run against this env? Split out (no I/O)
 * so it is unit-tested offline — see `scripts/guarded-push.test.ts`. Mirrors the
 * repo's shell/pure split (e.g. `decideMigration`, `mp/refusal.ts`).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ action: 'allow' | 'refuse', reason: string }}
 */
export function decidePush(env) {
  const url = env.DATABASE_URL
  if (!url) {
    return {
      action: 'refuse',
      reason:
        'DATABASE_URL is not set. `push` needs an explicit disposable target; refusing.',
    }
  }
  let host
  try {
    host = new URL(url).hostname
  } catch {
    return {
      action: 'refuse',
      reason: `DATABASE_URL is not a parseable URL (${url}); refusing to push.`,
    }
  }
  if (isLocalHost(host)) {
    return {
      action: 'allow',
      reason: `local database (${host}) — push allowed.`,
    }
  }
  if (env.BB_ALLOW_REMOTE_PUSH === '1') {
    return {
      action: 'allow',
      reason: `remote host ${host} allowed via BB_ALLOW_REMOTE_PUSH=1 — you asserted this is a THROWAWAY branch, never prod/main/preview/dev.`,
    }
  }
  return {
    action: 'refuse',
    reason:
      `refusing to push to non-local host ${host}. push writes no migration ` +
      'journal row and must never touch a long-lived DB (prod/main/preview/dev) ' +
      '— use `pnpm db:generate` + `pnpm db:migrate` there. For a throwaway Neon ' +
      'branch you have confirmed is disposable, re-run with BB_ALLOW_REMOTE_PUSH=1.',
  }
}

function main() {
  const decision = decidePush(process.env)
  if (decision.action === 'refuse') {
    console.error(`[guarded-push] ${decision.reason}`)
    process.exit(1)
  }
  console.warn(`[guarded-push] ${decision.reason}`)
  const res = spawnSync('pnpm', ['exec', 'drizzle-kit', 'push'], {
    stdio: 'inherit',
  })
  process.exit(res.status ?? 1)
}

// Only run the side-effecting push when invoked as the entrypoint, so the test
// can import `decidePush` without spawning anything.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
