import { NextResponse } from 'next/server'
import { setSeatReady } from '~/server/mp/game'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      token?: string
      seatId?: number
      seatSecret?: string
      ready?: boolean
    }
    const result = await setSeatReady(
      String(body.token ?? ''),
      Number(body.seatId ?? -1),
      String(body.seatSecret ?? ''),
      Boolean(body.ready),
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'Could not update ready state',
      },
      { status: 400 },
    )
  }
}
