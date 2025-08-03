import {
  AlertCircle,
  ArrowRight,
  Building,
  Coins,
  Factory,
  ShoppingCart,
} from 'lucide-react'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Separator } from '../ui/separator'

interface ResourceSource {
  type: 'market' | 'player_industry' | 'connected_industry' | 'merchant'
  location?: string
  playerName?: string
  cost: number
  amount: number
}

interface ResourceConsumptionFeedbackProps {
  resourceType: 'coal' | 'iron' | 'beer'
  totalRequired: number
  sources: ResourceSource[]
  totalCost: number
  canAfford: boolean
  playerMoney: number
  className?: string
}

export function ResourceConsumptionFeedback({
  resourceType,
  totalRequired,
  sources,
  totalCost,
  canAfford,
  playerMoney,
  className,
}: ResourceConsumptionFeedbackProps) {
  const getResourceIcon = () => {
    switch (resourceType) {
      case 'coal':
        return '⚫'
      case 'iron':
        return '🔸'
      case 'beer':
        return '🍺'
    }
  }

  const getSourceIcon = (source: ResourceSource) => {
    switch (source.type) {
      case 'market':
        return <ShoppingCart className="h-3 w-3" />
      case 'player_industry':
        return <Building className="h-3 w-3 text-green-600" />
      case 'connected_industry':
        return <Factory className="h-3 w-3 text-blue-600" />
      case 'merchant':
        return <Building className="h-3 w-3 text-amber-600" />
    }
  }

  const getSourceDescription = (source: ResourceSource) => {
    switch (source.type) {
      case 'market':
        return `Market (£${source.cost} each)`
      case 'player_industry':
        return `Your ${resourceType} at ${source.location}`
      case 'connected_industry':
        return `${source.playerName}'s ${resourceType} at ${source.location}`
      case 'merchant':
        return `Merchant beer at ${source.location}`
    }
  }

  const getSourceColor = (source: ResourceSource) => {
    switch (source.type) {
      case 'market':
        return 'border-gray-200 bg-gray-50'
      case 'player_industry':
        return 'border-green-200 bg-green-50'
      case 'connected_industry':
        return 'border-blue-200 bg-blue-50'
      case 'merchant':
        return 'border-amber-200 bg-amber-50'
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="text-lg">{getResourceIcon()}</span>
          {resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}{' '}
          Consumption
          <Badge variant="outline" className="ml-auto">
            {totalRequired} required
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Consumption Sources */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Sources:</h4>
          {sources.map((source, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-2 rounded border ${getSourceColor(source)}`}
            >
              <div className="flex items-center gap-2">
                {getSourceIcon(source)}
                <span className="text-sm">{getSourceDescription(source)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {source.amount} × {getResourceIcon()}
                </span>
                {source.cost > 0 && (
                  <>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-medium">£{source.cost}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Cost Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Total Cost:
            </span>
            <span
              className={`font-medium ${!canAfford ? 'text-destructive' : ''}`}
            >
              £{totalCost}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Your Money:</span>
            <span>£{playerMoney}</span>
          </div>
        </div>

        {/* Affordability Warning */}
        {!canAfford && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Insufficient funds! You need £{totalCost} but only have £
              {playerMoney}.
            </AlertDescription>
          </Alert>
        )}

        {/* Help Text */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="font-medium">Resource Priority:</div>
          <div>1. Your own industries (free)</div>
          <div>2. Connected industries (free)</div>
          <div>3. Market (pay price shown)</div>
          {resourceType === 'beer' && (
            <div>4. Merchant beer (for Sell actions only)</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
