import { waitUntil } from '@vercel/functions'
import { NextResponse } from 'next/server'
import { captureMpError } from '~/server/observability'
import { actInGame, kickAiTurns } from '~/server/mp/game'
import { isExpectedMpError } from '~/server/mp/expected-errors'

export const runtime = 'nodejs'
// A move may kick a multi-step AI turn (model calls); keep the instance alive
// long enough for the waitUntil'd runner. Requires Fluid compute on the
// project (300s default on all plans incl. Hobby once Fluid is enabled).
export const maxDuration = 300

export async function POST(req: Request) {
  // Populated as soon as the body parses, so a throw further down still
  // reports WHICH game / seat / event blew up (see observability.ts).
  let token: string | undefined
  let seatId: number | undefined
  let eventType: string | undefined
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
    token = String(body.token ?? '')
    seatId = Number(body.seatId ?? -1)
    eventType = body.event.type
    const result = await actInGame(
      token,
      seatId,
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
    // A move that throws is a genuine server fault (rule refusals come back as
    // an `{ok:false}` result, never an exception) — report it with the game,
    // seat and machine event so it is diagnosable, never just "400 somewhere".
    if (!isExpectedMpError(e)) {
      captureMpError(e, {
        route: 'api/mp/act',
        token,
        seatId,
        eventType,
      })
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Action failed' },
      { status: 400 },
    )
  }
}
