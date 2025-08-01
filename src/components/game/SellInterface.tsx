import React from 'react'
import { Coins, Factory, Gift, TrendingUp, Trophy } from 'lucide-react'
import { type IndustryType } from '~/data/cards'
import { type CityId } from '~/data/board'
import { merchants, type Merchant } from '~/data/merchants'
import { type Player } from '~/store/gameStore'
import { cn } from '~/lib/utils'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'

interface SellInterfaceProps {
  player: Player
  onSelectSale: (industryIds: string[], merchantId: CityId) => void
  onCancel: () => void
}

interface SellableIndustry {
  id: string
  location: CityId
  type: IndustryType
  level: number
  beerRequired: number
  incomeSpaces: number
  victoryPoints: number
  isFlipped: boolean
}

interface SellOption {
  merchant: Merchant
  industries: SellableIndustry[]
  isConnected: boolean
  hasBeer: boolean // Whether merchant has beer available
}

function MerchantBonusDisplay({ bonus }: { bonus: Merchant['bonus'] }) {
  const getBonusIcon = () => {
    switch (bonus.type) {
      case 'money': return <Coins className="h-4 w-4" />
      case 'income': return <TrendingUp className="h-4 w-4" />
      case 'victoryPoints': return <Trophy className="h-4 w-4" />
      case 'develop': return <Factory className="h-4 w-4" />
    }
  }

  const getBonusColor = () => {
    switch (bonus.type) {
      case 'money': return 'text-green-600'
      case 'income': return 'text-blue-600'
      case 'victoryPoints': return 'text-purple-600'
      case 'develop': return 'text-orange-600'
    }
  }

  return (
    <div className={cn('flex items-center gap-2 text-sm', getBonusColor())}>
      {getBonusIcon()}
      <span>{bonus.description}</span>
    </div>
  )
}

function SellableIndustryCard({ 
  industry, 
  isSelected, 
  onToggle,
  disabled 
}: { 
  industry: SellableIndustry
  isSelected: boolean
  onToggle: () => void
  disabled: boolean
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
        'h-auto p-3 justify-start',
        getIndustryColor(industry.type),
        isSelected && 'ring-2 ring-primary',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={!disabled ? onToggle : undefined}
      disabled={disabled}
    >
      <div className="flex items-center gap-3 w-full">
        <div className="text-xl">{getIndustryIcon(industry.type)}</div>
        <div className="flex-1 text-left">
          <div className="font-semibold capitalize flex items-center gap-2">
            {industry.type} L{industry.level}
            <Badge variant="secondary" className="text-xs">
              {industry.location}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4">
            <span>🍺 {industry.beerRequired}</span>
            <span>+{industry.incomeSpaces} income</span>
            <span>{industry.victoryPoints} VP</span>
          </div>
        </div>
      </div>
    </Button>
  )
}

function SellOptionCard({ 
  sellOption, 
  selectedIndustries, 
  onToggleIndustry,
  onConfirmSale 
}: {
  sellOption: SellOption
  selectedIndustries: Set<string>
  onToggleIndustry: (industryId: string) => void
  onConfirmSale: () => void
}) {
  const { merchant, industries, isConnected, hasBeer } = sellOption
  const selectedCount = industries.filter(ind => selectedIndustries.has(ind.id)).length
  const canSell = isConnected && selectedCount > 0

  const totalBeerRequired = industries
    .filter(ind => selectedIndustries.has(ind.id))
    .reduce((sum, ind) => sum + ind.beerRequired, 0)

  return (
    <Card className={cn(
      'transition-all',
      canSell ? 'border-primary' : 'border-muted',
      !isConnected && 'opacity-60'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Factory className="h-5 w-5" />
            {merchant.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isConnected && (
              <Badge variant="destructive" className="text-xs">
                Not Connected
              </Badge>
            )}
            {hasBeer && (
              <Badge variant="secondary" className="text-xs">
                🍺 Available
              </Badge>
            )}
          </div>
        </div>
        <MerchantBonusDisplay bonus={merchant.bonus} />
      </CardHeader>
      <CardContent className="space-y-3">
        {industries.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-4">
            No sellable {merchant.industries.join('/')} industries at connected locations
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {industries.map(industry => (
                <SellableIndustryCard
                  key={industry.id}
                  industry={industry}
                  isSelected={selectedIndustries.has(industry.id)}
                  onToggle={() => onToggleIndustry(industry.id)}
                  disabled={!isConnected}
                />
              ))}
            </div>
            
            {selectedCount > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Selling {selectedCount} industrie{selectedCount > 1 ? 's' : ''}
                    {totalBeerRequired > 0 && ` • Requires ${totalBeerRequired} beer`}
                    {hasBeer && totalBeerRequired > 0 && ' (merchant beer available)'}
                  </div>
                  <Button 
                    onClick={onConfirmSale}
                    disabled={!canSell}
                    className="w-full"
                  >
                    Sell to {merchant.name}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function SellInterface({ 
  player, 
  onSelectSale, 
  onCancel 
}: SellInterfaceProps) {
  // TODO: This is simplified - in a real implementation we would:
  // 1. Check network connections to determine which merchants are reachable
  // 2. Check which industries are actually connected to each merchant
  // 3. Check beer availability at each merchant
  
  // For now, simulate some sellable industries
  const sellableIndustries: SellableIndustry[] = player.industries
    .filter(industry => 
      ['cotton', 'manufacturer', 'pottery'].includes(industry.type) && 
      !industry.flipped
    )
    .map(industry => ({
      id: `${industry.location}-${industry.type}-${industry.level}`,
      location: industry.location,
      type: industry.type,
      level: industry.level,
      beerRequired: industry.tile.beerRequired,
      incomeSpaces: industry.tile.incomeSpaces,
      victoryPoints: industry.tile.victoryPoints,
      isFlipped: industry.flipped
    }))

  // Group industries by merchant (simplified - assuming all merchants are connected)
  const sellOptions: SellOption[] = Object.values(merchants).map(merchant => ({
    merchant,
    industries: sellableIndustries.filter(ind => 
      merchant.industries.includes(ind.type)
    ),
    isConnected: true, // Simplified - should check actual network connections
    hasBeer: Math.random() > 0.5 // Simplified - should check actual merchant beer availability
  }))

  const [selectedIndustries, setSelectedIndustries] = React.useState<Set<string>>(new Set())

  const toggleIndustry = (industryId: string) => {
    const newSelected = new Set(selectedIndustries)
    if (newSelected.has(industryId)) {
      newSelected.delete(industryId)
    } else {
      newSelected.add(industryId)
    }
    setSelectedIndustries(newSelected)
  }

  const handleConfirmSale = (merchantId: CityId) => {
    const selectedIds = Array.from(selectedIndustries)
    onSelectSale(selectedIds, merchantId)
  }

  const totalSellable = sellableIndustries.length

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Sell Industries
          </span>
          <Badge variant="secondary">
            {totalSellable} sellable
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalSellable === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Factory className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No cotton mills, manufacturers, or potteries available to sell</p>
            <p className="text-sm">Build and flip industries to sell them</p>
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Select industries to sell and choose a merchant. You can sell multiple industries in one action.
            </div>
            
            <div className="space-y-4">
              {sellOptions.map(sellOption => (
                <SellOptionCard
                  key={sellOption.merchant.id}
                  sellOption={sellOption}
                  selectedIndustries={selectedIndustries}
                  onToggleIndustry={toggleIndustry}
                  onConfirmSale={() => handleConfirmSale(sellOption.merchant.id)}
                />
              ))}
            </div>
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