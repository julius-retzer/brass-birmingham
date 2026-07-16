'use client'

// Full-screen moments: the pass-the-device curtain and the final scoring.
import { useMemo, useState } from 'react'
import { type Merchant, type Player } from '~/store/gameStore'
import { BoardMap, PLAYER_FILL } from './board/board-map'
import { CardBack } from './cards'
import { IncomeIcon, LaurelIcon, PoundIcon } from './icons'
import {
  type PlayerBreakdown,
  annotationsFor,
  buildBreakdown,
} from './vp-breakdown'

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
      data-testid="pass-curtain"
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

      <button
        type="button"
        className="bb2-confirm max-w-xs"
        data-testid="reveal-hand"
        onClick={onReveal}
      >
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
  era,
  merchants,
}: {
  players: Player[]
  winners: string[]
  onRestart: () => void
  /** Board context for the final map. Omit to fall back to a bare scoreboard. */
  era?: 'canal' | 'rail'
  merchants?: Merchant[]
}) {
  const ranked = [...players].sort(
    (a, b) =>
      b.victoryPoints - a.victoryPoints ||
      b.income - a.income ||
      b.money - a.money,
  )

  // One player's annotations at a time — every player's roundels at once is
  // unreadable on a board this dense. Defaults to the winner.
  const [shownId, setShownId] = useState<string>(
    () => ranked.find((p) => winners.includes(p.id))?.id ?? ranked[0]?.id ?? '',
  )
  const shown = ranked.find((p) => p.id === shownId) ?? ranked[0]
  const breakdown = shown ? buildBreakdown(shown) : null
  const annotations = useMemo(
    () => (shown ? annotationsFor(shown) : null),
    [shown],
  )

  const showMap = era !== undefined && merchants !== undefined

  return (
    <div className="flex h-screen min-h-screen flex-col gap-3 p-3">
      {/* ---------- banner ---------- */}
      <div className="bb2-rise flex flex-none flex-col items-center gap-1 text-center">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.34em]"
          style={{ color: 'var(--bb-brass)' }}
        >
          The books are closed
        </span>
        <h1
          className="bb2-display text-4xl font-black"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          {ranked
            .filter((p) => winners.includes(p.id))
            .map((p) => p.name)
            .join(' & ')}{' '}
          prevails
        </h1>
      </div>

      {/* ---------- final board + ledger ---------- */}
      <div className="flex min-h-0 flex-col gap-3 lg:flex-1 lg:flex-row">
        {showMap && (
          <div className="bb2-board-frame h-[42vh] min-h-[280px] lg:h-auto lg:min-h-0 lg:flex-1">
            <div className="bb2-board-inner">
              <BoardMap
                players={players}
                era={era}
                merchants={merchants}
                vpAnnotations={annotations}
                vpColor={shown ? PLAYER_FILL[shown.color] : null}
                prompt={
                  shown
                    ? `${shown.name}'s scoring — every roundel is VP banked`
                    : null
                }
              />
            </div>
          </div>
        )}

        <aside className="flex w-full flex-none flex-col gap-3 lg:w-[420px] lg:overflow-y-auto">
          {/* scoreboard — rows pick whose scoring the map shows */}
          <div className="bb2-panel p-4">
            <div
              className="flex items-center justify-end gap-4 px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'rgba(231,215,177,.45)' }}
            >
              <span className="flex items-center gap-1">
                <LaurelIcon size={11} /> victory
              </span>
              <span className="flex items-center gap-1">
                <IncomeIcon size={11} /> income
              </span>
              <span className="flex items-center gap-1">
                <PoundIcon size={11} /> money
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {ranked.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="bb2-mat"
                  data-current={winners.includes(p.id)}
                  data-shown={p.id === shownId || undefined}
                  data-testid={`score-row-${p.id}`}
                  aria-pressed={p.id === shownId}
                  onClick={() => setShownId(p.id)}
                  style={{
                    outline:
                      p.id === shownId
                        ? `2px solid ${PLAYER_FILL[p.color]}`
                        : undefined,
                    outlineOffset: '1px',
                  }}
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
                      className="bb2-display flex-1 text-left text-lg font-bold"
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
                </button>
              ))}
            </div>
            <p
              className="pt-3 text-center text-[11.5px]"
              style={{ color: 'rgba(231,215,177,.4)' }}
            >
              Ties break by income, then by money in the treasury.
            </p>
          </div>

          {/* the ledger for whoever is selected */}
          {shown && breakdown && (
            <VpLedger player={shown} breakdown={breakdown} />
          )}
        </aside>
      </div>

      <div className="flex flex-none justify-center">
        <button
          type="button"
          className="bb2-confirm max-w-xs"
          onClick={onRestart}
        >
          Found a new company
        </button>
      </div>
    </div>
  )
}

/** Where one player's victory points actually came from. */
function VpLedger({
  player,
  breakdown,
}: {
  player: Player
  breakdown: PlayerBreakdown
}) {
  return (
    <div className="bb2-panel p-4" data-testid="vp-ledger">
      <div className="bb2-panel-title flex items-center justify-between">
        <span>{player.name}&rsquo;s ledger</span>
        <span style={{ color: 'var(--bb-brass-bright)' }}>
          {breakdown.scoreboardTotal} VP
        </span>
      </div>

      {breakdown.sections.length === 0 && (
        <p
          className="pt-3 text-[12px]"
          style={{ color: 'rgba(231,215,177,.45)' }}
        >
          Nothing scored — no flipped industries, links or bonuses.
        </p>
      )}

      <div className="flex flex-col gap-3 pt-3">
        {breakdown.sections.map((section) => (
          <div key={section.source}>
            <div className="flex items-baseline justify-between">
              <span
                className="bb2-stat-label"
                style={{ color: 'rgba(231,215,177,.55)' }}
              >
                {section.title}
              </span>
              <span
                className="bb2-display text-[15px] font-bold tabular-nums"
                style={{ color: 'var(--bb-brass-bright)' }}
                data-testid={`subtotal-${section.source}`}
              >
                {section.subtotal > 0 ? '+' : ''}
                {section.subtotal}
              </span>
            </div>
            <div className="bb2-rule my-1" />
            <ul className="flex flex-col gap-0.5">
              {section.lines.map((line) => (
                <li
                  key={line.key}
                  className="flex items-baseline gap-2 text-[12px]"
                  style={{ color: 'rgba(231,215,177,.75)' }}
                >
                  <span className="flex-none font-semibold">{line.label}</span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ color: 'rgba(231,215,177,.42)' }}
                  >
                    {line.detail}
                  </span>
                  <span
                    className="flex-none text-[9.5px] font-semibold uppercase tracking-[0.14em]"
                    style={{
                      color:
                        line.era === 'canal'
                          ? 'var(--bb-canal)'
                          : 'var(--bb-rail)',
                    }}
                  >
                    {line.era}
                  </span>
                  <span
                    className="w-8 flex-none text-right font-bold tabular-nums"
                    style={{ color: 'var(--bb-parchment-bright)' }}
                  >
                    {line.vp > 0 ? '+' : ''}
                    {line.vp}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bb2-rule my-3" />
      <div className="flex items-baseline justify-between">
        <span className="bb2-stat-label">Total</span>
        <span
          className="bb2-display text-xl font-black tabular-nums"
          style={{ color: 'var(--bb-brass-bright)' }}
          data-testid="ledger-total"
        >
          {breakdown.total} VP
        </span>
      </div>

      {/* The ledger is derived from what the engine actually awarded, so a
          mismatch is a scoring bug — say so instead of hiding it. */}
      {!breakdown.reconciles && (
        <p
          className="mt-2 rounded p-2 text-[11.5px]"
          data-testid="ledger-mismatch"
          style={{
            color: 'var(--bb-parchment-bright)',
            background: 'rgba(193,68,52,.22)',
            border: '1px solid var(--bb-danger)',
          }}
        >
          This ledger sums to {breakdown.total} VP but the scoreboard shows{' '}
          {breakdown.scoreboardTotal} VP —{' '}
          {breakdown.scoreboardTotal - breakdown.total} VP is unaccounted for.
          Please report this.
        </p>
      )}
    </div>
  )
}
