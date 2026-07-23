// Sentry init for the browser. Next 15+/16 loads this file automatically (it
// replaced the old `sentry.client.config.ts`).
//
// NO Session Replay and NO profiling — deliberate: replay records the game
// board and chat (PII) and burns the free tier. Errors only.
import * as Sentry from '@sentry/nextjs'
import { sharedSentryOptions } from '~/lib/sentry-options'

Sentry.init({
  ...sharedSentryOptions,
  // Default browser integrations minus anything that ships payloads we do not
  // want (replay/feedback are not added by default, but be explicit about it).
  integrations: (defaults) =>
    defaults.filter(
      (i) => !['Replay', 'ReplayCanvas', 'Feedback'].includes(i.name),
    ),
})

// Required for Next.js navigation instrumentation (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
