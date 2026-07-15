'use client'

// The action dock — every turn decision happens here, driven entirely by
// the machine (`snapshot.matches` for the step, `snapshot.can` for legality).
// Card discards are made in the HandTray fan; this dock shows the step rail.
import { useEffect, useState } from 'react'
import { type CityId, cities } from '~/data/board'
import { type IndustryType } from '~/data/cards'
import {
  type GameEvent,
  type GameStoreSnapshot,
  type Player,
} from '~/store/gameStore'
import { CardChip } from './cards'
import {
  BuildIcon,
  CanalIcon,
  DevelopIcon,
  IndustryGlyph,
  LoanIcon,
  NetworkIcon,
  PassIcon,
  RailIcon,
  ScoutIcon,
  SellIcon,
} from './icons'

export const INDUSTRY_TYPES: IndustryType[] = [
  'cotton',
  'coal',
  'iron',
  'manufacturer',
  'pottery',
  'brewery',
]

export const SELLABLE: IndustryType[] = ['cotton', 'manufacturer', 'pottery']

const cityName = (id: CityId | string | null | undefined) =>
  id ? (cities[id as CityId]?.name ?? id) : '—'

/** On-board 'manufacturer' reads as "Goods" everywhere in the UI. */
const industryLabel = (t: IndustryType | string) =>
  t === 'manufacturer' ? 'goods' : t

/**
 * Result of dry-running the pending confirm on a shadow actor. `cost` is
 * omitted when the probe crossed a round boundary (round-end income would
 * pollute the money diff) — the action is still known to succeed.
 */
export type ConfirmOutcome =
  | { ok: true; cost?: number; balanceAfter?: number }
  | { ok: false; error: string }

interface ActionDockProps {
  snapshot: GameStoreSnapshot
  send: (event: GameEvent) => void
  currentPlayer: Player
  /** Exact machine-probed check: can any sale legally happen this turn? */
  canSellAnything?: boolean
  /** Machine-probed set of industries that can complete the current build. */
  viableIndustries?: Set<IndustryType> | null
  /** Machine-probed dry run of the step's confirm (cost or exact refusal). */
  confirmOutcome?: ConfirmOutcome | null
  /** How many actions the player still has this turn (shown while choosing). */
  actionsLeft?: { remaining: number; max: number } | null
  /** Deep-probed count of cities where the pending build can complete. */
  legalSiteCount?: number | null
  /** Undo the first action of this turn (null = not available). */
  onUndo?: (() => void) | null
}

/* ----- hand-selection contract for the shell / HandTray ----- */

export interface HandSelection {
  hint: string
  selectedIds: string[]
}

export function getHandSelection(
  snapshot: GameStoreSnapshot,
): HandSelection | null {
  const is = (path: string) => snapshot.matches(path as never)
  if (is('playing.action.building.selectingCard'))
    return { hint: 'Build — play a card from your hand', selectedIds: [] }
  if (is('playing.action.networking.selectingCard'))
    return { hint: 'Network — discard a card', selectedIds: [] }
  if (is('playing.action.developing.selectingCard'))
    return { hint: 'Develop — discard a card', selectedIds: [] }
  if (is('playing.action.selling.selectingCard'))
    return { hint: 'Sell — discard a card', selectedIds: [] }
  if (is('playing.action.takingLoan.selectingCard'))
    return { hint: 'Loan — discard a card', selectedIds: [] }
  if (is('playing.action.scouting.selectingCards')) {
    const picked = snapshot.context.selectedCardsForScout
    return {
      hint: `Scout — discard three cards (${picked.length}/3)`,
      selectedIds: picked.map((c) => c.id),
    }
  }
  return null
}

/* ----- develop tile picker ----- */

/**
 * Rules: a Develop action removes ONE or TWO tiles (1 iron each). Clicking
 * an industry cycles its count 0 → 1 → 2 → 0, capped at two tiles total
 * (the same industry may be picked twice — successive levels).
 */
function DevelopTilePicker({
  currentPlayer,
  onCancel,
  onPick,
  onLowest,
}: {
  currentPlayer: Player
  onCancel: () => void
  onPick: (types: IndustryType[]) => void
  onLowest: () => void
}) {
  const [counts, setCounts] = useState<Partial<Record<IndustryType, number>>>(
    {},
  )
  const developable = INDUSTRY_TYPES.filter((t) => {
    const tiles = currentPlayer.industryTilesOnMat[t] || []
    return tiles.some(
      (tw) =>
        tw.quantityAvailable > 0 &&
        !(t === 'pottery' && tw.tile.hasLightbulbIcon),
    )
  })
  const available = (t: IndustryType) =>
    (currentPlayer.industryTilesOnMat[t] || [])
      .filter((tw) => !(t === 'pottery' && tw.tile.hasLightbulbIcon))
      .reduce((n, tw) => n + tw.quantityAvailable, 0)
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
  const selection = developable.flatMap((t) =>
    Array.from({ length: counts[t] ?? 0 }, () => t),
  )

  const cycle = (t: IndustryType) =>
    setCounts((prev) => {
      const current = prev[t] ?? 0
      const others = total - current
      const max = Math.min(2 - others, available(t))
      const next = current >= max ? 0 : current + 1
      return { ...prev, [t]: next }
    })

  return (
    <Flow
      action="Develop"
      steps={['Card', 'Tiles', 'Confirm']}
      active={1}
      onCancel={onCancel}
    >
      <Note>
        Scrap one or <b>two</b> tiles from your mat — each consumes 1 iron. Tap
        an industry again for a second tile of the same kind.
      </Note>
      <div className="grid grid-cols-3 gap-2">
        {developable.map((t) => {
          const n = counts[t] ?? 0
          return (
            <button
              key={t}
              type="button"
              className="bb2-option relative flex-col !items-center gap-1.5 py-2.5"
              data-selected={n > 0}
              data-testid={`develop-${t}`}
              onClick={() => cycle(t)}
            >
              <IndustryGlyph type={t} size={20} />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]">
                {t === 'manufacturer' ? 'Goods' : t}
              </span>
              {n > 0 && (
                <span
                  className="absolute right-1.5 top-1.5 rounded-full px-1.5 text-[10px] font-bold"
                  style={{
                    background: 'var(--bb-brass)',
                    color: '#241a08',
                  }}
                >
                  ×{n}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <Confirm disabled={total === 0} onClick={() => onPick(selection)}>
        Scrap {total === 2 ? 'two tiles' : total === 1 ? 'one tile' : 'tiles'}
      </Confirm>
      <button
        type="button"
        className="bb2-ghost-btn"
        data-testid="develop-lowest"
        onClick={onLowest}
      >
        Develop lowest available
      </button>
    </Flow>
  )
}

/* ----- step rail ----- */

function StepRail({ steps, active }: { steps: string[]; active: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          {i > 0 && (
            <span
              className="h-px w-3"
              style={{
                background:
                  i <= active ? 'var(--bb-brass)' : 'rgba(231,215,177,.18)',
              }}
            />
          )}
          <span
            className="text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              color:
                i === active
                  ? 'var(--bb-brass-bright)'
                  : i < active
                    ? 'var(--bb-brass-dim)'
                    : 'rgba(231,215,177,.35)',
            }}
          >
            {s}
          </span>
        </div>
      ))}
    </div>
  )
}

function Flow({
  action,
  steps,
  active,
  onCancel,
  children,
}: {
  action: string
  steps: string[]
  active: number
  onCancel?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <span
            className="bb2-display text-[19px] font-bold leading-none"
            style={{ color: 'var(--bb-brass-bright)' }}
          >
            {action}
          </span>
          <StepRail steps={steps} active={active} />
        </div>
        {onCancel && (
          <button
            type="button"
            className="bb2-ghost-btn"
            data-testid="cancel-action"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
      <hr className="bb2-rule" />
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[14px] leading-relaxed"
      style={{ color: 'rgba(231,215,177,.7)' }}
    >
      {children}
    </p>
  )
}

function Confirm({
  disabled,
  onClick,
  children,
  disabledReason,
  outcome,
}: {
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
  disabledReason?: string
  /** Shadow-actor dry run: prices the action, or blocks it with the engine's reason. */
  outcome?: ConfirmOutcome | null
}) {
  const refused = outcome ? !outcome.ok : false
  const reason = outcome && !outcome.ok ? outcome.error : disabledReason
  return (
    <div className="flex flex-col gap-1.5">
      {outcome?.ok && outcome.cost !== undefined && (
        <p
          className="text-[12.5px] leading-snug tabular-nums"
          data-testid="confirm-cost"
          style={{ color: 'rgba(231,215,177,.65)' }}
        >
          {outcome.cost > 0 ? (
            <>
              All-in cost{' '}
              <b style={{ color: 'var(--bb-brass-bright)' }}>£{outcome.cost}</b>{' '}
              — leaves £{outcome.balanceAfter} in the treasury.
            </>
          ) : (
            'Costs nothing from the treasury.'
          )}
        </p>
      )}
      <button
        type="button"
        className="bb2-confirm"
        data-testid="confirm-action"
        disabled={disabled || refused}
        onClick={onClick}
      >
        {children}
      </button>
      {(disabled || refused) && reason && (
        <p className="text-[12.5px] leading-snug" style={{ color: '#d68d80' }}>
          {reason}
        </p>
      )}
    </div>
  )
}

/**
 * Passing forfeits the whole turn with no undo, so it arms like the
 * New-game button: first tap asks, second tap within 4s confirms.
 */
function PassButton({
  disabled,
  onPass,
}: {
  disabled: boolean
  onPass: () => void
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className="bb2-option justify-center"
      data-testid="action-pass"
      disabled={disabled}
      style={
        armed
          ? {
              borderColor: 'var(--bb-brass-bright)',
              color: 'var(--bb-brass-bright)',
            }
          : undefined
      }
      onClick={() => {
        if (armed) {
          setArmed(false)
          onPass()
        } else {
          setArmed(true)
        }
      }}
    >
      <PassIcon size={14} />
      <span className="font-semibold uppercase tracking-[0.14em] text-[11.5px]">
        {armed ? 'Really pass? Tap again' : 'Pass the turn'}
      </span>
    </button>
  )
}

/* ================================================================ */

export function ActionDock({
  snapshot,
  send,
  currentPlayer,
  canSellAnything = true,
  viableIndustries = null,
  confirmOutcome = null,
  actionsLeft = null,
  legalSiteCount = null,
  onUndo = null,
}: ActionDockProps) {
  const is = (path: string) => snapshot.matches(path as never)
  const can = (event: GameEvent) => snapshot.can(event)
  const cancel = () => send({ type: 'CANCEL' })
  const c = snapshot.context

  /* ---------- choose an action ---------- */
  if (is('playing.action.selectingAction')) {
    const actions: Array<{
      label: string
      event: GameEvent
      hint: string
      icon: React.ReactNode
      blocked?: boolean
    }> = [
      {
        label: 'Build',
        event: { type: 'BUILD' },
        hint: 'Place an industry tile',
        icon: <BuildIcon size={15} />,
      },
      {
        label: 'Network',
        event: { type: 'NETWORK' },
        hint: c.era === 'canal' ? 'Canal £3' : 'Rail £5 + coal',
        icon: <NetworkIcon size={15} />,
      },
      {
        label: 'Develop',
        event: { type: 'DEVELOP' },
        hint: 'Remove tiles · 1 iron each',
        icon: <DevelopIcon size={15} />,
      },
      {
        label: 'Sell',
        event: { type: 'SELL' },
        hint: canSellAnything
          ? 'Flip goods at merchants'
          : 'No goods you can sell right now',
        icon: <SellIcon size={15} />,
        blocked: !canSellAnything,
      },
      {
        label: 'Loan',
        event: { type: 'TAKE_LOAN' },
        hint: '+£30 · −3 income',
        icon: <LoanIcon size={15} />,
      },
      {
        label: 'Scout',
        event: { type: 'SCOUT' },
        hint: '3 cards → 2 wilds',
        icon: <ScoutIcon size={15} />,
      },
    ]
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="bb2-panel-title">Choose an action</span>
          {actionsLeft && (
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              data-testid="actions-left"
              style={{ color: 'var(--bb-brass)' }}
            >
              {actionsLeft.max === 1 || actionsLeft.remaining === 1
                ? 'Last action this turn'
                : `${actionsLeft.remaining} of ${actionsLeft.max} actions left`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="bb2-plaque"
              data-testid={`action-${a.label.toLowerCase()}`}
              disabled={!can(a.event) || a.blocked}
              onClick={() => send(a.event)}
            >
              <span className="bb2-plaque-name">
                {a.icon}
                {a.label}
              </span>
              <span className="bb2-plaque-hint">{a.hint}</span>
            </button>
          ))}
        </div>
        <PassButton
          disabled={!can({ type: 'PASS' })}
          onPass={() => send({ type: 'PASS' })}
        />
        {onUndo && (
          <button
            type="button"
            className="bb2-ghost-btn"
            data-testid="undo-action"
            onClick={onUndo}
            title="Rewind to the start of your turn — your first action is taken back in full (money, cards and markets included)"
          >
            ↩ Undo first action
          </button>
        )}
      </div>
    )
  }

  /* ---------- BUILD ---------- */
  const buildSteps = ['Card', 'Industry', 'Site', 'Confirm']
  if (is('playing.action.building.selectingCard')) {
    return (
      <Flow action="Build" steps={buildSteps} active={0} onCancel={cancel}>
        <Note>
          Play a card from your hand below. A <b>location card</b> opens that
          city; an <b>industry card</b> builds in your network.
        </Note>
      </Flow>
    )
  }
  if (is('playing.action.building.selectingIndustryType')) {
    const isViable = (t: IndustryType) =>
      can({ type: 'SELECT_INDUSTRY_TYPE', industryType: t }) &&
      (viableIndustries === null || viableIndustries.has(t))
    const anyBlocked = INDUSTRY_TYPES.some((t) => !isViable(t))
    return (
      <Flow action="Build" steps={buildSteps} active={1} onCancel={cancel}>
        {c.selectedCard && (
          <div
            className="flex items-center gap-2 text-[12px]"
            style={{ color: 'rgba(231,215,177,.6)' }}
          >
            Playing <CardChip card={c.selectedCard} />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {INDUSTRY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="bb2-option flex-col !items-center gap-1.5 py-2.5"
              data-testid={`industry-${t}`}
              disabled={!isViable(t)}
              title={
                isViable(t)
                  ? undefined
                  : 'No legal build for this industry with the played card'
              }
              onClick={() =>
                send({ type: 'SELECT_INDUSTRY_TYPE', industryType: t })
              }
            >
              <IndustryGlyph type={t} size={20} />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]">
                {t === 'manufacturer' ? 'Goods' : t}
              </span>
            </button>
          ))}
        </div>
        {anyBlocked && (
          <p
            className="text-[12px] leading-snug"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            Greyed industries have no legal build with this card — no free slot,
            no tile on your mat, or no way to pay for it.
          </p>
        )}
      </Flow>
    )
  }
  if (is('playing.action.building.selectingLocation')) {
    // Prefer the shell's deep-probed count (slot AND completable); fall
    // back to the raw slot guard when the probe isn't wired (multiplayer).
    const legalCount =
      legalSiteCount ??
      (Object.keys(cities) as CityId[]).filter((id) =>
        can({ type: 'SELECT_LOCATION', cityId: id }),
      ).length
    return (
      <Flow action="Build" steps={buildSteps} active={2} onCancel={cancel}>
        {legalCount === 0 ? (
          <Note>
            <b style={{ color: '#d68d80' }}>No city can take this build</b> —
            every candidate site is occupied, out of your network, or cannot be
            paid for or supplied. Cancel and choose a different industry or
            card.
          </Note>
        ) : (
          <Note>
            Choose a site on the map — legal cities are ringed in brass and
            pulsing. Dimmed cities are out of reach, full, or can't be paid for
            or supplied from there.
          </Note>
        )}
      </Flow>
    )
  }
  if (is('playing.action.building.confirmingBuild')) {
    const tile = c.selectedIndustryTile
    return (
      <Flow action="Build" steps={buildSteps} active={3} onCancel={cancel}>
        <div className="flex flex-col gap-2 text-[13px]">
          {c.selectedCard && (
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(231,215,177,.55)' }}>Card</span>
              <CardChip card={c.selectedCard} />
            </div>
          )}
          {tile && (
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(231,215,177,.55)' }}>Tile</span>
              <span
                className="inline-flex items-center gap-1.5 font-semibold"
                style={{ color: 'var(--bb-parchment-bright)' }}
              >
                <IndustryGlyph type={tile.type} size={14} />
                {industryLabel(tile.type)} · level {tile.level} · £{tile.cost}
              </span>
              {(tile.coalRequired > 0 || tile.ironRequired > 0) && (
                <span
                  className="inline-flex items-center gap-1 text-[11.5px]"
                  style={{ color: 'rgba(231,215,177,.6)' }}
                >
                  + {tile.coalRequired > 0 && `${tile.coalRequired} coal`}
                  {tile.coalRequired > 0 && tile.ironRequired > 0 && ' · '}
                  {tile.ironRequired > 0 && `${tile.ironRequired} iron`}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span style={{ color: 'rgba(231,215,177,.55)' }}>Site</span>
            <span
              className="font-semibold"
              style={{ color: 'var(--bb-parchment-bright)' }}
            >
              {cityName(c.selectedLocation)}
            </span>
          </div>
        </div>
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason="The ledger refuses this build — check your funds and coal / iron access from this site."
          outcome={confirmOutcome}
        >
          Raise the works
        </Confirm>
      </Flow>
    )
  }

  /* ---------- NETWORK ---------- */
  const netSteps = ['Card', 'Route', 'Confirm']
  if (is('playing.action.networking.selectingCard')) {
    return (
      <Flow action="Network" steps={netSteps} active={0} onCancel={cancel}>
        <Note>Discard any card from your hand below to open a route.</Note>
      </Flow>
    )
  }
  if (is('playing.action.networking.selectingLink')) {
    return (
      <Flow action="Network" steps={netSteps} active={1} onCancel={cancel}>
        <Note>
          Choose a {c.era} route on the map.{' '}
          {c.era === 'canal' ? (
            <span className="inline-flex items-center gap-1">
              <CanalIcon size={13} /> Canals cost £3.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <RailIcon size={13} /> Rails cost £5 + 1 coal.
            </span>
          )}
        </Note>
      </Flow>
    )
  }
  if (is('playing.action.networking.confirmingLink')) {
    const link = c.selectedLink
    return (
      <Flow action="Network" steps={netSteps} active={2} onCancel={cancel}>
        <Note>
          <b style={{ color: 'var(--bb-parchment-bright)' }}>
            {cityName(link?.from)} — {cityName(link?.to)}
          </b>{' '}
          ({c.era})
        </Note>
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason="This route can't be claimed — it must touch your network and be payable."
          outcome={confirmOutcome}
        >
          Lay the {c.era === 'canal' ? 'canal' : 'track'}
        </Confirm>
        {can({ type: 'CHOOSE_DOUBLE_LINK_BUILD' }) && (
          <button
            type="button"
            className="bb2-option justify-center"
            data-testid="choose-double-link"
            onClick={() => send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })}
          >
            <RailIcon size={14} />
            <span className="text-[12px] font-semibold">
              Build two rails — £15 + 2 coal + 1 beer
            </span>
          </button>
        )}
      </Flow>
    )
  }
  if (is('playing.action.networking.selectingSecondLink')) {
    return (
      <Flow
        action="Network"
        steps={['Card', 'Route', 'Route II', 'Confirm']}
        active={2}
        onCancel={cancel}
      >
        <Note>Choose the second rail route on the map.</Note>
      </Flow>
    )
  }
  if (is('playing.action.networking.confirmingDoubleLink')) {
    return (
      <Flow
        action="Network"
        steps={['Card', 'Route', 'Route II', 'Confirm']}
        active={3}
        onCancel={cancel}
      >
        <Note>
          <b style={{ color: 'var(--bb-parchment-bright)' }}>
            {cityName(c.selectedLink?.from)} — {cityName(c.selectedLink?.to)}
          </b>{' '}
          and{' '}
          <b style={{ color: 'var(--bb-parchment-bright)' }}>
            {cityName(c.selectedSecondLink?.from)} —{' '}
            {cityName(c.selectedSecondLink?.to)}
          </b>
        </Note>
        <Confirm
          disabled={!can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })}
          onClick={() => send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })}
          disabledReason="Two rails need £15, 2 coal and 1 beer within reach."
          outcome={confirmOutcome}
        >
          Lay both tracks
        </Confirm>
      </Flow>
    )
  }

  /* ---------- DEVELOP ---------- */
  const devSteps = ['Card', 'Tiles', 'Confirm']
  if (is('playing.action.developing.selectingCard')) {
    return (
      <Flow action="Develop" steps={devSteps} active={0} onCancel={cancel}>
        <Note>Discard any card from your hand below.</Note>
      </Flow>
    )
  }
  if (is('playing.action.developing.selectingTiles')) {
    return (
      <DevelopTilePicker
        currentPlayer={currentPlayer}
        onCancel={cancel}
        onPick={(types) =>
          send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: types })
        }
        onLowest={() => send({ type: 'CONFIRM' })}
      />
    )
  }
  if (is('playing.action.developing.confirmingDevelop')) {
    return (
      <Flow action="Develop" steps={devSteps} active={2} onCancel={cancel}>
        <Note>
          Scrapping:{' '}
          <b style={{ color: 'var(--bb-parchment-bright)' }}>
            {c.selectedTilesForDevelop.join(', ') || 'lowest available tile'}
          </b>{' '}
          — consumes iron.
        </Note>
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason="No iron within reach (or none on the market you can afford)."
          outcome={confirmOutcome}
        >
          Scrap the tile
        </Confirm>
      </Flow>
    )
  }

  /* ---------- SELL ---------- */
  if (is('playing.action.selling.selectingCard')) {
    return (
      <Flow
        action="Sell"
        steps={['Card', 'Goods']}
        active={0}
        onCancel={cancel}
      >
        <Note>Discard any card from your hand below.</Note>
      </Flow>
    )
  }
  if (is('playing.action.selling.selectingSale')) {
    const sales: Array<{
      location: CityId
      type: IndustryType
      merchant: CityId
    }> = []
    for (const ind of currentPlayer.industries) {
      if (ind.flipped || !SELLABLE.includes(ind.type)) continue
      for (const m of c.merchants) {
        const ev: GameEvent = {
          type: 'SELECT_SALE',
          location: ind.location,
          industryType: ind.type,
          merchant: m.location,
        }
        if (
          can(ev) &&
          !sales.some(
            (s) =>
              s.location === ind.location &&
              s.type === ind.type &&
              s.merchant === m.location,
          )
        ) {
          sales.push({
            location: ind.location,
            type: ind.type,
            merchant: m.location,
          })
        }
      }
    }
    const sold = c.salesMadeThisAction
    return (
      <Flow
        action="Sell"
        steps={['Card', 'Goods']}
        active={1}
        onCancel={sold === 0 ? cancel : undefined}
      >
        {sales.length === 0 ? (
          <Note>
            No further legal sales.{' '}
            {sold === 0 && 'You may cancel this action.'}
          </Note>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sales.map((s, i) => (
              <button
                key={i}
                type="button"
                className="bb2-option"
                data-testid="sale-option"
                onClick={() =>
                  send({
                    type: 'SELECT_SALE',
                    location: s.location,
                    industryType: s.type,
                    merchant: s.merchant,
                  })
                }
              >
                <IndustryGlyph type={s.type} size={16} />
                <span>
                  <b>{s.type === 'manufacturer' ? 'goods' : s.type}</b> at{' '}
                  {cityName(s.location)}
                  <span style={{ color: 'rgba(231,215,177,.55)' }}>
                    {' '}
                    → {cityName(s.merchant)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {sold > 0 && (
          <>
            <Note>
              Flipped {sold} industr{sold === 1 ? 'y' : 'ies'} this action.
            </Note>
            <Confirm
              disabled={!can({ type: 'CONFIRM' })}
              onClick={() => send({ type: 'CONFIRM' })}
            >
              Close the sale
            </Confirm>
          </>
        )}
      </Flow>
    )
  }

  /* ---------- SCOUT ---------- */
  if (is('playing.action.scouting.selectingCards')) {
    const picked = c.selectedCardsForScout
    return (
      <Flow
        action="Scout"
        steps={['Three cards', 'Confirm']}
        active={picked.length < 3 ? 0 : 1}
        onCancel={cancel}
      >
        <Note>
          Discard three cards from your hand below to take a wild location and a
          wild industry card. ({picked.length}/3 chosen)
        </Note>
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason={
            picked.length < 3 ? undefined : 'Scout is not available right now.'
          }
        >
          Send the scout
        </Confirm>
      </Flow>
    )
  }

  /* ---------- LOAN ---------- */
  if (is('playing.action.takingLoan.selectingCard')) {
    return (
      <Flow
        action="Loan"
        steps={['Card', 'Confirm']}
        active={0}
        onCancel={cancel}
      >
        <Note>Discard any card from your hand below.</Note>
      </Flow>
    )
  }
  if (is('playing.action.takingLoan.confirmingLoan')) {
    return (
      <Flow
        action="Loan"
        steps={['Card', 'Confirm']}
        active={1}
        onCancel={cancel}
      >
        <Note>
          Draw <b style={{ color: 'var(--bb-brass-bright)' }}>£30</b> against
          the estate — income drops <b style={{ color: '#d68d80' }}>3 levels</b>
          .
        </Note>
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
        >
          Sign with the bank
        </Confirm>
      </Flow>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="bb2-panel-title">Ledger</span>
      <Note>Resolving the turn…</Note>
    </div>
  )
}
