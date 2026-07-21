import { NextResponse } from 'next/server'
import { listLobbies } from '~/server/mp/game'

export const runtime = 'nodejs'

// Public: the lobby browser advertises open tables (token + counts only, no
// secrets, no snapshot). A short shared cache keeps refresh-spam off the DB —
// same egress discipline as /api/stats.
export async function GET() {
  try {
    const lobbies = await listLobbies()
    return NextResponse.json(
      { lobbies },
      { headers: { 'Cache-Control': 's-maxage=5, stale-while-revalidate=15' } },
    )
  } catch {
    // A failing list must never break the page — return an empty list.
    return NextResponse.json({ lobbies: [] })
  }
}
