'use client'

import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { type CityId } from '~/data/board'
import { type Card as GameCard, type IndustryType } from '~/data/cards'
import { cn } from '~/lib/utils'
import {
  type GameEvent,
  type GameStoreSnapshot,
  type Player,
} from '~/store/gameStore'
import { getCardDescription } from '~/store/shared/gameUtils'

const INDUSTRY_TYPES: IndustryType[] = [
  'cotton',
  'coal',
  'iron',
  'manufacturer',
  'pottery',
  'brewery',
]

const SELLABLE: IndustryType[] = ['cotton', 'manufacturer', 'pottery']

interface ActionPanelProps {
  snapshot: GameStoreSnapshot
  send: (event: GameEvent) => void
  currentPlayer: Player
}

export function ActionPanel({
  snapshot,
  send,
  currentPlayer,
}: ActionPanelProps) {
  const is = (path: string) => snapshot.matches(path as never)
  const can = (event: GameEvent) => snapshot.can(event)

  // --- Top-level action selection ---
  if (is('playing.action.selectingAction')) {
    const actions: Array<{ label: string; event: GameEvent; hint: string }> = [
      { label: 'Build', event: { type: 'BUILD' }, hint: 'Place an industry' },
      { label: 'Network', event: { type: 'NETWORK' }, hint: 'Build a link' },
      {
        label: 'Develop',
        event: { type: 'DEVELOP' },
        hint: 'Remove tiles w/ iron',
      },
      {
        label: 'Sell',
        event: { type: 'SELL' },
        hint: 'Flip goods to merchant',
      },
      {
        label: 'Loan',
        event: { type: 'TAKE_LOAN' },
        hint: '+£30, −3 income',
      },
      { label: 'Scout', event: { type: 'SCOUT' }, hint: 'Discard 3 for wilds' },
      { label: 'Pass', event: { type: 'PASS' }, hint: 'Discard a card' },
    ]
    return (
      <StepShell title="Choose an action">
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => (
            <Button
              key={a.label}
              variant="outline"
              disabled={!can(a.event)}
              onClick={() => send(a.event)}
              className="flex h-auto flex-col items-start gap-0.5 py-2"
            >
              <span className="font-semibold">{a.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                {a.hint}
              </span>
            </Button>
          ))}
        </div>
      </StepShell>
    )
  }

  // --- Build ---
  if (is('playing.action.building.selectingCard')) {
    return (
      <StepShell
        title="Build: pick a card"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <HandChooser
          hand={currentPlayer.hand}
          canSelect={(id) => can({ type: 'SELECT_CARD', cardId: id })}
          onSelect={(id) => send({ type: 'SELECT_CARD', cardId: id })}
        />
      </StepShell>
    )
  }

  if (is('playing.action.building.selectingIndustryType')) {
    return (
      <StepShell
        title="Build: pick an industry type"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <IndustryTypeChooser
          canSelect={(t) =>
            can({ type: 'SELECT_INDUSTRY_TYPE', industryType: t })
          }
          onSelect={(t) =>
            send({ type: 'SELECT_INDUSTRY_TYPE', industryType: t })
          }
        />
      </StepShell>
    )
  }

  if (is('playing.action.building.selectingLocation')) {
    return (
      <StepShell
        title="Build: pick a city on the board"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <p className="text-sm text-muted-foreground">
          Highlighted cities can host{' '}
          <b>
            {snapshot.context.selectedIndustryTile?.type ?? 'this industry'}
          </b>
          . Click one on the board.
        </p>
      </StepShell>
    )
  }

  if (is('playing.action.building.confirmingBuild')) {
    const c = snapshot.context
    return (
      <StepShell
        title="Build: confirm"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <ul className="space-y-1 text-sm">
          <li>Card: {c.selectedCard && getCardDescription(c.selectedCard)}</li>
          {c.selectedIndustryTile && (
            <li>
              Industry: {c.selectedIndustryTile.type} (level{' '}
              {c.selectedIndustryTile.level}, £{c.selectedIndustryTile.cost})
            </li>
          )}
          <li>Location: {c.selectedLocation}</li>
        </ul>
        <ConfirmButton
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
        >
          Confirm build
        </ConfirmButton>
      </StepShell>
    )
  }

  // --- Develop ---
  if (is('playing.action.developing.selectingCard')) {
    return (
      <StepShell
        title="Develop: pick a card to discard"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <HandChooser
          hand={currentPlayer.hand}
          canSelect={(id) => can({ type: 'SELECT_CARD', cardId: id })}
          onSelect={(id) => send({ type: 'SELECT_CARD', cardId: id })}
        />
      </StepShell>
    )
  }

  if (is('playing.action.developing.selectingTiles')) {
    return (
      <DevelopTiles
        player={currentPlayer}
        onConfirm={(types) =>
          send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: types })
        }
        onAuto={() => send({ type: 'CONFIRM' })}
        onCancel={() => send({ type: 'CANCEL' })}
      />
    )
  }

  if (is('playing.action.developing.confirmingDevelop')) {
    return (
      <StepShell
        title="Develop: confirm"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <p className="text-sm">
          Removing:{' '}
          {snapshot.context.selectedTilesForDevelop.join(', ') ||
            'lowest available tile'}{' '}
          (consumes iron).
        </p>
        <ConfirmButton
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
        >
          Confirm develop
        </ConfirmButton>
      </StepShell>
    )
  }

  // --- Sell ---
  if (is('playing.action.selling.selectingCard')) {
    return (
      <StepShell
        title="Sell: pick a card to discard"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <HandChooser
          hand={currentPlayer.hand}
          canSelect={(id) => can({ type: 'SELECT_CARD', cardId: id })}
          onSelect={(id) => send({ type: 'SELECT_CARD', cardId: id })}
        />
      </StepShell>
    )
  }

  if (is('playing.action.selling.selectingSale')) {
    const c = snapshot.context
    const sales: Array<{
      location: CityId
      type: IndustryType
      merchant: CityId
    }> = []
    for (const ind of currentPlayer.industries) {
      if (ind.flipped || !SELLABLE.includes(ind.type)) continue
      for (const m of c.merchants) {
        const event: GameEvent = {
          type: 'SELECT_SALE',
          location: ind.location,
          industryType: ind.type,
          merchant: m.location,
        }
        if (can(event)) {
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
      <StepShell
        title="Sell: choose goods to flip"
        onCancel={sold === 0 ? () => send({ type: 'CANCEL' }) : undefined}
      >
        {sales.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No further legal sales.{' '}
            {sold === 0 && 'You may cancel this action.'}
          </p>
        )}
        <div className="space-y-1">
          {sales.map((s, i) => (
            <Button
              key={i}
              variant="outline"
              className="w-full justify-start text-sm"
              onClick={() =>
                send({
                  type: 'SELECT_SALE',
                  location: s.location,
                  industryType: s.type,
                  merchant: s.merchant,
                })
              }
            >
              Sell {s.type} at {s.location} → merchant {s.merchant}
            </Button>
          ))}
        </div>
        {sold > 0 && (
          <>
            <Separator />
            <p className="text-sm">
              Flipped {sold} industr{sold === 1 ? 'y' : 'ies'} this action.
            </p>
            <ConfirmButton
              disabled={!can({ type: 'CONFIRM' })}
              onClick={() => send({ type: 'CONFIRM' })}
            >
              Finish selling
            </ConfirmButton>
          </>
        )}
      </StepShell>
    )
  }

  // --- Scout ---
  if (is('playing.action.scouting.selectingCards')) {
    const picked = snapshot.context.selectedCardsForScout
    return (
      <StepShell
        title={`Scout: select 3 cards (${picked.length}/3)`}
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <HandChooser
          hand={currentPlayer.hand}
          selectedIds={picked.map((c) => c.id)}
          canSelect={(id) => can({ type: 'SELECT_CARD', cardId: id })}
          onSelect={(id) => send({ type: 'SELECT_CARD', cardId: id })}
        />
        <ConfirmButton
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
        >
          Confirm scout
        </ConfirmButton>
      </StepShell>
    )
  }

  // --- Loan ---
  if (is('playing.action.takingLoan.selectingCard')) {
    return (
      <StepShell
        title="Loan: pick a card to discard"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <HandChooser
          hand={currentPlayer.hand}
          canSelect={(id) => can({ type: 'SELECT_CARD', cardId: id })}
          onSelect={(id) => send({ type: 'SELECT_CARD', cardId: id })}
        />
      </StepShell>
    )
  }

  if (is('playing.action.takingLoan.confirmingLoan')) {
    return (
      <StepShell
        title="Loan: confirm"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <p className="text-sm">Take £30 and lower income by 3?</p>
        <ConfirmButton
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
        >
          Confirm loan
        </ConfirmButton>
      </StepShell>
    )
  }

  // --- Network ---
  if (is('playing.action.networking.selectingCard')) {
    return (
      <StepShell
        title="Network: pick a card to discard"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <HandChooser
          hand={currentPlayer.hand}
          canSelect={(id) => can({ type: 'SELECT_CARD', cardId: id })}
          onSelect={(id) => send({ type: 'SELECT_CARD', cardId: id })}
        />
      </StepShell>
    )
  }

  if (is('playing.action.networking.selectingLink')) {
    return (
      <StepShell
        title="Network: pick a connection"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <p className="text-sm text-muted-foreground">
          Click a {snapshot.context.era} connection on the board. Rail links
          cost £5 + 1 coal; canal links cost £3.
        </p>
      </StepShell>
    )
  }

  if (is('playing.action.networking.confirmingLink')) {
    const link = snapshot.context.selectedLink
    return (
      <StepShell
        title="Network: confirm link"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <p className="text-sm">
          Link: {link?.from} → {link?.to} ({snapshot.context.era})
        </p>
        <ConfirmButton
          disabled={!can({ type: 'CONFIRM' })}
          onClick={() => send({ type: 'CONFIRM' })}
        >
          Build this link
        </ConfirmButton>
        {can({ type: 'CHOOSE_DOUBLE_LINK_BUILD' }) && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })}
          >
            Build 2 links (£15 + 2 coal + 1 beer)
          </Button>
        )}
      </StepShell>
    )
  }

  if (is('playing.action.networking.selectingSecondLink')) {
    return (
      <StepShell
        title="Network: pick a second connection"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <p className="text-sm text-muted-foreground">
          Click the second connection on the board.
        </p>
      </StepShell>
    )
  }

  if (is('playing.action.networking.confirmingDoubleLink')) {
    const c = snapshot.context
    return (
      <StepShell
        title="Network: confirm 2 links"
        onCancel={() => send({ type: 'CANCEL' })}
      >
        <p className="text-sm">
          {c.selectedLink?.from}→{c.selectedLink?.to} and{' '}
          {c.selectedSecondLink?.from}→{c.selectedSecondLink?.to}
        </p>
        <ConfirmButton
          disabled={!can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })}
          onClick={() => send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })}
        >
          Build both links
        </ConfirmButton>
      </StepShell>
    )
  }

  return (
    <StepShell title="Resolving…">
      <p className="text-sm text-muted-foreground">Processing turn…</p>
    </StepShell>
  )
}

// ---------- sub-components ----------

function StepShell({
  title,
  children,
  onCancel,
}: {
  title: string
  children: React.ReactNode
  onCancel?: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

function ConfirmButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button className="w-full" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

function HandChooser({
  hand,
  canSelect,
  onSelect,
  selectedIds = [],
}: {
  hand: GameCard[]
  canSelect: (id: string) => boolean
  onSelect: (id: string) => void
  selectedIds?: string[]
}) {
  if (hand.length === 0) {
    return <p className="text-sm text-muted-foreground">No cards in hand.</p>
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {hand.map((card) => {
        const selected = selectedIds.includes(card.id)
        const enabled = canSelect(card.id) || selected
        return (
          <Button
            key={card.id}
            variant={selected ? 'default' : 'outline'}
            size="sm"
            disabled={!enabled}
            onClick={() => onSelect(card.id)}
            className={cn('h-auto justify-start py-1.5 text-xs')}
          >
            {getCardDescription(card)}
          </Button>
        )
      })}
    </div>
  )
}

function IndustryTypeChooser({
  canSelect,
  onSelect,
}: {
  canSelect: (t: IndustryType) => boolean
  onSelect: (t: IndustryType) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {INDUSTRY_TYPES.map((t) => (
        <Button
          key={t}
          variant="outline"
          size="sm"
          disabled={!canSelect(t)}
          onClick={() => onSelect(t)}
          className="text-xs capitalize"
        >
          {t}
        </Button>
      ))}
    </div>
  )
}

function DevelopTiles({
  player,
  onConfirm,
  onAuto,
  onCancel,
}: {
  player: Player
  onConfirm: (types: IndustryType[]) => void
  onAuto: () => void
  onCancel: () => void
}) {
  const developable = INDUSTRY_TYPES.filter((t) => {
    const tiles = player.industryTilesOnMat[t] || []
    return tiles.some(
      (tw) =>
        tw.quantityAvailable > 0 &&
        !(t === 'pottery' && tw.tile.hasLightbulbIcon),
    )
  })
  return (
    <StepShell title="Develop: choose up to 2 tiles" onCancel={onCancel}>
      <p className="text-sm text-muted-foreground">
        Each removed tile consumes 1 iron.
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {developable.map((t) => (
          <Button
            key={t}
            variant="outline"
            size="sm"
            onClick={() => onConfirm([t])}
            className="text-xs capitalize"
          >
            {t}
          </Button>
        ))}
      </div>
      <Button variant="secondary" className="w-full" onClick={onAuto}>
        Develop lowest available
      </Button>
    </StepShell>
  )
}
