import { Card, CardContent } from '../ui/card';

export function GameOver() {
  return (
    <Card className="mt-8">
      <CardContent className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
        {/* Add victory points display and winner announcement here */}
      </CardContent>
    </Card>
  );
}