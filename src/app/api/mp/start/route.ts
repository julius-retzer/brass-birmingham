import { NextResponse } from 'next/server'
import { startGame } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: string; seatSecret?: string }
    const result = await startGame(
      String(body.token ?? ''),
      String(body.seatSecret ?? ''),
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not start the game' },
      { status: 400 },
    )
  }
}
