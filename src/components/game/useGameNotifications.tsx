'use client'

import { toast } from 'sonner'
import { CheckCircle, AlertCircle, Info, XCircle, Zap, Coins, Factory } from 'lucide-react'

export function useGameNotifications() {
  const showActionSuccess = (actionType: string, details?: string) => {
    const actionNames = {
      build: '🏭 Built',
      develop: '⚙️ Developed',
      sell: '💰 Sold',
      network: '🛤️ Connected',
      scout: '🔍 Scouted',
      loan: '🏦 Loan Taken'
    }
    
    toast.success(actionNames[actionType as keyof typeof actionNames] || 'Action Complete', {
      description: details,
      icon: <CheckCircle className="h-4 w-4" />
    })
  }

  const showActionError = (actionType: string, error: string) => {
    toast.error(`Action Failed`, {
      description: error,
      icon: <XCircle className="h-4 w-4" />
    })
  }

  const showResourceUpdate = (resource: string, amount: number, type: 'gained' | 'spent') => {
    const resourceIcons = {
      money: <Coins className="h-4 w-4 text-yellow-600" />,
      coal: '⚫',
      iron: '🔩',
      beer: '🍺',
      income: <Zap className="h-4 w-4 text-green-600" />,
      victoryPoints: '🏆'
    }

    const action = type === 'gained' ? 'Gained' : 'Spent'
    const sign = type === 'gained' ? '+' : '-'
    
    toast.info(`${action} ${resource}`, {
      description: `${sign}${amount} ${resource}`,
      icon: resourceIcons[resource as keyof typeof resourceIcons] || <Info className="h-4 w-4" />
    })
  }

  const showGameEvent = (event: string, description?: string) => {
    toast.info(event, {
      description,
      icon: <Info className="h-4 w-4" />
    })
  }

  const showEraTransition = (fromEra: string, toEra: string) => {
    toast.success(`Era Transition`, {
      description: `${fromEra} Era → ${toEra} Era`,
      icon: <Factory className="h-4 w-4" />,
      duration: 5000
    })
  }

  const showTurnChange = (playerName: string, actionsRemaining: number) => {
    toast.info(`${playerName}'s Turn`, {
      description: `${actionsRemaining} action${actionsRemaining !== 1 ? 's' : ''} remaining`,
      icon: '👤',
      duration: 2000
    })
  }

  const showValidationError = (message: string, suggestion?: string) => {
    toast.error('Invalid Action', {
      description: `${message}${suggestion ? ` ${suggestion}` : ''}`,
      icon: <AlertCircle className="h-4 w-4" />,
      action: suggestion ? {
        label: 'Help',
        onClick: () => toast.info('Help', { description: suggestion })
      } : undefined
    })
  }

  const showLowResource = (resource: string, amount: number) => {
    toast.warning(`Low ${resource}`, {
      description: `Only ${amount} ${resource} remaining`,
      icon: <AlertCircle className="h-4 w-4" />
    })
  }

  const showIndustryFlip = (industryType: string, location: string, victoryPoints: number) => {
    toast.success('Industry Flipped!', {
      description: `${industryType} at ${location} (+${victoryPoints} VP)`,
      icon: '🔄',
      duration: 4000
    })
  }

  return {
    showActionSuccess,
    showActionError,
    showResourceUpdate,
    showGameEvent,
    showEraTransition,
    showTurnChange,
    showValidationError,
    showLowResource,
    showIndustryFlip
  }
}