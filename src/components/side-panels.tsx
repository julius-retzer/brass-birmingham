'use client'

// Right-dock reference panels: the collapsible shell and the coal & iron
// exchanges. The journal moved to journal.tsx (with its presentation model
// in journal-model.ts).
import { type ReactNode, useState } from 'react'
import { type GameState } from '~/store/gameStore'

/* ---------------- collapsible shell ---------------- */

// The collapse affordance the chat panel established (`ChatPanel` in
// mp/mp-game.tsx): the title row doubles as the toggle, caret on the right.
export function CollapsiblePanel({
  title,
  testId,
  panelTestId,
  defaultOpen = true,
  openClassName = '',
  children,
}: {
  title: string
  testId?: string
  panelTestId?: string
  defaultOpen?: boolean
  // Applied only while open — layout that must not reserve space for content
  // that isn't rendered (e.g. the journal's min-height floor).
  openClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className={`bb2-panel flex flex-col gap-2 p-3 ${open ? openClassName : ''}`}
      data-testid={panelTestId}
      data-open={open}
    >
      <button
        type="button"
        className="flex flex-none items-center justify-between"
        data-testid={testId}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="bb2-panel-title">{title}</span>
        <span style={{ color: 'rgba(231,215,177,.5)', fontSize: 11 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && children}
    </div>
  )
}

/* ---------------- markets ---------------- */

function MarketTrack({
  title,
  rows,
  cubeFill,
  cubeStroke,
}: {
  title: string
  rows: Array<{ price: number; cubes: number; maxCubes: number }>
  cubeFill: string
  cubeStroke: string
}) {
  const cheapest = rows.find((r) => r.cubes > 0)?.price
  // Physical-board orientation: prices ascend UPWARD — £1 at the bottom.
  // Setup leaves only £1 spaces open and buying drains cheapest-first, so
  // empties accumulate at the BOTTOM, exactly like the real market track.
  const display = [...rows].reverse()
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <span
        className="text-[11.5px] font-bold uppercase tracking-[0.2em]"
        style={{ color: 'rgba(231,215,177,.55)' }}
      >
        {title}
      </span>
      <div className="flex flex-col gap-[3px]">
        {display.map((row) => {
          // The top price row has infinite capacity (serialized saves may
          // carry it as null) — draw its held cubes plus an ∞ mark.
          const bottomless = !Number.isFinite(row.maxCubes)
          const boxes = bottomless
            ? Math.min(row.cubes, 6)
            : Math.min(row.maxCubes, 8)
          return (
            <div key={row.price} className="flex items-center gap-1.5">
              <span
                className="w-7 text-right text-[12.5px] font-semibold tabular-nums"
                style={{
                  color:
                    row.price === cheapest
                      ? 'var(--bb-brass-bright)'
                      : 'rgba(231,215,177,.5)',
                }}
              >
                £{row.price}
              </span>
              <div className="flex items-center gap-[3px]">
                {Array.from({ length: boxes }, (_, i) => (
                  <span
                    key={i}
                    className="inline-block h-[9px] w-[9px] rounded-[2px]"
                    style={{
                      background: i < row.cubes ? cubeFill : 'transparent',
                      border: `1px solid ${
                        i < row.cubes ? cubeStroke : 'rgba(231,215,177,.18)'
                      }`,
                    }}
                  />
                ))}
                {bottomless && (
                  <span
                    className="text-[10px] leading-none"
                    style={{ color: 'rgba(231,215,177,.45)' }}
                    title="Unlimited supply at this price"
                  >
                    ∞
                  </span>
                )}
              </div>
              {row.price === cheapest && (
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--bb-brass)' }}
                >
                  next
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MarketsPanel({
  coalMarket,
  ironMarket,
}: {
  coalMarket: GameState['coalMarket']
  ironMarket: GameState['ironMarket']
}) {
  return (
    <CollapsiblePanel title="The Exchanges" testId="markets-toggle">
      <div className="flex gap-5">
        <MarketTrack
          title="Coal"
          rows={coalMarket}
          cubeFill="#55504a"
          cubeStroke="#8d867c"
        />
        <MarketTrack
          title="Iron"
          rows={ironMarket}
          cubeFill="#c2632f"
          cubeStroke="#7c3d1c"
        />
      </div>
    </CollapsiblePanel>
  )
}
