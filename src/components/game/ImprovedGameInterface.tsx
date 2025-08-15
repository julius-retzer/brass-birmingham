'use client'

import React from 'react'
import { type GameStoreSnapshot, type GameStoreSend } from '~/store/gameStore'
import { type Card, type IndustryType } from '~/data/cards'
import { type CityId } from '~/data/board'
import { ImprovedActionSelector } from './ImprovedActionSelector'
import { ImprovedActionWizard, useActionWizard, type ActionWizardStep } from './ImprovedActionWizard'
import { ImprovedCardSelector } from './ImprovedCardSelector'
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
  isMinimized: boolean
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
    isMinimized: false,
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
      isMinimized: false,
      data: {}
    })
  }

  const closeWizard = () => {
    console.log('Closing wizard and resetting state')
    
    // Always send CANCEL if we have an active wizard action
    if (wizardState.actionType) {
      console.log('Sending CANCEL to game store for action:', wizardState.actionType)
      send({ type: 'CANCEL' })
    }
    
    setWizardState({
      isOpen: false,
      actionType: null,
      isMinimized: false,
      data: {}
    })
    // Reset wizard hook state
    reset()
  }

  const toggleMinimize = () => {
    setWizardState(prev => ({
      ...prev,
      isMinimized: !prev.isMinimized
    }))
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
              let updates: any = { selectedCard: card }
              
              // Auto-select industry type for industry cards
              if (card.type === 'industry') {
                const industryCard = card as any
                if (industryCard.industries && industryCard.industries.length === 1) {
                  // If only one industry type, auto-select it
                  updates.selectedIndustryType = industryCard.industries[0]
                  onIndustryTypeSelect(industryCard.industries[0])
                }
              }
              
              updateWizardData(updates)
              send({ type: 'SELECT_CARD', cardId: card.id })
            }}
            actionType="build"
          />
        ),
        canProceed: !!wizardState.data.selectedCard,
        validationMessage: !wizardState.data.selectedCard ? 'Please select a card to continue' : undefined
      }
    ]

    // Add industry type selection step only if needed:
    // - For location cards or wild location cards (need to pick which industry to build)
    // - For industry cards with multiple industry types (rare but possible)
    // - Skip for industry cards with single industry type (already auto-selected)
    const needsIndustrySelection = (
      wizardState.data.selectedCard?.type === 'location' ||
      wizardState.data.selectedCard?.type === 'wild_location' ||
      (wizardState.data.selectedCard?.type === 'industry' && 
       !wizardState.data.selectedIndustryType) // Only if not already auto-selected
    )
    
    if (needsIndustrySelection) {
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
    // Location cards already have a location specified
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
        description: 'Choose any card to discard for development',
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
        id: 'develop-industries',
        title: 'Develop Industries',
        description: 'Choose industries to develop and confirm the action',
        component: (
          <DevelopInterface
            player={currentPlayer!}
            onSelectDevelopment={(industryTypes) => {
              console.log('Selected industries for development:', industryTypes)
              updateWizardData({ selectedIndustries: industryTypes })
              // Send the selection to the game store
              send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes })
              // Let the wizard complete normally
            }}
            onCancel={closeWizard}
          />
        ),
        canProceed: !!(wizardState.data.selectedIndustries && wizardState.data.selectedIndustries.length > 0),
        validationMessage: !(wizardState.data.selectedIndustries && wizardState.data.selectedIndustries.length > 0) ? 'Please select at least one industry to develop' : undefined
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

  // Network wizard steps
  const networkSteps: ActionWizardStep[] = React.useMemo(() => {
    if (!wizardState.actionType || wizardState.actionType !== 'network') return []

    return [
      {
        id: 'select-card',
        title: 'Select Card',
        description: 'Choose a card to discard for networking',
        component: (
          <ImprovedCardSelector
            cards={currentPlayer?.hand || []}
            selectedCard={wizardState.data.selectedCard}
            onCardSelect={(card) => {
              updateWizardData({ selectedCard: card })
              send({ type: 'SELECT_CARD', cardId: card.id })
            }}
            actionType="network"
          />
        ),
        canProceed: !!wizardState.data.selectedCard,
        validationMessage: !wizardState.data.selectedCard ? 'Please select a card to discard' : undefined
      },
      {
        id: 'select-link',
        title: 'Select Connection',
        description: 'Click on the board to select a connection to build',
        component: (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Select Connection on Board</h4>
              <p className="text-sm text-muted-foreground">
                Click on the board to select a {snapshot.context.era} connection to build.
              </p>
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
                <div className="font-medium text-blue-900 dark:text-blue-100">
                  {snapshot.context.era === 'canal' ? 'Canal Era' : 'Rail Era'} Connection
                </div>
                <div className="text-blue-700 dark:text-blue-300 mt-1">
                  Cost: {snapshot.context.era === 'canal' ? '£3' : '£5 + 1 coal'}
                </div>
              </div>
              {wizardState.data.selectedLocation && (
                <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                  <div className="text-green-700 dark:text-green-300 text-sm font-medium">
                    ✓ Connection selected: {wizardState.data.selectedLocation}
                  </div>
                </div>
              )}
            </div>
          </div>
        ),
        canProceed: !!wizardState.data.selectedLocation,
        validationMessage: !wizardState.data.selectedLocation ? 'Please select a connection on the board' : undefined
      },
      {
        id: 'confirm',
        title: 'Confirm Network',
        description: 'Review and confirm your network action',
        component: (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Network Summary</h4>
              <div className="space-y-2 text-sm">
                <div>Card: {wizardState.data.selectedCard?.type.replace('_', ' ')}</div>
                {wizardState.data.selectedLocation && (
                  <div>Connection: {wizardState.data.selectedLocation}</div>
                )}
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Cost: {snapshot.context.era === 'canal' ? '£3' : '£5 + 1 coal'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
        canProceed: true
      }
    ]
  }, [wizardState, currentPlayer, send, snapshot.context.era])

  // Get current steps based on action type
  const getCurrentSteps = (): ActionWizardStep[] => {
    switch (wizardState.actionType) {
      case 'build':
        return buildSteps
      case 'develop':
        return developSteps
      case 'scout':
        return scoutSteps
      case 'network':
        return networkSteps
      case 'sell':
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
        
      case 'scout':
        // For scout, send the selected cards first, then confirm
        if (wizardState.data.selectedCards && wizardState.data.selectedCards.length === 3) {
          console.log('Sending selected cards for scout:', wizardState.data.selectedCards)
          // Send each selected card using SELECT_CARD
          wizardState.data.selectedCards.forEach(card => {
            send({ type: 'SELECT_CARD', cardId: card.id })
          })
          // Then confirm the scout action
          console.log('Sending final CONFIRM for scout')
          send({ type: 'CONFIRM' })
        } else {
          console.error('Scout action incomplete - not exactly 3 cards selected')
        }
        break
        
      case 'network':
        // For network, the link should already be selected via SELECT_LINK
        // Just send the final CONFIRM to complete the action
        console.log('Sending final CONFIRM for network')
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

  // Auto-set location for location cards (only for build action)
  React.useEffect(() => {
    if (wizardState.actionType === 'build' && wizardState.data.selectedCard?.type === 'location') {
      const locationCard = wizardState.data.selectedCard as any
      if (locationCard?.location && !wizardState.data.selectedLocation) {
        updateWizardData({ selectedLocation: locationCard.location })
      }
    }
  }, [wizardState.data.selectedCard, wizardState.actionType])

  // TODO: Re-implement auto-close when action completes successfully
  // For now, wizard closes manually when user confirms or cancels

  // Update wizard data when game state changes
  React.useEffect(() => {
    if (snapshot.context.selectedLocation) {
      updateWizardData({ selectedLocation: snapshot.context.selectedLocation })
    }
  }, [snapshot.context.selectedLocation])

  // Update wizard data when a network link is selected
  React.useEffect(() => {
    if (wizardState.actionType === 'network' && snapshot.context.selectedLink) {
      const linkName = `${snapshot.context.selectedLink.from} → ${snapshot.context.selectedLink.to}`
      updateWizardData({ selectedLocation: linkName })
      // Make sure wizard stays open and advances to next step when link is selected
      if (!wizardState.isOpen) {
        setWizardState(prev => ({ ...prev, isOpen: true }))
      }
    }
  }, [snapshot.context.selectedLink, wizardState.actionType, wizardState.isOpen])

  // Show action selector when in action selection mode
  if (isActionSelection && !wizardState.isOpen) {
    return (
      <ImprovedActionSelector
        snapshot={snapshot}
        onActionSelect={handleActionSelect}
        showCosts={true}
        showRequirements={true}
      />
    )
  }

  // Show wizard when action is selected OR when we're in an active action
  const shouldShowWizard = wizardState.isOpen && wizardState.actionType && steps.length > 0
  const isInActiveAction = !isActionSelection && (
    snapshot.matches({ playing: { action: 'building' } }) ||
    snapshot.matches({ playing: { action: 'developing' } }) ||
    snapshot.matches({ playing: { action: 'networking' } }) ||
    snapshot.matches({ playing: { action: 'selling' } }) ||
    snapshot.matches({ playing: { action: 'scouting' } }) ||
    snapshot.matches({ playing: { action: 'takingLoan' } })
  )
  
  if (shouldShowWizard) {
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
        isMinimized={wizardState.isMinimized}
        onToggleMinimize={toggleMinimize}
        wizardData={wizardState.data}
      />
    )
  }
  
  // If we're in an active action but wizard is closed, reopen it
  if (isInActiveAction && !wizardState.isOpen) {
    console.log('Reopening wizard for active action')
    const actionTypeMap: { [key: string]: WizardActionType } = {
      building: 'build',
      developing: 'develop', 
      networking: 'network',
      selling: 'sell',
      scouting: 'scout',
      takingLoan: 'loan'
    }
    
    for (const [stateName, actionType] of Object.entries(actionTypeMap)) {
      if (snapshot.matches({ playing: { action: stateName } })) {
        setWizardState({
          isOpen: true,
          actionType,
          isMinimized: false, // Always open full wizard when reopening
          data: wizardState.data // Preserve existing data
        })
        break
      }
    }
  }

  // Fallback: show nothing or loading state
  return null
}