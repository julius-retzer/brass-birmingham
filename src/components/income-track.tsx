'use client'

// The income Progress Track — the snaking 0..99 track printed around the
// board edge, made visible. Shows every income level with its £/round coin
// value, the non-linear number of spaces it spans (1→2→3→4 as income climbs,
// so higher income is slower to reach), and where each player's marker sits.
// Opened from the rail's Income stat; mirrors PlayerLedger's modal shell.
import { useEffect } from 'react'
import { incomeTrackLevels } from '~/data/incomeTrack'
import { type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'
import { IncomeIcon } from './icons'

const TRACK = incomeTrackLevels()

// £/round the coin pays. Negative levels are a debt settled from the treasury.
function formatIncome(level: number): string {
  return level < 0 ? `−£${-level}` : `£${level}`
}

export function IncomeTrackModal({
  players,
  currentPlayerId,
  onClose,
}: {
  players: Player[]
  currentPlayerId: string | undefined
  onClose: () => void
}) {
  // Escape closes, matching every other overlay in the game.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const currentLevel = currentPlayer?.income

  // Which players sit on each space, resolved once.
  const playersOnSpace = new Map<number, Player[]>()
  for (const p of players) {
    const list = playersOnSpace.get(p.incomeSpace) ?? []
    list.push(p)
    playersOnSpace.set(p.incomeSpace, list)
  }

  // Highest income at the top — reads like climbing the track.
  const rows = [...TRACK].reverse()

  return (
    <div
      className="bb2-curtain fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(10, 8, 6, 0.82)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bb2-panel bb2-rise flex max-h-[92vh] w-full max-w-xl flex-col p-5"
        role="dialog"
        aria-label="Income track"
        data-testid="income-track-modal"
      >
        {/* header */}
        <div className="flex items-center gap-3 pb-4">
          <IncomeIcon size={22} />
          <div className="flex flex-col">
            <span
              className="bb2-display text-[24px] font-black leading-none"
              style={{ color: 'var(--bb-parchment-bright)' }}
            >
              Income track
            </span>
            <span
              className="text-[12px] uppercase tracking-[0.18em]"
              style={{ color: 'rgba(231,215,177,.45)' }}
            >
              £ collected each round
            </span>
          </div>
          <button
            type="button"
            className="bb2-ghost-btn ml-auto"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <hr className="bb2-rule" />

        {/* per-player summary */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-4">
          {players.map((p) => {
            const isCurrent = p.id === currentPlayerId
            return (
              <span
                key={p.id}
                className="flex items-center gap-1.5 text-[13px]"
                style={{ color: 'var(--bb-parchment)' }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: PLAYER_FILL[p.color] }}
                />
                <span style={{ fontWeight: isCurrent ? 700 : 400 }}>
                  {p.name}
                </span>
                <span
                  className="tabular-nums"
                  style={{ color: 'var(--bb-parchment-bright)' }}
                >
                  {formatIncome(p.income)}/rd
                </span>
                {isCurrent && (
                  <span
                    className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--bb-brass-bright)' }}
                  >
                    · to act
                  </span>
                )}
              </span>
            )
          })}
        </div>

        <p
          className="pt-3 text-[12px] leading-snug"
          style={{ color: 'rgba(231,215,177,.5)' }}
        >
          Each cell is one space on the board track. A level spans more spaces
          the higher the income — one space low down, up to four near the top —
          so each extra £ of income takes longer to earn. Loans drop you three
          levels; a negative level is a debt paid from your treasury.
        </p>

        {/* the track — scrolls within the modal, highest income first */}
        <div
          className="mt-3 flex flex-col gap-[3px] overflow-y-auto pr-1"
          data-testid="income-track-levels"
        >
          {rows.map(({ level, spaces }) => {
            const isCurrentLevel = level === currentLevel
            return (
              <div
                key={level}
                data-testid={`income-level-${level}`}
                data-current={isCurrentLevel || undefined}
                className="flex items-center gap-2 rounded px-2 py-1"
                style={{
                  background: isCurrentLevel
                    ? 'rgba(195,149,56,.12)'
                    : 'rgba(255,240,200,.02)',
                  boxShadow: isCurrentLevel
                    ? 'inset 0 0 0 1px rgba(230,189,99,.4)'
                    : undefined,
                }}
              >
                <span
                  className="bb2-display w-12 flex-none text-right text-[14px] font-bold tabular-nums"
                  style={{
                    color: isCurrentLevel
                      ? 'var(--bb-brass-bright)'
                      : level < 0
                        ? 'var(--bb-danger)'
                        : 'var(--bb-parchment)',
                  }}
                >
                  {formatIncome(level)}
                </span>
                <div className="flex flex-wrap items-center gap-[3px]">
                  {spaces.map((space) => {
                    const here = playersOnSpace.get(space) ?? []
                    return (
                      <span
                        key={space}
                        title={`Space ${space}`}
                        className="relative flex h-5 min-w-[20px] items-center justify-center gap-0.5 rounded-[3px] px-0.5"
                        style={{
                          border: '1px solid rgba(231,215,177,.14)',
                          background:
                            here.length > 0
                              ? 'rgba(255,240,200,.05)'
                              : 'transparent',
                        }}
                      >
                        {here.length === 0 ? (
                          <span
                            className="text-[8px] tabular-nums"
                            style={{ color: 'rgba(231,215,177,.28)' }}
                          >
                            {space}
                          </span>
                        ) : (
                          here.map((p) => (
                            <span
                              key={p.id}
                              title={`${p.name} — space ${space}`}
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{
                                background: PLAYER_FILL[p.color],
                                boxShadow: '0 0 0 1px rgba(10,8,6,.6)',
                              }}
                            />
                          ))
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
