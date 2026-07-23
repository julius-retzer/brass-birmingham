/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { withSentryConfig } from '@sentry/nextjs'
import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {}

// Source-map upload only happens when SENTRY_AUTH_TOKEN + org/project are set
// (Vercel, build time). Without them the plugin warns and skips the upload
// rather than failing, so local dev and preview need no Sentry setup — the
// tunnel route below is still added either way.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Route events through our own origin so ad blockers can't silently eat a
  // slice of client errors (they block requests to *.sentry.io by name).
  tunnelRoute: '/monitoring-tunnel',

  // Readable stack traces: upload maps, then delete them from the deployed
  // bundle so they are not publicly served.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Keep the build log quiet unless something actually goes wrong.
  silent: !process.env.SENTRY_AUTH_TOKEN,
})
