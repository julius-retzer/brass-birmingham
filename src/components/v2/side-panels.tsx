'use client'

// Right-dock reference panels: the coal & iron exchanges and the journal.
import { type GameState, type LogEntry, type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'

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

// Emphasis for scanning: player names glow in their colour, amounts
// (£, income, VP, levels, resources) in bold parchment. Pure inline
// wrapping — the TEXT CONTENT is unchanged, so e2e journal-text pins and
// copy/paste behave exactly as before.
const AMOUNT_RE =
  /£\d+|[+-]\d+ income|\d+ (?:VP|income levels?|beers?|coal|iron|cards?|wilds?|spaces?|industries)|Level \d+|\(\d+ industries sold\)/g

function emphasize(
  message: string,
  players: Array<{ name: string; color: Player['color'] }>,
): React.ReactNode[] {
  // Split on player names first (longest first so "Georgeanne" wins over
  // "George"), then bold amounts inside the remaining text runs.
  const names = [...players].sort((a, b) => b.name.length - a.name.length)
  const nodes: React.ReactNode[] = []
  let key = 0

  const pushText = (text: string) => {
    let last = 0
    for (const m of text.matchAll(AMOUNT_RE)) {
      if (m.index! > last) nodes.push(text.slice(last, m.index))
      nodes.push(
        <b key={key++} style={{ color: 'var(--bb-parchment-bright)' }}>
          {m[0]}
        </b>,
      )
      last = m.index! + m[0].length
    }
    if (last < text.length) nodes.push(text.slice(last))
  }

  let rest = message
  while (rest.length > 0) {
    let earliest: { idx: number; name: string; color: Player['color'] } | null =
      null
    for (const p of names) {
      const idx = rest.indexOf(p.name)
      if (idx !== -1 && (earliest === null || idx < earliest.idx)) {
        earliest = { idx, name: p.name, color: p.color }
      }
    }
    if (!earliest) {
      pushText(rest)
      break
    }
    if (earliest.idx > 0) pushText(rest.slice(0, earliest.idx))
    nodes.push(
      <b key={key++} style={{ color: PLAYER_FILL[earliest.color] }}>
        {earliest.name}
      </b>,
    )
    rest = rest.slice(earliest.idx + earliest.name.length)
  }
  return nodes
}

export function JournalPanel({
  logs,
  players = [],
}: {
  logs: LogEntry[]
  players?: Array<{ name: string; color: Player['color'] }>
}) {
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
            {players.length > 0
              ? emphasize(entry.message, players)
              : entry.message}
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
