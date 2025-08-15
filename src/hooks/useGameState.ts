import { useSelector } from '@xstate/react'
import { type ActorRefFrom } from 'xstate'
import { type gameStore, type GameStoreSnapshot } from '../store/gameStore'

type GameActor = ActorRefFrom<typeof gameStore>

/**
 * Custom hook for accessing game state capabilities using state.can()
 * Provides optimized selectors that only re-render when specific capabilities change
 */
export function useGameCapabilities(actor: GameActor) {
  // Action capabilities
  const canBuild = useSelector(actor, (state) => state.can({ type: 'BUILD' }))
  const canDevelop = useSelector(actor, (state) => state.can({ type: 'DEVELOP' }))
  const canSell = useSelector(actor, (state) => state.can({ type: 'SELL' }))
  const canTakeLoan = useSelector(actor, (state) => state.can({ type: 'TAKE_LOAN' }))
  const canScout = useSelector(actor, (state) => state.can({ type: 'SCOUT' }))
  const canNetwork = useSelector(actor, (state) => state.can({ type: 'NETWORK' }))
  const canPass = useSelector(actor, (state) => state.can({ type: 'PASS' }))
  
  // Confirmation capabilities
  const canConfirm = useSelector(actor, (state) => state.can({ type: 'CONFIRM' }))
  const canCancel = useSelector(actor, (state) => state.can({ type: 'CANCEL' }))
  
  // Network-specific capabilities
  const canChooseDoubleLink = useSelector(actor, (state) => 
    state.can({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
  )
  const canExecuteDoubleNetwork = useSelector(actor, (state) => 
    state.can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
  )
  
  return {
    // Primary actions
    canBuild,
    canDevelop,
    canSell,
    canTakeLoan,
    canScout,
    canNetwork,
    canPass,
    
    // Control actions
    canConfirm,
    canCancel,
    
    // Network actions
    canChooseDoubleLink,
    canExecuteDoubleNetwork,
  }
}

/**
 * Utility function to get game capabilities from a snapshot
 * Use this when you have a snapshot instead of an actor reference
 */
export function getGameCapabilities(snapshot: GameStoreSnapshot) {
  return {
    // Primary actions
    canBuild: snapshot.can({ type: 'BUILD' }),
    canDevelop: snapshot.can({ type: 'DEVELOP' }),
    canSell: snapshot.can({ type: 'SELL' }),
    canTakeLoan: snapshot.can({ type: 'TAKE_LOAN' }),
    canScout: snapshot.can({ type: 'SCOUT' }),
    canNetwork: snapshot.can({ type: 'NETWORK' }),
    canPass: snapshot.can({ type: 'PASS' }),
    
    // Control actions
    canConfirm: snapshot.can({ type: 'CONFIRM' }),
    canCancel: snapshot.can({ type: 'CANCEL' }),
    
    // Network actions
    canChooseDoubleLink: snapshot.can({ type: 'CHOOSE_DOUBLE_LINK_BUILD' }),
    canExecuteDoubleNetwork: snapshot.can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' }),
  }
}

/**
 * Hook for checking specific event capabilities
 * Useful for dynamic event checking with parameters
 */
export function useCanSendEvent(actor: GameActor, event: any) {
  return useSelector(actor, (state) => state.can(event))
}

/**
 * Hook for checking multiple capabilities at once
 * Returns an object with all the requested capabilities
 */
export function useMultipleCapabilities(actor: GameActor, events: Array<{ name: string; event: any }>) {
  return useSelector(actor, (state) => {
    const capabilities: Record<string, boolean> = {}
    events.forEach(({ name, event }) => {
      capabilities[name] = state.can(event)
    })
    return capabilities
  })
}

/**
 * Hook for card selection capabilities
 * Checks if specific cards can be selected
 */
export function useCardCapabilities(actor: GameActor) {
  const canSelectCard = useSelector(actor, (state) => 
    state.can({ type: 'SELECT_CARD', cardId: 'any' }) // Generic check
  )
  
  const canSelectIndustryType = useSelector(actor, (state) => 
    state.can({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' }) // Generic check
  )
  
  const canSelectLocation = useSelector(actor, (state) => 
    state.can({ type: 'SELECT_LOCATION', cityId: 'birmingham' }) // Generic check
  )
  
  return {
    canSelectCard,
    canSelectIndustryType,
    canSelectLocation,
  }
}

/**
 * Hook for network capabilities
 * Checks specific link building capabilities
 */
export function useNetworkCapabilities(actor: GameActor) {
  const canSelectLink = useSelector(actor, (state) => 
    state.can({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' }) // Generic check
  )
  
  const canSelectSecondLink = useSelector(actor, (state) => 
    state.can({ type: 'SELECT_SECOND_LINK', from: 'birmingham', to: 'wolverhampton' }) // Generic check
  )
  
  return {
    canSelectLink,
    canSelectSecondLink,
    canChooseDoubleLink: useSelector(actor, (state) => 
      state.can({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    ),
    canExecuteDoubleNetwork: useSelector(actor, (state) => 
      state.can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
    ),
  }
}