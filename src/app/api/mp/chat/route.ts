import { waitUntil } from '@vercel/functions'
import { NextResponse } from 'next/server'
import { kickAiTurns, sendChat } from '~/server/mp/game'
import {
  allowChat,
  CHAT_LIMIT_WINDOW_MS,
  clientIpFrom,
} from '~/server/mp/rate-limit'

export const runtime = 'nodejs'
// Symmetric with the act route: a chat never advances the turn, but keeping
// the same maxDuration + waitUntil shape means a message sent during an AI
// turn re-attaches (never restarts) the in-flight runner to this invocation.
export const maxDuration = 300

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
    const token = String(body.token ?? '')
    const seatId = Number(body.seatId ?? -1)
    // Chat is the one seat-authenticated endpoint whose cost is per-MESSAGE
    // spam rather than per-seat, so it carries its own window. The seat bucket
    // is keyed by IP too — this runs before the secret is checked, and a bare
    // token+seat key would let a stranger burn a real player's allowance.
    const ip = clientIpFrom(req)
    if (!allowChat(ip, `${ip}|${token}|${seatId}`)) {
      return NextResponse.json(
        { ok: false, error: 'Sending messages too quickly — slow down.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(CHAT_LIMIT_WINDOW_MS / 1000)),
          },
        },
      )
    }
    const result = await sendChat(
      token,
      seatId,
      String(body.seatSecret ?? ''),
      body.text,
    )
    if (result.ok) waitUntil(kickAiTurns(token))
    // Response carries the sender's fresh per-seat view + version (incl. the
    // new message) so it applies immediately, same path as an SSE frame.
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Chat failed' },
      { status: 400 },
    )
  }
}
