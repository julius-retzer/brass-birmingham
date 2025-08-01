import { Coins } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { cn } from '~/lib/utils'

interface ResourceMarketsProps {
  coalMarket: (number | null)[]
  ironMarket: (number | null)[]
}

interface MarketSlotProps {
  price: number | null
  resource: 'coal' | 'iron'
  isEmpty: boolean
}

function MarketSlot({ price, resource, isEmpty }: MarketSlotProps) {
  const resourceIcon = resource === 'coal' ? '⚫' : '🔩'
  const resourceColor = resource === 'coal' ? 'text-gray-600' : 'text-orange-600'
  
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-2 rounded-md border-2 transition-all',
        isEmpty
          ? 'border-dashed border-gray-300 bg-gray-50'
          : 'border-solid border-primary/30 bg-primary/5'
      )}
    >
      {!isEmpty ? (
        <>
          <div className={cn('text-2xl mb-1', resourceColor)}>
            {resourceIcon}
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Coins className="h-3 w-3" />
            <span className="font-semibold">£{price}</span>
          </div>
        </>
      ) : (
        <div className="text-gray-400 text-sm">Empty</div>
      )}
    </div>
  )
}

function ResourceMarket({ 
  title, 
  market, 
  resource, 
  icon 
}: { 
  title: string
  market: (number | null)[]
  resource: 'coal' | 'iron'
  icon: string
}) {
  const availableSlots = market.filter(slot => slot !== null).length
  const totalSlots = market.length
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          {title}
        </h4>
        <Badge variant="secondary" className="text-xs">
          {availableSlots}/{totalSlots} available
        </Badge>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {market.map((price, index) => (
          <MarketSlot
            key={index}
            price={price}
            resource={resource}
            isEmpty={price === null}
          />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        When market is empty: £{resource === 'coal' ? '8' : '6'} each
      </div>
    </div>
  )
}

export function ResourceMarkets({ coalMarket, ironMarket }: ResourceMarketsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource Markets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResourceMarket
          title="Coal Market"
          market={coalMarket}
          resource="coal"
          icon="⚫"
        />
        <ResourceMarket
          title="Iron Market"
          market={ironMarket}
          resource="iron"
          icon="🔩"
        />
        <div className="pt-2 border-t text-xs text-muted-foreground">
          <p>Resources are consumed from the cheapest available slots first.</p>
          <p>Coal requires connection to merchants (⬅️➡️) when buying from market.</p>
          <p>Iron can be consumed from any iron works or purchased from market.</p>
        </div>
      </CardContent>
    </Card>
  )
}