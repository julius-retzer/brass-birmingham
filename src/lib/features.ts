// AI opponents are server-driven and not ready for prod yet (captain's call,
// 2026-07-16) — gated off production, on everywhere else (dev, preview, CI).
// Vercel sets VERCEL_ENV server-side and mirrors it to NEXT_PUBLIC_VERCEL_ENV
// for the client automatically; pass whichever is in scope.
export function aiOpponentsEnabled(vercelEnv: string | undefined): boolean {
  return vercelEnv !== 'production'
}
