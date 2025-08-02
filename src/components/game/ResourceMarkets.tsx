import { Coins } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface ResourceMarketsProps {
  coalMarket: Array<{ price: number; cubes: number; maxCubes: number }>
  ironMarket: Array<{ price: number; cubes: number; maxCubes: number }>
}

interface MarketSlotProps {
  price: number
  cubes: number
  maxCubes: number
  resource: 'coal' | 'iron'
  isInfinite?: boolean
}

function MarketSlot({
  price,
  cubes,
  maxCubes,
  resource,
  isInfinite = false,
}: MarketSlotProps) {
  const resourceConfig =
    resource === 'coal'
      ? {
          icon: '🪨',
          color: 'text-slate-800',
          bgColor: 'bg-slate-100',
          borderColor: 'border-slate-300',
          activeBg: 'bg-slate-200',
          activeBorder: 'border-slate-400',
        }
      : {
          icon: '⚙️',
          color: 'text-amber-700',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          activeBg: 'bg-amber-100',
          activeBorder: 'border-amber-300',
        }

  const hasResources = cubes > 0
  const isFull = cubes >= maxCubes && !isInfinite

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all min-h-[85px]',
        hasResources
          ? `${resourceConfig.activeBg} ${resourceConfig.activeBorder}`
          : `${resourceConfig.bgColor} ${resourceConfig.borderColor} border-dashed`,
        isFull && 'bg-red-50 border-red-300',
      )}
    >
      <div className="flex items-center gap-1 text-sm mb-2 font-semibold text-green-700">
        <Coins className="h-3 w-3" />
        <span>£{price}</span>
      </div>

      <div className={cn('text-2xl mb-1', resourceConfig.color)}>
        {hasResources ? resourceConfig.icon : '⭕'}
      </div>

      <div className="text-xs text-center">
        {isInfinite ? (
          <span className="text-purple-600 font-bold">∞</span>
        ) : (
          <span
            className={cn(
              'font-semibold px-1.5 py-0.5 rounded text-xs',
              cubes === 0
                ? 'text-red-600 bg-red-100'
                : 'text-emerald-700 bg-emerald-100',
            )}
          >
            {cubes}/{maxCubes}
          </span>
        )}
      </div>
    </div>
  )
}

function ResourceMarket({
  title,
  market,
  resource,
  icon,
}: {
  title: string
  market: Array<{ price: number; cubes: number; maxCubes: number }>
  resource: 'coal' | 'iron'
  icon: string
}) {
  const totalCubes = market.reduce((sum, level) => sum + level.cubes, 0)
  const totalCapacity = market
    .filter((level) => level.maxCubes !== Infinity)
    .reduce((sum, level) => sum + level.maxCubes, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          {title}
        </h4>
        <Badge variant="secondary" className="text-xs">
          {totalCubes}/{totalCapacity} cubes
        </Badge>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {market.map((level, index) => (
          <MarketSlot
            key={index}
            price={level.price}
            cubes={level.cubes}
            maxCubes={level.maxCubes}
            resource={resource}
            isInfinite={level.maxCubes === Infinity}
          />
        ))}
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Resources are consumed from cheapest available slots first</p>
        <p>• Resources are sold to most expensive available slots first</p>
        <p>• Infinite capacity slots are fallbacks for purchasing only</p>
      </div>
    </div>
  )
}

export function ResourceMarkets({
  coalMarket,
  ironMarket,
}: ResourceMarketsProps) {
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
          icon="🪨"
        />
        <ResourceMarket
          title="Iron Market"
          market={ironMarket}
          resource="iron"
          icon="⚙️"
        />
      </CardContent>
    </Card>
  )
}
