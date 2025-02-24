import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface ActionButtonsProps {
  isActionSelection: boolean
  actionsRemaining: number
  canConfirmAction: boolean
  onAction: (
    action: 'BUILD' | 'DEVELOP' | 'SELL' | 'TAKE_LOAN' | 'SCOUT' | 'NETWORK',
  ) => void
  onConfirm: () => void
  onCancel: () => void
}

export function ActionButtons({
  isActionSelection,
  actionsRemaining,
  canConfirmAction,
  onAction,
  onConfirm,
  onCancel,
}: ActionButtonsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent>
        {isActionSelection ? (
          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={() => onAction('BUILD')}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Build
            </Button>
            <Button
              onClick={() => onAction('DEVELOP')}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Develop
            </Button>
            <Button
              onClick={() => onAction('SELL')}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Sell
            </Button>
            <Button
              onClick={() => onAction('TAKE_LOAN')}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Take Loan
            </Button>
            <Button
              onClick={() => onAction('SCOUT')}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Scout
            </Button>
            <Button
              onClick={() => onAction('NETWORK')}
              disabled={actionsRemaining <= 0}
              variant="secondary"
              className="w-full"
            >
              Network
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              onClick={onConfirm}
              disabled={!canConfirmAction}
              variant="default"
              className="w-full"
            >
              Confirm
            </Button>
            <Button onClick={onCancel} variant="secondary" className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
