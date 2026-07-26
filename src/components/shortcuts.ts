// Keyboard shortcuts, leader-prefix style: tap `g`, then the binding key.
//
// No modifier combos. Cmd/Ctrl+<letter> collides with the browser and the OS
// (Cmd+S saves the page, Cmd+B opens bookmarks…), and Cmd+K is already the
// command palette. A leader sequence needs no modifier at all, so nothing here
// can shadow a browser binding.
//
// This module is the whole declaration surface: one row per shortcut, carrying
// its key, the description the hint overlay reads, and the id a surface hangs a
// handler on. It is pure data — the React wiring lives in leader-shortcuts.tsx.
import type { UseHotkeySequenceDefinition } from '@tanstack/react-hotkeys'
import type { Hotkey, SequenceOptions } from '@tanstack/react-hotkeys'

export const SHORTCUT_LEADER: Hotkey = 'G'

// How long the leader stays armed. The library's 1000ms default is tight for a
// two-step sequence typed with one hand; 2s starts to feel like a stuck mode.
// 1500ms is unhurried and still short enough that a stray `g` is forgotten
// before the next unrelated keystroke lands.
export const SHORTCUT_TIMEOUT_MS = 1500

// Tailwind's `lg`, the breakpoint the collapsible dock layout starts at.
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'

interface ShortcutBinding {
  /** Handler slot a surface fills in; also the row's stable identity. */
  id: string
  /** The key pressed after the leader. */
  key: Hotkey
  /** Shown in the hint overlay while the leader is armed. */
  description: string
  /** Set when the target only exists in the desktop layout. */
  desktopOnly?: boolean
}

export const SHORTCUTS = [
  {
    id: 'togglePanel',
    key: 'P',
    description: 'Collapse or expand the panel',
    desktopOnly: true,
  },
] as const satisfies ReadonlyArray<ShortcutBinding>

export type ShortcutId = (typeof SHORTCUTS)[number]['id']

/**
 * Handlers a surface offers. A shortcut with no handler here is inert, so a
 * binding may be declared before every surface can serve it.
 */
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>

export interface ShortcutContext {
  /** Whether the viewport is showing the desktop layout. */
  isDesktop: boolean
}

function isOffered(
  binding: (typeof SHORTCUTS)[number],
  handlers: ShortcutHandlers,
  { isDesktop }: ShortcutContext,
): boolean {
  if (handlers[binding.id] === undefined) return false
  return isDesktop || binding.desktopOnly !== true
}

// stopPropagation stays off: the listener sits on `document`, and window-level
// keydown handlers (the command palette) run after it in the bubble phase.
export const SHORTCUT_SEQUENCE_OPTIONS: SequenceOptions = {
  timeout: SHORTCUT_TIMEOUT_MS,
  // Never fire while the player is typing — a game name, a chat line, the
  // palette's search box. Covers inputs, textareas, selects and
  // contenteditable, in that element's own document.
  ignoreInputs: true,
  preventDefault: true,
  stopPropagation: false,
}

/** The leader sequences to register, one per declared shortcut. */
export function shortcutSequences(
  handlers: ShortcutHandlers,
  context: ShortcutContext,
): Array<UseHotkeySequenceDefinition> {
  return SHORTCUTS.map((binding) => ({
    sequence: [SHORTCUT_LEADER, binding.key],
    callback: () => handlers[binding.id]?.(),
    options: { enabled: isOffered(binding, handlers, context) },
  }))
}

/** The rows the hint overlay lists: every shortcut this surface can serve. */
export function shortcutHints(
  handlers: ShortcutHandlers,
  context: ShortcutContext,
): Array<{ key: Hotkey; description: string }> {
  return SHORTCUTS.filter((binding) =>
    isOffered(binding, handlers, context),
  ).map(({ key, description }) => ({ key, description }))
}
