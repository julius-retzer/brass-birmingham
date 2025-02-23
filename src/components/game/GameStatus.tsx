import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface GameStatusProps {
  isActionSelection: boolean;
  currentAction: string | undefined;
  description: string | undefined;
}

export function GameStatus({
  isActionSelection,
  currentAction,
  description
}: GameStatusProps) {
  return (
    <Card className="bg-muted/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span>Game Status</span>
          <Badge variant={isActionSelection ? "secondary" : "default"}>
            {isActionSelection ? "Select Action" : currentAction ?? "Unknown"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-medium">{description ?? "Unknown state"}</p>
      </CardContent>
    </Card>
  );
}