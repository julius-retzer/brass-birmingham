import { NextResponse } from 'next/server'
import { captureMpError } from '~/server/observability'
import { startGame } from '~/server/mp/game'
import { isExpectedMpError } from '~/server/mp/expected-errors'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let token: string | undefined
  try {
    const body = (await req.json()) as { token?: string; seatSecret?: string }
    token = String(body.token ?? '')
    const result = await startGame(token, String(body.seatSecret ?? ''))
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (e) {
    // Engine setup runs here (deal, shuffle, first snapshot) — a throw is a
    // real bug, not a lobby refusal, so it must reach Sentry with the token.
    if (!isExpectedMpError(e)) {
      captureMpError(e, { route: 'api/mp/start', token, phase: 'lobby' })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not start the game' },
      { status: 400 },
    )
  }
}
