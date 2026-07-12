import { NextResponse } from 'next/server'
import { createGame } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; playerCount?: number }
    const result = await createGame(
      String(body.name ?? ''),
      Number(body.playerCount ?? 0),
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not create the game' },
      { status: 400 },
    )
  }
}
