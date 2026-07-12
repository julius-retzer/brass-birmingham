'use client'

// Full-screen moments: the pass-the-device curtain and the final scoring.
import { type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'
import { CardBack } from './cards'
import { IncomeIcon, LaurelIcon, PoundIcon } from './icons'

export function PassGate({
  player,
  round,
  era,
  onReveal,
}: {
  player: Player
  round: number
  era: 'canal' | 'rail'
  onReveal: () => void
}) {
  return (
    <div
      className="bb2-curtain fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
      style={{
        background:
          'radial-gradient(900px 600px at 50% 30%, rgba(214,168,84,.06), transparent 60%), linear-gradient(180deg, rgba(16,13,10,.97), rgba(12,10,8,.99))',
      }}
    >
      {/* face-down hand */}
      <div className="flex" aria-hidden>
        {[-10, -5, 0, 5, 10].map((r, i) => (
          <div
            key={r}
            className="-mx-6"
            style={{
              transform: `rotate(${r}deg) translateY(${Math.abs(r) * 1.4}px)`,
              zIndex: i,
            }}
          >
            <CardBack />
          </div>
        ))}
      </div>

      <div className="bb2-seal-pop flex flex-col items-center gap-2 text-center">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.34em]"
          style={{ color: 'rgba(231,215,177,.5)' }}
        >
          {era} era · round {round} — pass the device to
        </span>
        <span
          className="bb2-display text-6xl font-black"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          {player.name}
        </span>
        <span
          className="mt-1 h-1.5 w-40 rounded-full"
          style={{ background: PLAYER_FILL[player.color] }}
        />
        <span
          className="text-[12px] italic"
          style={{
            color: 'rgba(231,215,177,.55)',
            fontFamily: 'var(--bb-display)',
          }}
        >
          {player.character}
        </span>
      </div>

      <button type="button" className="bb2-confirm max-w-xs" onClick={onReveal}>
        Reveal my hand
      </button>
      <p className="text-[11px]" style={{ color: 'rgba(231,215,177,.35)' }}>
        Only {player.name} should be looking at the screen.
      </p>
    </div>
  )
}

export function GameOverScreen({
  players,
  winners,
  onRestart,
}: {
  players: Player[]
  winners: string[]
  onRestart: () => void
}) {
  const ranked = [...players].sort(
    (a, b) =>
      b.victoryPoints - a.victoryPoints ||
      b.income - a.income ||
      b.money - a.money,
  )
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="bb2-rise flex flex-col items-center gap-2 text-center">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.34em]"
          style={{ color: 'var(--bb-brass)' }}
        >
          The books are closed
        </span>
        <h1
          className="bb2-display text-5xl font-black"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          {ranked
            .filter((p) => winners.includes(p.id))
            .map((p) => p.name)
            .join(' & ')}{' '}
          prevails
        </h1>
      </div>

      <div className="bb2-panel w-full max-w-xl p-4">
        <div className="flex flex-col gap-2">
          {ranked.map((p, i) => (
            <div
              key={p.id}
              className="bb2-mat"
              data-current={winners.includes(p.id)}
            >
              <div
                className="bb2-mat-ribbon"
                style={{ background: PLAYER_FILL[p.color] }}
              />
              <div className="flex flex-1 items-center gap-4 py-1">
                <span
                  className="bb2-display w-8 text-center text-2xl font-black"
                  style={{
                    color:
                      i === 0
                        ? 'var(--bb-brass-bright)'
                        : 'rgba(231,215,177,.4)',
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="bb2-display flex-1 text-lg font-bold"
                  style={{ color: 'var(--bb-parchment-bright)' }}
                >
                  {p.name}
                </span>
                <span className="bb2-stat-value flex items-center gap-1.5">
                  <LaurelIcon size={14} /> {p.victoryPoints}
                </span>
                <span className="bb2-stat-value flex items-center gap-1.5">
                  <IncomeIcon size={14} /> {p.income}
                </span>
                <span className="bb2-stat-value flex items-center gap-1.5">
                  <PoundIcon size={14} /> {p.money}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="bb2-confirm max-w-xs"
        onClick={onRestart}
      >
        Found a new company
      </button>
    </div>
  )
}
