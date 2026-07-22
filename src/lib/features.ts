// AI opponents are server-driven and not ready for prod yet (captain's call,
// 2026-07-16) — gated off production, on everywhere else (dev, preview, CI).
// Vercel sets VERCEL_ENV server-side and mirrors it to NEXT_PUBLIC_VERCEL_ENV
// for the client automatically; pass whichever is in scope.
export function aiOpponentsEnabled(vercelEnv: string | undefined): boolean {
  return vercelEnv !== 'production'
}

// Whether AI opponents can ACTUALLY be created right now. On top of the
// production feature gate above, the server needs an LLM key (ANTHROPIC_API_KEY)
// or the offline mock provider (BB_AI_MOCK=1). Pure so it stays unit-testable
// and reads no secrets itself — the caller passes booleans derived server-side;
// the key VALUE never reaches the client, only this flag does.
export function aiOpponentsAvailable(opts: {
  vercelEnv: string | undefined
  hasKey: boolean
  mock: boolean
}): boolean {
  return aiOpponentsEnabled(opts.vercelEnv) && (opts.hasKey || opts.mock)
}
