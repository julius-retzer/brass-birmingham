// @vitest-environment happy-dom
//
// Drives the real key matcher over the registry's own sequences and options, so
// the two behaviours that matter — the shortcut fires, and it stays silent
// while someone is typing — are pinned against the library rather than a
// re-implementation of it.
import { SequenceManager, getSequenceManager } from '@tanstack/react-hotkeys'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SHORTCUT_SEQUENCE_OPTIONS,
  SHORTCUT_TIMEOUT_MS,
  shortcutSequences,
} from './shortcuts'

function register(
  handlers: Parameters<typeof shortcutSequences>[0],
  context: Parameters<typeof shortcutSequences>[1] = { isDesktop: true },
) {
  const manager = getSequenceManager()
  for (const definition of shortcutSequences(handlers, context)) {
    manager.register(definition.sequence, definition.callback, {
      ...SHORTCUT_SEQUENCE_OPTIONS,
      ...definition.options,
      target: document,
    })
  }
}

function press(key: string, from: EventTarget = document.body) {
  from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

let togglePanel: ReturnType<typeof vi.fn>

beforeEach(() => {
  SequenceManager.resetInstance()
  document.body.innerHTML = ''
  togglePanel = vi.fn()
})

afterEach(() => {
  SequenceManager.resetInstance()
  vi.useRealTimers()
})

describe('leader shortcuts on a real keyboard', () => {
  it('fires the panel toggle on g then p, once per sequence', () => {
    register({ togglePanel })
    press('g')
    press('p')
    expect(togglePanel).toHaveBeenCalledTimes(1)

    press('g')
    press('p')
    expect(togglePanel).toHaveBeenCalledTimes(2)
  })

  it('ignores the second key on its own', () => {
    register({ togglePanel })
    press('p')
    expect(togglePanel).not.toHaveBeenCalled()
  })

  it.each([
    ['a text input', () => document.createElement('input')],
    [
      'a textarea',
      () => document.createElement('textarea') as unknown as HTMLElement,
    ],
    [
      'a contenteditable field',
      () => {
        const editable = document.createElement('div')
        editable.setAttribute('contenteditable', 'true')
        return editable
      },
    ],
  ])('stays silent while typing into %s', (_label, make) => {
    register({ togglePanel })
    const field = make()
    document.body.appendChild(field)
    field.focus()

    press('g', field)
    press('p', field)
    expect(togglePanel).not.toHaveBeenCalled()
  })

  it('lets the leader lapse after the timeout', () => {
    vi.useFakeTimers()
    register({ togglePanel })
    press('g')
    vi.advanceTimersByTime(SHORTCUT_TIMEOUT_MS + 50)
    press('p')
    expect(togglePanel).not.toHaveBeenCalled()

    // …and the very same keys work again once pressed together in time.
    press('g')
    vi.advanceTimersByTime(SHORTCUT_TIMEOUT_MS - 50)
    press('p')
    expect(togglePanel).toHaveBeenCalledTimes(1)
  })

  it('forgets the leader when an unrelated key follows', () => {
    register({ togglePanel })
    press('g')
    press('x')
    press('p')
    expect(togglePanel).not.toHaveBeenCalled()
  })

  it('never fires a binding no surface serves', () => {
    register({})
    press('g')
    press('p')
    expect(togglePanel).not.toHaveBeenCalled()
  })

  it('never fires a desktop-only binding on a phone layout', () => {
    register({ togglePanel }, { isDesktop: false })
    press('g')
    press('p')
    expect(togglePanel).not.toHaveBeenCalled()
  })
})
