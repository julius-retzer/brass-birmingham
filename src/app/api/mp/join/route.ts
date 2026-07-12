import { NextResponse } from 'next/server'
import { joinGame } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
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
