import { NextResponse } from 'next/server'
import { aiOpponentsEnabled } from '~/lib/features'
import { isAiTierId } from '~/server/ai/types'
import { captureMpError } from '~/server/observability'
import { createGame } from '~/server/mp/game'
import { isExpectedMpError } from '~/server/mp/expected-errors'
import { allowCreate, clientIpFrom } from '~/server/mp/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // Unauthenticated by design ("no accounts, ever"), so the only brake on
  // mass creation is this per-IP window — see rate-limit.ts for thresholds.
  if (!allowCreate(clientIpFrom(req))) {
    return NextResponse.json(
      { error: 'Too many games created from this address — try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    )
  }
  try {
    const body = (await req.json()) as {
      name?: string
      /** optional short table name shown in the lobby browser + masthead */
      gameName?: string
      /** 'private' hides the table from the public lobby list */
      visibility?: unknown
      playerCount?: number
      /** seats 1..n-1: 'human' or an AI tier id */
      opponents?: unknown[]
    }
    const opponents = (body.opponents ?? []).map((o) =>
      isAiTierId(o) ? o : ('human' as const),
    )
    const visibility = body.visibility === 'private' ? 'private' : 'public'
    if (
      opponents.some((o) => o !== 'human') &&
      !aiOpponentsEnabled(process.env.VERCEL_ENV)
    ) {
      return NextResponse.json(
        { error: 'AI opponents are not available in production yet' },
        { status: 403 },
      )
    }
    const result = await createGame(
      String(body.name ?? ''),
      Number(body.playerCount ?? 0),
      opponents,
      { name: String(body.gameName ?? ''), visibility },
    )
    return NextResponse.json(result)
  } catch (e) {
    // Create touches the DB (and the TTL sweep) before any game exists, so
    // there is no token yet — the route tag is the whole diagnosis here.
    if (!isExpectedMpError(e)) {
      captureMpError(e, { route: 'api/mp/create', phase: 'lobby' })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not create the game' },
      { status: 400 },
    )
  }
}
