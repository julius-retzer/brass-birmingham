// Next.js instrumentation hook — the SDK's server/edge entry point.
// `register()` runs once per runtime at boot; `onRequestError` is Next 15+/16's
// hook for errors thrown in server components, route handlers and middleware.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
