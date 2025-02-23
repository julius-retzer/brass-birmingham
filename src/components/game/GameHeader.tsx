import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface GameHeaderProps {
  era: string;
  round: number;
  actionsRemaining: number;
  currentPlayerName: string;
  spentMoney: number;
  onStartInspector: () => void;
}

export function GameHeader({
  era,
  round,
  actionsRemaining,
  currentPlayerName,
  spentMoney,
  onStartInspector
}: GameHeaderProps) {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-3xl">Brass Birmingham</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <h2 className="text-sm text-muted-foreground">Era</h2>
            <p className="text-xl font-semibold capitalize">{era}</p>
          </div>
          <div>
            <h2 className="text-sm text-muted-foreground">Round</h2>
            <p className="text-xl font-semibold">{round}</p>
          </div>
          <div>
            <h2 className="text-sm text-muted-foreground">Actions Left</h2>
            <p className="text-xl font-semibold">{actionsRemaining}</p>
          </div>
          <div>
            <h2 className="text-sm text-muted-foreground">Current Player</h2>
            <p className="text-xl font-semibold">{currentPlayerName ?? 'None'}</p>
          </div>
          <div>
            <h2 className="text-sm text-muted-foreground">Money Spent</h2>
            <p className="text-xl font-semibold">£{spentMoney}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onStartInspector}
          >
            Start State Inspector
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}