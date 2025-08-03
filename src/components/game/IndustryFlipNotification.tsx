import { RotateCcw, TrendingUp, Trophy } from 'lucide-react'
import { type IndustryType } from '~/data/cards'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface FlippedIndustry {
  type: IndustryType
  location: string
  playerName: string
  playerColor: string
  incomeAdvancement: number
  newIncome: number
}

interface IndustryFlipNotificationProps {
  flippedIndustries: FlippedIndustry[]
  onDismiss?: () => void
  className?: string
}

export function IndustryFlipNotification({
  flippedIndustries,
  onDismiss,
  className,
}: IndustryFlipNotificationProps) {
  if (flippedIndustries.length === 0) {
    return null
  }

  const getIndustryIcon = (type: IndustryType) => {
    switch (type) {
      case 'coal':
        return '⚫'
      case 'iron':
        return '🔸'
      case 'brewery':
        return '🍺'
      case 'cotton':
        return '🌿'
      case 'manufacturer':
        return '🏭'
      case 'pottery':
        return '🏺'
      default:
        return '🏭'
    }
  }

  const getFlipReason = (type: IndustryType) => {
    switch (type) {
      case 'coal':
        return 'coal cubes exhausted'
      case 'iron':
        return 'iron cubes exhausted'
      case 'brewery':
        return 'beer barrels exhausted'
      default:
        return 'resources exhausted'
    }
  }

  return (
    <Card className={`border-blue-300 bg-blue-50 ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <RotateCcw className="h-5 w-5" />
          Industry Tiles Flipped ({flippedIndustries.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <TrendingUp className="h-4 w-4" />
          <AlertDescription>
            Industry tiles automatically flip when their resources are
            exhausted, advancing player income and providing victory points.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          {flippedIndustries.map((industry, index) => (
            <div
              key={`${industry.playerName}-${industry.location}-${industry.type}-${index}`}
              className="flex items-center justify-between p-3 bg-white border border-blue-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: industry.playerColor }}
                />
                <span className="text-lg">
                  {getIndustryIcon(industry.type)}
                </span>
                <div>
                  <div className="font-medium text-sm">
                    {industry.playerName}'s {industry.type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    at {industry.location} • {getFlipReason(industry.type)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {industry.incomeAdvancement > 0 && (
                  <Badge
                    variant="outline"
                    className="text-green-700 bg-green-50"
                  >
                    <TrendingUp className="h-3 w-3 mr-1" />+
                    {industry.incomeAdvancement} income
                  </Badge>
                )}
                <div className="text-sm text-muted-foreground">
                  Income: {industry.newIncome}
                </div>
                <Badge
                  variant="outline"
                  className="text-purple-700 bg-purple-50"
                >
                  <Trophy className="h-3 w-3 mr-1" />
                  VP at era end
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-blue-200">
          <div className="font-medium">Industry Flipping Rules:</div>
          <div>• Coal mines flip when coal cubes are exhausted</div>
          <div>• Iron works flip when iron cubes are exhausted</div>
          <div>• Breweries flip when beer barrels are exhausted</div>
          <div>• Flipped tiles score victory points at era end</div>
          <div>• Income advancement is capped at level 30</div>
        </div>

        {onDismiss && (
          <Button
            onClick={onDismiss}
            variant="outline"
            size="sm"
            className="w-full"
          >
            Continue
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
