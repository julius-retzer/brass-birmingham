import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// Ephemeral per-run Neon branch lifecycle for LOCAL test runs.
//
// CI (see .github/workflows/ci.yml) branches a throwaway DB off the long-lived,
// pre-migrated `ci` parent for each run via neondatabase/create-branch-action.
// This is the local-machine equivalent, driven through the official Neon
// TypeScript SDK (@neondatabase/api-client) so `pnpm test` on a laptop stops
// sharing the `dev` branch and parallel runs cannot collide. Wired into vitest
// via `globalSetup` (src/test/global-db-branch.ts) — created once before the
// run, deleted in teardown.
//
// Credential: `NEON_API_KEY` from the process env, else `.env.local` (the repo's
// T3/Next convention; gitignored). Absent → the caller skips branching and
// degrades to the existing DATABASE_URL (offline never hard-fails).
import { EndpointType, createApiClient } from '@neondatabase/api-client'

// Same brass-scoped project + parent the CI workflow uses. The `ci` parent is
// pre-migrated, so a copy-on-write branch inherits the schema instantly.
const DEFAULT_PROJECT_ID = 'muddy-night-85782525'
const PARENT_BRANCH_NAME = 'ci'
const BRANCH_PREFIX = 'local-test'
// Orphan backstop: even if teardown never runs (crash, SIGKILL), Neon reaps the
// branch after this. Teardown is still the primary cleanup path.
const TTL_HOURS = 2

export interface EphemeralBranch {
  id: string
  name: string
  connectionUri: string
}

// Minimal `.env.local` reader — the repo's env convention (T3/Next) with no
// dotenv dependency. Parsed once; only sources the optional NEON_API_KEY /
// NEON_PROJECT_ID — the app's real DATABASE_URL still flows via `~/env`.
let envLocalCache: Record<string, string> | null = null
function readEnvLocal(): Record<string, string> {
  if (envLocalCache) return envLocalCache
  const out: Record<string, string> = {}
  try {
    const text = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const m = line.match(
        /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
      )
      const key = m?.[1]
      if (!key) continue
      let val = (m[2] ?? '').trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      out[key] = val
    }
  } catch {
    // No `.env.local` — fine; the caller degrades gracefully.
  }
  envLocalCache = out
  return out
}

/**
 * Resolve the Neon API key: the `NEON_API_KEY` env var wins (CI repo secret /
 * disposable worktrees), otherwise `NEON_API_KEY` from `.env.local` (local
 * dev). Returns `null` when neither is present so callers degrade gracefully.
 */
export function resolveNeonApiKey(): string | null {
  const fromEnv = process.env.NEON_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const fromFile = readEnvLocal().NEON_API_KEY?.trim()
  return fromFile || null
}

/**
 * Resolve the shared long-lived test-branch URL used by the no-ephemeral
 * fallback: `TEST_DATABASE_URL` from the process env, else `.env.local`. This
 * is the dedicated Neon `test` branch — NEVER `dev`. Returns `null` when unset.
 */
export function resolveTestDatabaseUrl(): string | null {
  const fromEnv = process.env.TEST_DATABASE_URL?.trim()
  if (fromEnv) return fromEnv
  const fromFile = readEnvLocal().TEST_DATABASE_URL?.trim()
  return fromFile || null
}

/** Project id: `NEON_PROJECT_ID` env / `.env.local`, else the brass default. */
function resolveProjectId(): string {
  return (
    process.env.NEON_PROJECT_ID?.trim() ||
    readEnvLocal().NEON_PROJECT_ID?.trim() ||
    DEFAULT_PROJECT_ID
  )
}

type NeonApi = ReturnType<typeof createApiClient>

async function resolveParentBranchId(
  api: NeonApi,
  projectId: string,
): Promise<string> {
  const res = await api.listProjectBranches({
    projectId,
    search: PARENT_BRANCH_NAME,
  })
  // `search` is a partial match — pin the exact parent by name.
  const parent = res.data.branches.find((b) => b.name === PARENT_BRANCH_NAME)
  if (!parent) {
    throw new Error(
      `parent branch "${PARENT_BRANCH_NAME}" not found in project ${projectId}`,
    )
  }
  return parent.id
}

/** Create an ephemeral branch off `ci` with a short TTL and return its id +
 * connection string. Rejects on failure (the caller decides how to degrade). */
export async function createBranch(apiKey: string): Promise<EphemeralBranch> {
  const api = createApiClient({ apiKey })
  const projectId = resolveProjectId()
  const parentId = await resolveParentBranchId(api, projectId)
  const name = `${BRANCH_PREFIX}-${randomBytes(4).toString('hex')}`
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000).toISOString()
  const res = await api.createProjectBranch(projectId, {
    // A read-write compute is what yields a connection URI in the response.
    endpoints: [{ type: EndpointType.ReadWrite }],
    branch: { parent_id: parentId, name, expires_at: expiresAt },
  })
  const id = res.data.branch?.id
  const connectionUri = res.data.connection_uris?.[0]?.connection_uri
  if (!id || !connectionUri) {
    throw new Error('Neon create returned no branch id / connection_uri')
  }
  return { id, name, connectionUri }
}

/** Delete an ephemeral branch. The TTL is the backstop if this ever fails. */
export async function deleteBranch(id: string, apiKey: string): Promise<void> {
  const api = createApiClient({ apiKey })
  await api.deleteProjectBranch({ projectId: resolveProjectId(), branchId: id })
}
