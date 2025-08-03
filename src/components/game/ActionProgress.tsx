import { Check, ChevronRight, Circle, HelpCircle } from 'lucide-react'
import {
  type Card,
  type IndustryCard,
  type IndustryType,
  type LocationCard,
} from '~/data/cards'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { CardContent, CardHeader, CardTitle, Card as UICard } from '../ui/card'

interface ActionStep {
  id: string
  label: string
  description: string
  completed: boolean
  current: boolean
  required: boolean
  helpText?: string
}

interface ActionProgressProps {
  actionType: string | null
  subState: string | null
  selectedCard: Card | null
  selectedLocation: string | null
  selectedIndustryTile: { type: IndustryType; level: number } | null
  era: 'canal' | 'rail'
  playerMoney: number
  canAfford?: boolean
}

export function ActionProgress({
  actionType,
  subState,
  selectedCard,
  selectedLocation,
  selectedIndustryTile,
  era,
  playerMoney,
  canAfford = true,
}: ActionProgressProps) {
  if (!actionType || !subState) return null

  // Get theme colors for different action types
  const getActionColors = (action: string) => {
    const colors = {
      building: {
        cardBg: 'bg-orange-50',
        cardBorder: 'border-orange-200',
        iconColor: 'text-orange-600',
        alertBg: 'bg-orange-50',
        alertBorder: 'border-orange-200',
        stepCurrentBg: 'bg-orange-500',
        stepCurrentBorder: 'border-orange-500',
        stepCurrentText: 'text-orange-700',
      },
      developing: {
        cardBg: 'bg-purple-50',
        cardBorder: 'border-purple-200',
        iconColor: 'text-purple-600',
        alertBg: 'bg-purple-50',
        alertBorder: 'border-purple-200',
        stepCurrentBg: 'bg-purple-500',
        stepCurrentBorder: 'border-purple-500',
        stepCurrentText: 'text-purple-700',
      },
      selling: {
        cardBg: 'bg-green-50',
        cardBorder: 'border-green-200',
        iconColor: 'text-green-600',
        alertBg: 'bg-green-50',
        alertBorder: 'border-green-200',
        stepCurrentBg: 'bg-green-500',
        stepCurrentBorder: 'border-green-500',
        stepCurrentText: 'text-green-700',
      },
      networking: {
        cardBg: 'bg-blue-50',
        cardBorder: 'border-blue-200',
        iconColor: 'text-blue-600',
        alertBg: 'bg-blue-50',
        alertBorder: 'border-blue-200',
        stepCurrentBg: 'bg-blue-500',
        stepCurrentBorder: 'border-blue-500',
        stepCurrentText: 'text-blue-700',
      },
      scouting: {
        cardBg: 'bg-yellow-50',
        cardBorder: 'border-yellow-200',
        iconColor: 'text-yellow-600',
        alertBg: 'bg-yellow-50',
        alertBorder: 'border-yellow-200',
        stepCurrentBg: 'bg-yellow-500',
        stepCurrentBorder: 'border-yellow-500',
        stepCurrentText: 'text-yellow-700',
      },
      takingLoan: {
        cardBg: 'bg-red-50',
        cardBorder: 'border-red-200',
        iconColor: 'text-red-600',
        alertBg: 'bg-red-50',
        alertBorder: 'border-red-200',
        stepCurrentBg: 'bg-red-500',
        stepCurrentBorder: 'border-red-500',
        stepCurrentText: 'text-red-700',
      },
    }
    return colors[action as keyof typeof colors] || colors.building
  }

  const actionColors = getActionColors(actionType)

  const getActionSteps = (): ActionStep[] => {
    switch (actionType) {
      case 'building':
        return [
          {
            id: 'card',
            label: 'Select Card',
            description: 'Choose a location or industry card',
            completed: !!selectedCard,
            current: subState === 'selectingCard',
            required: true,
            helpText: selectedCard
              ? `Selected: ${selectedCard.type === 'industry' ? 'Industry' : 'Location'} card`
              : 'Click a card from your hand to build with',
          },
          {
            id: 'type',
            label: 'Choose Industry',
            description: 'Select which industry type to build',
            completed:
              !!selectedIndustryTile || selectedCard?.type === 'location',
            current: subState === 'selectingIndustryType',
            required:
              selectedCard?.type === 'industry' ||
              selectedCard?.type === 'wild_industry',
            helpText: selectedIndustryTile
              ? `Building: ${selectedIndustryTile.type} Level ${selectedIndustryTile.level}`
              : selectedCard?.type === 'industry'
                ? `Choose which industry from: ${(selectedCard as IndustryCard).industries.join(', ')}`
                : 'Location cards skip this step',
          },
          {
            id: 'location',
            label: 'Select Location',
            description: 'Choose where to build on the board',
            completed: !!selectedLocation,
            current: subState === 'selectingLocation',
            required: true,
            helpText: selectedLocation
              ? `Building at: ${selectedLocation}`
              : selectedCard?.type === 'location'
                ? `Must build at: ${(selectedCard as LocationCard).location}`
                : 'Click a city on the board',
          },
          {
            id: 'confirm',
            label: 'Confirm Build',
            description: 'Review and confirm your build action',
            completed: false,
            current: subState === 'confirmingBuild',
            required: true,
            helpText: canAfford
              ? 'Click Confirm to complete the build'
              : `Insufficient funds! Need £${selectedIndustryTile?.level || 'X'} but have £${playerMoney}`,
          },
        ]

      case 'networking':
        return [
          {
            id: 'card',
            label: 'Select Card',
            description: 'Choose a card to discard for networking',
            completed: !!selectedCard,
            current: subState === 'selectingCard',
            required: true,
            helpText: selectedCard
              ? `Discarding: ${selectedCard.id}`
              : 'Any card can be used for networking',
          },
          {
            id: 'link',
            label: 'Choose Link',
            description: `Build a ${era} connection`,
            completed: false,
            current: subState === 'selectingLink',
            required: true,
            helpText:
              era === 'rail'
                ? 'Rail links cost £5 + 1 coal cube'
                : 'Canal links cost £3',
          },
          {
            id: 'confirm',
            label: 'Confirm Link',
            description: 'Review and confirm your network action',
            completed: false,
            current: subState === 'confirmingLink',
            required: true,
            helpText: 'Click Confirm to build the link',
          },
        ]

      case 'developing':
        return [
          {
            id: 'card',
            label: 'Select Card',
            description: 'Choose an industry card to develop',
            completed: !!selectedCard,
            current: subState === 'selectingCard',
            required: true,
            helpText: selectedCard
              ? `Developing with: ${selectedCard.id}`
              : 'Industry cards let you remove tiles from your mat',
          },
          {
            id: 'confirm',
            label: 'Confirm Develop',
            description: 'Remove tiles and consume iron',
            completed: false,
            current: subState === 'confirmingDevelop',
            required: true,
            helpText: 'Removes 1 tile per industry type, costs 1 iron each',
          },
        ]

      case 'selling':
        return [
          {
            id: 'card',
            label: 'Select Card',
            description: 'Choose a card to sell goods',
            completed: !!selectedCard,
            current: subState === 'selectingCard',
            required: true,
            helpText: selectedCard
              ? `Selling with: ${selectedCard.id}`
              : 'Any card can be used to sell goods',
          },
          {
            id: 'confirm',
            label: 'Confirm Sale',
            description: 'Flip industries and consume beer',
            completed: false,
            current: subState === 'confirmingSell',
            required: true,
            helpText:
              'Flips cotton/manufacturer/pottery tiles, requires 1 beer',
          },
        ]

      case 'scouting':
        return [
          {
            id: 'cards',
            label: 'Select 3 Cards',
            description: 'Choose 3 cards to discard',
            completed: false, // This would need the count from context
            current: subState === 'selectingCards',
            required: true,
            helpText:
              'Discard 3 cards to gain 1 wild location + 1 wild industry',
          },
        ]

      case 'takingLoan':
        return [
          {
            id: 'card',
            label: 'Select Card',
            description: 'Choose a card to discard for loan',
            completed: !!selectedCard,
            current: subState === 'selectingCard',
            required: true,
            helpText: selectedCard
              ? `Discarding: ${selectedCard.id}`
              : 'Any card can be discarded for a £30 loan',
          },
          {
            id: 'confirm',
            label: 'Confirm Loan',
            description: 'Take £30 and reduce income by 3',
            completed: false,
            current: subState === 'confirmingLoan',
            required: true,
            helpText: 'Gain £30 but lose £3 income per round',
          },
        ]

      default:
        return []
    }
  }

  const steps = getActionSteps()
  const currentStepIndex = steps.findIndex((step) => step.current)
  const currentStep = steps[currentStepIndex]

  if (steps.length === 0) return null

  return (
    <UICard className={`${actionColors.cardBorder} ${actionColors.cardBg}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Circle className={`h-5 w-5 ${actionColors.iconColor}`} />
          {actionType.charAt(0).toUpperCase() + actionType.slice(1)} Action
          <Badge variant="outline" className="ml-auto">
            Step {currentStepIndex + 1} of {steps.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Steps */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-2 min-w-0">
              {/* Step Circle */}
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 flex-shrink-0 ${
                  step.completed
                    ? 'bg-green-500 border-green-500 text-white'
                    : step.current
                      ? `${actionColors.stepCurrentBg} ${actionColors.stepCurrentBorder} text-white`
                      : step.required
                        ? 'bg-white border-gray-300 text-gray-400'
                        : 'bg-gray-100 border-gray-200 text-gray-300'
                }`}
              >
                {step.completed ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>

              {/* Step Label */}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-medium truncate ${
                    step.completed
                      ? 'text-green-700'
                      : step.current
                        ? actionColors.stepCurrentText
                        : step.required
                          ? 'text-gray-700'
                          : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </div>
              </div>

              {/* Arrow */}
              {index < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Current Step Help */}
        {currentStep && (
          <Alert
            className={`${actionColors.alertBorder} ${actionColors.alertBg}`}
          >
            <HelpCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <div className="font-medium">{currentStep.description}</div>
                {currentStep.helpText && (
                  <div className="text-sm text-muted-foreground">
                    {currentStep.helpText}
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Next Steps Preview */}
        {currentStepIndex < steps.length - 1 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Next: </span>
            {steps[currentStepIndex + 1]?.label} -{' '}
            {steps[currentStepIndex + 1]?.description}
          </div>
        )}
      </CardContent>
    </UICard>
  )
}
