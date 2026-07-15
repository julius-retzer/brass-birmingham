import { waitUntil } from '@vercel/functions'
import { NextResponse } from 'next/server'
import { actInGame, kickAiTurns } from '~/server/mp/game'

export const runtime = 'nodejs'
// A move may kick a multi-step AI turn (model calls); keep the instance alive
// long enough for the waitUntil'd runner. Requires Fluid compute on the
// project (300s default on all plans incl. Hobby once Fluid is enabled).
export const maxDuration = 300

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
    const token = String(body.token ?? '')
    const result = await actInGame(
      token,
      Number(body.seatId ?? -1),
      String(body.seatSecret ?? ''),
      body.event,
    )
    // The AI turn-runner is fire-and-forget inside actInGame; on serverless the
    // instance freezes once the response returns, killing the detached runner.
    // waitUntil ties its lifetime to this invocation so an AI turn can finish.
    if (result.ok) waitUntil(kickAiTurns(token))
    // Response carries the actor's own fresh per-seat view + version so the
    // client applies its authoritative result immediately (see actInGame).
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Action failed' },
      { status: 400 },
    )
  }
}
