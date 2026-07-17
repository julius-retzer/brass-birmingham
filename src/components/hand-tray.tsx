'use client'

// The player's hand as a fan of real cards along the bottom of the table.
// When an action flow needs a discard the fan itself becomes the selector.
//
// A hovered (mouse) or peeked (touch: first tap) card magnifies dock-style:
// the visual lens scales up while its 108×156 button hitbox stays put, and
// neighbours slide aside. Pure geometry lives in hand-tray-layout.ts.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Card as GameCard } from '~/data/cards'
import { CardFaceContent } from './cards'
import {
  LENS_COARSE,
  LENS_FINE,
  dockShift,
  fanAngle,
  fanLayout,
  fanLift,
  lensReach,
  lensShiftX,
} from './hand-tray-layout'

export interface HandTrayProps {
  hand: GameCard[]
  /** null = hand is just on display; otherwise cards become selectable */
  canSelect: ((cardId: string) => boolean) | null
  onSelect?: (cardId: string) => void
  selectedIds?: string[]
  hint?: string | null
  /** Hover preview: the shell highlights the card's targets on the map. */
  onHoverCard?: (card: GameCard | null) => void
}

export function HandTray({
  hand,
  canSelect,
  onSelect,
  selectedIds = [],
  hint,
  onHoverCard,
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
      onHoverCard?.(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [peekedId, onHoverCard])

  // The peeked card may leave the hand (played, era end) under the peek.
  useEffect(() => {
    if (peekedId && !hand.some((c) => c.id === peekedId)) setPeekedId(null)
  }, [hand, peekedId])

  const setPeek = (card: GameCard | null) => {
    setPeekedId(card?.id ?? null)
    onHoverCard?.(card)
  }

  const raisedId = peekedId ?? hoveredId
  const raisedIndex = raisedId ? hand.findIndex((c) => c.id === raisedId) : -1
  const lens = coarse ? LENS_COARSE : LENS_FINE
  const { spacing, marginX } = fanLayout(n, fanWidth)

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center lg:right-[392px]"
    >
      {hint && (
        <div
          className="bb2-rise pointer-events-auto mb-2 rounded border px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em]"
          style={{
            background: 'rgba(20,16,11,.92)',
            borderColor: 'var(--bb-brass)',
            color: 'var(--bb-brass-bright)',
            boxShadow: '0 6px 18px rgba(0,0,0,.5)',
          }}
        >
          {hint}
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
                if (e.pointerType !== 'touch') {
                  setHoveredId(card.id)
                  onHoverCard?.(card)
                }
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== 'touch') {
                  setHoveredId((h) => (h === card.id ? null : h))
                  onHoverCard?.(null)
                }
              }}
              onPointerDown={(e) => {
                lastPointerType.current = e.pointerType
              }}
              onPointerUp={(e) => {
                // Disabled buttons swallow click, so a display-only or
                // dimmed card's touch peek toggles here instead.
                if (e.pointerType === 'touch' && disabled)
                  setPeek(peekedId === card.id ? null : card)
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
                    '--bb-lens-reach': `${lensReach(lens)}px`,
                  } as React.CSSProperties
                }
                aria-label={`Card: ${card.id}`}
              >
                <span
                  className="bb2-card bb2-card-lens"
                  style={
                    raised
                      ? {
                          transform: `translate(${lensShiftX(i, n, spacing, fanWidth, lens.scale)}px, ${-lens.rise}px) rotate(${-angle}deg) scale(${lens.scale})`,
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
