// Server-side error reporting for the multiplayer surface.
//
// Before this module the whole MP server had exactly ONE `console.error` (the
// AI turn runner) and every other failure was swallowed into an `{ok:false}`
// the client rendered as a toast — so a prod break was invisible. Every
// capture site therefore does TWO things:
//   1. writes a structured server log line (works with no Sentry at all, which
//      is the local/CI/preview default), and
//   2. reports to Sentry with enough context to answer "which game, which
//      player, which action" — never just "500 somewhere".
//
// Context is STRUCTURED (tags + a named context block), never string
// concatenation, so events group by route and filter by token in the UI.
//
// The Sentry SDK is imported LAZILY and only when a DSN is configured: with no
// DSN this file is a console-only logger and the SDK is never even loaded (it
// keeps the offline unit suites and DSN-less builds completely unaffected).
import { sentryEnabled } from '~/lib/sentry-options'
import { scrubValue } from '~/lib/sentry-scrub'

export interface MpErrorContext {
  /** Where it broke — an API route path or a `module.function` name.
   *  Becomes the `route` tag, so events group per surface. */
  route: string
  /** The game's public token. NOT a credential (acting needs a seat secret)
   *  and the only way to find the game, so it is reported verbatim. */
  token?: string | null
  /** Lifecycle phase of the game record: 'lobby' | 'playing' | 'over' | … */
  phase?: string | null
  /** Seat index the request acted as / on. Never the seat SECRET. */
  seatId?: number | null
  /** Machine event type for an `act` intent (`BUILD`, `CONFIRM`, …). */
  eventType?: string | null
  /** Anything else worth seeing on the event. Deep-scrubbed before send. */
  extra?: Record<string, unknown>
}

/** Tag values must be strings; drop the tag entirely when there is nothing. */
function tagsFrom(ctx: MpErrorContext): Record<string, string> {
  const tags: Record<string, string> = { route: ctx.route }
  if (ctx.token) tags['mp.token'] = ctx.token
  if (ctx.phase) tags['mp.phase'] = ctx.phase
  if (typeof ctx.seatId === 'number' && ctx.seatId >= 0) {
    tags['mp.seat'] = String(ctx.seatId)
  }
  if (ctx.eventType) tags['mp.event'] = ctx.eventType
  return tags
}

/** The console half — always runs, DSN or not. */
function logLine(err: unknown, ctx: MpErrorContext): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error(
    `[mp] ${ctx.route} failed`,
    scrubValue({
      token: ctx.token ?? undefined,
      phase: ctx.phase ?? undefined,
      seat: ctx.seatId ?? undefined,
      event: ctx.eventType ?? undefined,
      ...ctx.extra,
    }),
    detail,
  )
}

/**
 * Report a server-side failure. Never throws and never awaits the transport —
 * a capture must not be able to break, slow or fail the request it describes.
 */
export function captureMpError(err: unknown, ctx: MpErrorContext): void {
  logLine(err, ctx)
  if (!sentryEnabled) return
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(err, {
        tags: tagsFrom(ctx),
        contexts: {
          multiplayer: scrubValue({
            route: ctx.route,
            token: ctx.token ?? null,
            phase: ctx.phase ?? null,
            seatId: ctx.seatId ?? null,
            eventType: ctx.eventType ?? null,
            ...ctx.extra,
          }) as Record<string, unknown>,
        },
      })
    })
    .catch(() => {
      // reporting must never cascade into a second failure
    })
}

/**
 * Wrap an API route handler so an unhandled throw is captured with route
 * context and then rethrown for the handler's own error response. Used by the
 * MP routes, whose `catch` blocks previously turned every crash into a silent
 * 400.
 */
export async function withMpCapture<T>(
  ctx: MpErrorContext,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (err) {
    captureMpError(err, ctx)
    throw err
  }
}
