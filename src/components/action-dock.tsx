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
import { isDevelopable } from '~/store/shared/gameUtils'
import {
  type BeerSourceOption,
  type IronSourceOption,
  beerSourceKey,
  ironSourceKey,
  pendingBeerChoice,
  pendingIronChoice,
} from '~/store/shared/resourceSources'
import { CardChip, cardTitle } from './cards'
import {
  doubleLinkDisabledReason,
  showsDoubleLinkOption,
} from './double-link-availability'
import { CityName, useLocateCity } from './locate'
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

/** A route's two endpoints, each a hover-to-locate CityName. */
function LinkLabel({
  link,
}: {
  link: { from: CityId; to: CityId } | null | undefined
}) {
  if (!link) return <>— — —</>
  return (
    <>
      <CityName cityId={link.from} /> — <CityName cityId={link.to} />
    </>
  )
}

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
  // Card-first: the hand is live while idling — playing a card opens the
  // actions it can start (the machine's cardSelected state). Wording gotcha:
  // neither hint may contain "choose an action" (the idle dock title, pinned
  // by e2e getByText, which substring-matches case-insensitively).
  //
  // Which cards are actually clickable at each step is NOT decided here — the
  // shell asks the machine (`state.can({SELECT_CARD, cardId})`) per card. That
  // keeps one source of truth: on a pick step every hand card is selectable;
  // once a card is committed only a DIFFERENT card is (the mid-flow switch),
  // and a Sell that already flipped an industry offers none.
  if (is('playing.action.selectingAction'))
    return { hint: 'Pick an action — or play a card first', selectedIds: [] }
  if (is('playing.action.cardSelected')) {
    const held = snapshot.context.selectedCard
    return {
      hint: 'Pick an action for this card — tap it again to put it back',
      selectedIds: held ? [held.id] : [],
    }
  }
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
  // Any deeper step of an action flow: the card is committed but still in
  // play. Keep it lifted in the fan and named in the pill for the WHOLE flow
  // (until confirm / cancel / put-back) so the player never loses sight of
  // what they're spending. Derived from machine context, so it survives the
  // multiplayer intent → broadcast → rebuild round-trip like every other
  // selection signal. Clicking a DIFFERENT card here switches the play (the
  // machine cancels the action and re-holds it, see `canSwitchHeldCard`).
  if (is('playing.action')) {
    const held = snapshot.context.selectedCard
    if (held)
      return { hint: `Holding ${cardTitle(held)}`, selectedIds: [held.id] }
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
      (tw) => tw.quantityAvailable > 0 && isDevelopable(tw.tile),
    )
  })
  const available = (t: IndustryType) =>
    (currentPlayer.industryTilesOnMat[t] || [])
      .filter((tw) => isDevelopable(tw.tile))
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

/* ----- beer source picker ----- */

/** What taking a barrel from this source actually does to the board. */
function beerSourceCaption(option: BeerSourceOption): string {
  if (option.source.kind === 'merchant') {
    const bonus = option.merchantBonus
    if (!bonus) return 'The barrel beside the merchant tile.'
    const reward =
      bonus.type === 'money'
        ? `£${bonus.value}`
        : bonus.type === 'victoryPoints'
          ? `${bonus.value} VP`
          : bonus.type === 'income'
            ? `+${bonus.value} income`
            : 'a free Develop'
    return `Collects the merchant bonus: ${reward}.`
  }
  if (!option.flipsOwnerTile) return 'Flips nothing.'
  return option.own
    ? 'Flips your brewery when its last barrel goes — your income advances.'
    : `Flips ${option.ownerName}'s brewery when its last barrel goes — their income advances.`
}

// Titles name a place, so the place is a hover-to-locate CityName. Passive:
// the option BUTTON carries the locate handlers (whole row hovers/focuses),
// the span only adds the dotted-underline affordance.
function beerSourceTitle(option: BeerSourceOption): React.ReactNode {
  const place = <CityName cityId={option.source.location} passive />
  if (option.source.kind === 'merchant') {
    return (
      <>
        {place}
        {" merchant's barrel"}
      </>
    )
  }
  const where = (
    <>
      {'brewery at '}
      {place}
    </>
  )
  return option.own ? (
    <>
      {'Your '}
      {where}
    </>
  ) : (
    <>
      {option.ownerName}
      {"'s "}
      {where}
    </>
  )
}

/**
 * Which beer to drink. The rules make every barrel's source a player choice,
 * and a consequential one (see the captions) — the engine used to pick
 * silently, which put merchant bonuses out of reach of anyone holding beer.
 *
 * A click assigns the next barrel; clicking once the last one is assigned
 * starts the allocation over, so a single-barrel sale behaves like a radio.
 */
function BeerSourcePicker({
  options,
  required,
  picks,
  onPick,
}: {
  options: BeerSourceOption[]
  required: number
  /** Barrels assigned so far — the machine's own record, not UI staging. */
  picks: BeerSourceOption['source'][]
  onPick: (source: BeerSourceOption['source']) => void
}) {
  const takenFrom = (option: BeerSourceOption) =>
    picks.filter((p) => beerSourceKey(p) === beerSourceKey(option.source))
      .length
  const { handlersFor } = useLocateCity()

  return (
    <div className="flex flex-col gap-1.5">
      {required > 1 && (
        <Note>
          Beer {Math.min(picks.length + 1, required)} of {required} — each
          barrel may come from a different source.
        </Note>
      )}
      {options.map((option) => {
        const taken = takenFrom(option)
        const full = taken >= option.available
        return (
          <button
            key={beerSourceKey(option.source)}
            type="button"
            className="bb2-option"
            data-testid="beer-source"
            data-selected={taken > 0}
            disabled={full && picks.length < required}
            onClick={() => onPick(option.source)}
            {...handlersFor(option.source.location)}
          >
            <IndustryGlyph type="brewery" size={16} />
            <span className="flex flex-col text-left">
              <b>
                {beerSourceTitle(option)}
                {required > 1 && taken > 0 && ` ×${taken}`}
              </b>
              <span
                className="text-[12px]"
                style={{ color: 'rgba(231,215,177,.55)' }}
              >
                {beerSourceCaption(option)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ----- iron source picker ----- */

function ironSourceTitle(option: IronSourceOption): React.ReactNode {
  if (option.source.kind === 'market') {
    return option.price ? `The market — £${option.price} a cube` : 'The market'
  }
  const where = (
    <>
      {'iron works at '}
      <CityName cityId={option.source.location} passive />
    </>
  )
  return option.own ? (
    <>
      {'Your '}
      {where}
    </>
  ) : (
    <>
      {option.ownerName}
      {"'s "}
      {where}
    </>
  )
}

function ironSourceCaption(option: IronSourceOption): string {
  // Only the market costs money; a works is free whether or not this cube
  // flips it (flipsOwnerTile is false for a works that keeps cubes after).
  if (option.source.kind === 'market') return 'Costs money; flips nothing.'
  return option.own
    ? 'Free — flips your works when its last cube goes, advancing your income.'
    : `Free — flips ${option.ownerName}'s works when its last cube goes, advancing their income.`
}

/**
 * Which iron to use. The rules let iron come from ANY unflipped works, and
 * whose works empties decides whose income advances — so this is a choice,
 * not bookkeeping. Left untouched, the engine picks as it always has (works
 * in turn, then the market).
 */
function IronSourcePicker({
  options,
  required,
  picks,
  onPick,
}: {
  options: IronSourceOption[]
  required: number
  picks: IronSourceOption['source'][]
  onPick: (source: IronSourceOption['source']) => void
}) {
  const takenFrom = (option: IronSourceOption) =>
    picks.filter((p) => ironSourceKey(p) === ironSourceKey(option.source))
      .length
  const { handlersFor } = useLocateCity()

  return (
    <div className="flex flex-col gap-1.5">
      <Note>
        {required > 1
          ? `Iron ${Math.min(picks.length + 1, required)} of ${required} — each cube may come from a different works.`
          : 'Where does the iron come from?'}
      </Note>
      {options.map((option) => {
        const taken = takenFrom(option)
        const full = taken >= option.available
        return (
          <button
            key={ironSourceKey(option.source)}
            type="button"
            className="bb2-option"
            data-testid="iron-source"
            data-selected={taken > 0}
            disabled={full && picks.length < required}
            onClick={() => onPick(option.source)}
            {...handlersFor(
              option.source.kind === 'market' ? null : option.source.location,
            )}
          >
            <IndustryGlyph type="iron" size={16} />
            <span className="flex flex-col text-left">
              <b>
                {ironSourceTitle(option)}
                {required > 1 && taken > 0 && ` ×${taken}`}
              </b>
              <span
                className="text-[12px]"
                style={{ color: 'rgba(231,215,177,.55)' }}
              >
                {ironSourceCaption(option)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
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
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
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
            className="bb2-display text-[22px] font-bold leading-none"
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
      className="text-[15px] leading-relaxed"
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
 * The Rail-Era "two rails for one action" option. It renders DISABLED rather
 * than vanishing when the machine refuses it: a player with no beer in reach
 * otherwise saw a plain single-rail confirm and had no way to learn double
 * rail exists at all.
 */
function DoubleLinkOption({
  enabled,
  reason,
  onClick,
}: {
  enabled: boolean
  /** Why it is refused — only read when `enabled` is false. */
  reason: string
  onClick: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="bb2-option justify-center"
        data-testid="choose-double-link"
        disabled={!enabled}
        title={enabled ? undefined : reason}
        onClick={onClick}
      >
        <RailIcon size={14} />
        <span className="text-[12px] font-semibold">
          Build two rails — £15 + 2 coal + 1 beer
        </span>
      </button>
      {!enabled && (
        <p
          className="text-[12.5px] leading-snug"
          data-testid="double-link-reason"
          style={{ color: '#d68d80' }}
        >
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
  const { locate, unlocate } = useLocateCity()
  const c = snapshot.context

  // The six card-consuming actions — shared by the idle chooser and the
  // card-first chooser (same labels, testids and gating in both).
  const actionPlaques = (): Array<{
    label: string
    event: GameEvent
    hint: string
    icon: React.ReactNode
    blocked?: boolean
  }> => [
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

  const cancel = () => send({ type: 'CANCEL' })

  /* ---------- choose an action ---------- */
  if (is('playing.action.selectingAction')) {
    const actions = actionPlaques()
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

  /* ---------- card-first: a card is held, choose its action ---------- */
  if (is('playing.action.cardSelected')) {
    const actions = actionPlaques()
    const anyBlocked = actions.some((a) => !can(a.event) || a.blocked)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="bb2-panel-title">Play this card</span>
            {c.selectedCard && (
              <div
                className="flex items-center gap-2 text-[12px]"
                style={{ color: 'rgba(231,215,177,.6)' }}
              >
                Holding <CardChip card={c.selectedCard} />
              </div>
            )}
          </div>
          <button
            type="button"
            className="bb2-ghost-btn"
            data-testid="cancel-action"
            onClick={cancel}
          >
            Put back
          </button>
        </div>
        <hr className="bb2-rule" />
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
        {anyBlocked && (
          <p
            className="text-[12px] leading-snug"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            Greyed actions can't start with this card right now.
          </p>
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
              {c.selectedLocation ? (
                <CityName cityId={c.selectedLocation} />
              ) : (
                '—'
              )}
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

  // The machine stops here only when the iron could come from more than one
  // works; it never asks about the market, which the rules make a fallback
  // rather than an alternative (p.5).
  if (
    is('playing.action.building.choosingIronSource') ||
    is('playing.action.developing.choosingIronSource')
  ) {
    const choice = pendingIronChoice(c)
    const building = is('playing.action.building.choosingIronSource')
    return (
      <Flow
        action={building ? 'Build' : 'Develop'}
        // An Iron step joins the rail while the question is open — exactly
        // like the Beer step on a sale or double rail. Without it the rail
        // marked Confirm active while the player was still picking iron.
        steps={
          building
            ? ['Card', 'Industry', 'Site', 'Iron', 'Confirm']
            : ['Card', 'Tiles', 'Iron', 'Confirm']
        }
        active={building ? 3 : 2}
        onCancel={cancel}
      >
        {choice && (
          <IronSourcePicker
            options={choice.options}
            required={choice.required}
            picks={c.chosenIronSources ?? []}
            onPick={(source) => send({ type: 'SELECT_IRON_SOURCE', source })}
          />
        )}
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
            <LinkLabel link={link} />
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
        {showsDoubleLinkOption(c) && (
          <DoubleLinkOption
            enabled={can({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })}
            reason={doubleLinkDisabledReason(c)}
            onClick={() => send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })}
          />
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
  if (is('playing.action.networking.choosingDoubleLinkBeer')) {
    const choice = pendingBeerChoice(c)
    return (
      <Flow
        action="Network"
        steps={['Card', 'Route', 'Route II', 'Beer', 'Confirm']}
        active={3}
        onCancel={cancel}
      >
        <Note>Which brewery supplies the beer for the second rail?</Note>
        {choice && (
          <BeerSourcePicker
            options={choice.options}
            required={choice.required}
            picks={c.chosenBeerSources ?? []}
            onPick={(source) => send({ type: 'SELECT_BEER_SOURCE', source })}
          />
        )}
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
            <LinkLabel link={c.selectedLink} />
          </b>{' '}
          and{' '}
          <b style={{ color: 'var(--bb-parchment-bright)' }}>
            <LinkLabel link={c.selectedSecondLink} />
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
  /**
   * The machine holds the sale still and asks where its beer comes from — but
   * only when the answer could differ. When one source must supply it all it
   * never stops here, and the sale flips on the first click as it always has.
   */
  if (is('playing.action.selling.choosingBeerSource')) {
    const choice = pendingBeerChoice(c)
    const sale = c.pendingSale
    return (
      <Flow
        action="Sell"
        steps={['Card', 'Goods', 'Beer']}
        active={2}
        onCancel={cancel}
      >
        <Note>
          Where does the beer for {industryLabel(sale?.industryType ?? 'goods')}{' '}
          at {sale ? <CityName cityId={sale.location} /> : '—'} come from?
        </Note>
        {choice && (
          <BeerSourcePicker
            options={choice.options}
            required={choice.required}
            picks={c.chosenBeerSources ?? []}
            onPick={(source) => send({ type: 'SELECT_BEER_SOURCE', source })}
          />
        )}
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
                // Two places on one row, so each NAME locates its own city;
                // keyboard focus points at the goods' own city.
                onFocus={() => locate(s.location)}
                onBlur={() => unlocate(s.location)}
              >
                <IndustryGlyph type={s.type} size={16} />
                <span>
                  <b>{s.type === 'manufacturer' ? 'goods' : s.type}</b> at{' '}
                  <CityName cityId={s.location} focusable={false} />
                  <span style={{ color: 'rgba(231,215,177,.55)' }}>
                    {' '}
                    → <CityName cityId={s.merchant} focusable={false} />
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
