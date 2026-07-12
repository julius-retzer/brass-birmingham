'use client'

// The company charter — local hotseat setup.
import { useState } from 'react'
import { type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'

const COLORS: Player['color'][] = ['red', 'blue', 'green', 'yellow']
const CHARACTERS: Player['character'][] = [
  'Eliza Tinsley',
  'Isambard Kingdom Brunel',
  'George Stephenson',
  'Richard Arkwright',
]
const DEFAULT_NAMES = ['Eliza', 'Isambard', 'George', 'Richard']

export type SetupPlayer = Omit<Player, 'hand' | 'links' | 'industries'>

export function SetupScreen({
  onStart,
}: {
  onStart: (players: SetupPlayer[]) => void
}) {
  const [count, setCount] = useState(3)
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES)

  const start = () => {
    onStart(
      Array.from({ length: count }, (_, i) => ({
        id: String(i + 1),
        name: names[i]?.trim() || DEFAULT_NAMES[i]!,
        color: COLORS[i]!,
        character: CHARACTERS[i]!,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as Player['industryTilesOnMat'],
      })),
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="bb2-rise flex flex-col items-center gap-1 text-center">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.4em]"
          style={{ color: 'var(--bb-brass)' }}
        >
          Birmingham · 1770
        </span>
        <h1
          className="bb2-display text-7xl font-black tracking-wide"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          BRASS
        </h1>
        <p
          className="bb2-display text-lg italic"
          style={{ color: 'rgba(231,215,177,.65)' }}
        >
          The Ironmaster&rsquo;s Atlas — pass one device between players
        </p>
      </div>

      <div
        className="bb2-panel bb2-rise flex w-full max-w-md flex-col gap-5 p-6"
        style={{ animationDelay: '0.12s' }}
      >
        <span className="bb2-panel-title">Company charter</span>

        <div className="flex flex-col gap-2">
          <span className="bb2-stat-label">Industrialists at the table</span>
          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className="bb2-option justify-center py-2.5"
                data-selected={count === n}
                onClick={() => setCount(n)}
              >
                <span className="bb2-display text-lg font-bold">{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className="h-8 w-2 flex-none rounded-full"
                style={{ background: PLAYER_FILL[COLORS[i]!] }}
              />
              <input
                value={names[i] ?? ''}
                onChange={(e) =>
                  setNames((prev) => {
                    const next = [...prev]
                    next[i] = e.target.value
                    return next
                  })
                }
                placeholder={DEFAULT_NAMES[i]}
                className="w-full rounded border bg-transparent px-3 py-2 text-[14px] outline-none transition-colors"
                style={{
                  borderColor: 'rgba(231,215,177,.2)',
                  color: 'var(--bb-parchment-bright)',
                }}
              />
              <span
                className="w-28 flex-none text-right text-[10px] uppercase tracking-[0.12em]"
                style={{ color: 'rgba(231,215,177,.4)' }}
              >
                {CHARACTERS[i]}
              </span>
            </div>
          ))}
        </div>

        <button type="button" className="bb2-confirm" onClick={start}>
          Open the ledger
        </button>
      </div>
    </div>
  )
}
