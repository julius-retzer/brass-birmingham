'use client'

// Cmd/Ctrl+K — "where is that?" Type a city or an industry, pick it, and the
// board spotlights it (an industry lights up EVERY location that can take it)
// for ~5s while the map pans it into view.
//
// Strictly a navigation aid: it reads BOARD DATA only (`palette-search.ts`),
// sends no machine event and never consults legality — so it behaves the same
// on the hotseat and multiplayer surfaces, on any turn, for any seat.
//
// Hand-rolled rather than shadcn's `command`: that component is cmdk plus
// radix-dialog, and this repo carries neither (its only ui/ entry is sonner);
// every overlay here is the same `.bb2-curtain` + `.bb2-panel` shell used by
// IncomeTrackModal and the player mat, which the palette follows.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { IndustryType } from '~/data/cards'
import { IndustryChip } from './icons'
import { useLocateCity } from './locate'
import {
  type PaletteEntry,
  matchPaletteEntries,
  paletteEntries,
} from './palette-search'

/** True when a keystroke belongs to whatever the player is typing into. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  // Rendered only after mount so the shortcut hint can name the real modifier
  // without risking a hydration mismatch.
  const [isMac, setIsMac] = useState(false)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.userAgent))
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'k' && e.key !== 'K') return
      if (!e.metaKey && !e.ctrlKey) return
      // Never steal the key from a chat box or any other field — except the
      // palette's own input, where Cmd+K toggles back out.
      const insidePalette =
        e.target instanceof HTMLElement &&
        e.target.closest('[data-command-palette]') !== null
      if (!insidePalette && isTypingTarget(e.target)) return
      e.preventDefault()
      setOpen((prev) => !prev)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openPalette = () => {
    restoreFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setOpen(true)
  }

  const closePalette = () => {
    setOpen(false)
    restoreFocus.current?.focus()
    restoreFocus.current = null
  }

  return (
    <>
      <button
        type="button"
        className="bb2-chip"
        style={{ cursor: 'pointer' }}
        onClick={openPalette}
        data-testid="palette-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SearchGlyph />
        <span>Find</span>
        <span
          className="hidden sm:inline"
          style={{ color: 'var(--bb-brass)', letterSpacing: '0.08em' }}
        >
          {isMac ? '⌘K' : 'Ctrl K'}
        </span>
      </button>
      {open && <PaletteOverlay isMac={isMac} onClose={closePalette} />}
    </>
  )
}

function PaletteOverlay({
  isMac,
  onClose,
}: {
  isMac: boolean
  onClose: () => void
}) {
  const { spotlightCities } = useLocateCity()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const index = useMemo(() => paletteEntries(), [])
  const results = useMemo(
    () => matchPaletteEntries(query, index).slice(0, MAX_RESULTS),
    [query, index],
  )
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0))
  const activeEntry = results[activeIndex]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry) return
    spotlightCities(entry.cities)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = (activeIndex + step + results.length) % results.length
      setActive(next)
      listRef.current
        ?.querySelector(`[data-row="${next}"]`)
        ?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      choose(activeEntry)
    }
  }

  return (
    <div
      className="bb2-curtain fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh] sm:p-8 sm:pt-[14vh]"
      style={{ background: 'rgba(10, 8, 6, 0.78)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bb2-panel bb2-rise flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Find a place or industry"
        data-command-palette
        data-testid="command-palette"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3 [border-color:var(--bb-brass-hairline-soft)]">
          <SearchGlyph />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Find a city or industry…"
            aria-label="Find a city or industry"
            role="combobox"
            aria-expanded="true"
            aria-controls="bb2-palette-list"
            aria-activedescendant={activeEntry ? rowId(activeEntry) : undefined}
            autoComplete="off"
            spellCheck={false}
            data-testid="palette-input"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:opacity-50"
            style={{ color: 'var(--bb-parchment-bright)' }}
          />
          <button
            type="button"
            className="bb2-ghost-btn"
            onClick={onClose}
            data-testid="palette-close"
          >
            Esc
          </button>
        </div>

        <div
          ref={listRef}
          id="bb2-palette-list"
          role="listbox"
          aria-label="Results"
          className="flex flex-col gap-1 overflow-y-auto p-2"
        >
          {results.length === 0 && (
            <p
              className="px-2 py-6 text-center text-[13px]"
              style={{ color: 'rgba(231,215,177,.55)' }}
              data-testid="palette-empty"
            >
              Nothing on the board by that name.
            </p>
          )}
          {results.map((entry, i) => (
            <button
              key={`${entry.kind}:${entry.id}`}
              id={rowId(entry)}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              data-row={i}
              data-active={i === activeIndex}
              data-selected={i === activeIndex}
              data-testid={`palette-result-${entry.kind}-${entry.id}`}
              className="bb2-option"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(entry)}
            >
              <EntryMark entry={entry} />
              <span className="flex-1">{entry.label}</span>
              <span
                className="text-[11px] uppercase tracking-[0.12em]"
                style={{ color: 'rgba(231,215,177,.5)' }}
              >
                {entry.detail}
              </span>
            </button>
          ))}
        </div>

        <p
          className="border-t px-4 py-2 text-[11px] [border-color:var(--bb-brass-hairline-soft)]"
          style={{ color: 'rgba(231,215,177,.45)' }}
        >
          ↑↓ to walk · Enter to spotlight on the map · {isMac ? '⌘K' : 'Ctrl K'}{' '}
          to close
        </p>
      </div>
    </div>
  )
}

/** Long lists are noise in a spotlight picker — the board has ~30 places. */
const MAX_RESULTS = 40

/** The map's surveyor's-mark teal (LocateMark), so a row reads as "a place". */
const LOCATE_TEAL = '#8fd8cd'

function rowId(entry: PaletteEntry): string {
  return `bb2-palette-${entry.kind}-${entry.id}`
}

/** An industry row wears its own glyph; a location wears a survey pin. */
function EntryMark({ entry }: { entry: PaletteEntry }) {
  if (entry.kind === 'industry') {
    return <IndustryChip type={entry.id as IndustryType} size={13} />
  }
  return <PinGlyph />
}

function SearchGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 L14 14" strokeLinecap="round" />
    </svg>
  )
}

function PinGlyph() {
  return (
    <span
      className="inline-grid place-items-center"
      style={{ width: 20, height: 20, color: LOCATE_TEAL }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="8" cy="6.5" r="2.6" />
        <path d="M8 9.5 V14" strokeLinecap="round" />
      </svg>
    </span>
  )
}
