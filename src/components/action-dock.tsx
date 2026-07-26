'use client'

// The action dock — every turn decision happens here, driven entirely by
// the machine (`snapshot.matches` for the step, `snapshot.can` for legality).
// Card discards are made in the HandTray fan; this dock shows the step rail.
import { useEffect, useState } from 'react'
import { type CityId, cities } from '~/data/board'
import { type Card, type IndustryType } from '~/data/cards'
import {
  type GameEvent,
  type GameState,
  type GameStoreSnapshot,
  type Player,
} from '~/store/gameStore'
import {
  type RailCoalSourceView,
  railNetworkCostView,
} from '~/store/market/marketActions'
import { pendingDevelopBonusChoice } from '~/store/shared/developBonus'
import {
  type BeerSource,
  type BeerSourceOption,
  type CoalSourceOption,
  type IronSourceOption,
  beerChoiceForDoubleLink,
  beerSourceKey,
  coalSourceKey,
  ironSourceKey,
  pendingBeerChoice,
  pendingCoalChoice,
  pendingIronChoice,
} from '~/store/shared/resourceSources'
import { disabledActionReason } from './action-reason'
import { CardChip, cardTitle } from './cards'
import {
  doubleLinkDisabledReason,
  showsDoubleLinkOption,
} from './double-link-availability'
import {
  BuildIcon,
  CanalIcon,
  DevelopIcon,
  IndustryChip,
  LoanIcon,
  NetworkIcon,
  PassIcon,
  RailIcon,
  ScoutIcon,
  SellIcon,
} from './icons'
import { CityName, useLocateCity } from './locate'

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

/**
 * Read-only "sourced from" line naming where a rail link's 1 coal comes from —
 * a connected mine (free) or the coal market (£). The names are hover-to-locate
 * CityNames. Facts come from the engine (`railNetworkCostView`); never
 * re-derived here.
 */
function CoalSourceText({ coal }: { coal: RailCoalSourceView | null }) {
  if (!coal) return null
  if (coal.kind === 'mine') {
    return (
      <span>
        coal: free from{' '}
        {coal.location ? (
          <CityName cityId={coal.location} />
        ) : (
          'a connected mine'
        )}
        {coal.ownerName && !coal.own ? ` (${coal.ownerName})` : ''}
      </span>
    )
  }
  return (
    <span>
      coal: {coal.location ? <CityName cityId={coal.location} /> : ''} market £
      {coal.cost}
    </span>
  )
}

/** The beer feeding a double rail's second link — own or a rival's brewery. */
function BeerSourceText({
  source,
  currentPlayer,
  players,
}: {
  source: BeerSource
  currentPlayer: Player
  players: Player[]
}) {
  if (source.kind === 'merchant') {
    return (
      <span>
        beer: <CityName cityId={source.location} /> merchant
      </span>
    )
  }
  const own = source.ownerId === currentPlayer.id
  const owner = players.find((p) => p.id === source.ownerId)
  return (
    <span>
      beer: {own ? 'your' : `${owner?.name ?? 'a rival'}'s`} brewery at{' '}
      <CityName cityId={source.location} />
    </span>
  )
}

/**
 * The concrete cost of the rail Network action the machine is holding, shown
 * before the player commits: base £ + coal (+ beer for a double), then each
 * link's coal source and the beer source named inline. All engine-computed
 * (`railNetworkCostView` / `beerChoiceForDoubleLink`) so it can never disagree
 * with the confirm guard.
 */
function NetworkCostBreakdown({
  context,
  currentPlayer,
}: {
  context: GameState
  currentPlayer: Player
}) {
  const view = railNetworkCostView(context)
  if (!view?.ok) return null

  let beer: BeerSource | null = null
  if (view.double) {
    const choice = beerChoiceForDoubleLink(context, currentPlayer)
    const picked = (context.chosenBeerSources ?? [])[0]
    beer =
      choice?.options.find(
        (o) => picked && beerSourceKey(o.source) === beerSourceKey(picked),
      )?.source ??
      // No explicit pick: name the engine's auto-pick (first offered).
      choice?.options[0]?.source ??
      null
  }

  return (
    <div
      className="flex flex-col gap-1 text-[12.5px]"
      style={{ color: 'rgba(231,215,177,.62)' }}
      data-testid="network-cost"
    >
      <div className="tabular-nums">
        <b style={{ color: 'var(--bb-parchment-bright)' }}>
          Lay {view.double ? '2 tracks' : '1 track'}
        </b>{' '}
        — £{view.baseCost} + {view.double ? '2 coal + 1 beer' : '1 coal'}
      </div>
      {view.links.map((link) => (
        <div
          key={`${link.from}-${link.to}`}
          className="flex flex-wrap items-center gap-x-1"
        >
          {view.double && (
            <span>
              <CityName cityId={link.from} /> — <CityName cityId={link.to} />:
            </span>
          )}
          <CoalSourceText coal={link.coal} />
        </div>
      ))}
      {beer && (
        <BeerSourceText
          source={beer}
          currentPlayer={currentPlayer}
          players={context.players}
        />
      )}
    </div>
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
  /**
   * Develop picks tiles ON THE PLAYER MAT (the ledger modal). While the modal
   * is open it owns the whole develop UI — the dock steps down to a pointer so
   * the modal's confirm/cancel/iron controls stay the only ones on screen.
   */
  developMat?: { open: boolean; onOpen: () => void } | null
}

/* ----- hand-selection contract for the shell / HandTray ----- */

export interface HandSelection {
  /** null = the tray says nothing; the hand is still live. */
  hint: string | null
  selectedIds: string[]
}

export function getHandSelection(
  snapshot: GameStoreSnapshot,
): HandSelection | null {
  const is = (path: string) => snapshot.matches(path as never)
  // A hint exists only while something is actually in flight. Idling, the
  // hand is live (card-first: playing a card opens the actions it can start,
  // the machine's cardSelected state) but the tray says nothing — the dock's
  // own "Choose an action" panel is the narration for that state, and a tray
  // label repeating it just covers whatever panel it happens to float over.
  // Wording gotcha: no hint may contain "choose an action" (that dock title,
  // pinned by e2e getByText, which substring-matches case-insensitively).
  //
  // Which cards are actually clickable at each step is NOT decided here — the
  // shell asks the machine (`state.can({SELECT_CARD, cardId})`) per card. That
  // keeps one source of truth: on a pick step every hand card is selectable;
  // once a card is committed only a DIFFERENT card is (the mid-flow switch),
  // and a Sell that already flipped an industry offers none.
  if (is('playing.action.selectingAction'))
    return { hint: null, selectedIds: [] }
  if (is('playing.action.cardSelected')) {
    // Same "Holding <card>" wording as every deeper step: the held card is
    // the only live state the tray adds here, and the dock already carries
    // the title, the card chip and the Put back control.
    const held = snapshot.context.selectedCard
    return {
      hint: held ? `Holding ${cardTitle(held)}` : null,
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
            <IndustryChip type="brewery" size={16} />
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
export function IronSourcePicker({
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
            <IndustryChip type="iron" size={16} />
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

/* ----- coal source picker ----- */

function coalSourceTitle(option: CoalSourceOption): React.ReactNode {
  const where = (
    <>
      {'coal mine at '}
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

function coalSourceCaption(option: CoalSourceOption): string {
  // Only the pick that takes the mine's LAST cube flips it — a mine with cubes
  // to spare does not, so don't promise an income advance that won't happen.
  if (option.flipsOwnerTile) {
    return option.own
      ? "Free — your mine's last cube; taking it flips the tile and advances your income."
      : `Free — ${option.ownerName}'s mine's last cube; taking it flips the tile and advances their income.`
  }
  return option.own
    ? `Free — ${option.available} cubes left on your mine.`
    : `Free — ${option.available} cubes left on ${option.ownerName}'s mine.`
}

/**
 * Which mine pays for the coal. Coal must come from the CLOSEST connected mine,
 * so this appears ONLY when two or more mines tie at that nearest distance
 * (rules L119-121) — draining a rival's mine flips it and advances their
 * income, so the tie is a real decision. Left untouched, the engine drains the
 * nearest in discovery order, exactly as before.
 */
function CoalSourcePicker({
  options,
  required,
  picks,
  onPick,
}: {
  options: CoalSourceOption[]
  /** Cubes the whole action spends — a double rail asks twice. */
  required: number
  /** Cubes already assigned — the machine's own record, not UI staging. */
  picks: CoalSourceOption['source'][]
  onPick: (source: CoalSourceOption['source']) => void
}) {
  const { handlersFor } = useLocateCity()
  const tied = `${options.length} mines are equally close`
  return (
    <div className="flex flex-col gap-1.5">
      <Note>
        {required > 1
          ? `Coal ${Math.min(picks.length + 1, required)} of ${required} — ${tied}.`
          : `${tied} — choose which to drain.`}
      </Note>
      {options.map((option) => (
        <button
          key={coalSourceKey(option.source)}
          type="button"
          className="bb2-option"
          data-testid="coal-source"
          onClick={() => onPick(option.source)}
          {...handlersFor(option.source.location)}
        >
          <IndustryChip type="coal" size={16} />
          <span className="flex flex-col text-left">
            <b>{coalSourceTitle(option)}</b>
            <span
              className="text-[12px]"
              style={{ color: 'rgba(231,215,177,.55)' }}
            >
              {coalSourceCaption(option)}
            </span>
          </span>
        </button>
      ))}
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

/**
 * The held-card banner, shown the instant a card is committed and kept for the
 * whole action flow — the SAME "Holding <card>" wording in the card-first
 * chooser and every action-first step, so the two entry orders look identical
 * (captain's rule: the held card is named consistently regardless of order).
 */
function HeldCard({ card }: { card: Card | null | undefined }) {
  if (!card) return null
  return (
    <div
      className="flex items-center gap-2 text-[12px]"
      style={{ color: 'rgba(231,215,177,.6)' }}
      data-testid="held-card"
    >
      Holding <CardChip card={card} />
    </div>
  )
}

function Flow({
  action,
  steps,
  active,
  onCancel,
  held,
  children,
}: {
  action: string
  steps: string[]
  active: number
  onCancel?: () => void
  /** The card carried through this action — named at the top of every step. */
  held?: Card | null
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
      <HeldCard card={held} />
      <hr className="bb2-rule" />
      {children}
    </div>
  )
}

/**
 * Shown while the develop-mode mat modal is open: the modal owns every
 * control (confirm, cancel, iron picker), so the dock must not render its own
 * — duplicate testids/controls behind an overlay would be unreachable anyway.
 */
function DevelopOnMatAside() {
  return (
    <div className="flex flex-col gap-2" data-testid="develop-on-mat">
      <span
        className="bb2-display text-[22px] font-bold leading-none"
        style={{ color: 'var(--bb-brass-bright)' }}
      >
        Develop
      </span>
      <p
        className="text-[14px] leading-relaxed"
        style={{ color: 'rgba(231,215,177,.7)' }}
      >
        Picking tiles on your player mat…
      </p>
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
  developMat = null,
}: ActionDockProps) {
  const is = (path: string) => snapshot.matches(path as never)
  const can = (event: GameEvent) => snapshot.can(event)
  const whyDisabled = (event: GameEvent, fallback: string) =>
    disabledActionReason(snapshot, event, fallback)
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
        {/* Card-first entry lives here rather than on a tray label: the dock
            scrolls with its own panel, so it can never cover another one. */}
        <p
          className="text-[12px] leading-snug"
          style={{ color: 'rgba(231,215,177,.5)' }}
        >
          Or play a card from your hand to see the actions it can start.
        </p>
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
            <HeldCard card={c.selectedCard} />
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
      <Flow
        action="Build"
        steps={buildSteps}
        active={0}
        onCancel={cancel}
        held={c.selectedCard}
      >
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
      <Flow
        action="Build"
        steps={buildSteps}
        active={1}
        onCancel={cancel}
        held={c.selectedCard}
      >
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
              <IndustryChip type={t} size={20} />
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
      <Flow
        action="Build"
        steps={buildSteps}
        active={2}
        onCancel={cancel}
        held={c.selectedCard}
      >
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
      <Flow
        action="Build"
        steps={buildSteps}
        active={3}
        onCancel={cancel}
        held={c.selectedCard}
      >
        <div className="flex flex-col gap-2 text-[13px]">
          {tile && (
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(231,215,177,.55)' }}>Tile</span>
              <span
                className="inline-flex items-center gap-1.5 font-semibold"
                style={{ color: 'var(--bb-parchment-bright)' }}
              >
                <IndustryChip type={tile.type} size={14} />
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
          disabledReason={whyDisabled(
            { type: 'CONFIRM' },
            'This build cannot be completed from this site.',
          )}
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
    // A develop's iron question is asked INSIDE the open mat modal.
    if (is('playing.action.developing.choosingIronSource') && developMat?.open)
      return <DevelopOnMatAside />
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
        held={c.selectedCard}
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

  // A build's coal comes from the closest connected mine; the machine only
  // stops here when two or more tie at that distance (rules L119-121).
  if (is('playing.action.building.choosingCoalSource')) {
    const choice = pendingCoalChoice(c)
    return (
      <Flow
        action="Build"
        steps={['Card', 'Industry', 'Site', 'Coal', 'Confirm']}
        active={3}
        onCancel={cancel}
        held={c.selectedCard}
      >
        {choice && (
          <CoalSourcePicker
            options={choice.options}
            required={choice.required}
            picks={c.chosenCoalSources ?? []}
            onPick={(source) => send({ type: 'SELECT_COAL_SOURCE', source })}
          />
        )}
      </Flow>
    )
  }

  /* ---------- NETWORK ---------- */
  const netSteps = ['Card', 'Route', 'Confirm']
  if (is('playing.action.networking.selectingCard')) {
    return (
      <Flow
        action="Network"
        steps={netSteps}
        active={0}
        onCancel={cancel}
        held={c.selectedCard}
      >
        <Note>Discard any card from your hand below to open a route.</Note>
      </Flow>
    )
  }
  if (is('playing.action.networking.selectingLink')) {
    return (
      <Flow
        action="Network"
        steps={netSteps}
        active={1}
        onCancel={cancel}
        held={c.selectedCard}
      >
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
      <Flow
        action="Network"
        steps={netSteps}
        active={2}
        onCancel={cancel}
        held={c.selectedCard}
      >
        <Note>
          <b style={{ color: 'var(--bb-parchment-bright)' }}>
            <LinkLabel link={link} />
          </b>{' '}
          ({c.era})
        </Note>
        {c.era === 'rail' ? (
          <NetworkCostBreakdown context={c} currentPlayer={currentPlayer} />
        ) : null}
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason={whyDisabled(
            { type: 'CONFIRM' },
            'This route cannot be claimed.',
          )}
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
  // A rail link's 1 coal comes from the closest connected mine; the machine
  // pauses here only when two tie at that distance (rules L119-121).
  if (is('playing.action.networking.choosingLinkCoal')) {
    const choice = pendingCoalChoice(c)
    return (
      <Flow
        action="Network"
        steps={['Card', 'Route', 'Coal', 'Confirm']}
        active={2}
        onCancel={cancel}
        held={c.selectedCard}
      >
        {choice && (
          <CoalSourcePicker
            options={choice.options}
            required={choice.required}
            picks={c.chosenCoalSources ?? []}
            onPick={(source) => send({ type: 'SELECT_COAL_SOURCE', source })}
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
        held={c.selectedCard}
      >
        <Note>Choose the second rail route on the map.</Note>
      </Flow>
    )
  }
  if (is('playing.action.networking.choosingDoubleLinkCoal')) {
    const choice = pendingCoalChoice(c)
    return (
      <Flow
        action="Network"
        steps={['Card', 'Route', 'Route II', 'Coal', 'Beer', 'Confirm']}
        active={3}
        onCancel={cancel}
        held={c.selectedCard}
      >
        {choice && (
          <CoalSourcePicker
            options={choice.options}
            required={choice.required}
            picks={c.chosenCoalSources ?? []}
            onPick={(source) => send({ type: 'SELECT_COAL_SOURCE', source })}
          />
        )}
      </Flow>
    )
  }
  if (is('playing.action.networking.choosingDoubleLinkBeer')) {
    const choice = pendingBeerChoice(c)
    return (
      <Flow
        action="Network"
        steps={['Card', 'Route', 'Route II', 'Coal', 'Beer', 'Confirm']}
        active={4}
        onCancel={cancel}
        held={c.selectedCard}
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
        held={c.selectedCard}
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
        <NetworkCostBreakdown context={c} currentPlayer={currentPlayer} />
        <Confirm
          disabled={!can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })}
          onClick={() => send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })}
          disabledReason={whyDisabled(
            { type: 'EXECUTE_DOUBLE_NETWORK_ACTION' },
            'Two rails cannot be laid from here.',
          )}
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
      <Flow
        action="Develop"
        steps={devSteps}
        active={0}
        onCancel={cancel}
        held={c.selectedCard}
      >
        <Note>Discard any card from your hand below.</Note>
      </Flow>
    )
  }
  if (is('playing.action.developing.selectingTiles')) {
    // The player mat IS the tile picker. While the modal is open the dock
    // only points at it; when the player closed the modal mid-flow, the dock
    // offers the way back in (plus the one-tap lowest shortcut and cancel).
    if (developMat?.open) return <DevelopOnMatAside />
    return (
      <Flow
        action="Develop"
        steps={devSteps}
        active={1}
        onCancel={cancel}
        held={c.selectedCard}
      >
        <Note>
          Scrap one or <b>two</b> tiles straight off your player mat — each
          consumes 1 iron.
        </Note>
        {developMat && (
          <button
            type="button"
            className="bb2-confirm"
            data-testid="open-develop-mat"
            onClick={developMat.onOpen}
          >
            Open your mat
          </button>
        )}
        <button
          type="button"
          className="bb2-ghost-btn"
          data-testid="develop-lowest"
          onClick={() => send({ type: 'CONFIRM' })}
        >
          Develop lowest available
        </button>
      </Flow>
    )
  }
  if (is('playing.action.developing.confirmingDevelop')) {
    if (developMat?.open) return <DevelopOnMatAside />
    return (
      <Flow
        action="Develop"
        steps={devSteps}
        active={2}
        onCancel={cancel}
        held={c.selectedCard}
      >
        <Note>
          Scrapping:{' '}
          <b style={{ color: 'var(--bb-parchment-bright)' }}>
            {c.selectedTilesForDevelop.join(', ') || 'lowest available tile'}
          </b>{' '}
          — consumes iron.
        </Note>
        {developMat && (
          <button
            type="button"
            className="bb2-ghost-btn"
            data-testid="open-develop-mat"
            onClick={developMat.onOpen}
          >
            Back to the mat
          </button>
        )}
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason={whyDisabled(
            { type: 'CONFIRM' },
            'This develop cannot be completed.',
          )}
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
        held={c.selectedCard}
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
        held={c.selectedCard}
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
  if (is('playing.action.selling.choosingDevelopTile')) {
    const choice = pendingDevelopBonusChoice(
      currentPlayer.industryTilesOnMat,
      c.pendingDevelopChoice?.remaining,
    )
    // NOTE: no IndustryGlyph here on purpose. The native tsc (CI, Linux only)
    // fails to resolve the IndustryGlyph import at any JSX site in this branch
    // where the identifier `industryType` is also in scope — it even suggests
    // "did you mean industryType". Every other working glyph site uses `.type`.
    // Rendering the name alone dodges the bug; the picker stays clear.
    const developChoices: Array<{ kind: IndustryType; tileLevel: number }> = (
      choice?.options ?? []
    ).map((o) => ({ kind: o.industryType, tileLevel: o.tile.level }))
    return (
      <Flow
        action="Sell"
        steps={['Card', 'Goods', 'Develop']}
        active={2}
        held={c.selectedCard}
      >
        {choice && (
          <div className="flex flex-col gap-1.5">
            <Note>
              Merchant develop bonus: choose which industry to develop. Its
              lowest tile is removed.
            </Note>
            {developChoices.map((opt) => (
              <button
                key={opt.kind}
                type="button"
                className="bb2-option"
                data-testid="develop-tile"
                onClick={() =>
                  send({ type: 'SELECT_DEVELOP_TILE', industryType: opt.kind })
                }
              >
                <span className="flex flex-col text-left">
                  <b>{industryLabel(opt.kind)}</b>
                  <span
                    className="text-[12px]"
                    style={{ color: 'rgba(231,215,177,.55)' }}
                  >
                    Removes the level {opt.tileLevel} tile
                  </span>
                </span>
              </button>
            ))}
          </div>
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
        held={c.selectedCard}
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
                <IndustryChip type={s.type} size={16} />
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
              disabledReason={whyDisabled(
                { type: 'CONFIRM' },
                'This sale cannot be closed.',
              )}
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
        held={c.selectedCard}
      >
        <Note>
          Discard three cards from your hand below to take a wild location and a
          wild industry card. ({picked.length}/3 chosen)
        </Note>
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason={
            picked.length < 3
              ? undefined
              : whyDisabled({ type: 'CONFIRM' }, 'Scout is not available.')
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
        held={c.selectedCard}
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
        held={c.selectedCard}
      >
        <Note>
          Draw <b style={{ color: 'var(--bb-brass-bright)' }}>£30</b> against
          the estate — income drops <b style={{ color: '#d68d80' }}>3 levels</b>
          .
        </Note>
        <Confirm
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
          disabledReason={whyDisabled(
            { type: 'CONFIRM' },
            'This loan cannot be taken.',
          )}
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
