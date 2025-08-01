import { cn } from '~/lib/utils'
import { type GameStoreSend, type GameStoreSnapshot } from '~/store/gameStore'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface ActionButtonsProps {
  snapshot: GameStoreSnapshot
  send: GameStoreSend
}

export function ActionButtons({ snapshot, send }: ActionButtonsProps) {
  const isSelectingAction = snapshot.matches({
    playing: { action: 'selectingAction' },
  })

  // Check for confirming states
  const isConfirmingBuild = snapshot.matches({
    playing: { action: { building: 'confirmingBuild' } },
  })
  const isConfirmingDevelop = snapshot.matches({
    playing: { action: { developing: 'confirmingDevelop' } },
  })
  const isConfirmingSell = snapshot.matches({
    playing: { action: { selling: 'confirmingSell' } },
  })
  const isConfirmingLoan = snapshot.matches({
    playing: { action: { takingLoan: 'confirmingLoan' } },
  })
  const isConfirmingLink = snapshot.matches({
    playing: { action: { networking: 'confirmingLink' } },
  })

  // Check for card selection states
  const isSelectingCard =
    snapshot.matches({ playing: { action: { building: 'selectingCard' } } }) ||
    snapshot.matches({
      playing: { action: { developing: 'selectingCard' } },
    }) ||
    snapshot.matches({ playing: { action: { selling: 'selectingCard' } } }) ||
    snapshot.matches({
      playing: { action: { takingLoan: 'selectingCard' } },
    }) ||
    snapshot.matches({ playing: { action: { networking: 'selectingCard' } } })

  const isSelectingCardsForScout = snapshot.matches({
    playing: { action: { scouting: 'selectingCards' } },
  })

  const isSelectingLink = snapshot.matches({
    playing: { action: { networking: 'selectingLink' } },
  })

  const isConfirmingAction =
    isConfirmingBuild ||
    isConfirmingDevelop ||
    isConfirmingSell ||
    isConfirmingLoan ||
    isConfirmingLink

  const actionsRemaining = snapshot.context.actionsRemaining

  const isActive =
    isSelectingAction ||
    isConfirmingAction ||
    isSelectingCard ||
    isSelectingCardsForScout ||
    isSelectingLink

  return (
    <Card
      className={cn(
        'transition-colors duration-200',
        isActive ? 'border-primary' : 'border-muted',
      )}
    >
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent>
        {isSelectingAction && (
          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={() => send({ type: 'BUILD' })}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Build
            </Button>
            <Button
              onClick={() => send({ type: 'DEVELOP' })}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Develop
            </Button>
            <Button
              onClick={() => send({ type: 'SELL' })}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Sell
            </Button>
            <Button
              onClick={() => send({ type: 'TAKE_LOAN' })}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Take Loan
            </Button>
            <Button
              onClick={() => send({ type: 'SCOUT' })}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Scout
            </Button>
            <Button
              onClick={() => send({ type: 'NETWORK' })}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Network
            </Button>
            <Button
              onClick={() => send({ type: 'PASS' })}
              variant="outline"
              className="w-full mt-2"
            >
              Pass Turn
            </Button>
          </div>
        )}
        {(isConfirmingAction ||
          isSelectingCard ||
          isSelectingCardsForScout ||
          isSelectingLink) && (
          <div className="flex flex-col gap-2">
            {isConfirmingAction && (
              <Button
                onClick={() => send({ type: 'CONFIRM' })}
                disabled={!snapshot.can({ type: 'CONFIRM' })}
                variant="default"
                className="w-full"
              >
                Confirm
              </Button>
            )}
            {isSelectingCardsForScout &&
              snapshot.context.selectedCardsForScout.length === 2 && (
                <Button
                  onClick={() => send({ type: 'CONFIRM' })}
                  variant="default"
                  className="w-full"
                >
                  Confirm Scout
                </Button>
              )}
            <Button
              onClick={() => send({ type: 'CANCEL' })}
              variant="secondary"
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
