import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useState } from 'react'
import { type Card, type IndustryType } from '~/data/cards'
import { type CityId } from '~/data/board'
import { type GameState, type Player } from '~/store/gameStore'
import { cn } from '~/lib/utils'
import { Button } from '../ui/button'
import { Card as UICard, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Progress } from '../ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'

interface ActionWizardProps {
  actionType: 'build' | 'network' | 'develop' | 'sell' | 'loan' | 'scout'
  currentStep: number
  totalSteps: number
  player: Player
  gameState: GameState
  onNext: () => void
  onBack: () => void
  onCancel: () => void
  onComplete: () => void
  children: React.ReactNode
}

export function ActionWizard({
  actionType,
  currentStep,
  totalSteps,
  player,
  gameState,
  onNext,
  onBack,
  onCancel,
  onComplete,
  children,
}: ActionWizardProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100

  const getActionColor = () => {
    const colors = {
      build: 'from-orange-500 to-orange-600',
      network: 'from-blue-500 to-blue-600',
      develop: 'from-purple-500 to-purple-600',
      sell: 'from-green-500 to-green-600',
      loan: 'from-red-500 to-red-600',
      scout: 'from-yellow-500 to-yellow-600',
    }
    return colors[actionType]
  }

  const getActionIcon = () => {
    const icons = {
      build: '🏭',
      network: '🛤️',
      develop: '⚙️',
      sell: '💰',
      loan: '🏦',
      scout: '🔍',
    }
    return icons[actionType]
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed inset-x-0 bottom-0 z-50 p-4 pointer-events-none"
    >
      <UICard className="max-w-4xl mx-auto shadow-2xl pointer-events-auto">
        <CardHeader className={cn('bg-gradient-to-r text-white', getActionColor())}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-xl">
              <span className="text-2xl">{getActionIcon()}</span>
              <span className="capitalize">{actionType} Action</span>
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCancel}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        
        <Progress value={progress} className="h-2" />
        
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: totalSteps }).map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all',
                    index === currentStep
                      ? 'bg-primary text-primary-foreground scale-110'
                      : index < currentStep
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </div>
              ))}
            </div>

            <Separator />

            {/* Dynamic Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>

            <Separator />

            {/* Navigation */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={onBack}
                disabled={currentStep === 0}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              {currentStep === totalSteps - 1 ? (
                <Button onClick={onComplete} className="gap-2">
                  Complete
                  <Check className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={onNext} className="gap-2">
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </UICard>
    </motion.div>
  )
}