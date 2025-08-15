'use client'

import React from 'react'
import { type GameStoreSnapshot, type GameStoreSend } from '~/store/gameStore'
import { type Card, type IndustryType } from '~/data/cards'
import { type CityId } from '~/data/board'
import { ImprovedActionSelector } from './ImprovedActionSelector'
import { ImprovedActionWizard, useActionWizard, type ActionWizardStep } from './ImprovedActionWizard'
import { ImprovedCardSelector } from './ImprovedCardSelector'
import { ImprovedResourceDashboard } from './ImprovedResourceDashboard'
import { IndustryTypeSelector } from './IndustryTypeSelector'
import { DevelopInterface } from './DevelopInterface'
import { useGameKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { Button } from '../ui/button'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'

interface ImprovedGameInterfaceProps {
  snapshot: GameStoreSnapshot
  send: GameStoreSend
  onCitySelect: (cityId: CityId) => void
  onIndustryTypeSelect: (industryType: IndustryType) => void
}

type WizardActionType = 'build' | 'develop' | 'sell' | 'network' | 'scout' | 'loan'

interface ActionWizardState {
  isOpen: boolean
  actionType: WizardActionType | null
  data: {
    selectedCard?: Card | null
    selectedCards?: Card[]
    selectedIndustryType?: IndustryType | null
    selectedIndustries?: IndustryType[]
    selectedLocation?: string | null
    confirmed?: boolean
  }
}

export function ImprovedGameInterface({
  snapshot,
  send,
  onCitySelect,
  onIndustryTypeSelect
}: ImprovedGameInterfaceProps) {
  const [wizardState, setWizardState] = React.useState<ActionWizardState>({
    isOpen: false,
    actionType: null,
    data: {}
  })

  const currentPlayer = snapshot.context.players[snapshot.context.currentPlayerIndex]
  const isActionSelection = snapshot.matches({ playing: 'action' })
  
  console.log('Current game state:', snapshot.value)
  console.log('Is action selection?', isActionSelection)
  console.log('Wizard state:', wizardState)

  // Handle action selection from the improved selector
  const handleActionSelect = (actionType: string) => {
    const action = actionType.toUpperCase()
    
    // For simple actions that don't need wizards, execute directly
    if (actionType === 'pass') {
      send({ type: 'PASS' })
      return
    }

    // For complex actions, start the action in the state machine first
    console.log(`Starting ${action} action`)
    send({ type: action as any })

    // Then open the wizard
    setWizardState({
      isOpen: true,
      actionType: actionType as WizardActionType,
      data: {}
    })
  }

  const closeWizard = () => {
    console.log('Closing wizard and resetting state')
    setWizardState({
      isOpen: false,
      actionType: null,
      data: {}
    })
    // Reset wizard hook state
    reset()
    // Cancel any ongoing action in the game store if still in progress
    if (!isActionSelection) {
      console.log('Sending CANCEL to game store')
      send({ type: 'CANCEL' })
    }
  }

  const updateWizardData = (updates: Partial<ActionWizardState['data']>) => {
    console.log('Updating wizard data:', updates)
    setWizardState(prev => {
      const newState = {
        ...prev,
        data: { ...prev.data, ...updates }
      }
      console.log('New wizard state:', newState)
      return newState
    })
  }

  // Build wizard steps
  const buildSteps: ActionWizardStep[] = React.useMemo(() => {
    if (!wizardState.actionType || wizardState.actionType !== 'build') return []

    console.log('Building steps, wizard data:', wizardState.data)
    const steps: ActionWizardStep[] = [
      {
        id: 'select-card',
        title: 'Select Card',
        description: 'Choose a location or industry card to build',
        component: (
          <ImprovedCardSelector
            cards={currentPlayer?.hand || []}
            selectedCard={wizardState.data.selectedCard}
            onCardSelect={(card) => {
              console.log('Card selected in build wizard:', card)
              updateWizardData({ selectedCard: card })
              send({ type: 'SELECT_CARD', cardId: card.id })
            }}
            actionType="build"
          />
        ),
        canProceed: !!wizardState.data.selectedCard,
        validationMessage: !wizardState.data.selectedCard ? 'Please select a card to continue' : undefined
      }
    ]

    // Add industry type selection step if needed
    if (wizardState.data.selectedCard?.type === 'industry' || 
        wizardState.data.selectedCard?.type === 'location' ||
        wizardState.data.selectedCard?.type === 'wild_location') {
      steps.push({
        id: 'select-industry-type',
        title: 'Select Industry',
        description: 'Choose which industry type to build',
        component: (
          <IndustryTypeSelector
            industryCard={wizardState.data.selectedCard?.type === 'industry' ? wizardState.data.selectedCard : undefined}
            locationCard={wizardState.data.selectedCard?.type === 'location' || wizardState.data.selectedCard?.type === 'wild_location' ? wizardState.data.selectedCard : undefined}
            player={currentPlayer!}
            gameState={snapshot.context}
            era={snapshot.context.era}
            onSelectIndustryType={(industryType) => {
              updateWizardData({ selectedIndustryType: industryType })
              onIndustryTypeSelect(industryType)
            }}
            onCancel={closeWizard}
          />
        ),
        canProceed: !!wizardState.data.selectedIndustryType,
        validationMessage: !wizardState.data.selectedIndustryType ? 'Please select an industry type' : undefined
      })
    }

    // Add location selection step only for industry cards and wild cards (not location cards)
    if (wizardState.data.selectedCard?.type === 'industry' || 
        wizardState.data.selectedCard?.type === 'wild_location' ||
        wizardState.data.selectedCard?.type === 'wild_industry') {
      steps.push({
        id: 'select-location',
        title: 'Select Location',
        description: 'Choose where to build your industry',
        component: (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Click on the board to select a location for your {wizardState.data.selectedIndustryType || 'industry'}.
                Valid locations will be highlighted.
              </AlertDescription>
            </Alert>
            <div className="text-sm text-muted-foreground">
              Selected location: {wizardState.data.selectedLocation ? (
                <Badge variant="secondary">{wizardState.data.selectedLocation}</Badge>
              ) : (
                <span className="text-red-600">None selected</span>
              )}
            </div>
          </div>
        ),
        canProceed: !!wizardState.data.selectedLocation,
        validationMessage: !wizardState.data.selectedLocation ? 'Please select a location on the board' : undefined
      })
    }

    // Add confirmation step
    steps.push({
      id: 'confirm',
      title: 'Confirm Build',
      description: 'Review and confirm your build action',
      component: (
        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Build Summary</h4>
            <div className="space-y-2 text-sm">
              <div>Card: {wizardState.data.selectedCard?.type.replace('_', ' ')}</div>
              {wizardState.data.selectedIndustryType && (
                <div>Industry: {wizardState.data.selectedIndustryType}</div>
              )}
              {wizardState.data.selectedLocation && (
                <div>Location: {wizardState.data.selectedLocation}</div>
              )}
              {wizardState.data.selectedCard?.type === 'location' && (
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Using location card - building at {wizardState.data.selectedCard.location}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      canProceed: true
    })

    return steps
  }, [wizardState, currentPlayer, snapshot.context, send, onIndustryTypeSelect])

  // Develop wizard steps
  const developSteps: ActionWizardStep[] = React.useMemo(() => {
    if (!wizardState.actionType || wizardState.actionType !== 'develop') return []

    return [
      {
        id: 'select-card',
        title: 'Select Card',
        description: 'Choose an industry card to develop',
        component: (
          <ImprovedCardSelector
            cards={currentPlayer?.hand || []}
            selectedCard={wizardState.data.selectedCard}
            onCardSelect={(card) => {
              updateWizardData({ selectedCard: card })
              send({ type: 'SELECT_CARD', cardId: card.id })
            }}
            actionType="develop"
          />
        ),
        canProceed: !!wizardState.data.selectedCard,
        validationMessage: !wizardState.data.selectedCard ? 'Please select a card to discard' : undefined
      },
      {
        id: 'select-industries',
        title: 'Select Industries',
        description: 'Choose which industries to develop (up to 2)',
        component: (
          <div className="space-y-4">
            <DevelopInterface
              player={currentPlayer!}
              onSelectDevelopment={(industryTypes) => {
                console.log('Selected industries for development:', industryTypes)
                updateWizardData({ selectedIndustries: industryTypes })
                // Send the selection to the game store
                send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes })
              }}
              onCancel={closeWizard}
            />
          </div>
        ),
        canProceed: !!(wizardState.data.selectedIndustries && wizardState.data.selectedIndustries.length > 0),
        validationMessage: !(wizardState.data.selectedIndustries && wizardState.data.selectedIndustries.length > 0) ? 'Please select at least one industry to develop' : undefined
      },
      {
        id: 'confirm',
        title: 'Confirm Development',
        description: 'Review and confirm your development action',
        component: (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Development Summary</h4>
              <div className="space-y-2 text-sm">
                <div>Card: {wizardState.data.selectedCard?.type.replace('_', ' ')}</div>
                {wizardState.data.selectedIndustries && wizardState.data.selectedIndustries.length > 0 && (
                  <div>
                    <div className="font-medium">Industries to develop:</div>
                    <ul className="list-disc list-inside ml-2">
                      {wizardState.data.selectedIndustries.map((industry, index) => (
                        <li key={index}>{industry}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
                  <p className="text-xs text-orange-700 dark:text-orange-300">
                    Cost: {wizardState.data.selectedIndustries?.length || 0} iron
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
        canProceed: true
      }
    ]
  }, [wizardState, currentPlayer, send])

  // Scout wizard steps
  const scoutSteps: ActionWizardStep[] = React.useMemo(() => {
    if (!wizardState.actionType || wizardState.actionType !== 'scout') return []

    return [
      {
        id: 'select-cards',
        title: 'Select Cards',
        description: 'Choose 3 cards to discard for scouting',
        component: (
          <ImprovedCardSelector
            cards={currentPlayer?.hand || []}
            selectedCards={wizardState.data.selectedCards || []}
            onCardSelect={(card) => {}} // Required prop, but not used for multi-select
            onCardToggle={(card) => {
              const currentCards = wizardState.data.selectedCards || []
              const isSelected = currentCards.some(c => c.id === card.id)
              
              if (isSelected) {
                updateWizardData({ 
                  selectedCards: currentCards.filter(c => c.id !== card.id)
                })
              } else if (currentCards.length < 3) {
                updateWizardData({ 
                  selectedCards: [...currentCards, card]
                })
              }
            }}
            actionType="scout"
            maxSelections={3}
          />
        ),
        canProceed: (wizardState.data.selectedCards?.length || 0) === 3,
        validationMessage: (wizardState.data.selectedCards?.length || 0) !== 3 ? 'Please select exactly 3 cards' : undefined
      }
    ]
  }, [wizardState, currentPlayer])

  // Get current steps based on action type
  const getCurrentSteps = (): ActionWizardStep[] => {
    switch (wizardState.actionType) {
      case 'build':
        return buildSteps
      case 'develop':
        return developSteps
      case 'scout':
        return scoutSteps
      case 'sell':
      case 'network':
      case 'loan':
        return [
          {
            id: 'select-card',
            title: 'Select Card',
            description: 'Choose a card to discard',
            component: (
              <ImprovedCardSelector
                cards={currentPlayer?.hand || []}
                selectedCard={wizardState.data.selectedCard}
                onCardSelect={(card) => {
                  updateWizardData({ selectedCard: card })
                  send({ type: 'SELECT_CARD', cardId: card.id })
                }}
                actionType={wizardState.actionType}
              />
            ),
            canProceed: !!wizardState.data.selectedCard,
            validationMessage: !wizardState.data.selectedCard ? 'Please select a card' : undefined
          }
        ]
      default:
        return []
    }
  }

  const steps = getCurrentSteps()
  const { currentStepIndex, canGoNext, canGoPrevious, canComplete, goNext, goPrevious, reset } = useActionWizard(steps)

  const handleWizardComplete = () => {
    console.log('Completing wizard with data:', wizardState.data)
    
    // Execute the final action based on type and collected data
    switch (wizardState.actionType) {
      case 'develop':
        // For develop, the industries should already be selected via SELECT_TILES_FOR_DEVELOP
        // Just send the final CONFIRM to complete the action
        console.log('Sending final CONFIRM for develop')
        send({ type: 'CONFIRM' })
        break
        
      default:
        // For other actions, just send the final CONFIRM
        console.log('Sending final CONFIRM')
        send({ type: 'CONFIRM' })
        break
    }
    
    // Close wizard immediately after confirming
    closeWizard()
  }

  // Initialize keyboard shortcuts
  useGameKeyboardShortcuts(
    (actionType: string) => handleActionSelect(actionType),
    () => {}, // Toggle UI handled in parent
    { can: snapshot.can, send }
  )

  // Auto-set location for location cards
  React.useEffect(() => {
    if (wizardState.data.selectedCard?.type === 'location') {
      const locationCard = wizardState.data.selectedCard as any
      if (locationCard?.location && !wizardState.data.selectedLocation) {
        updateWizardData({ selectedLocation: locationCard.location })
      }
    }
  }, [wizardState.data.selectedCard])

  // TODO: Re-implement auto-close when action completes successfully
  // For now, wizard closes manually when user confirms or cancels

  // Update wizard data when game state changes
  React.useEffect(() => {
    if (snapshot.context.selectedLocation) {
      updateWizardData({ selectedLocation: snapshot.context.selectedLocation })
    }
  }, [snapshot.context.selectedLocation])

  // Show action selector when in action selection mode
  if (isActionSelection && !wizardState.isOpen) {
    return (
      <div className="space-y-4">
        <ImprovedActionSelector
          snapshot={snapshot}
          onActionSelect={handleActionSelect}
          showRecommendations={true}
          showCosts={true}
          showRequirements={true}
        />
        <ImprovedResourceDashboard
          snapshot={snapshot}
          currentPlayer={currentPlayer!}
        />
      </div>
    )
  }

  // Show wizard when action is selected
  if (wizardState.isOpen && wizardState.actionType && steps.length > 0) {
    return (
      <ImprovedActionWizard
        isOpen={wizardState.isOpen}
        onClose={closeWizard}
        actionType={wizardState.actionType}
        steps={steps}
        currentStepIndex={currentStepIndex}
        onNext={goNext}
        onPrevious={goPrevious}
        onComplete={handleWizardComplete}
        canComplete={canComplete()}
      />
    )
  }

  // Fallback: show nothing or loading state
  return null
}