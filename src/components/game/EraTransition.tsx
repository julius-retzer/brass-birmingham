import { ArrowRight, Factory, Route, Star, Trash2 } from 'lucide-react'
import { type Player } from '~/store/gameStore'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Separator } from '../ui/separator'

interface EraTransitionProps {
  players: Player[]
  fromEra: 'canal'
  toEra: 'rail'
  onCompleteTransition: () => void
}

interface PlayerScoringInfo {
  player: Player
  linkVictoryPoints: number
  industryVictoryPoints: number
  totalVictoryPoints: number
  removedIndustries: string[]
}

export function EraTransition({
  players,
  fromEra,
  toEra,
  onCompleteTransition,
}: EraTransitionProps) {
  // Calculate scoring for each player
  const playerScoringInfo: PlayerScoringInfo[] = players.map((player) => {
    // Link scoring: Each canal/rail link scores VP based on connected locations
    // Simplified: assume 1 VP per link for this implementation
    const linkVictoryPoints = player.links.length * 1

    // Industry scoring: Only flipped industries score VP
    const industryVictoryPoints = player.industries
      .filter((industry) => industry.flipped)
      .reduce((sum, industry) => sum + industry.tile.victoryPoints, 0)

    // Industries to be removed (level 1 only in Canal Era)
    const removedIndustries = player.industries
      .filter((industry) => industry.level === 1)
      .map((industry) => `${industry.type} at ${industry.location}`)

    return {
      player,
      linkVictoryPoints,
      industryVictoryPoints,
      totalVictoryPoints: linkVictoryPoints + industryVictoryPoints,
      removedIndustries,
    }
  })

  const totalVPAwarded = playerScoringInfo.reduce(
    (sum, info) => sum + info.totalVictoryPoints,
    0,
  )

  return (
    <Card className="border-primary bg-gradient-to-r from-blue-50 to-orange-50">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-3 text-2xl">
          <Badge variant="secondary" className="text-blue-700 bg-blue-100">
            {fromEra.charAt(0).toUpperCase() + fromEra.slice(1)} Era
          </Badge>
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
          <Badge variant="secondary" className="text-orange-700 bg-orange-100">
            {toEra.charAt(0).toUpperCase() + toEra.slice(1)} Era
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center text-muted-foreground">
          <p>
            The {fromEra.charAt(0).toUpperCase() + fromEra.slice(1)} Era has
            ended. Time to score victory points and transition to the{' '}
            {toEra.charAt(0).toUpperCase() + toEra.slice(1)} Era!
          </p>
        </div>

        {/* Scoring Summary */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            End of Era Scoring
          </h3>

          <div className="space-y-3">
            {playerScoringInfo.map((info) => (
              <div
                key={info.player.id}
                className="flex items-center gap-4 p-4 rounded-lg border bg-white"
              >
                {/* Player info */}
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{
                      backgroundColor: info.player.color,
                      borderColor: info.player.color,
                    }}
                  />
                  <span className="font-medium">{info.player.name}</span>
                </div>

                {/* Scoring breakdown */}
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="flex items-center gap-1">
                      <Route className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">
                        +{info.linkVictoryPoints}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">Links</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1">
                      <Factory className="h-4 w-4 text-green-500" />
                      <span className="font-medium">
                        +{info.industryVictoryPoints}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Industries
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="font-semibold text-lg">
                        +{info.totalVictoryPoints}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Total VP
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center justify-center gap-2">
              <Star className="h-5 w-5 text-yellow-600" />
              <span className="font-semibold text-yellow-800">
                Total Victory Points Awarded: {totalVPAwarded}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Era Cleanup */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" />
            Era Cleanup
          </h3>

          {fromEra === 'canal' && (
            <Alert className="mb-4">
              <Factory className="h-4 w-4" />
              <AlertDescription>
                All Level 1 industry tiles are removed from the board. Level 2+
                tiles remain for the Rail Era.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {playerScoringInfo.map((info) => (
              <div key={info.player.id}>
                {info.removedIndustries.length > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                    <div
                      className="w-3 h-3 rounded-full border mt-1"
                      style={{
                        backgroundColor: info.player.color,
                        borderColor: info.player.color,
                      }}
                    />
                    <div>
                      <div className="font-medium text-red-800">
                        {info.player.name}
                      </div>
                      <div className="text-sm text-red-600">
                        Removed: {info.removedIndustries.join(', ')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Transition Actions */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Era Transition</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>• All player links are removed from the board</div>
            <div>• All cards are shuffled to create a new draw deck</div>
            <div>• Each player draws 8 new cards</div>
            <div>• Merchant beer is reset on the board</div>
            <div>• Round counter resets to 1</div>
          </div>
        </div>

        <div className="text-center pt-4">
          <Button onClick={onCompleteTransition} size="lg">
            Begin {toEra.charAt(0).toUpperCase() + toEra.slice(1)} Era
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
