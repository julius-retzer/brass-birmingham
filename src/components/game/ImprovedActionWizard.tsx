'use client'

import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import React from 'react'
import { type IndustryType } from '~/data/cards'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet'
import { cn } from '~/lib/utils'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'

export interface ActionWizardStep {
  id: string
  title: string
  description: string
  component: React.ReactNode
  canProceed: boolean
  validationMessage?: string
  isOptional?: boolean
}

interface ActionWizardProps {
  isOpen: boolean
  onClose: () => void
  actionType: 'build' | 'develop' | 'sell' | 'network' | 'scout' | 'loan'
  steps: ActionWizardStep[]
  currentStepIndex: number
  onNext: () => void
  onPrevious: () => void
  onComplete: () => void
  canComplete?: boolean
  completionMessage?: string
}

const actionConfig = {
  build: {
    title: 'Build Industry',
    icon: '🏭',
    color: 'bg-blue-50 border-blue-200 text-blue-900',
    primaryColor: 'bg-blue-600 hover:bg-blue-700'
  },
  develop: {
    title: 'Develop Industries',
    icon: '⚙️',
    color: 'bg-green-50 border-green-200 text-green-900',
    primaryColor: 'bg-green-600 hover:bg-green-700'
  },
  sell: {
    title: 'Sell Goods',
    icon: '💰',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    primaryColor: 'bg-yellow-600 hover:bg-yellow-700'
  },
  network: {
    title: 'Build Network',
    icon: '🛤️',
    color: 'bg-purple-50 border-purple-200 text-purple-900',
    primaryColor: 'bg-purple-600 hover:bg-purple-700'
  },
  scout: {
    title: 'Scout Cards',
    icon: '🔍',
    color: 'bg-orange-50 border-orange-200 text-orange-900',
    primaryColor: 'bg-orange-600 hover:bg-orange-700'
  },
  loan: {
    title: 'Take Loan',
    icon: '🏦',
    color: 'bg-red-50 border-red-200 text-red-900',
    primaryColor: 'bg-red-600 hover:bg-red-700'
  }
}

export function ImprovedActionWizard({
  isOpen,
  onClose,
  actionType,
  steps,
  currentStepIndex,
  onNext,
  onPrevious,
  onComplete,
  canComplete = false,
  completionMessage
}: ActionWizardProps) {
  const config = actionConfig[actionType]
  const currentStep = steps[currentStepIndex]
  const progress = ((currentStepIndex + 1) / steps.length) * 100
  const isLastStep = currentStepIndex === steps.length - 1
  const isFirstStep = currentStepIndex === 0

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-[600px] lg:w-[700px] flex flex-col h-full max-h-screen"
      >
        {/* Header */}
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{config.icon}</div>
            <div>
              <SheetTitle className="text-xl">{config.title}</SheetTitle>
              <SheetDescription>
                Step {currentStepIndex + 1} of {steps.length}: {currentStep?.title}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Progress Bar */}
        <div className="px-1 pb-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
            <span>Progress</span>
            <span>{currentStepIndex + 1} / {steps.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Navigation */}
        <div className="flex flex-wrap gap-2 pb-4">
          {steps.map((step, index) => {
            const isActive = index === currentStepIndex
            const isComplete = index < currentStepIndex
            const isPending = index > currentStepIndex
            
            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border',
                  isActive && 'bg-primary text-primary-foreground border-primary',
                  isComplete && 'bg-green-100 text-green-700 border-green-300',
                  isPending && 'bg-gray-100 text-gray-500 border-gray-300'
                )}
              >
                {isComplete && <Check className="h-3 w-3" />}
                <span>{step.title}</span>
                {step.isOptional && (
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    Optional
                  </Badge>
                )}
              </div>
            )
          })}
        </div>

        <Separator className="mb-6" />

        {/* Current Step Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {currentStep && (
            <>
              <div className="flex-shrink-0 mb-4">
                <h3 className="text-lg font-semibold mb-2">{currentStep.title}</h3>
                <p className="text-sm text-muted-foreground">{currentStep.description}</p>
              </div>

              {/* Validation Message */}
              {!currentStep.canProceed && currentStep.validationMessage && (
                <div className="flex-shrink-0 mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800">
                    <div className="h-4 w-4 rounded-full bg-yellow-400 flex items-center justify-center">
                      <span className="text-xs text-white">!</span>
                    </div>
                    <span className="text-sm font-medium">Action Required</span>
                  </div>
                  <p className="text-sm text-yellow-700 mt-1">
                    {currentStep.validationMessage}
                  </p>
                </div>
              )}

              {/* Step Component - Scrollable Area */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {currentStep.component}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions - Always visible */}
        <div className="flex-shrink-0 pt-4 mt-4 border-t bg-background">
          <div className="flex items-center justify-between gap-3">
            {/* Back Button */}
            <Button
              variant="outline"
              onClick={onPrevious}
              disabled={isFirstStep}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {/* Cancel Button */}
              <Button
                variant="ghost"
                onClick={onClose}
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>

              {/* Next/Complete Button */}
              {isLastStep ? (
                <Button
                  onClick={onComplete}
                  disabled={!canComplete}
                  className={cn('flex items-center gap-2', config.primaryColor)}
                >
                  <Check className="h-4 w-4" />
                  {completionMessage || 'Complete Action'}
                </Button>
              ) : (
                <Button
                  onClick={onNext}
                  disabled={!currentStep?.canProceed}
                  className={cn('flex items-center gap-2', config.primaryColor)}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Helper hook for managing wizard state
export function useActionWizard(steps: ActionWizardStep[]) {
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0)

  const canGoNext = () => {
    const currentStep = steps[currentStepIndex]
    return currentStep?.canProceed ?? false
  }

  // Auto-advance disabled for now - users will click "Next" manually
  // React.useEffect(() => {
  //   if (canGoNext() && currentStepIndex < steps.length - 1) {
  //     const timer = setTimeout(() => {
  //       console.log('Auto-advancing from step', currentStepIndex, 'to step', currentStepIndex + 1)
  //       setCurrentStepIndex(prev => prev + 1)
  //     }, 800) // Slightly longer delay to let user see the selection
  //     
  //     return () => clearTimeout(timer)
  //   }
  // }, [canGoNext(), currentStepIndex, steps.length])

  const canGoPrevious = () => {
    return currentStepIndex > 0
  }

  const canComplete = () => {
    return currentStepIndex === steps.length - 1 && canGoNext()
  }

  const goNext = () => {
    if (canGoNext() && currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  const goPrevious = () => {
    if (canGoPrevious()) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }

  const reset = () => {
    setCurrentStepIndex(0)
  }

  const goToStep = (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < steps.length) {
      setCurrentStepIndex(stepIndex)
    }
  }

  return {
    currentStepIndex,
    canGoNext,
    canGoPrevious,
    canComplete,
    goNext,
    goPrevious,
    reset,
    goToStep
  }
}

// Types for building wizard steps
export interface BuildWizardData {
  selectedCard: any
  selectedIndustryType: IndustryType | null
  selectedLocation: string | null
  confirmed: boolean
}

export interface DevelopWizardData {
  selectedCard: any
  selectedIndustries: IndustryType[]
  confirmed: boolean
}

export interface SellWizardData {
  selectedCard: any
  confirmed: boolean
}

export interface NetworkWizardData {
  selectedCard: any
  selectedLink: { from: string; to: string } | null
  selectedSecondLink: { from: string; to: string } | null
  confirmed: boolean
}

export interface ScoutWizardData {
  selectedCards: any[]
  confirmed: boolean
}

export interface LoanWizardData {
  selectedCard: any
  confirmed: boolean
}