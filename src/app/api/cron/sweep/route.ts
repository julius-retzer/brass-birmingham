import { NextResponse } from 'next/server'
import { authorizeCron } from '~/server/mp/cron-auth'
import { archiveStaleLobbies } from '~/server/mp/store'

export const runtime = 'nodejs'
// Never cache a mutation endpoint.
export const dynamic = 'force-dynamic'

// Weekly archive sweep (Vercel Cron — see vercel.json `crons`). Vercel invokes
// this with `Authorization: Bearer <CRON_SECRET>`; only that authorized caller
// may trigger it. It ARCHIVES never-started stale lobbies (does not delete any
// row) so they drop off the public lobby list while surviving for analytics.
export async function GET(req: Request) {
  const auth = authorizeCron(
    req.headers.get('authorization'),
    process.env.CRON_SECRET,
  )
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status ?? 401 },
    )
  }
  try {
    const archived = await archiveStaleLobbies()
    return NextResponse.json({ ok: true, archived })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sweep failed' },
      { status: 500 },
    )
  }
}
