// In-process, per-IP guardrails for the UNAUTHENTICATED multiplayer endpoints.
//
// Scope (deliberate): this is an in-memory limiter, not a durable one. Each
// serverless instance keeps its own counters, so a determined attacker spread
// across many instances is bounded per instance, not globally — that is
// accepted at friends-and-family scale (see the 2026-07-23 abuse/cost report:
// unauthenticated create was measured at 41.7 games/sec, streams unbounded).
// The alternative (Upstash/Redis) means a new vendor, which the architecture
// verdict forbids. Under Fluid compute instances are long-lived and reused, so
// in practice these counters do bite.
//
// Two primitives, both pure and unit-tested:
//   • fixed-window counter  — bounds game CREATION per IP
//   • concurrent-slot gauge — bounds simultaneously OPEN SSE streams per IP
//
// Neither identifies anyone beyond an IP bucket, and both defaults are picked
// generously so no legitimate table (≤4 players, a handful of lobbies) ever
// hits them.

/* ---------------- tunable thresholds ---------------- */

/**
 * Game creation allowance per IP per window. 30 games/hour is far beyond any
 * legitimate use (a busy games night creates a handful) while turning the
 * measured 41.7 creates/SECOND spam vector into 30/hour. Tune here.
 */
export const CREATE_LIMIT_MAX = 30
export const CREATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

/**
 * Concurrently open SSE streams allowed per IP (per instance). A household
 * behind one NAT with four players, each with a couple of tabs, stays well
 * under this; an abuser can no longer hold hundreds of 290s serverless slots
 * + ~88 Neon queries/min each from one address. Tune here.
 */
export const STREAM_CAP_PER_IP = 24

/** Soft bound on tracked keys so a scan of many IPs can't grow memory forever. */
const MAX_TRACKED_KEYS = 10_000

/* ---------------- pure primitives ---------------- */

export interface WindowEntry {
  count: number
  windowStart: number
}

/**
 * Fixed-window rate limit: consume one unit for `key`; true when allowed.
 * The window resets `windowMs` after its first hit (coarse but predictable,
 * and plenty against a 40/sec spammer).
 */
export function takeFromWindow(
  map: Map<string, WindowEntry>,
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const entry = map.get(key)
  if (!entry || now - entry.windowStart >= windowMs) {
    if (map.size >= MAX_TRACKED_KEYS) pruneExpired(map, windowMs, now)
    map.set(key, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= max) return false
  entry.count += 1
  return true
}

function pruneExpired(
  map: Map<string, WindowEntry>,
  windowMs: number,
  now: number,
): void {
  for (const [key, entry] of map) {
    if (now - entry.windowStart >= windowMs) map.delete(key)
  }
}

/**
 * Concurrent-slot gauge: claim one slot for `key`; null when the cap is
 * already held. On success returns an IDEMPOTENT release — the stream route
 * calls it from cleanup, cancel and abort paths, which can all fire.
 */
export function acquireSlot(
  map: Map<string, number>,
  key: string,
  cap: number,
): (() => void) | null {
  const held = map.get(key) ?? 0
  if (held >= cap) return null
  map.set(key, held + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const current = map.get(key) ?? 0
    if (current <= 1) map.delete(key)
    else map.set(key, current - 1)
  }
}

/* ---------------- request helper ---------------- */

/**
 * The client IP as Vercel reports it (`x-forwarded-for` is set by the
 * platform and the first entry is the real client; it cannot be spoofed
 * through Vercel's proxy). Local dev has no such header — everything shares
 * one 'local' bucket, which the generous defaults absorb.
 */
export function clientIpFrom(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  const first = fwd?.split(',')[0]?.trim()
  return first || 'local'
}

/* ---------------- HMR-safe shared state ---------------- */

const g = globalThis as unknown as {
  __bbCreateWindow?: Map<string, WindowEntry>
  __bbStreamSlots?: Map<string, number>
}
const createWindow = (g.__bbCreateWindow ??= new Map())
const streamSlots = (g.__bbStreamSlots ??= new Map())

/** May this IP create another game right now? */
export function allowCreate(ip: string, now: number = Date.now()): boolean {
  return takeFromWindow(
    createWindow,
    ip,
    CREATE_LIMIT_MAX,
    CREATE_LIMIT_WINDOW_MS,
    now,
  )
}

/** Claim an SSE stream slot for this IP; null when the cap is held. */
export function acquireStreamSlot(ip: string): (() => void) | null {
  return acquireSlot(streamSlots, ip, STREAM_CAP_PER_IP)
}
