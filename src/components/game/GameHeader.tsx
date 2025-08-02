import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface GameHeaderProps {
  era: string
  round: number
  actionsRemaining: number
  currentPlayerName: string
  spentMoney: number
  onStartInspector: () => void
}

export function GameHeader({
  era,
  round,
  actionsRemaining,
  currentPlayerName,
  spentMoney,
  onStartInspector,
}: GameHeaderProps) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold">Brass Birmingham</CardTitle>
          <Button variant="outline" size="sm" onClick={onStartInspector}>
            State Inspector
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-start gap-8">
          <div className="text-center">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wide">Era</h2>
            <p className="text-lg font-semibold capitalize">{era}</p>
          </div>
          <div className="text-center">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wide">Round</h2>
            <p className="text-lg font-semibold">{round}</p>
          </div>
          <div className="text-center">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wide">Actions Left</h2>
            <p className="text-lg font-semibold">{actionsRemaining}</p>
          </div>
          <div className="text-center">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wide">Current Player</h2>
            <p className="text-lg font-semibold">
              {currentPlayerName ?? 'None'}
            </p>
          </div>
          <div className="text-center">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wide">Money Spent</h2>
            <p className="text-lg font-semibold">£{spentMoney}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
