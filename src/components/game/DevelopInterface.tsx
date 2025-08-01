import React from 'react'
import { Coins, Factory, Trash2, Zap } from 'lucide-react'
import { type IndustryType } from '~/data/cards'
import { type IndustryTile } from '~/data/industryTiles'
import { type Player } from '~/store/gameStore'
import { cn } from '~/lib/utils'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'

interface DevelopInterfaceProps {
  player: Player
  onSelectDevelopment: (industryTypes: IndustryType[]) => void
  onCancel: () => void
}

interface DevelopableIndustry {
  type: IndustryType
  lowestTile: IndustryTile
  canDevelop: boolean
  reason?: string
}

function DevelopableIndustryCard({ 
  industry, 
  isSelected, 
  onToggle 
}: { 
  industry: DevelopableIndustry
  isSelected: boolean
  onToggle: () => void
}) {
  const getIndustryColor = (type: IndustryType) => {
    const colors = {
      cotton: 'bg-pink-100 border-pink-300',
      coal: 'bg-gray-100 border-gray-400',
      iron: 'bg-orange-100 border-orange-300',
      manufacturer: 'bg-blue-100 border-blue-300',
      pottery: 'bg-yellow-100 border-yellow-300',
      brewery: 'bg-green-100 border-green-300',
    }
    return colors[type] || 'bg-gray-100'
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
        getIndustryColor(industry.type),
        isSelected && 'ring-2 ring-primary',
        !industry.canDevelop && 'opacity-50 cursor-not-allowed'
      )}
      onClick={industry.canDevelop ? onToggle : undefined}
      disabled={!industry.canDevelop}
    >
      <div className="flex items-center gap-3 w-full">
        <div className="text-2xl">{getIndustryIcon(industry.type)}</div>
        <div className="flex-1 text-left">
          <div className="font-semibold capitalize flex items-center gap-2">
            {industry.type}
            <Badge variant="secondary" className="text-xs">
              L{industry.lowestTile.level}
            </Badge>
            {industry.lowestTile.hasLightbulbIcon && (
              <Zap className="h-3 w-3 text-yellow-500" />
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Coins className="h-3 w-3" />
              £{industry.lowestTile.cost}
            </span>
            <span>{industry.lowestTile.victoryPoints} VP</span>
          </div>
          {!industry.canDevelop && industry.reason && (
            <div className="text-xs text-red-600 mt-1">
              {industry.reason}
            </div>
          )}
        </div>
        {isSelected && (
          <div className="text-primary">
            <Trash2 className="h-4 w-4" />
          </div>
        )}
      </div>
    </Button>
  )
}

export function DevelopInterface({ 
  player, 
  onSelectDevelopment, 
  onCancel 
}: DevelopInterfaceProps) {
  const [selectedIndustries, setSelectedIndustries] = React.useState<Set<IndustryType>>(new Set())

  // Get developable industries
  const developableIndustries: DevelopableIndustry[] = Object.entries(player.industryTilesOnMat)
    .map(([type, tiles]) => {
      const industryType = type as IndustryType
      if (!tiles || tiles.length === 0) {
        return null
      }

      // Find the lowest level tile (first tile is always the lowest)
      const lowestTile = tiles[0]
      
      // Check if this industry can be developed
      let canDevelop = true
      let reason = ''
      
      // Pottery tiles with lightbulb icon cannot be developed
      if (industryType === 'pottery' && lowestTile.hasLightbulbIcon) {
        canDevelop = false
        reason = 'Pottery with lightbulb icon cannot be developed'
      }

      return {
        type: industryType,
        lowestTile,
        canDevelop,
        reason
      }
    })
    .filter((industry): industry is DevelopableIndustry => industry !== null)

  const availableIndustries = developableIndustries.filter(ind => ind.canDevelop)
  const selectedCount = selectedIndustries.size
  const maxSelectable = 2 // Can develop up to 2 industries per action

  const toggleIndustry = (industryType: IndustryType) => {
    const newSelected = new Set(selectedIndustries)
    if (newSelected.has(industryType)) {
      newSelected.delete(industryType)
    } else if (newSelected.size < maxSelectable) {
      newSelected.add(industryType)
    }
    setSelectedIndustries(newSelected)
  }

  const handleConfirm = () => {
    if (selectedCount > 0) {
      onSelectDevelopment(Array.from(selectedIndustries))
    }
  }

  const totalIronCost = selectedCount * 1 // 1 iron per industry developed
  const totalIronMarketCost = selectedCount * 6 // £6 per iron if buying from market when empty

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Develop Industries
          </span>
          <Badge variant="secondary">
            {selectedCount}/{maxSelectable} selected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableIndustries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Factory className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No industries available to develop</p>
            <p className="text-sm">All pottery tiles with lightbulb icons must be built first</p>
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Remove industry tiles from your player mat to access higher-level tiles. 
              You can develop 1-2 industries per action. Each requires 1 iron.
            </div>
            
            <div className="space-y-2">
              {developableIndustries.map(industry => (
                <DevelopableIndustryCard
                  key={industry.type}
                  industry={industry}
                  isSelected={selectedIndustries.has(industry.type)}
                  onToggle={() => toggleIndustry(industry.type)}
                />
              ))}
            </div>

            {selectedCount > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="font-medium">Development Cost:</div>
                    <div className="text-muted-foreground">
                      • {totalIronCost} iron (from iron works or market)
                      • Up to £{totalIronMarketCost} if buying from empty market
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleConfirm}
                      disabled={selectedCount === 0}
                      className="flex-1"
                    >
                      Develop {selectedCount} Industr{selectedCount === 1 ? 'y' : 'ies'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <Separator />
        <Button variant="outline" onClick={onCancel} className="w-full">
          Cancel
        </Button>
      </CardContent>
    </Card>
  )
}