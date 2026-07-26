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
//
// A PEEKED card carries an act tab ("Play" / "Put back") on its lower edge.
// The peek exists because touch has no hover — it is how a phone reads a card
// out of a fan packed to a 26px sliver — so the tap that ACTS is a second one,
// and the tab is what says so: a target the finger can aim at instead of an
// invisible repeat. It is a LABEL, not a control (pointer-events: none, inside
// the card's own hitbox): the card takes the tap either way, which keeps one
// control per card and leaves the card's tap point clear, exactly as the ◀ ▶
// handles do. Hover and keyboard focus never show it — they already act on the
// first click, and the tab keys off `peekedId`, which only touch ever sets.
//
// The fan is also REORDERABLE (display only — see hand-order.ts; the engine's
// hand is never touched). Which ways in depend on the pointer, because the
// tray's pointer budget is already spent: on DESKTOP (fine pointer) a mouse
// drag or Shift+Arrow on a focused card; on TOUCH (coarse pointer) the ◀ ▶
// handles that flank a raised card, plus Shift+Arrow (keyboard stays on every
// platform for accessibility). The handles are COARSE-ONLY on purpose: a mouse
// leaves the card's hover region on the way to a handle, so the card lowers and
// the handle vanishes before the click lands — desktop keeps drag + keyboard
// instead. A drag is only ever read as a drag once the pointer travels
// DRAG_SLOP_PX, and it swallows the click it would otherwise synthesize, so
// dragging can never be mistaken for selecting.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Card as GameCard } from '~/data/cards'
import { CardFaceContent, cardTitle } from './cards'
import {
  LENS_COARSE,
  LENS_FINE,
  LENS_SELECTED,
  actTabLayout,
  cardIndexAtX,
  dockShift,
  fanAngle,
  fanLayout,
  fanLift,
  lensReach,
  lensShiftX,
  moveHandleLayout,
  moveHandleShiftX,
} from './hand-tray-layout'

/** Hold this long (without sliding) to start browsing the fan. */
const LONG_PRESS_MS = 350
/** Finger drift allowed before the hold is read as a slide and cancelled. */
const BROWSE_SLOP_PX = 12
/** Pointer travel before a press on a card is read as a reorder drag. */
const DRAG_SLOP_PX = 8

interface BrowseGesture {
  pointerId: number
  startX: number
  startY: number
  timer: number
  /** Set when the long-press fires; from then on sliding browses the fan. */
  active: boolean
}

interface DragGesture {
  pointerId: number
  startX: number
  startY: number
  cardId: string
  /** Set once the pointer clears DRAG_SLOP_PX; before that it's still a click. */
  active: boolean
}

export interface HandTrayProps {
  hand: GameCard[]
  /** null = hand is just on display; otherwise cards become selectable */
  canSelect: ((cardId: string) => boolean) | null
  onSelect?: (cardId: string) => void
  selectedIds?: string[]
  /** Hover preview: the shell highlights the card's targets on the map. */
  onHoverCard?: (card: GameCard | null) => void
  /** Right dock collapsed — the tray extends toward the reclaimed edge. */
  panelCollapsed?: boolean
  /**
   * Display-order change: move `cardId` to display index `toIndex`. Omit to
   * make the fan unreorderable. NEVER an engine event — see hand-order.ts.
   */
  onReorder?: (cardId: string, toIndex: number) => void
}

export function HandTray({
  hand,
  canSelect,
  onSelect,
  selectedIds = [],
  onHoverCard,
  panelCollapsed = false,
  onReorder,
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
  // In-progress reorder drag (fine pointers only). Same document-level
  // listeners as the browse gesture, for the same reason: the cursor leaves
  // the pressed seat the moment the cards swap under it.
  const dragRef = useRef<DragGesture | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Reorders are invisible to a screen reader without this.
  const [announcement, setAnnouncement] = useState('')

  const reorderable = !!onReorder && hand.length > 1

  /** Move a card and say so; `toIndex` is clamped by the caller's own bounds. */
  const moveCardTo = (card: GameCard, toIndex: number) => {
    if (!onReorder) return
    const to = Math.max(0, Math.min(hand.length - 1, toIndex))
    if (to === hand.findIndex((c) => c.id === card.id)) return
    onReorder(card.id, to)
    setAnnouncement(
      `${cardTitle(card)} moved to position ${to + 1} of ${hand.length}`,
    )
  }

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
  const handles = moveHandleLayout(lens, coarse)
  const actTab = actTabLayout(lens)

  // Long-press browse: once the hold fires, sliding moves the raised
  // highlight to the card whose resting seat is under the finger; releasing
  // keeps that card peeked (never selects — acting stays a deliberate tap on
  // the already-raised card). Listeners live on the document because touch
  // implicit-captures pointer events to the pressed element, so per-seat
  // handlers would never see the finger crossing the fan.
  useEffect(() => {
    /** Layout-x of a client-x inside the fan (the fan is scaled on phones). */
    const layoutXOf = (clientX: number): number | null => {
      const el = fanRef.current
      if (!el || fanWidth === null || hand.length === 0) return null
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return null
      return ((clientX - rect.left) / rect.width) * fanWidth
    }
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (d && e.pointerId === d.pointerId) {
        if (!d.active) {
          if (Math.abs(e.clientX - d.startX) <= DRAG_SLOP_PX) return
          d.active = true
          // The pointerup after a drag still synthesizes a click on the
          // pressed card — swallow it so a drag can never select.
          suppressClickRef.current = true
          setDraggingId(d.cardId)
          setHoveredId(d.cardId)
        }
        const layoutX = layoutXOf(e.clientX)
        if (layoutX === null || fanWidth === null) return
        const from = hand.findIndex((c) => c.id === d.cardId)
        const to = cardIndexAtX(layoutX, hand.length, spacing, fanWidth)
        if (from !== -1 && to !== from) onReorder?.(d.cardId, to)
        return
      }
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
      const layoutX = layoutXOf(e.clientX)
      if (layoutX === null || fanWidth === null) return
      const under = hand[cardIndexAtX(layoutX, hand.length, spacing, fanWidth)]
      if (under && under.id !== peekedId) setPeek(under)
    }
    const onEnd = (e: PointerEvent) => {
      const d = dragRef.current
      if (d && e.pointerId === d.pointerId) {
        dragRef.current = null
        if (d.active) {
          setDraggingId(null)
          const card = hand.find((c) => c.id === d.cardId)
          const at = hand.findIndex((c) => c.id === d.cardId)
          if (card && at !== -1)
            setAnnouncement(
              `${cardTitle(card)} moved to position ${at + 1} of ${hand.length}`,
            )
        }
        return
      }
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
    >
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
          const dragging = draggingId === card.id
          // `peekedId` is only ever set by touch, so it is exactly the state
          // whose next tap acts — what the act tab is there to advertise.
          const actLabel =
            peekedId === card.id && enabled
              ? selected
                ? 'Put back'
                : 'Play'
              : null
          /** The second tap's effect, shared by the card and its act tab. */
          const act = () => {
            if (peekedId) setPeek(null)
            onSelect?.(card.id)
          }
          const shift = dockShift(
            i,
            raisedIndex === -1 ? null : raisedIndex,
            lens.scale,
          )
          // Transient hover/peek beats the persistent selected lens; the
          // selected state deliberately shifts no neighbours (rise carries
          // the signal without churning the fan for a whole flow).
          // A dragged card keeps the modest lens: the full hover magnification
          // swinging around the fan while its neighbours swap is pure noise.
          const lensPreset = dragging
            ? LENS_SELECTED
            : raised
              ? lens
              : selected
                ? LENS_SELECTED
                : null
          return (
            // The fan transform and hover events live on a wrapper: mouse
            // events don't fire on disabled buttons, but the hover preview
            // should work even when the hand is display-only.
            <span
              key={card.id}
              className="bb2-card-seat"
              data-dragging={dragging || undefined}
              style={{
                transform: `translateX(${shift}px) rotate(${angle}deg) translateY(${lift}px)`,
                zIndex: dragging ? 70 : raised ? 60 : selected ? 40 : i,
              }}
              onPointerEnter={(e) => {
                // Mid-drag the cards swap under the cursor; the raise must
                // stay on the card being dragged, not follow the swap.
                if (dragRef.current?.active) return
                if (e.pointerType !== 'touch') setHoveredId(card.id)
              }}
              onPointerLeave={(e) => {
                if (dragRef.current?.active) return
                if (e.pointerType !== 'touch')
                  setHoveredId((h) => (h === card.id ? null : h))
              }}
              onPointerDown={(e) => {
                lastPointerType.current = e.pointerType
                suppressClickRef.current = false
                if (reorderable && e.pointerType !== 'touch' && e.button === 0)
                  dragRef.current = {
                    pointerId: e.pointerId,
                    startX: e.clientX,
                    startY: e.clientY,
                    cardId: card.id,
                    active: false,
                  }
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
                  if (enabled) act()
                }}
                onKeyDown={(e) => {
                  // Shift+Arrow, not a bare arrow: bare arrows are how a
                  // keyboard user expects to move BETWEEN things, and the
                  // modifier keeps browser back/forward (Alt+Arrow) clear.
                  if (!reorderable || !e.shiftKey) return
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                  e.preventDefault()
                  moveCardTo(card, i + (e.key === 'ArrowLeft' ? -1 : 1))
                }}
                aria-keyshortcuts={
                  reorderable ? 'Shift+ArrowLeft Shift+ArrowRight' : undefined
                }
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
              {/* Reorder handles: the TOUCH route (coarse pointers only —
                see the header). On a mouse the trip from card to handle leaves
                the hover region and lowers the card before the click lands, so
                desktop uses drag + keyboard instead. The long-press already
                belongs to the browse gesture, so on touch these are the tap
                route. They ride the raised card so the fan stays clean at rest,
                FLANK the magnified visual rather than covering it
                (moveHandleLayout), and counter-rotate out of the fan's tilt so
                the arrows read straight. They must not bubble: a pointerdown
                here would arm a browse/drag, and a pointerup would toggle the
                peek back off. */}
              {reorderable && coarse && raised && !draggingId && (
                <span
                  className="bb2-card-move"
                  style={
                    {
                      // Centred on the magnified visual, with its own edge
                      // clamp — the strip is far wider than the card, so the
                      // lens's clamp would still let an edge card's outer
                      // handle run off screen.
                      bottom: `${handles.bottom}px`,
                      width: `${handles.width}px`,
                      '--bb-move-size': `${handles.size}px`,
                      transform: `translateX(calc(-50% + ${moveHandleShiftX(i, n, spacing, fanWidth, handles)}px)) rotate(${-angle}deg)`,
                    } as React.CSSProperties
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                >
                  {(
                    [
                      ['left', -1, '◀'],
                      ['right', 1, '▶'],
                    ] as const
                  ).map(([dir, step, glyph]) => (
                    <button
                      key={dir}
                      type="button"
                      className="bb2-card-movebtn"
                      data-testid={`move-${dir}-${card.id}`}
                      disabled={step < 0 ? i === 0 : i === n - 1}
                      aria-label={`Move ${cardTitle(card)} ${dir}`}
                      title={`Move ${dir} (Shift+Arrow)`}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveCardTo(card, i + step)
                      }}
                    >
                      <span aria-hidden>{glyph}</span>
                    </button>
                  ))}
                </span>
              )}
              {/* What the next tap does, on the card it will do it to. Sized
                and placed by actTabLayout; counter-rotated out of the fan's
                tilt so the label reads straight, and shifted with the same
                edge clamp as the lens it rides. Hidden from assistive tech:
                nothing reaches a peek without a pointer, and the card button
                is the only control here. */}
              {actLabel && !draggingId && (
                <span
                  className="bb2-card-act"
                  data-testid={`card-act-${card.id}`}
                  data-variant={selected ? 'back' : undefined}
                  aria-hidden
                  style={{
                    bottom: `${actTab.bottom}px`,
                    height: `${actTab.height}px`,
                    width: `${actTab.width}px`,
                    transform: `translateX(calc(-50% + ${lensShiftX(i, n, spacing, fanWidth, lens.scale)}px)) rotate(${-angle}deg)`,
                  }}
                >
                  {actLabel}
                </span>
              )}
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
      {/* Reordering is silent otherwise — the fan is the only feedback. */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
