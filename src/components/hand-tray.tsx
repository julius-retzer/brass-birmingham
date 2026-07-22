'use client'

// The player's hand as a fan of real cards along the bottom of the table.
// When an action flow needs a discard the fan itself becomes the selector.
//
// A hovered (mouse) or peeked (touch) card magnifies dock-style: the visual
// lens scales up while its 108×156 button hitbox stays put, and neighbours
// slide aside. Touch reaches the peek two ways: a tap, or a long-press that
// then browses the fan Hearthstone-style (slide left/right, release keeps
// the card under the finger peeked). A selected card keeps a smaller
// persistent lens. Pure geometry lives in hand-tray-layout.ts.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Card as GameCard } from '~/data/cards'
import { CardFaceContent } from './cards'
import {
  LENS_COARSE,
  LENS_FINE,
  LENS_SELECTED,
  cardIndexAtX,
  dockShift,
  fanAngle,
  fanLayout,
  fanLift,
  hintClearance,
  lensReach,
  lensShiftX,
} from './hand-tray-layout'

/** Hold this long (without sliding) to start browsing the fan. */
const LONG_PRESS_MS = 350
/** Finger drift allowed before the hold is read as a slide and cancelled. */
const BROWSE_SLOP_PX = 12

interface BrowseGesture {
  pointerId: number
  startX: number
  startY: number
  timer: number
  /** Set when the long-press fires; from then on sliding browses the fan. */
  active: boolean
}

export interface HandTrayProps {
  hand: GameCard[]
  /** null = hand is just on display; otherwise cards become selectable */
  canSelect: ((cardId: string) => boolean) | null
  onSelect?: (cardId: string) => void
  selectedIds?: string[]
  hint?: string | null
  /** Hover preview: the shell highlights the card's targets on the map. */
  onHoverCard?: (card: GameCard | null) => void
  /** Right dock collapsed — the tray extends toward the reclaimed edge. */
  panelCollapsed?: boolean
}

export function HandTray({
  hand,
  canSelect,
  onSelect,
  selectedIds = [],
  hint,
  onHoverCard,
  panelCollapsed = false,
}: HandTrayProps) {
  const n = hand.length
  const selecting = canSelect !== null

  // Mouse hover and touch peek both raise a card; peek wins so a stray
  // synthetic mouse event after a tap can't dismiss it.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [peekedId, setPeekedId] = useState<string | null>(null)
  const [coarse, setCoarse] = useState(false)
  const [fanWidth, setFanWidth] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const fanRef = useRef<HTMLDivElement | null>(null)
  // Pointer type of the press that produced the next click, consumed there —
  // per-interaction, so hybrid (touch + mouse) devices do the right thing.
  const lastPointerType = useRef<string | null>(null)
  // In-progress long-press/browse gesture; document-level move/up handlers
  // drive it so the finger may wander off the pressed card mid-browse.
  const browseRef = useRef<BrowseGesture | null>(null)
  // A browse release still synthesizes a click on the pressed card — that
  // click must neither act nor re-toggle the peek the browse just set.
  const suppressClickRef = useRef(false)

  useLayoutEffect(() => {
    const el = fanRef.current
    if (!el) return
    const measure = () => setFanWidth(el.offsetWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarse(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // A tap anywhere outside the tray dismisses the peek.
  useEffect(() => {
    if (!peekedId) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setPeekedId(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [peekedId])

  // The peeked card may leave the hand (played, era end) under the peek.
  useEffect(() => {
    if (peekedId && !hand.some((c) => c.id === peekedId)) setPeekedId(null)
  }, [hand, peekedId])

  const setPeek = (card: GameCard | null) => {
    setPeekedId(card?.id ?? null)
  }

  const raisedId = peekedId ?? hoveredId
  const raisedIndex = raisedId ? hand.findIndex((c) => c.id === raisedId) : -1

  // The shell's hover preview follows whichever card is actually raised —
  // one derived notification instead of per-handler calls, so a peek can't
  // fight a stale mouse hover and a raised card leaving the hand clears the
  // preview. Deduped by id: hand arrays are rebuilt per snapshot and the
  // shell shouldn't re-render for an identity-only change.
  const raisedCard = raisedId
    ? (hand.find((c) => c.id === raisedId) ?? null)
    : null
  const notifiedHoverRef = useRef<string | null>(null)
  useEffect(() => {
    const id = raisedCard?.id ?? null
    if (notifiedHoverRef.current === id) return
    notifiedHoverRef.current = id
    onHoverCard?.(raisedCard)
  }, [onHoverCard, raisedCard])
  const lens = coarse ? LENS_COARSE : LENS_FINE
  const { spacing, marginX } = fanLayout(n, fanWidth)

  // Long-press browse: once the hold fires, sliding moves the raised
  // highlight to the card whose resting seat is under the finger; releasing
  // keeps that card peeked (never selects — acting stays a deliberate tap on
  // the already-raised card). Listeners live on the document because touch
  // implicit-captures pointer events to the pressed element, so per-seat
  // handlers would never see the finger crossing the fan.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = browseRef.current
      if (!g || e.pointerId !== g.pointerId) return
      if (!g.active) {
        // Sliding before the hold fires is not a browse — cancel it.
        if (
          Math.hypot(e.clientX - g.startX, e.clientY - g.startY) >
          BROWSE_SLOP_PX
        ) {
          clearTimeout(g.timer)
          browseRef.current = null
        }
        return
      }
      const el = fanRef.current
      if (!el || fanWidth === null || hand.length === 0) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return
      // Client → layout px (the fan is scaled down on phones).
      const layoutX = ((e.clientX - rect.left) / rect.width) * fanWidth
      const under = hand[cardIndexAtX(layoutX, hand.length, spacing, fanWidth)]
      if (under && under.id !== peekedId) setPeek(under)
    }
    const onEnd = (e: PointerEvent) => {
      const g = browseRef.current
      if (!g || e.pointerId !== g.pointerId) return
      clearTimeout(g.timer)
      browseRef.current = null
      if (g.active && e.type === 'pointerup') suppressClickRef.current = true
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onEnd)
    document.addEventListener('pointercancel', onEnd)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
      document.removeEventListener('pointercancel', onEnd)
    }
  })

  return (
    <div
      ref={rootRef}
      className={`bb2-handtray pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center transition-[right] duration-300 ease-in-out ${
        panelCollapsed ? 'lg:right-[44px]' : 'lg:right-[428px]'
      }`}
      style={
        { '--bb-hint-clear': `${hintClearance(lens)}px` } as React.CSSProperties
      }
    >
      {hint && (
        // The pill stacks above the fan, clearing the tallest lens this
        // device can raise (--bb-hint-clear, scaled with the tray) so no
        // card — resting, selected or magnified — ever reaches it. It stays
        // fully opaque and put: the reserve is static, so hovering never
        // moves or dims the instruction. It is click-transparent: on phones
        // the dock scrolls behind it, and the pill must never eat a tap
        // aimed at an action button.
        <div className="bb2-hand-hint bb2-rise relative z-[1]">
          <div
            className="rounded border px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em]"
            style={{
              background: 'rgba(20,16,11,.92)',
              borderColor: 'var(--bb-brass)',
              color: 'var(--bb-brass-bright)',
              boxShadow: '0 6px 18px rgba(0,0,0,.5)',
            }}
          >
            {hint}
          </div>
        </div>
      )}
      <div
        ref={fanRef}
        className="bb2-hand bb2-handbox"
        style={{ '--bb-card-mx': `${marginX}px` } as React.CSSProperties}
      >
        {hand.map((card, i) => {
          const angle = fanAngle(i, n)
          const lift = fanLift(i, n)
          const selected = selectedIds.includes(card.id)
          const enabled = selecting
            ? (canSelect?.(card.id) ?? false) || selected
            : false
          const disabled = selecting ? !enabled : true
          const raised = i === raisedIndex
          const shift = dockShift(
            i,
            raisedIndex === -1 ? null : raisedIndex,
            lens.scale,
          )
          // Transient hover/peek beats the persistent selected lens; the
          // selected state deliberately shifts no neighbours (rise carries
          // the signal without churning the fan for a whole flow).
          const lensPreset = raised ? lens : selected ? LENS_SELECTED : null
          return (
            // The fan transform and hover events live on a wrapper: mouse
            // events don't fire on disabled buttons, but the hover preview
            // should work even when the hand is display-only.
            <span
              key={card.id}
              className="bb2-card-seat"
              style={{
                transform: `translateX(${shift}px) rotate(${angle}deg) translateY(${lift}px)`,
                zIndex: raised ? 60 : selected ? 40 : i,
              }}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') setHoveredId(card.id)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== 'touch')
                  setHoveredId((h) => (h === card.id ? null : h))
              }}
              onPointerDown={(e) => {
                lastPointerType.current = e.pointerType
                suppressClickRef.current = false
                if (e.pointerType === 'touch') {
                  // A second finger replaces the pending gesture outright.
                  if (browseRef.current) clearTimeout(browseRef.current.timer)
                  const g: BrowseGesture = {
                    pointerId: e.pointerId,
                    startX: e.clientX,
                    startY: e.clientY,
                    timer: 0,
                    active: false,
                  }
                  g.timer = window.setTimeout(() => {
                    if (browseRef.current !== g) return
                    g.active = true
                    setPeek(card)
                  }, LONG_PRESS_MS)
                  browseRef.current = g
                }
              }}
              onPointerUp={(e) => {
                // A browse release is handled at the document level (keeps
                // the browsed card peeked) — not a tap.
                if (browseRef.current?.active) return
                // Disabled buttons swallow click, so a display-only or
                // dimmed card's touch peek toggles here instead.
                if (e.pointerType === 'touch' && disabled)
                  setPeek(peekedId === card.id ? null : card)
              }}
              onContextMenu={(e) => {
                // Android fires contextmenu on long-press — that press is
                // our browse gesture, never a context menu.
                if (browseRef.current) e.preventDefault()
              }}
            >
              <button
                type="button"
                className="bb2-card bb2-card-hit"
                data-testid={`card-${card.id}`}
                data-selected={selected || undefined}
                data-dimmed={(selecting && !enabled && !selected) || undefined}
                data-raised={raised || undefined}
                disabled={disabled}
                onClick={() => {
                  // The click synthesized after a browse release is not a
                  // tap — swallow it so browsing can never act.
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false
                    return
                  }
                  const viaTouch = lastPointerType.current === 'touch'
                  lastPointerType.current = null
                  // Touch has no hover: the first tap peeks, the second acts.
                  // A card the player already selected acts immediately —
                  // they know it; re-tapping means deselect/put back.
                  if (viaTouch && !selected && peekedId !== card.id) {
                    setPeek(card)
                    return
                  }
                  if (enabled) {
                    if (peekedId) setPeek(null)
                    onSelect?.(card.id)
                  }
                }}
                onFocus={(e) => {
                  // Keyboard focus reads like hover; mouse clicks (not
                  // :focus-visible) must not pin the card raised.
                  if (e.target.matches(':focus-visible')) setHoveredId(card.id)
                }}
                onBlur={() => setHoveredId((h) => (h === card.id ? null : h))}
                style={
                  {
                    cursor: selecting
                      ? enabled
                        ? 'pointer'
                        : 'not-allowed'
                      : 'default',
                    '--bb-lens-reach': `${lensReach(lensPreset ?? lens)}px`,
                  } as React.CSSProperties
                }
                aria-label={`Card: ${card.id}`}
              >
                <span
                  className="bb2-card bb2-card-lens"
                  style={
                    lensPreset
                      ? {
                          transform: `translate(${lensShiftX(i, n, spacing, fanWidth, lensPreset.scale)}px, ${-lensPreset.rise}px) rotate(${-angle}deg) scale(${lensPreset.scale})`,
                        }
                      : undefined
                  }
                >
                  <CardFaceContent card={card} />
                </span>
              </button>
            </span>
          )
        })}
        {n === 0 && (
          <div
            className="pointer-events-auto mb-16 rounded border px-4 py-2 text-[12px] uppercase tracking-[0.2em]"
            style={{
              borderColor: 'rgba(231,215,177,.2)',
              color: 'rgba(231,215,177,.45)',
              background: 'rgba(20,16,11,.8)',
            }}
          >
            No cards in hand
          </div>
        )}
      </div>
    </div>
  )
}
