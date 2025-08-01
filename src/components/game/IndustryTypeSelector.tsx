import { Factory } from 'lucide-react'
import { type IndustryType } from '~/data/cards'
import { type IndustryCard } from '~/data/cards'
import { type Player } from '~/store/gameStore'
import { cn } from '~/lib/utils'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'

interface IndustryTypeSelectorProps {
  industryCard: IndustryCard
  player: Player
  era: 'canal' | 'rail'
  onSelectIndustryType: (industryType: IndustryType) => void
  onCancel: () => void
}

interface IndustryTypeOptionProps {
  industryType: IndustryType
  availableTiles: number
  isAvailable: boolean
  onClick: () => void
}

function IndustryTypeOption({ 
  industryType, 
  availableTiles, 
  isAvailable, 
  onClick 
}: IndustryTypeOptionProps) {
  const getIndustryColor = (type: IndustryType) => {
    const colors = {
      cotton: 'bg-pink-100 border-pink-300 hover:bg-pink-200',
      coal: 'bg-gray-100 border-gray-400 hover:bg-gray-200',
      iron: 'bg-orange-100 border-orange-300 hover:bg-orange-200',
      manufacturer: 'bg-blue-100 border-blue-300 hover:bg-blue-200',
      pottery: 'bg-yellow-100 border-yellow-300 hover:bg-yellow-200',
      brewery: 'bg-green-100 border-green-300 hover:bg-green-200',
    }
    return colors[type] || 'bg-gray-100 border-gray-400'
  }

  const getIndustryIcon = (type: IndustryType) => {
    const icons = {
      cotton: '🧵',
      coal: '⚫',
      iron: '🔩',
      manufacturer: '🏭',
      pottery: '🏺',
      brewery: '🍺',
    }
    return icons[type] || '🏭'
  }

  return (
    <Button
      variant="outline"
      className={cn(
        'h-auto p-4 justify-start',
        getIndustryColor(industryType),
        !isAvailable && 'opacity-50 cursor-not-allowed'
      )}
      onClick={isAvailable ? onClick : undefined}
      disabled={!isAvailable}
    >
      <div className="flex items-center gap-3 w-full">
        <div className="text-2xl">{getIndustryIcon(industryType)}</div>
        <div className="flex-1 text-left">
          <div className="font-semibold capitalize">{industryType}</div>
          <div className="text-sm text-muted-foreground">
            {availableTiles} tile{availableTiles !== 1 ? 's' : ''} available
          </div>
        </div>
        {isAvailable && (
          <Badge variant="secondary" className="ml-auto">
            Select
          </Badge>
        )}
      </div>
    </Button>
  )
}

export function IndustryTypeSelector({
  industryCard,
  player,
  era,
  onSelectIndustryType,
  onCancel,
}: IndustryTypeSelectorProps) {
  const getAvailableTiles = (industryType: IndustryType) => {
    const tilesOfType = player.industryTilesOnMat[industryType] || []
    return tilesOfType.filter(tile => {
      if (era === 'canal') return tile.canBuildInCanalEra
      if (era === 'rail') return tile.canBuildInRailEra
      return false
    })
  }

  const industryOptions = industryCard.industries.map(industryType => {
    const availableTiles = getAvailableTiles(industryType)
    return {
      industryType,
      availableTiles: availableTiles.length,
      isAvailable: availableTiles.length > 0,
    }
  })

  const hasAvailableOptions = industryOptions.some(option => option.isAvailable)

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Factory className="h-5 w-5" />
          Select Industry Type to Build
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          The selected industry card allows building any of these industries:
        </div>
        
        <div className="space-y-2">
          {industryOptions.map(({ industryType, availableTiles, isAvailable }) => (
            <IndustryTypeOption
              key={industryType}
              industryType={industryType}
              availableTiles={availableTiles}
              isAvailable={isAvailable}
              onClick={() => onSelectIndustryType(industryType)}
            />
          ))}
        </div>

        {!hasAvailableOptions && (
          <div className="text-center p-4 text-muted-foreground">
            No available tiles for any industry type on this card in the {era} era.
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}