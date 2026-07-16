// Teach the Neon serverless driver to talk to a LOCAL Neon HTTP proxy.
//
// `@neondatabase/serverless` speaks Neon's HTTP protocol, not the Postgres wire
// protocol, and its default endpoint builder is hard-wired to the cloud
// (`https://<api-host>/sql`). The local stack in compose.yaml terminates that
// same protocol as plain HTTP on :4444, so the driver needs to be pointed at it.
//
// Deliberately env-free: the test harness imports this WITHOUT pulling in `~/env`
// (see src/test/local-db.ts), which is why the check takes a url argument rather
// than reading DATABASE_URL itself.
import { neonConfig } from '@neondatabase/serverless'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** Is this DATABASE_URL pointing at a local Neon HTTP proxy rather than Neon cloud? */
export function isLocalProxyUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * Point the driver at the local proxy — but ONLY for a local URL.
 *
 * `neonConfig.fetchEndpoint` is global and the cloud default does more than
 * prepend a scheme (it rewrites the host to `api.*`). Overriding it
 * unconditionally would therefore break every real Neon connection, so a
 * non-local url leaves the driver's own default untouched.
 */
export function configureLocalProxy(url: string): void {
  if (!isLocalProxyUrl(url)) return
  neonConfig.fetchEndpoint = (host, port) => `http://${host}:${port}/sql`
}
