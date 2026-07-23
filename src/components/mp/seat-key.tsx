'use client'

// The player's PRIVATE seat key — the UI half of `recovery-link.ts`.
//
// This surface exists to make one specific mistake hard: pasting your own
// recovery link where the invite link belongs. Everything below is shaped by
// that, and none of it is decoration:
//
//   - The recovery URL is NEVER rendered next to the invite link, and never
//     on the page at all until the player opens this modal and then explicitly
//     reveals it. The invite link (`ShareLink`) is the only bare URL on screen,
//     so "the URL you can grab" is always the safe one.
//   - The affordances differ: the invite link is a chip showing its own URL
//     (click = copy); the seat key is a keyed ghost BUTTON that opens a modal.
//     There are never two similar-looking URLs side by side.
//   - The copy says what the credential does in plain words, and names the
//     other link so the distinction is stated rather than implied.
//
// It reuses the EXISTING per-seat secret (see recovery-link.ts) — there is no
// second credential scheme, and the server is not involved at all.
import { useEffect, useState } from 'react'
import { type RecoveryCreds, buildRecoveryLink } from './recovery-link'

/** Placeholder shown instead of the link until the player asks to see it, so
 *  a shared screen or a screenshot does not leak the seat by accident. */
const MASK = '••••••••••••••••••••••••••••••••'

export function SeatKeyModal({
  token,
  creds,
  atClaim = false,
  onClose,
}: {
  token: string
  creds: RecoveryCreds
  /** true when opened automatically right after claiming the seat */
  atClaim?: boolean
  onClose: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const link =
    typeof window === 'undefined'
      ? ''
      : buildRecoveryLink(window.location.origin, token, creds)

  const copy = () => {
    void navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div
      className="bb2-curtain fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(10, 8, 6, 0.86)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bb2-panel bb2-rise flex w-full max-w-md flex-col gap-3 p-5"
        role="dialog"
        aria-label="Your private seat key"
        data-testid="seat-key-modal"
      >
        <div className="flex items-baseline gap-2">
          <span className="bb2-panel-title">🔑 Your private seat key</span>
          <button
            type="button"
            className="bb2-ghost-btn ml-auto !px-2 !py-1 text-[11px]"
            data-testid="seat-key-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {atClaim && (
          <p
            className="text-[13px]"
            style={{ color: 'var(--bb-parchment-bright)' }}
          >
            Seat claimed. Keep this link somewhere private — it is the only way
            back into your seat from another device or browser.
          </p>
        )}

        {/* The warning is the loudest thing in the dialog, above the link. */}
        <p
          className="rounded border px-3 py-2 text-[13px] font-semibold"
          data-testid="seat-key-warning"
          style={{
            borderColor: 'rgba(214, 92, 62, .55)',
            background: 'rgba(214, 92, 62, .12)',
            color: 'var(--bb-parchment-bright)',
          }}
        >
          This is yours — anyone with this link can take your seat. Never post
          it in a chat, a stream or a screenshot.
        </p>

        <div className="flex flex-col gap-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            Private — do not share
          </span>
          <code
            className="block break-all rounded border px-3 py-2 text-[11.5px] leading-snug"
            data-testid="seat-key-link"
            data-revealed={revealed ? 'true' : 'false'}
            style={{
              borderColor: 'rgba(231,215,177,.18)',
              background: 'rgba(0,0,0,.25)',
              color: revealed ? 'var(--bb-parchment)' : 'rgba(231,215,177,.45)',
            }}
          >
            {revealed ? link : MASK}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              className="bb2-confirm flex-1"
              data-testid="seat-key-copy"
              onClick={copy}
            >
              {copied ? 'Copied — keep it private' : 'Copy my private link'}
            </button>
            <button
              type="button"
              className="bb2-ghost-btn"
              data-testid="seat-key-reveal"
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>
        </div>

        <p className="text-[12px]" style={{ color: 'rgba(231,215,177,.55)' }}>
          Open it on your phone or in another browser and you are back in this
          seat. It keeps working for the whole game.
        </p>

        {/* State the distinction outright — implying it is not enough. */}
        <p
          className="border-t pt-2 text-[12px]"
          data-testid="seat-key-vs-invite"
          style={{
            borderColor: 'rgba(231,215,177,.15)',
            color: 'rgba(231,215,177,.55)',
          }}
        >
          <b style={{ color: 'var(--bb-parchment)' }}>
            This is not the invite link.
          </b>{' '}
          To bring someone to the table, share the <b>invite link</b> in the
          header instead — that one only offers an open seat and is safe to post
          anywhere.
        </p>
      </div>
    </div>
  )
}

/**
 * The always-available way back to the modal — the "retrievable later"
 * half of the feature, since nobody saves the link the first time they see it.
 * Rendered in the lobby and in the live game's masthead.
 */
export function SeatKeyButton({
  token,
  creds,
  className,
}: {
  token: string
  creds: RecoveryCreds
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`bb2-ghost-btn ${className ?? ''}`}
        data-testid="seat-key-button"
        title="Your private link back into this seat — do not share it"
        onClick={() => setOpen(true)}
      >
        🔑 Seat key
      </button>
      {open && (
        <SeatKeyModal
          token={token}
          creds={creds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** Per-game "the player has seen the nudge" flag. Its own key, so clearing a
 *  game's credentials does not resurrect the notice for a seat that no longer
 *  exists, and a dismissal survives a reload. */
const seenKey = (token: string) => `bb-mp-seatkey-seen-${token}`

/**
 * The claim-time nudge, shown in the lobby to EVERY seated player — the host
 * (whose seat is claimed at creation, without ever passing through the join
 * screen) as well as everyone who joined.
 *
 * It is a persistent inline card rather than a modal on purpose: a modal is a
 * one-shot a player dismisses on reflex, and it would sit on top of the lobby
 * controls. This stays until acknowledged, and the Seat key button remains
 * afterwards, which is the "retrievable later" half of the requirement.
 */
export function SeatKeyNotice({
  token,
  creds,
}: {
  token: string
  creds: RecoveryCreds
}) {
  const [dismissed, setDismissed] = useState(true)
  const [open, setOpen] = useState(false)

  // Read the flag after mount: localStorage is unavailable during SSR and
  // reading it in render would desync hydration.
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(seenKey(token)) !== null)
    } catch {
      setDismissed(false)
    }
  }, [token])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(seenKey(token), '1')
    } catch {
      // a session-only dismissal is fine
    }
  }

  if (dismissed) return null
  return (
    <div
      className="bb2-panel flex w-full max-w-sm flex-col gap-2 p-4"
      data-testid="seat-key-notice"
      style={{ borderColor: 'var(--bb-brass-dim)' }}
    >
      <span className="bb2-panel-title">🔑 Save your seat key</span>
      <p className="text-[12.5px]" style={{ color: 'var(--bb-parchment)' }}>
        It is the only way back into your seat from another device, or if this
        browser forgets you. Private — anyone with it can play as you.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="bb2-confirm flex-1"
          data-testid="seat-key-notice-open"
          onClick={() => setOpen(true)}
        >
          Show my seat key
        </button>
        <button
          type="button"
          className="bb2-ghost-btn"
          data-testid="seat-key-notice-dismiss"
          onClick={dismiss}
        >
          Later
        </button>
      </div>
      {open && (
        <SeatKeyModal
          token={token}
          creds={creds}
          atClaim
          onClose={() => {
            setOpen(false)
            dismiss()
          }}
        />
      )}
    </div>
  )
}
