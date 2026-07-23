// SSE stream: the client's live window onto its per-seat filtered view.
//
// DB-AS-BUS MODEL. On serverless there is no single long-lived process, so
// this stream is NOT a passive push subscriber — it is a server-side polling
// loop with an open pipe to the client. The delivery GUARANTEE is a cheap
// `(version, maxSeq)` DB poll every ~1.2s: the `games.version` column IS the
// event bus for game state, and `MAX(chat_messages.seq)` is the bus for chat.
// Any instance can read the pair. The in-process `subscribe()` bus is kept only
// as a same-instance FAST PATH (zero-latency when the writer and this stream
// share a Fluid-reused instance); pushes are deduped by version/seq so the bus
// and the poll never double-send.
//
// Two frame kinds, so a chat line never costs a full ~26KB state frame:
//   • default `data:` frame — the full per-seat view (version-guarded), sent
//     when `version` moved OR on every (re)connect (carries current state +
//     the recent chat tail).
//   • `event: chat` frame — a bounded chat increment, sent when ONLY `maxSeq`
//     moved; the client merges its messages by id (seq-idempotent).
//
// The stream is bounded by design: it closes cleanly just before `maxDuration`
// and the client's EventSource reconnects (a `retry` hint shortens the gap).
// The first frame on every (re)connect is the full current view, and the
// client's version/seq guards make overlap/reorder harmless.
import { type NextRequest } from 'next/server'
import {
  CHAT_TAIL_LIMIT,
  getChatDelta,
  getGameView,
  kickAiTurns,
  subscribe,
} from '~/server/mp/game'
import { acquireStreamSlot, clientIpFrom } from '~/server/mp/rate-limit'
import { loadGame, loadVersionAndSeq } from '~/server/mp/store'

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

  // Abuse bound: each stream holds a serverless slot for up to 290s and polls
  // Neon every ~1.2s, and `seat`/`secret` stay OPTIONAL (spectating is an open
  // product question — auth is deliberately NOT required here). So the bound
  // is a per-IP concurrent-stream cap: legitimate tables (≤4 players, a tab
  // or two each) never come near it, while one address can no longer hold
  // unbounded streams. Cap + rationale in rate-limit.ts.
  const releaseStreamSlot = acquireStreamSlot(clientIpFrom(req))
  if (!releaseStreamSlot) {
    return new Response('Too many open streams from this address', {
      status: 429,
      headers: { 'Retry-After': '30' },
    })
  }

  // Recovery: if the server restarted mid-AI-turn, the first client to
  // reconnect restarts the turn-runner (no-op when it's a human's turn).
  void kickAiTurns(token)

  const encoder = new TextEncoder()
  let unsub = () => {
    // replaced by the real unsubscribe once the stream starts
  }
  // Full teardown (stop timers, mark closed, release slot, unsubscribe, close
  // the controller). Assigned once the stream starts so BOTH the abort/close
  // paths inside `start` and the `cancel()` callback can run it — a cancelled
  // stream must stop polling Neon, not keep the slot free while the pollTimer
  // and closeTimer run to the 290s cap.
  let cleanup = () => {
    // replaced by the real cleanup once the stream starts
  }

  const stream = new ReadableStream({
    start(controller) {
      let open = true
      // Two independent cursors: the last engine version pushed as a full
      // frame, and the highest chat seq the client has been told about.
      let lastVersion = -1
      let lastSeq = 0
      let pollTimer: ReturnType<typeof setTimeout> | undefined

      const write = (chunk: string) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          open = false
        }
      }

      cleanup = () => {
        open = false
        releaseStreamSlot() // idempotent — cancel/abort/close can all fire
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
      // the cursors and double-send. One `syncNow` reconciles both cursors:
      // a full view frame when `version` moved, else a bounded chat increment
      // when only `maxSeq` moved.
      let syncing: Promise<void> = Promise.resolve()
      const syncNow = () => {
        syncing = syncing
          .then(async () => {
            if (!open) return
            const vs = await loadVersionAndSeq(token)
            if (!vs) return
            if (vs.version > lastVersion) {
              // Full frame: current per-seat state + the recent chat tail.
              const view = await getGameView(token, seatId, secret)
              if (view && view.version > lastVersion) {
                lastVersion = view.version
                const tailMax = view.messages.at(-1)?.id ?? 0
                if (tailMax > lastSeq) lastSeq = tailMax
                write(`data: ${JSON.stringify(view)}\n\n`)
              }
            } else if (vs.maxSeq > lastSeq) {
              // Only chat moved: push a bounded increment (or, for a spectator
              // / stale secret, send nothing but advance the cursor so we don't
              // re-query every tick).
              const delta = await getChatDelta(
                token,
                seatId,
                secret,
                lastSeq,
                CHAT_TAIL_LIMIT,
              )
              if (delta && delta.messages.length > 0) {
                lastSeq = delta.chatSeq
                write(`event: chat\ndata: ${JSON.stringify(delta)}\n\n`)
              } else {
                lastSeq = vs.maxSeq
              }
            }
          })
          .catch(() => {
            // a transient load/filter error must not break the pipe
          })
        return syncing
      }

      // Reconnect hint first, then the full current view.
      write(`retry: ${RETRY_HINT_MS}\n\n`)
      unsub = subscribe(token, () => {
        void syncNow()
      })
      void syncNow()

      // The guarantee: poll (version, maxSeq); push on change, and re-kick a
      // stalled AI turn (idempotent — no-op if running/human).
      const poll = async () => {
        if (!open) return
        try {
          void kickAiTurns(token)
          await syncNow()
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
      // The reader went away: run the SAME full teardown as abort/close so the
      // pollTimer, closeTimer and ping stop and we don't keep polling Neon (and
      // holding the slot free) until the 290s cap. Falls back to the stub if the
      // stream never started.
      cleanup()
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
