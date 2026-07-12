'use client'

// Right-dock reference panels: the coal & iron exchanges and the journal.
import { type GameState, type LogEntry } from '~/store/gameStore'

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
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.2em]"
        style={{ color: 'rgba(231,215,177,.55)' }}
      >
        {title}
      </span>
      <div className="flex flex-col gap-[3px]">
        {rows.map((row) => {
          // The top price row has infinite capacity (serialized saves may
          // carry it as null) — draw its held cubes plus an ∞ mark.
          const bottomless = !Number.isFinite(row.maxCubes)
          const boxes = bottomless
            ? Math.min(row.cubes, 6)
            : Math.min(row.maxCubes, 8)
          return (
            <div key={row.price} className="flex items-center gap-1.5">
              <span
                className="w-6 text-right text-[11px] font-semibold tabular-nums"
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
                  className="text-[9px] font-bold uppercase tracking-[0.16em]"
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
    <div className="bb2-panel flex flex-col gap-3 p-3">
      <span className="bb2-panel-title">The Exchanges</span>
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
    </div>
  )
}

/* ---------------- journal ---------------- */

export function JournalPanel({ logs }: { logs: LogEntry[] }) {
  const recent = logs.slice(-40).reverse()
  return (
    <div className="bb2-panel flex min-h-0 flex-1 flex-col gap-2 p-3">
      <span className="bb2-panel-title">Journal</span>
      <div className="bb2-log min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {recent.map((entry, i) => (
          <div
            key={i}
            className="bb2-log-entry"
            data-testid="journal-entry"
            data-type={entry.type}
          >
            {entry.message}
          </div>
        ))}
        {recent.length === 0 && (
          <p className="text-[12px]" style={{ color: 'rgba(231,215,177,.4)' }}>
            The journal is empty.
          </p>
        )}
      </div>
    </div>
  )
}
