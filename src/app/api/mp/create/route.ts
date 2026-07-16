import { NextResponse } from 'next/server'
import { aiOpponentsEnabled } from '~/lib/features'
import { isAiTierId } from '~/server/ai/types'
import { createGame } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string
      playerCount?: number
      /** seats 1..n-1: 'human' or an AI tier id */
      opponents?: unknown[]
    }
    const opponents = (body.opponents ?? []).map((o) =>
      isAiTierId(o) ? o : ('human' as const),
    )
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
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not create the game' },
      { status: 400 },
    )
  }
}
