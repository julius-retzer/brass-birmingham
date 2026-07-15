import { NextResponse } from 'next/server'
import { sendChat } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string
      seatId?: number
      seatSecret?: string
      text?: string
    }
    if (typeof body.text !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing text' },
        { status: 400 },
      )
    }
    const result = await sendChat(
      String(body.token ?? ''),
      Number(body.seatId ?? -1),
      String(body.seatSecret ?? ''),
      body.text,
    )
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Chat failed' },
      { status: 400 },
    )
  }
}
