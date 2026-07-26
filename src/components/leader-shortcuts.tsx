'use client'

// The React half of the leader-prefix shortcuts declared in shortcuts.ts:
// registers every sequence with TanStack Hotkeys and shows the hint overlay
// while the leader is armed. A surface mounts it once and hands over the
// handlers it can serve.
import { useHotkey, useHotkeySequences } from '@tanstack/react-hotkeys'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SHORTCUT_LEADER,
  SHORTCUT_SEQUENCE_OPTIONS,
  SHORTCUT_TIMEOUT_MS,
  type ShortcutHandlers,
  type ShortcutId,
  shortcutHints,
  shortcutSequences,
} from './shortcuts'

export function LeaderShortcuts({ handlers }: { handlers: ShortcutHandlers }) {
  const [armed, setArmed] = useState(false)
  const lapse = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disarm = useCallback(() => {
    if (lapse.current !== null) clearTimeout(lapse.current)
    lapse.current = null
    setArmed(false)
  }, [])

  useEffect(() => disarm, [disarm])

  // Taking the hint down is this component's business, so the handlers the
  // registry sees are wrapped rather than each surface remembering to do it.
  const wrapped: ShortcutHandlers = {}
  for (const [id, handler] of Object.entries(handlers)) {
    if (!handler) continue
    wrapped[id as ShortcutId] = () => {
      disarm()
      handler()
    }
  }

  useHotkeySequences(shortcutSequences(wrapped), SHORTCUT_SEQUENCE_OPTIONS)

  // A display mirror of the sequence manager's own leader progress: it exposes
  // no lapse callback, so the overlay keeps its own timer on the same window.
  // Drift is cosmetic — the manager alone decides whether a shortcut fires.
  useHotkey(
    SHORTCUT_LEADER,
    () => {
      if (lapse.current !== null) clearTimeout(lapse.current)
      setArmed(true)
      lapse.current = setTimeout(() => {
        lapse.current = null
        setArmed(false)
      }, SHORTCUT_TIMEOUT_MS)
    },
    {
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
    },
  )

  const hints = shortcutHints(handlers)
  if (!armed || hints.length === 0) return null

  return (
    <div
      data-testid="shortcut-hint"
      role="status"
      className="bb2-panel pointer-events-none fixed bottom-4 right-4 z-[70] hidden flex-col gap-1.5 p-3 lg:flex"
    >
      <span
        className="text-[10.5px] font-bold uppercase tracking-[0.2em]"
        style={{ color: 'rgba(231,215,177,.5)' }}
      >
        {SHORTCUT_LEADER.toLowerCase()} then…
      </span>
      {hints.map((hint) => (
        <span key={hint.key} className="flex items-center gap-2">
          <span
            className="min-w-[22px] rounded border px-1.5 py-0.5 text-center font-mono text-[12px] font-bold lowercase"
            style={{
              borderColor: 'var(--bb-brass-hairline)',
              background: 'rgba(20,16,11,.7)',
              color: 'var(--bb-brass-bright)',
            }}
          >
            {hint.key.toLowerCase()}
          </span>
          <span
            className="text-[12.5px]"
            style={{ color: 'var(--bb-parchment)' }}
          >
            {hint.description}
          </span>
        </span>
      ))}
    </div>
  )
}
