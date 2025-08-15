'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface UseGamePollingOptions {
  gameId: string
  playerIndex: number
  enabled?: boolean
  intervalMs?: number
}

export function useGamePolling({ 
  gameId, 
  playerIndex, 
  enabled = true, 
  intervalMs = 3000 
}: UseGamePollingOptions) {
  const router = useRouter()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastUpdateRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !gameId) return

    const checkForUpdates = async () => {
      try {
        // Call a simple API that returns the last update timestamp
        const response = await fetch(`/api/game/${gameId}/status`, {
          cache: 'no-store'
        })
        
        if (response.ok) {
          const data = await response.json()
          const { lastUpdate, currentPlayerIndex } = data
          
          // If this is the first check, just store the timestamp
          if (lastUpdateRef.current === null) {
            lastUpdateRef.current = lastUpdate
            return
          }
          
          // If the game was updated since our last check
          if (lastUpdate !== lastUpdateRef.current) {
            lastUpdateRef.current = lastUpdate
            
            // Use Next.js router to refresh the page and revalidate server components
            router.refresh()
          }
        }
      } catch (error) {
        console.error('❌ Error polling for game updates:', error)
      }
    }

    // Start polling
    intervalRef.current = setInterval(checkForUpdates, intervalMs)
    
    // Check immediately
    checkForUpdates()

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [gameId, playerIndex, enabled, intervalMs, router])

  return {
    stopPolling: () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }
}