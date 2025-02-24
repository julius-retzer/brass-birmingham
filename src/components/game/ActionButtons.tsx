import { type GameStoreSnapshot, type GameStoreSend } from '~/store/gameStore'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { cn } from '~/lib/utils'

interface ActionButtonsProps {
  snapshot: GameStoreSnapshot
  send: GameStoreSend
}

export function ActionButtons({
  snapshot,
  send,
}: ActionButtonsProps) {
  const isSelectingAction = snapshot.matches({ playing: { action: 'selectingAction' } })
  const isConfirmingAction = snapshot.hasTag('confirmingAction')
  const isSelectingCard = snapshot.hasTag('selectingCard')
  const isConfirmingLink = snapshot.matches({ playing: { action: { networking: 'confirmingLink' } } })
  const actionsRemaining = snapshot.context.actionsRemaining

  const isActive = isSelectingAction || isConfirmingAction || isSelectingCard || isConfirmingLink

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
          </div>
        )}
        {(isConfirmingAction || isSelectingCard || isConfirmingLink) && (
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
