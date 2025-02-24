import { type GameStoreSnapshot, type GameStoreSend } from '~/store/gameStore'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface ActionButtonsProps {
  snapshot: GameStoreSnapshot
  send: GameStoreSend
}
export function ActionButtons({
  snapshot,
  send,
}: ActionButtonsProps) {

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent>
        {!snapshot.hasTag('confirmingAction') ? (
          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={() => send({ type: 'BUILD' })}
              disabled={snapshot.context.actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Build
            </Button>
            <Button
              onClick={() => send({ type: 'DEVELOP' })}
              disabled={snapshot.context.actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Develop
            </Button>
            <Button
              onClick={() => send({ type: 'SELL' })}
              disabled={snapshot.context.actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Sell
            </Button>
            <Button
              onClick={() => send({ type: 'TAKE_LOAN' })}
              disabled={snapshot.context.actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Take Loan
            </Button>
            <Button
              onClick={() => send({ type: 'SCOUT' })}
              disabled={snapshot.context.actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Scout
            </Button>
            <Button
              onClick={() => send({ type: 'NETWORK' })}
              disabled={snapshot.context.actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Network
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => send({ type: 'CONFIRM' })}
              disabled={!snapshot.can({ type: 'CONFIRM' })}
              variant="default"
              className="w-full"
            >
              Confirm
            </Button>
            <Button onClick={() => send({ type: 'CANCEL' })} variant="secondary" className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
