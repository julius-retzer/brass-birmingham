import { NextResponse } from 'next/server'
import { aiOpponentsAvailable } from '~/lib/features'
import { hasAnthropicKey, isMockMode } from '~/server/ai/provider'

export const runtime = 'nodejs'

// Public boolean the charter reads to decide whether to offer "Versus AI".
// Exposes ONLY the flag — the ANTHROPIC_API_KEY value never leaves the server.
export function GET() {
  return NextResponse.json({
    available: aiOpponentsAvailable({
      vercelEnv: process.env.VERCEL_ENV,
      hasKey: hasAnthropicKey(),
      mock: isMockMode(),
    }),
  })
}
