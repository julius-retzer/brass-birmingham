'use client'

// Full-screen moments: the round-end curtain, the pass-the-device curtain and
// the final scoring.
import { useEffect, useMemo, useState } from 'react'
import {
  type Merchant,
  type Player,
  type RoundSummary,
} from '~/store/gameStore'
import { BoardMap, PLAYER_FILL } from './board/board-map'
import { CardBack } from './cards'
import { IncomeIcon, LaurelIcon, PoundIcon } from './icons'
import {
  type PlayerBreakdown,
  annotationsFor,
  buildBreakdown,
} from './vp-breakdown'

/** Height of one turn-order row, in px — the animation translates by it. */
const ORDER_ROW = 46

/**
 * The round-end interstitial: announces the round that closed, what each
 * player spent, and animates the spend-driven reordering of the turn order.
 *
 * Everything rendered here comes from the engine's own RoundSummary — the
 * order switch is the one the machine installed, not a recomputed guess.
 */
export function RoundCurtain({
  summary,
  players,
  onDismiss,
  autoDismissMs,
}: {
  summary: RoundSummary
  players: Player[]
  onDismiss: () => void
  /** When set, the curtain lifts itself after this long (multiplayer). */
  autoDismissMs?: number
}) {
  // The reorder animates from the old ranking to the new one shortly after
  // mount, so the switch is legible as a movement rather than a jump cut.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 850)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!autoDismissMs) return
    const t = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(t)
  }, [autoDismissMs, onDismiss])

  // Any key lifts the curtain — it is an announcement, never a prompt.
  useEffect(() => {
    const onKey = () => onDismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const spendRows = summary.previousOrder
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p))
  const topSpend = Math.max(
    1,
    ...Object.values(summary.spending).map((v) => Math.abs(v)),
  )

  return (
    <div
      className="bb2-curtain fixed inset-0 z-[60] flex flex-col items-center justify-center gap-7 overflow-y-auto p-6"
      data-testid="round-curtain"
      style={{
        background:
          'radial-gradient(900px 600px at 50% 25%, rgba(214,168,84,.07), transparent 60%), linear-gradient(180deg, rgba(16,13,10,.98), rgba(12,10,8,.99))',
      }}
      // A stray click anywhere dismisses; the button below is the signposted way.
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label={`Round ${summary.round} complete`}
    >
      <div className="bb2-seal-pop flex flex-col items-center gap-2 text-center">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.34em]"
          style={{ color: 'rgba(231,215,177,.5)' }}
        >
          {summary.era} era
        </span>
        <span
          className="bb2-display text-5xl font-black"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          Round {summary.round} complete
        </span>
        {summary.eraEnded && (
          <span
            className="bb2-chip mt-1"
            style={{ color: 'var(--bb-brass-bright)' }}
            data-testid="curtain-era-note"
          >
            deck spent — the {summary.era} era closes
          </span>
        )}
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
        {/* ---------- what everyone spent ---------- */}
        <section className="flex-1">
          <h3
            className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            Spent this round
          </h3>
          <ul className="flex flex-col gap-2">
            {spendRows.map((p) => {
              const spent = summary.spending[p.id] ?? 0
              const income = summary.income[p.id]
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3"
                  data-testid={`curtain-spend-${p.id}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: PLAYER_FILL[p.color] }}
                  />
                  <span
                    className="w-24 shrink-0 truncate text-[13px]"
                    style={{ color: 'var(--bb-parchment)' }}
                  >
                    {p.name}
                  </span>
                  {/* Spend bar — relative weight is the thing that decides order. */}
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(231,215,177,.08)]">
                    <span
                      className="bb2-spend-bar block h-full rounded-full"
                      style={{
                        width: `${(spent / topSpend) * 100}%`,
                        background: PLAYER_FILL[p.color],
                      }}
                    />
                  </span>
                  <span
                    className="w-12 shrink-0 text-right text-[13px] font-bold tabular-nums"
                    style={{ color: 'var(--bb-parchment-bright)' }}
                  >
                    £{spent}
                  </span>
                  {income !== undefined && (
                    <span
                      className="w-14 shrink-0 text-right text-[11px] tabular-nums"
                      style={{
                        color:
                          income >= 0 ? 'rgba(150,200,150,.75)' : '#e0968b',
                      }}
                      title="income collected at round end"
                    >
                      {income >= 0 ? '+' : '−'}£{Math.abs(income)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {/* ---------- the order switch ---------- */}
        <section className="flex-1">
          <h3
            className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            Turn order — round {summary.round + 1}
          </h3>
          <div
            className="relative"
            style={{ height: summary.newOrder.length * ORDER_ROW }}
            data-testid="curtain-order"
          >
            {summary.newOrder.map((id) => {
              const p = byId.get(id)
              if (!p) return null
              const from = summary.previousOrder.indexOf(id)
              const to = summary.newOrder.indexOf(id)
              const rank = settled ? to : from
              const moved = to - from
              return (
                <div
                  key={id}
                  className="bb2-order-row absolute inset-x-0 flex items-center gap-3 rounded border px-3 py-2"
                  data-testid={`curtain-order-${id}`}
                  data-rank={to + 1}
                  style={{
                    transform: `translateY(${rank * ORDER_ROW}px)`,
                    borderColor:
                      settled && to === 0
                        ? 'var(--bb-brass)'
                        : 'var(--bb-brass-hairline)',
                    background: 'rgba(20,16,11,.7)',
                  }}
                >
                  <span
                    className="bb2-display w-5 shrink-0 text-center text-[15px] font-black tabular-nums"
                    style={{ color: 'var(--bb-brass-bright)' }}
                  >
                    {rank + 1}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: PLAYER_FILL[p.color] }}
                  />
                  <span
                    className="flex-1 truncate text-[13px]"
                    style={{ color: 'var(--bb-parchment-bright)' }}
                  >
                    {p.name}
                  </span>
                  {moved !== 0 && (
                    <span
                      className="text-[11px] font-bold tabular-nums transition-opacity duration-300"
                      style={{
                        opacity: settled ? 1 : 0,
                        color: moved < 0 ? 'rgba(150,200,150,.85)' : '#e0968b',
                      }}
                    >
                      {moved < 0 ? '▲' : '▼'} {Math.abs(moved)}
                    </span>
                  )}
                  {settled && to === 0 && (
                    <span
                      className="text-[10px] uppercase tracking-[0.2em]"
                      style={{ color: 'var(--bb-brass)' }}
                    >
                      leads
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p
            className="mt-3 text-[11px] italic"
            style={{ color: 'rgba(231,215,177,.45)' }}
          >
            The lightest spender leads the next round; equal spenders keep their
            order.
          </p>
        </section>
      </div>

      <button
        type="button"
        className="bb2-confirm max-w-xs"
        data-testid="round-curtain-dismiss"
        onClick={onDismiss}
      >
        Begin round {summary.round + 1}
      </button>
    </div>
  )
}

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
