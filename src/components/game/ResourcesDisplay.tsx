import { CircleDot, Factory, Beer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Resources {
  coal: number;
  iron: number;
  beer: number;
}

interface ResourcesDisplayProps {
  resources: Resources;
}

export function ResourcesDisplay({ resources }: ResourcesDisplayProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resources</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <CircleDot className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-sm text-muted-foreground">Coal</p>
              <p className="text-xl font-semibold">{resources.coal}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Factory className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-sm text-muted-foreground">Iron</p>
              <p className="text-xl font-semibold">{resources.iron}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Beer className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-sm text-muted-foreground">Beer</p>
              <p className="text-xl font-semibold">{resources.beer}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}