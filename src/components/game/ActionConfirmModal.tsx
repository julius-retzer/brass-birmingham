import { Beer, CircleDot, Coins, Factory, MapPin, Trophy } from 'lucide-react'
import { type CityId } from '../../data/board'
import {
  type Card,
  type IndustryCard,
  type LocationCard,
  type WildIndustryCard,
} from '../../data/cards'
import { type IndustryTile } from '../../data/industryTiles'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Separator } from '../ui/separator'

interface ActionConfirmModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  action:
    | 'building'
    | 'developing'
    | 'selling'
    | 'networking'
    | 'scouting'
    | 'takingLoan'
  selectedCard?: Card | null
  selectedLocation?: CityId | null
  selectedIndustryTile?: IndustryTile | null
  playerMoney?: number
  era?: 'canal' | 'rail'
}

export function ActionConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  action,
  selectedCard,
  selectedLocation,
  selectedIndustryTile,
  playerMoney = 0,
  era = 'canal',
}: ActionConfirmModalProps) {
  const getActionTitle = () => {
    switch (action) {
      case 'building':
        return 'Confirm Build Action'
      case 'developing':
        return 'Confirm Develop Action'
      case 'selling':
        return 'Confirm Sell Action'
      case 'networking':
        return 'Confirm Network Action'
      case 'scouting':
        return 'Confirm Scout Action'
      case 'takingLoan':
        return 'Confirm Loan Action'
      default:
        return 'Confirm Action'
    }
  }

  const getActionDescription = () => {
    switch (action) {
      case 'building':
        if (selectedCard?.type === 'location') {
          const locationCard = selectedCard as LocationCard
          return `Build at ${locationCard.location} (${selectedLocation})`
        } else if (selectedCard?.type === 'industry' && selectedIndustryTile) {
          return `Build ${selectedIndustryTile.type} Level ${selectedIndustryTile.level} at ${selectedLocation}`
        }
        return 'Build action'
      case 'developing':
        return `Develop ${(selectedCard as IndustryCard)?.industries?.[0] || 'industry'}`
      case 'selling':
        return `Sell ${(selectedCard as IndustryCard)?.industries?.[0] || 'goods'}`
      case 'networking':
        return `Build ${era} connection`
      case 'scouting':
        return 'Scout for wild cards'
      case 'takingLoan':
        return 'Take loan (£30, -3 income)'
      default:
        return 'Perform action'
    }
  }

  const getCost = () => {
    if (action === 'building' && selectedIndustryTile) {
      return selectedIndustryTile.cost
    } else if (action === 'networking') {
      return era === 'canal' ? 3 : 5
    }
    return 0
  }

  const getResourceRequirements = () => {
    if (action === 'building' && selectedIndustryTile) {
      const requirements = []
      if (selectedIndustryTile.coalRequired > 0) {
        requirements.push(`${selectedIndustryTile.coalRequired} Coal`)
      }
      if (selectedIndustryTile.ironRequired > 0) {
        requirements.push(`${selectedIndustryTile.ironRequired} Iron`)
      }
      if (selectedIndustryTile.beerRequired > 0) {
        requirements.push(`${selectedIndustryTile.beerRequired} Beer`)
      }
      return requirements
    } else if (action === 'networking' && era === 'rail') {
      return ['1 Coal']
    }
    return []
  }

  const cost = getCost()
  const resourceRequirements = getResourceRequirements()
  const canAfford = playerMoney >= cost

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            {getActionTitle()}
          </DialogTitle>
          <DialogDescription>
            Review the details and confirm your action.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Action Summary */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Action Summary
            </h4>
            <p className="text-sm text-muted-foreground">
              {getActionDescription()}
            </p>
          </div>

          {/* Selected Card */}
          {selectedCard && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Using Card:</h4>
              <div className="p-3 border rounded-lg bg-card">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {selectedCard.type === 'location'
                      ? (selectedCard as LocationCard).location
                      : selectedCard.type === 'industry'
                        ? (selectedCard as IndustryCard).industries?.join(', ')
                        : selectedCard.type}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {selectedCard.type}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Industry Tile Details */}
          {selectedIndustryTile && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Industry Tile:</h4>
              <div className="p-3 border rounded-lg bg-card">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">
                      {selectedIndustryTile.type} Level{' '}
                      {selectedIndustryTile.level}
                    </span>
                    <div className="flex items-center gap-1 text-sm">
                      <Trophy className="h-3 w-3" />
                      <span>{selectedIndustryTile.victoryPoints}VP</span>
                    </div>
                  </div>

                  {/* Production */}
                  {(selectedIndustryTile.coalProduced > 0 ||
                    selectedIndustryTile.ironProduced > 0 ||
                    selectedIndustryTile.beerProduced > 0) && (
                    <div className="text-xs text-green-600">
                      Produces:{' '}
                      {[
                        selectedIndustryTile.coalProduced > 0 &&
                          `${selectedIndustryTile.coalProduced} Coal`,
                        selectedIndustryTile.ironProduced > 0 &&
                          `${selectedIndustryTile.ironProduced} Iron`,
                        selectedIndustryTile.beerProduced > 0 &&
                          `${selectedIndustryTile.beerProduced} Beer`,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Cost and Requirements */}
          <div className="space-y-3">
            {cost > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  Cost:
                </span>
                <span
                  className={`font-medium ${!canAfford ? 'text-destructive' : ''}`}
                >
                  £{cost}
                </span>
              </div>
            )}

            {resourceRequirements.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium flex items-center gap-2">
                  <CircleDot className="h-4 w-4" />
                  Resources Required:
                </span>
                <div className="flex flex-wrap gap-2">
                  {resourceRequirements.map((requirement, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {requirement}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {!canAfford && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">
                  ⚠️ Insufficient funds! You need £{cost} but only have £
                  {playerMoney}.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canAfford}
            className="min-w-[100px]"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
