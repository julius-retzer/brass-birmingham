import { describe, expect, it, vi } from 'vitest'
import {
  SHORTCUTS,
  SHORTCUT_LEADER,
  SHORTCUT_SEQUENCE_OPTIONS,
  SHORTCUT_TIMEOUT_MS,
  shortcutHints,
  shortcutSequences,
} from './shortcuts'

describe('shortcut registry', () => {
  it('declares one sequence per binding, all behind the leader', () => {
    const definitions = shortcutSequences({ togglePanel: () => {} })
    expect(definitions).toHaveLength(SHORTCUTS.length)
    for (const definition of definitions) {
      expect(definition.sequence[0]).toBe(SHORTCUT_LEADER)
      expect(definition.sequence).toHaveLength(2)
    }
  })

  it('binds no modifier combos — they belong to the browser', () => {
    for (const binding of SHORTCUTS) {
      expect(binding.key).not.toMatch(/\+/)
    }
    expect(SHORTCUT_LEADER).not.toMatch(/\+/)
  })

  it('keeps every binding key distinct and clear of the leader', () => {
    const keys = SHORTCUTS.map((binding) => binding.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain(SHORTCUT_LEADER)
  })

  it('gives every binding a description for the hint overlay', () => {
    for (const binding of SHORTCUTS) {
      expect(binding.description.length).toBeGreaterThan(0)
    }
  })

  it('routes a completed sequence to the matching handler', () => {
    const togglePanel = vi.fn()
    const definition = shortcutSequences({ togglePanel }).find(
      (d) => d.sequence[1] === 'P',
    )
    definition?.callback(new Event('keydown') as KeyboardEvent, {
      hotkey: 'P',
      parsedHotkey: {} as never,
    })
    expect(togglePanel).toHaveBeenCalledTimes(1)
  })

  it('registers a handler-less binding but leaves it inert', () => {
    const definitions = shortcutSequences({})
    expect(definitions).toHaveLength(SHORTCUTS.length)
    for (const definition of definitions) {
      expect(definition.options?.enabled).toBe(false)
    }
    expect(shortcutHints({})).toEqual([])
  })

  it('hints only what this surface can serve', () => {
    expect(shortcutHints({ togglePanel: () => {} })).toEqual([
      { key: 'P', description: 'Collapse or expand the panel' },
    ])
  })

  it('suppresses shortcuts in text fields and bounds the leader window', () => {
    expect(SHORTCUT_SEQUENCE_OPTIONS.ignoreInputs).toBe(true)
    expect(SHORTCUT_SEQUENCE_OPTIONS.timeout).toBe(SHORTCUT_TIMEOUT_MS)
    expect(SHORTCUT_TIMEOUT_MS).toBeGreaterThan(0)
    expect(SHORTCUT_TIMEOUT_MS).toBeLessThanOrEqual(2000)
  })
})
