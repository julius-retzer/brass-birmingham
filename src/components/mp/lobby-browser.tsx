'use client'

// The public lobby browser: open online tables waiting for players. Discovery
// is the one thing the token-URL flow could never do — you had to be handed a
// link. This lists games still in the `lobby` phase with an open seat, and a
// Join takes you to `/g/<token>` where the existing join screen claims a seat.
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface LobbyWire {
  token: string
  name: string
  host: string | null
  capacity: number
  claimed: number
  open: boolean
  createdAt: string
}

/** Poll cadence for the list. The app syncs per-game state over an SSE DB-poll
 *  (~1.2s); a cross-game LIST has no single game to stream, so it polls the
 *  same cache-fronted endpoint on a gentle interval. */
const POLL_MS = 4000

export function LobbyBrowser() {
  const [lobbies, setLobbies] = useState<LobbyWire[] | null>(null)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/mp/lobbies', { cache: 'no-store' })
      if (!res.ok) throw new Error('bad status')
      const body = (await res.json()) as { lobbies?: LobbyWire[] }
      setLobbies(body.lobbies ?? [])
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 p-6">
      <div className="bb2-rise flex flex-col items-center gap-1 text-center">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.4em]"
          style={{ color: 'var(--bb-brass)' }}
        >
          Open tables
        </span>
        <h1
          className="bb2-display text-5xl font-black tracking-wide"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          Join a game
        </h1>
      </div>

      <div className="flex w-full max-w-lg items-center justify-between gap-2">
        <Link href="/" className="bb2-ghost-btn" data-testid="lobby-back-home">
          ← Host a game
        </Link>
        <button
          type="button"
          className="bb2-ghost-btn"
          data-testid="lobby-refresh"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>

      <div
        className="flex w-full max-w-lg flex-col gap-3"
        data-testid="lobby-list"
      >
        {lobbies === null ? (
          <p
            className="py-8 text-center text-[13px]"
            style={{ color: 'rgba(231,215,177,.55)' }}
          >
            Looking for open tables…
          </p>
        ) : lobbies.length === 0 ? (
          <div
            className="bb2-panel flex flex-col items-center gap-2 p-8 text-center"
            data-testid="lobby-empty"
          >
            <span
              className="bb2-display text-lg"
              style={{ color: 'var(--bb-parchment-bright)' }}
            >
              No open tables right now
            </span>
            <p
              className="text-[12.5px]"
              style={{ color: 'rgba(231,215,177,.5)' }}
            >
              {failed
                ? 'Could not reach the server — retrying…'
                : 'Be the first — host a game and share the link, or wait for one to open.'}
            </p>
            <Link href="/" className="bb2-confirm mt-2">
              Host a game
            </Link>
          </div>
        ) : (
          lobbies.map((l) => (
            <div
              key={l.token}
              className="bb2-panel flex items-center gap-4 p-4"
              data-testid={`lobby-row-${l.token}`}
            >
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-[15px] font-semibold"
                  style={{ color: 'var(--bb-parchment-bright)' }}
                >
                  {l.name?.trim()
                    ? l.name
                    : l.host
                      ? `${l.host}’s table`
                      : 'A table'}
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: 'rgba(231,215,177,.5)' }}
                >
                  {l.claimed} / {l.capacity} seated
                </span>
              </div>
              <Link
                href={`/g/${l.token}`}
                className="bb2-confirm ml-auto"
                data-testid={`lobby-join-${l.token}`}
              >
                Join
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
