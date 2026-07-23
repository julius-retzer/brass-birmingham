import { NextResponse } from 'next/server'
import { archiveGame } from '~/server/mp/game'

export const runtime = 'nodejs'

// Host removes their own lobby from discovery. Authorized inside archiveGame by
// the effective host's secret — a non-host seat or a stranger is refused. This
// archives (hides) the game; it never deletes the row.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: string; seatSecret?: string }
    const result = await archiveGame(
      String(body.token ?? ''),
      String(body.seatSecret ?? ''),
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, version: result.version })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not remove the game' },
      { status: 400 },
    )
  }
}
