import { Beer, Coins, Factory, TrendingUp, Trophy } from 'lucide-react'
import { cn } from '~/lib/utils'
import { type Merchant } from '~/store/gameStore'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface MerchantDisplayProps {
  merchants: Merchant[]
  className?: string
}

export function MerchantDisplay({
  merchants,
  className,
}: MerchantDisplayProps) {
  const getBonusIcon = (bonusType: Merchant['bonusType']) => {
    switch (bonusType) {
      case 'money':
        return <Coins className="h-3 w-3" />
      case 'income':
        return <TrendingUp className="h-3 w-3" />
      case 'victoryPoints':
        return <Trophy className="h-3 w-3" />
      case 'develop':
        return <Factory className="h-3 w-3" />
    }
  }

  const getBonusText = (merchant: Merchant) => {
    switch (merchant.bonusType) {
      case 'money':
        return `£${merchant.bonusValue}`
      case 'income':
        return `+${merchant.bonusValue} income`
      case 'victoryPoints':
        return `${merchant.bonusValue} VP`
      case 'develop':
        return `${merchant.bonusValue} develop`
    }
  }

  const getBonusColor = (bonusType: Merchant['bonusType']) => {
    switch (bonusType) {
      case 'money':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'income':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'victoryPoints':
        return 'text-purple-600 bg-purple-50 border-purple-200'
      case 'develop':
        return 'text-blue-600 bg-blue-50 border-blue-200'
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Factory className="h-5 w-5" />
          Merchants ({merchants.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {merchants.map((merchant, index) => (
          <div
            key={`${merchant.location}-${index}`}
            className="p-3 bg-card border border-border rounded-lg space-y-2"
          >
            {/* Location */}
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm capitalize">
                {merchant.location}
              </div>
              <div className="flex items-center gap-1">
                <Beer
                  className={cn(
                    'h-3 w-3',
                    merchant.hasBeer ? 'text-amber-600' : 'text-gray-400',
                  )}
                />
                <span
                  className={cn(
                    'text-xs',
                    merchant.hasBeer ? 'text-amber-600' : 'text-gray-400',
                  )}
                >
                  {merchant.hasBeer ? 'Beer' : 'No Beer'}
                </span>
              </div>
            </div>

            {/* Industry Icons */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">
                Accepts:
              </span>
              {merchant.industryIcons.map((industry, i) => (
                <Badge key={i} variant="outline" className="text-xs capitalize">
                  {industry}
                </Badge>
              ))}
            </div>

            {/* Bonus */}
            <div
              className={cn(
                'flex items-center justify-between p-2 rounded border',
                getBonusColor(merchant.bonusType),
              )}
            >
              <div className="flex items-center gap-1">
                {getBonusIcon(merchant.bonusType)}
                <span className="text-xs font-medium">Bonus:</span>
              </div>
              <span className="text-xs font-medium">
                {getBonusText(merchant)}
              </span>
            </div>
          </div>
        ))}

        {merchants.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <Factory className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No merchants active</p>
          </div>
        )}

        {/* Help Text */}
        <div className="text-xs text-muted-foreground space-y-1 mt-4 pt-3 border-t border-amber-200">
          <div className="font-medium">Merchant Rules:</div>
          <div>• Sell matching industry types to collect bonuses</div>
          <div>• Beer can be consumed for Sell actions</div>
          <div>• Bonuses are awarded when merchant beer is used</div>
        </div>
      </CardContent>
    </Card>
  )
}
