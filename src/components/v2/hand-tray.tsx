'use client'

// The player's hand as a fan of real cards along the bottom of the table.
// When an action flow needs a discard the fan itself becomes the selector.
import { type Card as GameCard } from '~/data/cards'
import { CardFaceContent } from './cards'

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

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center lg:right-[392px]">
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
      <div className="bb2-hand -mb-5 h-[150px] w-full max-w-3xl origin-bottom scale-[0.72] sm:scale-90 lg:scale-100">
        {hand.map((card, i) => {
          const angle = (i - (n - 1) / 2) * (n > 6 ? 4 : 5.5)
          const lift = Math.abs(i - (n - 1) / 2) * (n > 6 ? 5 : 7)
          const selected = selectedIds.includes(card.id)
          const enabled = selecting
            ? (canSelect?.(card.id) ?? false) || selected
            : false
          return (
            // The fan transform and hover events live on a wrapper: mouse
            // events don't fire on disabled buttons, but the hover preview
            // should work even when the hand is display-only.
            <span
              key={card.id}
              className="bb2-card-seat"
              style={{
                transform: `rotate(${angle}deg) translateY(${lift}px)`,
                zIndex: i,
              }}
              onMouseEnter={() => onHoverCard?.(card)}
              onMouseLeave={() => onHoverCard?.(null)}
            >
              <button
                type="button"
                className="bb2-card"
                data-testid={`card-${card.id}`}
                data-selected={selected || undefined}
                data-dimmed={(selecting && !enabled && !selected) || undefined}
                disabled={selecting ? !enabled : true}
                onClick={() => enabled && onSelect?.(card.id)}
                style={{
                  cursor: selecting
                    ? enabled
                      ? 'pointer'
                      : 'not-allowed'
                    : 'default',
                }}
                aria-label={`Card: ${card.id}`}
              >
                <CardFaceContent card={card} />
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
