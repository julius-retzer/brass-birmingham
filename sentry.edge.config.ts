// Sentry init for the Vercel Edge runtime (middleware / edge routes). brass
// has no edge routes today, but the Next.js SDK still needs this file wired so
// anything that later runs on the edge reports through the same scrubber.
import * as Sentry from '@sentry/nextjs'
import { sharedSentryOptions } from '~/lib/sentry-options'

Sentry.init({
  ...sharedSentryOptions,
})
