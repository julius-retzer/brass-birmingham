'use client'

import React from 'react'
import { toast } from 'sonner'

interface KeyboardShortcut {
  key: string
  description: string
  action: () => void
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean
  showHelp?: boolean
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, showHelp = true } = options

  React.useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.contentEditable === 'true')
      ) {
        return
      }

      const matchingShortcut = shortcuts.find(
        (shortcut) =>
          shortcut.key.toLowerCase() === event.key.toLowerCase() &&
          !!shortcut.ctrlKey === event.ctrlKey &&
          !!shortcut.shiftKey === event.shiftKey &&
          !!shortcut.altKey === event.altKey
      )

      if (matchingShortcut) {
        event.preventDefault()
        matchingShortcut.action()
      }

      // Show help with '?'
      if (showHelp && event.key === '?' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        showShortcutHelp(shortcuts)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [shortcuts, enabled, showHelp])

  return {
    showHelp: () => showShortcutHelp(shortcuts)
  }
}

function showShortcutHelp(shortcuts: KeyboardShortcut[]) {
  const shortcutList = shortcuts
    .map(s => {
      const modifiers = []
      if (s.ctrlKey) modifiers.push('Ctrl')
      if (s.shiftKey) modifiers.push('Shift')
      if (s.altKey) modifiers.push('Alt')

      const keyCombo = [...modifiers, s.key.toUpperCase()].join('+')
      return `${keyCombo}: ${s.description}`
    })
    .join('\n')

  toast.info('Keyboard Shortcuts', {
    description: shortcutList + '\n\n? : Show this help',
    duration: 8000
  })
}

// Game-specific shortcuts hook
export function useGameKeyboardShortcuts(
  onActionSelect: (action: string) => void,
  onToggleUI: () => void,
  gameState: { can: (event: any) => boolean; send: (event: any) => void }
) {
  const shortcuts: KeyboardShortcut[] = React.useMemo(() => [
    {
      key: 'b',
      description: 'Build action',
      action: () => onActionSelect('build')
    },
    {
      key: 'd',
      description: 'Develop action',
      action: () => onActionSelect('develop')
    },
    {
      key: 's',
      description: 'Sell action',
      action: () => onActionSelect('sell')
    },
    {
      key: 'n',
      description: 'Network action',
      action: () => onActionSelect('network')
    },
    {
      key: 'r',
      description: 'Scout action',
      action: () => onActionSelect('scout')
    },
    {
      key: 'l',
      description: 'Take Loan action',
      action: () => onActionSelect('loan')
    },
    {
      key: 'p',
      description: 'Pass turn',
      action: () => onActionSelect('pass')
    },
    {
      key: 'u',
      description: 'Toggle UI',
      action: onToggleUI
    },
    {
      key: 'Escape',
      description: 'Cancel current action',
      action: () => {
        if (gameState?.can?.({ type: 'CANCEL' })) {
          gameState.send({ type: 'CANCEL' })
        }
      }
    }
  ], [onActionSelect, onToggleUI, gameState])

  const { showHelp } = useKeyboardShortcuts(shortcuts, {
    enabled: false,
    showHelp: true
  })

  return { showHelp }
}