// SSE stream: the client's live window onto its per-seat filtered view.
// Sends the current view on connect and on every game change; EventSource
// reconnects automatically after dev-server restarts (the store is on disk).
import { type NextRequest } from 'next/server'
import { getGameView, kickAiTurns, subscribe } from '~/server/mp/game'
import { loadGame } from '~/server/mp/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const token = params.get('token') ?? ''
  const seatParam = params.get('seat')
  const seatId = seatParam === null ? null : Number(seatParam)
  const secret = params.get('secret')

  const game = await loadGame(token).catch(() => null)
  if (!game) return new Response('Game not found', { status: 404 })

  // Recovery: if the server restarted mid-AI-turn, the first client to
  // reconnect restarts the turn-runner (no-op when it's a human's turn).
  kickAiTurns(token)

  const encoder = new TextEncoder()
  let unsub = () => {}
  let ping: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      let open = true
      const write = (chunk: string) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          open = false
        }
      }
      const push = async () => {
        const view = await getGameView(token, seatId, secret)
        if (view) write(`data: ${JSON.stringify(view)}\n\n`)
      }
      unsub = subscribe(token, () => {
        void push()
      })
      ping = setInterval(() => write(': ping\n\n'), 15_000)
      void push()
      req.signal.addEventListener('abort', () => {
        open = false
        unsub()
        if (ping) clearInterval(ping)
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
    cancel() {
      unsub()
      if (ping) clearInterval(ping)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
