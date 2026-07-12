import { NextResponse } from 'next/server'
import { actInGame } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string
      seatId?: number
      seatSecret?: string
      event?: { type: string } & Record<string, unknown>
    }
    if (!body.event || typeof body.event.type !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing event' },
        { status: 400 },
      )
    }
    const result = await actInGame(
      String(body.token ?? ''),
      Number(body.seatId ?? -1),
      String(body.seatSecret ?? ''),
      body.event,
    )
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Action failed' },
      { status: 400 },
    )
  }
}
