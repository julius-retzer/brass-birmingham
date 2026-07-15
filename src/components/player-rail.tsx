'use client'

// One compact mat per industrialist, in seating order — the strip under the
// masthead. Shows the numbers players actually reason about between turns,
// including "spent this round" (turn order is set by least-spender-first).
// Tapping a mat opens that player's full ledger (tile mat + holdings).
import { type GameState, type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'
import { CardsIcon, IncomeIcon, LaurelIcon, PoundIcon } from './icons'

function Stat({
  label,
  value,
  icon,
  accent,
  testId,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  accent?: string
  testId?: string
}) {
  return (
    <div className="flex min-w-[52px] flex-col items-start gap-0.5">
      <span className="bb2-stat-label">{label}</span>
      <span
        className="bb2-stat-value flex items-center gap-1"
        data-testid={testId}
        style={accent ? { color: accent } : undefined}
      >
        {icon}
        {value}
      </span>
    </div>
  )
}

export function PlayerRail({
  players,
  currentPlayerId,
  turnOrder,
  playerSpending,
  onOpenLedger,
}: {
  players: Player[]
  currentPlayerId: string | undefined
  turnOrder: GameState['turnOrder']
  playerSpending: GameState['playerSpending']
  onOpenLedger?: (playerId: string) => void
}) {
  const ordered = [...players].sort(
    (a, b) => turnOrder.indexOf(a.id) - turnOrder.indexOf(b.id),
  )
  return (
    <div
      className="flex gap-2 overflow-x-auto px-3 pb-2 lg:grid lg:overflow-visible"
      style={{
        gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 1fr))`,
      }}
    >
      {ordered.map((p, i) => {
        const isCurrent = p.id === currentPlayerId
        const spent = playerSpending[p.id] ?? 0
        return (
          <button
            key={p.id}
            type="button"
            className="bb2-mat min-w-[290px] text-left lg:min-w-0"
            data-testid={`mat-${p.id}`}
            data-current={isCurrent}
            onClick={() => onOpenLedger?.(p.id)}
            title={`Open ${p.name}'s ledger`}
          >
            <div
              className="bb2-mat-ribbon"
              style={{ background: PLAYER_FILL[p.color] }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
              <div className="flex items-baseline gap-2">
                <span
                  className="bb2-display truncate text-[17px] font-bold leading-none"
                  style={{
                    color: isCurrent
                      ? 'var(--bb-brass-bright)'
                      : 'var(--bb-parchment)',
                  }}
                >
                  {p.name}
                </span>
                <span
                  className="truncate text-[11.5px] uppercase tracking-[0.14em]"
                  style={{ color: 'rgba(231,215,177,.4)' }}
                >
                  {i + 1}
                  {i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} ·{' '}
                  {p.character}
                </span>
                {isCurrent && (
                  <span
                    className="ml-auto flex-none text-[10px] font-bold uppercase tracking-[0.22em]"
                    style={{ color: 'var(--bb-brass-bright)' }}
                  >
                    · to act ·
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                <Stat
                  label="Treasury"
                  value={`£${p.money}`}
                  icon={<PoundIcon size={12} />}
                  testId="treasury"
                />
                <Stat
                  label="Income"
                  value={p.income}
                  icon={<IncomeIcon size={12} />}
                />
                <Stat
                  label="Victory"
                  value={p.victoryPoints}
                  icon={<LaurelIcon size={12} />}
                />
                <Stat
                  label="Spent"
                  value={`£${spent}`}
                  accent={
                    spent > 0 ? 'var(--bb-rail)' : 'rgba(231,215,177,.55)'
                  }
                />
                <Stat
                  label="Hand"
                  value={p.hand.length}
                  icon={<CardsIcon size={12} />}
                />
                <Stat label="Works" value={p.industries.length} />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
