import { AlertTriangle, Beer, Route } from 'lucide-react'
import { type CityId } from '~/data/board'
import { type Player, type GameStoreSnapshot } from '~/store/gameStore'
import { getGameCapabilities } from '~/hooks/useGameState'
import { Alert, AlertDescription } from '../ui/alert'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface BuildSecondLinkProps {
  player: Player
  era: 'canal' | 'rail'
  firstLink: {
    from: CityId
    to: CityId
  }
  selectedLink: {
    from: CityId
    to: CityId
  } | null
  onLinkSelect: (from: CityId, to: CityId) => void
  onConfirm: () => void
  onCancel: () => void
  snapshot: GameStoreSnapshot  // Add snapshot to use state.can()
}

export function BuildSecondLink({
  player,
  era,
  firstLink,
  selectedLink,
  onLinkSelect,
  onConfirm,
  onCancel,
  snapshot,
}: BuildSecondLinkProps) {
  const isRailEra = era === 'rail'
  const linkCost = isRailEra ? 5 : 3
  const coalCost = isRailEra ? 1 : 0 // Rail links require 1 coal
  const beerCost = 1 // Building second link requires 1 beer

  const totalCost = linkCost + coalCost // Beer consumption is separate

  // Use state.can() to check if the double network action is allowed
  // This replaces all the local validation logic
  const { canExecuteDoubleNetwork } = getGameCapabilities(snapshot)

  // Keep affordability check for display purposes
  const canAfford = player.money >= totalCost

  // Check if player has beer sources (for display feedback)
  const hasBreweries = player.industries.some(
    (industry) => industry.type === 'brewery',
  )
  const hasBeerAccess = hasBreweries // Simplified for UI feedback

  return (
    <Card className="border-orange-300 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-5 w-5 text-orange-600" />
          Build Second Link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          You can build a second link during your Network action by consuming 1
          beer barrel.
        </div>

        {/* First Link Built */}
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Route className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-800">First Link Built</span>
          </div>
          <div className="text-sm text-green-700">
            {firstLink.from} ↔ {firstLink.to} ({era} link)
          </div>
        </div>

        {/* Second Link Selection */}
        <div>
          <h4 className="font-medium mb-2">Select Second Link Location</h4>
          {selectedLink ? (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-blue-600" />
                <span className="text-blue-800">
                  {selectedLink.from} ↔ {selectedLink.to}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
              Click on the board to select a second link to build
            </div>
          )}
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-2">
          <h4 className="font-medium">Cost Breakdown</h4>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span>Link cost:</span>
              <span>£{linkCost}</span>
            </div>
            {isRailEra && (
              <div className="flex justify-between">
                <span>Coal consumption:</span>
                <span>£{coalCost}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <Beer className="h-3 w-3" />
                Beer consumption:
              </span>
              <span>1 barrel</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>Total money cost:</span>
              <span>£{totalCost}</span>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {!canAfford && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Insufficient money. You need £{totalCost} but only have £
              {player.money}.
            </AlertDescription>
          </Alert>
        )}

        {!hasBeerAccess && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No beer access. You need a brewery or connection to merchant beer
              to build a second link.
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={onConfirm}
            disabled={!canExecuteDoubleNetwork}
            className="flex-1"
          >
            Build Second Link
          </Button>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        </div>

        {/* Help Text */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Second link must be adjacent to your network</div>
          <div>• Cannot build on connections that already have links</div>
          <div>• Beer is consumed from your breweries or merchant beer</div>
        </div>
      </CardContent>
    </Card>
  )
}
