// Sentry init for the Node.js server runtime (API routes, server components,
// the AI turn runner). Loaded by `instrumentation.ts`'s `register()`.
//
// With no NEXT_PUBLIC_SENTRY_DSN this initialises disabled — the app runs
// exactly as before, just without reporting. Errors only: no profiling
// (`profilesSampleRate` unset) and no replay. See src/lib/sentry-options.ts.
import * as Sentry from '@sentry/nextjs'
import { sharedSentryOptions } from '~/lib/sentry-options'

Sentry.init({
  ...sharedSentryOptions,
})
