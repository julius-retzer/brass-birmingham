import { NextResponse } from 'next/server'
import { joinGame } from '~/server/mp/game'
import {
  allowJoin,
  clientIpFrom,
  JOIN_LIMIT_WINDOW_MS,
} from '~/server/mp/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // Unauthenticated by design: a join needs only the game token, and public
  // lobby tokens are published by /api/mp/lobbies — so without this window a
  // stranger could harvest every token and squat every open seat, one HTTP
  // request per seat. See rate-limit.ts for thresholds.
  if (!allowJoin(clientIpFrom(req))) {
    return NextResponse.json(
      { error: 'Too many seat claims from this address — try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(JOIN_LIMIT_WINDOW_MS / 1000)),
        },
      },
    )
  }
  try {
    const body = (await req.json()) as { token?: string; name?: string }
    const result = await joinGame(
      String(body.token ?? ''),
      String(body.name ?? ''),
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not join the game' },
      { status: 400 },
    )
  }
}
