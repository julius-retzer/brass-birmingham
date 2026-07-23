// One place for the Sentry init options shared by the client, server and edge
// runtimes. Keeping it here (rather than copy-pasting three near-identical
// `Sentry.init` blocks) means the scrubbing and the sampling can never drift
// between runtimes — a leak on ONE surface is a leak.
//
// FREE-TIER POSTURE, deliberate:
//   • errors only — no Session Replay (PII + quota), no profiling.
//   • `tracesSampleRate` is tiny and env-overridable; the SSE stream alone
//     would otherwise mint a transaction every ~1.2s per open tab.
//   • no DSN ⇒ the SDK initialises into a no-op. Local dev, CI and previews
//     build and run identically, just without reporting. Nothing in the app
//     may depend on Sentry being live.
import { scrubEvent } from './sentry-scrub'

/** The DSN is public by design (it only permits ingest), hence NEXT_PUBLIC_. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

/** True when a DSN is configured; false ⇒ every capture is a silent no-op. */
export const sentryEnabled = !!SENTRY_DSN

/** Fraction of transactions sampled. Default 1%; override per-environment. */
export function tracesSampleRate(
  raw: string | undefined = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
): number {
  if (raw === undefined || raw.trim() === '') return 0.01
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0.01
  return parsed
}

/**
 * Options every runtime passes to `Sentry.init`. `beforeSend`/
 * `beforeSendTransaction` are the last gate before an event leaves the
 * process — see sentry-scrub.ts for what they strip and why.
 */
export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: sentryEnabled,
  tracesSampleRate: tracesSampleRate(),
  // Errors only: no replay, no profiling, no PII.
  sendDefaultPii: false,
  // Keep local/CI consoles quiet; Vercel logs already carry our own lines.
  debug: false,
  // Typed as identity-preserving generics so ONE implementation satisfies the
  // SDK's three different callback signatures (ErrorEvent / TransactionEvent /
  // Breadcrumb) without this module importing any Sentry type.
  beforeSend: <T>(event: T): T => scrubEvent(event),
  beforeSendTransaction: <T>(event: T): T => scrubEvent(event),
  // A fetch/xhr breadcrumb carries the full URL — the SSE stream URL holds
  // `?secret=…`, so a crumb must go through the same scrubber as an event.
  beforeBreadcrumb: <T>(crumb: T): T => scrubEvent(crumb),
}
