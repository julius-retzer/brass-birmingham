// SSE stream: the client's live window onto its per-seat filtered view.
//
// DB-AS-BUS MODEL. On serverless there is no single long-lived process, so
// this stream is NOT a passive push subscriber — it is a server-side polling
// loop with an open pipe to the client. The delivery GUARANTEE is a cheap
// `loadVersion` DB poll every ~1.2s: the `games.version` column IS the event
// bus, and any instance can read it. The in-process `subscribe()` bus is kept
// only as a same-instance FAST PATH (zero-latency when the writer and this
// stream share a Fluid-reused instance); every push is deduped by version so
// the bus and the poll never double-send.
//
// The stream is bounded by design: it closes cleanly just before `maxDuration`
// and the client's EventSource reconnects (a `retry` hint shortens the gap).
// The first frame on every (re)connect is the full current view, and the
// client's version guard makes overlap/reorder harmless.
import { type NextRequest } from 'next/server'
import { getGameView, kickAiTurns, subscribe } from '~/server/mp/game'
import { loadGame, loadVersion } from '~/server/mp/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Requires Fluid compute on the project (300s default on all plans, incl.
// Hobby, once Fluid is enabled). Without it the platform default (~10s) kills
// the stream and every viewer reconnect-storms.
export const maxDuration = 300

/** DB version-poll cadence — the delivery guarantee. */
const POLL_INTERVAL_MS = 1_200
/** Close before the 300s function cap so EventSource reconnects on our terms. */
const MAX_STREAM_MS = 290_000
/** Reconnect hint: bridge the close→reopen gap in ~1.5s (Chrome default ~4s). */
const RETRY_HINT_MS = 1_500
/** Comment ping to keep an idle connection alive through intermediaries. */
const PING_INTERVAL_MS = 15_000

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
  void kickAiTurns(token)

  const encoder = new TextEncoder()
  let unsub = () => {
    // replaced by the real unsubscribe once the stream starts
  }

  const stream = new ReadableStream({
    start(controller) {
      let open = true
      let lastSent = -1
      let pollTimer: ReturnType<typeof setTimeout> | undefined

      const write = (chunk: string) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          open = false
        }
      }

      const cleanup = () => {
        open = false
        unsub()
        if (pollTimer) clearTimeout(pollTimer)
        if (closeTimer) clearTimeout(closeTimer)
        if (ping) clearInterval(ping)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      // Serialize pushes so the bus fast-path and the poll loop can't race on
      // `lastSent` and double-send the same version.
      let pushing: Promise<void> = Promise.resolve()
      const pushIfNewer = () => {
        pushing = pushing
          .then(async () => {
            if (!open) return
            const view = await getGameView(token, seatId, secret)
            if (view && view.version > lastSent) {
              lastSent = view.version
              write(`data: ${JSON.stringify(view)}\n\n`)
            }
          })
          .catch(() => {
            // a transient load/filter error must not break the pipe
          })
        return pushing
      }

      // Reconnect hint first, then the full current view.
      write(`retry: ${RETRY_HINT_MS}\n\n`)
      unsub = subscribe(token, () => {
        void pushIfNewer()
      })
      void pushIfNewer()

      // The guarantee: poll the version column; re-derive & push on change,
      // and re-kick a stalled AI turn (idempotent — no-op if running/human).
      const poll = async () => {
        if (!open) return
        try {
          void kickAiTurns(token)
          const v = await loadVersion(token)
          if (v !== null && v > lastSent) await pushIfNewer()
        } catch {
          // a transient DB blip must not kill the stream; next tick retries
        }
        if (open) pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
      }
      pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS)

      const ping = setInterval(() => write(': ping\n\n'), PING_INTERVAL_MS)

      // Bounded lifetime: close cleanly and let EventSource reconnect.
      const closeTimer = setTimeout(cleanup, MAX_STREAM_MS)

      req.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      unsub()
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
