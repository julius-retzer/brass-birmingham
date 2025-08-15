import { Coins, Factory, Trophy, Zap } from 'lucide-react'
import { type IndustryType } from '../data/cards'
import { type IndustryTile, type IndustryTileWithQuantity } from '../data/industryTiles'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'

interface IndustryTilesDisplayProps {
  industryTiles: Record<IndustryType, IndustryTileWithQuantity[]>
  selectedTile?: IndustryTile | null
  onTileSelect?: (tile: IndustryTile) => void
  era: 'canal' | 'rail'
  playerName: string
  isSelecting?: boolean
}

interface IndustryTileCardProps {
  tileWithQuantity: IndustryTileWithQuantity
  isSelected: boolean
  isSelectable: boolean
  onClick?: () => void
  era: 'canal' | 'rail'
}

function IndustryTileCard({
  tileWithQuantity,
  isSelected,
  isSelectable,
  onClick,
  era,
}: IndustryTileCardProps) {
  const tile = tileWithQuantity.tile
  const canBuildInCurrentEra =
    era === 'canal' ? tile.canBuildInCanalEra : tile.canBuildInRailEra
  const isAvailable = tileWithQuantity.quantityAvailable > 0

  const getIndustryColor = (type: IndustryType) => {
    const colors = {
      cotton: 'bg-pink-100 dark:bg-pink-900 border-pink-300',
      coal: 'bg-gray-100 dark:bg-gray-800 border-gray-400',
      iron: 'bg-orange-100 dark:bg-orange-900 border-orange-300',
      manufacturer: 'bg-blue-100 dark:bg-blue-900 border-blue-300',
      pottery: 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300',
      brewery: 'bg-green-100 dark:bg-green-900 border-green-300',
    }
    return colors[type] || 'bg-gray-100 dark:bg-gray-800'
  }

  const getResourceIcon = (type: string, amount: number) => {
    if (amount === 0) return null

    const iconMap: Record<string, string> = {
      coal: '⚫',
      iron: '🔩',
      beer: '🍺',
    }

    return (
      <div className="flex items-center gap-1 text-xs">
        <span>{iconMap[type]}</span>
        <span>{amount}</span>
      </div>
    )
  }

  const getTooltipContent = () => {
    const resources = []
    if (tile.coalRequired > 0) resources.push(`${tile.coalRequired} Coal`)
    if (tile.ironRequired > 0) resources.push(`${tile.ironRequired} Iron`)
    if (tile.beerRequired > 0)
      resources.push(`${tile.beerRequired} Beer to sell`)

    const production = []
    if (tile.coalProduced > 0)
      production.push(`Produces ${tile.coalProduced} Coal`)
    if (tile.ironProduced > 0)
      production.push(`Produces ${tile.ironProduced} Iron`)
    if (tile.beerProduced > 0)
      production.push(`Produces ${tile.beerProduced} Beer`)

    return (
      <div className="space-y-1">
        <div className="font-semibold">
          {tile.type.charAt(0).toUpperCase() + tile.type.slice(1)} Level{' '}
          {tile.level}
        </div>
        <div>Cost: £{tile.cost}</div>
        <div>Victory Points: {tile.victoryPoints}</div>
        <div>Income Spaces: {tile.incomeSpaces}</div>
        <div>Quantity Available: {tileWithQuantity.quantityAvailable}</div>
        {resources.length > 0 && <div>Requires: {resources.join(', ')}</div>}
        {production.length > 0 && <div>{production.join(', ')}</div>}
        {!canBuildInCurrentEra && (
          <div className="text-red-500">Cannot build in {era} era</div>
        )}
        {tile.hasLightbulbIcon && (
          <div className="text-yellow-500">Cannot be developed</div>
        )}
      </div>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card
          className={cn(
            'transition-all cursor-pointer relative',
            getIndustryColor(tile.type),
            isSelected && 'ring-2 ring-primary ring-offset-2',
            isSelectable && canBuildInCurrentEra && isAvailable && 'hover:scale-105',
            (!canBuildInCurrentEra || !isAvailable) && 'opacity-50',
            !isSelectable && 'cursor-not-allowed opacity-70',
          )}
          onClick={isSelectable && canBuildInCurrentEra && isAvailable ? onClick : undefined}
        >
          <CardContent className="p-3">
            <div className="space-y-2">
              {/* Header with type and level */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4" />
                  <span className="font-semibold text-sm">
                    {tile.type.charAt(0).toUpperCase() + tile.type.slice(1)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs">
                    L{tile.level}
                  </Badge>
                  <Badge variant={isAvailable ? "default" : "destructive"} className="text-xs">
                    {tileWithQuantity.quantityAvailable}
                  </Badge>
                </div>
              </div>

              {/* Cost and VP */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <Coins className="h-3 w-3" />
                  <span>£{tile.cost}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  <span>{tile.victoryPoints}VP</span>
                </div>
              </div>

              {/* Resource requirements/production */}
              <div className="space-y-1">
                {tile.coalRequired > 0 &&
                  getResourceIcon('coal', tile.coalRequired)}
                {tile.ironRequired > 0 &&
                  getResourceIcon('iron', tile.ironRequired)}
                {tile.beerRequired > 0 &&
                  getResourceIcon('beer', tile.beerRequired)}
                {tile.coalProduced > 0 && (
                  <div className="text-xs text-green-600">
                    +{tile.coalProduced} ⚫
                  </div>
                )}
                {tile.ironProduced > 0 && (
                  <div className="text-xs text-green-600">
                    +{tile.ironProduced} 🔩
                  </div>
                )}
                {tile.beerProduced > 0 && (
                  <div className="text-xs text-green-600">
                    +{tile.beerProduced} 🍺
                  </div>
                )}
              </div>

              {/* Special indicators */}
              {tile.hasLightbulbIcon && (
                <div className="absolute top-1 right-1">
                  <Zap className="h-3 w-3 text-yellow-500" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent>{getTooltipContent()}</TooltipContent>
    </Tooltip>
  )
}

export function IndustryTilesDisplay({
  industryTiles,
  selectedTile,
  onTileSelect,
  era,
  playerName,
  isSelecting = false,
}: IndustryTilesDisplayProps) {
  const industryTypes: IndustryType[] = [
    'cotton',
    'coal',
    'iron',
    'manufacturer',
    'pottery',
    'brewery',
  ]

  return (
    <Card
      className={cn(
        'transition-colors duration-200',
        isSelecting ? 'border-primary' : 'border-muted',
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{playerName}'s Industry Tiles</span>
          <Badge variant={isSelecting ? 'default' : 'secondary'}>
            {isSelecting ? 'Select Tile' : 'Available'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-4">
            {industryTypes.map((type) => {
              const tiles = industryTiles[type] || []
              if (tiles.length === 0) return null

              return (
                <div key={type} className="space-y-2">
                  <h4 className="text-sm font-medium capitalize flex items-center gap-2">
                    <Factory className="h-4 w-4" />
                    {type} ({tiles.reduce((sum, t) => sum + t.quantityAvailable, 0)} available)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {tiles.map((tileWithQuantity) => (
                      <IndustryTileCard
                        key={tileWithQuantity.tile.id}
                        tileWithQuantity={tileWithQuantity}
                        isSelected={selectedTile?.id === tileWithQuantity.tile.id}
                        isSelectable={isSelecting}
                        onClick={() => onTileSelect?.(tileWithQuantity.tile)}
                        era={era}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
