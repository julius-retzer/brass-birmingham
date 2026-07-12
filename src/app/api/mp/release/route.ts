import { NextResponse } from 'next/server'
import { releaseSeat } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string
      seatSecret?: string
      targetSeatId?: number
    }
    await releaseSeat(
      String(body.token ?? ''),
      String(body.seatSecret ?? ''),
      Number(body.targetSeatId ?? -1),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Release failed' },
      { status: 400 },
    )
  }
}
