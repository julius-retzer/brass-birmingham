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
//   • fixed-window counter  — bounds game CREATION, seat JOINs and CHAT per IP
//   • concurrent-slot gauge — bounds simultaneously OPEN SSE streams per IP
//
// Neither identifies anyone beyond an IP bucket, and both defaults are picked
// generously so no legitimate table (≤4 players, a handful of lobbies) ever
// hits them.
//
// COVERAGE IS DELIBERATE. Only the endpoints an UNAUTHENTICATED stranger can
// reach are limited: create, stream, join and chat. `act`/`ready`/`start`/
// `release` all demand a valid per-seat secret (128-bit, handed out only by a
// successful join), so they are not a stranger-reachable surface — and join,
// which is the gate to getting such a secret, IS limited here. Chat needs a
// seat too, but it is the one authenticated endpoint whose cost is per-MESSAGE
// spam rather than per-seat, so it gets its own bucket.

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

/**
 * Seat JOINs allowed per IP per window. This is the lobby-SQUATTING brake:
 * public lobby tokens are handed out by `GET /api/mp/lobbies`, so a stranger
 * can harvest every token and claim every open seat at one HTTP request each.
 *
 * Sized so a real household never notices. A whole 4-player table filling up
 * from behind ONE NAT is 4 joins; add re-joins after a refresh, a dropped
 * connection or a release-and-reclaim and a heavy games night is still well
 * inside 40 per 10 minutes. An abuser gets 40 seats per 10 min per instance
 * instead of unbounded. Tune here.
 */
export const JOIN_LIMIT_MAX = 40
export const JOIN_LIMIT_WINDOW_MS = 10 * 60 * 1000

/**
 * Chat messages allowed per SEAT per window. A seat secret is required to
 * chat, so this bounds spam from a legitimately seated player (or a leaked
 * secret) rather than a stranger. 30 messages/minute is far past conversation
 * pace — roughly one every two seconds, sustained. Tune here.
 */
export const CHAT_SEAT_LIMIT_MAX = 30
export const CHAT_LIMIT_WINDOW_MS = 60 * 1000

/**
 * Chat messages allowed per IP per window, over the same window. Four players
 * behind one NAT each chatting at the per-seat ceiling would be 120, so this
 * only bites when a single address is driving many seats at once. Tune here.
 */
export const CHAT_IP_LIMIT_MAX = 120

/** Hard bound on tracked keys so a scan of many IPs can't grow memory forever. */
export const MAX_TRACKED_KEYS = 10_000

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
    if (map.size >= MAX_TRACKED_KEYS) {
      pruneExpired(map, windowMs, now)
      // Prune only drops EXPIRED windows; under a distributed unique-IP scan
      // every window is still active, so it frees nothing and the map would
      // grow unbounded. Fail closed: refuse the new key (treated as
      // rate-limited) rather than defeat the very bound this guardrail exists
      // to hold. The generous CREATE_LIMIT_MAX means a real IP is never the
      // 10,000th distinct active key.
      if (map.size >= MAX_TRACKED_KEYS) return false
    }
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
  __bbJoinWindow?: Map<string, WindowEntry>
  __bbChatWindow?: Map<string, WindowEntry>
}
const createWindow = (g.__bbCreateWindow ??= new Map())
const streamSlots = (g.__bbStreamSlots ??= new Map())
const joinWindow = (g.__bbJoinWindow ??= new Map())
// One map for both chat buckets — the keys are prefixed and so cannot collide.
const chatWindow = (g.__bbChatWindow ??= new Map())

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

/** May this IP claim another seat right now? */
export function allowJoin(ip: string, now: number = Date.now()): boolean {
  return takeFromWindow(
    joinWindow,
    ip,
    JOIN_LIMIT_MAX,
    JOIN_LIMIT_WINDOW_MS,
    now,
  )
}

/**
 * May this seat send another chat message right now? Both buckets are
 * consumed, per-SEAT first so a single noisy seat is stopped before it can
 * spend its housemates' shared per-IP allowance.
 *
 * `seatKey` MUST include the caller's IP (see the chat route): the check runs
 * before the seat secret is verified, so a key of token+seat alone would let a
 * stranger POST forged seat ids to exhaust a real player's chat allowance.
 */
export function allowChat(
  ip: string,
  seatKey: string,
  now: number = Date.now(),
): boolean {
  const seatOk = takeFromWindow(
    chatWindow,
    `seat:${seatKey}`,
    CHAT_SEAT_LIMIT_MAX,
    CHAT_LIMIT_WINDOW_MS,
    now,
  )
  if (!seatOk) return false
  return takeFromWindow(
    chatWindow,
    `ip:${ip}`,
    CHAT_IP_LIMIT_MAX,
    CHAT_LIMIT_WINDOW_MS,
    now,
  )
}

/** Claim an SSE stream slot for this IP; null when the cap is held. */
export function acquireStreamSlot(ip: string): (() => void) | null {
  return acquireSlot(streamSlots, ip, STREAM_CAP_PER_IP)
}
