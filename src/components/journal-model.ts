// Journal presentation model: turns the engine's prose log lines into
// structured, skimmable items (actor / kind / headline / chips / demoted
// detail). PRESENTATION ONLY — every fragment of the original message
// survives verbatim in main/chips/details, so nothing is lost, only
// re-weighted. The engine's log strings are the contract here; if a new
// message template appears, the fallback keeps it fully visible as an
// 'info' item rather than dropping anything.
import { cities } from '~/data/board'
import type { LogEntry, LogEntryType, Player } from '~/store/gameStore'

export interface PlayerRef {
  name: string
  color: Player['color']
}

export type JournalKind =
  | 'build'
  | 'network'
  | 'sell'
  | 'develop'
  | 'loan'
  | 'scout'
  | 'pass'
  | 'income'
  | 'flip'
  | 'score'
  | 'round'
  | 'era'
  | 'system'
  | 'error'
  | 'info'

export type ChipTone = 'flip' | 'income' | 'penalty' | 'money' | 'neutral'

export interface JournalChip {
  text: string
  tone: ChipTone
}

export interface JournalItem {
  kind: JournalKind
  type: LogEntryType
  actor: PlayerRef | null
  /** Headline clause, verbatim minus the leading actor name. */
  main: string
  /** De-emphasized fragments (consumption, card used), verbatim. */
  details: string[]
  /** Hoisted highlights (flips, income moves, loan terms). */
  chips: JournalChip[]
  /** Set on round/era boundary items — rendered as a divider, not a row. */
  divider?: string
}

/* ---------------- low-level scanners ---------------- */

interface Segment {
  kind: 'text' | 'paren'
  text: string
}

/** Split into top-level runs of plain text and `(...)` group contents. */
function topLevelSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') {
      if (depth === 0) {
        if (i > start)
          segments.push({ kind: 'text', text: text.slice(start, i) })
        start = i + 1
      }
      depth++
    } else if (ch === ')' && depth > 0) {
      depth--
      if (depth === 0) {
        segments.push({ kind: 'paren', text: text.slice(start, i) })
        start = i + 1
      }
    }
  }
  if (start < text.length)
    segments.push({ kind: 'text', text: text.slice(start) })
  return segments
}

/** Split on ', ' at paren depth 0, so nested groups stay intact. */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth++
    else if (ch === ')' && depth > 0) depth--
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Split off the trailing top-level ' using <card>' clause, if present. */
function splitUsing(text: string): { head: string; card: string | null } {
  let depth = 0
  let usingAt = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth++
    else if (ch === ')' && depth > 0) depth--
    else if (depth === 0 && text.startsWith(' using ', i)) usingAt = i
  }
  if (usingAt === -1) return { head: text, card: null }
  return {
    head: text.slice(0, usingAt),
    card: text.slice(usingAt + 1), // keep the word "using" in the fragment
  }
}

/* ---------------- classification ---------------- */

/** A paren group kept inline in the headline (route lists, inline prices). */
const INLINE_GROUP = /^£\d+$|^\w+-\w+(?:, \w+-\w+)*$/

function chipFor(piece: string): JournalChip | null {
  if (/^(?:tile )?flipped$/.test(piece))
    return { text: 'flipped', tone: 'flip' }
  const income =
    /^income \+(\d+)$/.exec(piece) ?? /^\+(\d+) income$/.exec(piece)
  if (income) return { text: `+${income[1]} income`, tone: 'income' }
  const penalty = /^-(\d+) income$/.exec(piece)
  if (penalty) return { text: `−${penalty[1]} income`, tone: 'penalty' }
  if (/^£\d+$/.test(piece)) return { text: piece, tone: 'money' }
  if (/^shortfall: £\d+$/.test(piece)) return { text: piece, tone: 'penalty' }
  if (
    /^removed \d+ tiles?$/.test(piece) ||
    /^\d+ industr(?:y|ies) sold$/.test(piece) ||
    /^gained \d+ wild cards?$/.test(piece) ||
    /^overbuilt (?:own|opponent's) level \d+$/.test(piece)
  ) {
    return { text: piece, tone: 'neutral' }
  }
  return null
}

function classify(main: string, type: LogEntryType): JournalKind {
  if (/^built (?:a (?:canal|rail) link|\d+ rail links)/.test(main)) {
    return 'network'
  }
  if (/^built /.test(main)) return 'build'
  if (/^completed Sell action/.test(main)) return 'sell'
  if (type === 'info' && /^sold .+ industry for £\d+$/.test(main)) {
    return 'income' // forced settlement sale, not a Sell action
  }
  if (/^sold /.test(main)) return 'sell'
  if (/^developed/.test(main)) return 'develop'
  if (/^took a loan/.test(main)) return 'loan'
  if (/^scouted/.test(main)) return 'scout'
  if (/^passed/.test(main)) return 'pass'
  if (/^collected £\d+ income/.test(main) || /^paid £\d+/.test(main)) {
    return 'income'
  }
  if (/^scored \d+ VPs?/.test(main) || /^lost \d+ VPs?/.test(main)) {
    return 'score'
  }
  if (/^'s .+ flipped/.test(main)) return 'flip'
  if (type === 'system') return 'system'
  return 'info'
}

const ERA_DIVIDERS = [
  /^Game started$/,
  /^(?:Canal|Rail) Era (?:started|ended)$/,
  /^End of (?:canal|rail) era scoring$/,
  /^Game Over!/,
]

function parseSystemEntry(message: string): JournalItem | null {
  const base = {
    type: 'system' as const,
    actor: null,
    main: message,
    details: [],
    chips: [],
  }
  if (/^Round \d+ completed$/.test(message)) {
    return { ...base, kind: 'round', divider: message }
  }
  if (ERA_DIVIDERS.some((re) => re.test(message))) {
    return { ...base, kind: 'era', divider: message }
  }
  return null
}

function extractActor(
  message: string,
  players: PlayerRef[],
): { actor: PlayerRef | null; rest: string } {
  // Longest name first so "Georgeanne" wins over "George"; only a leading,
  // word-bounded name counts as the actor.
  const byLength = [...players].sort((a, b) => b.name.length - a.name.length)
  for (const p of byLength) {
    if (!message.startsWith(p.name)) continue
    const after = message[p.name.length]
    if (after !== undefined && /\w/.test(after)) continue
    return { actor: p, rest: message.slice(p.name.length).replace(/^ /, '') }
  }
  return { actor: null, rest: message }
}

/* ---------------- display decoration ---------------- */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Tile level as the roman numeral the board tiles themselves show. */
export function romanLevel(level: number): string {
  return ROMAN[level - 1] ?? String(level)
}

export interface MainSpan {
  text: string
  role: 'text' | 'industry' | 'level' | 'place'
}

const capitalize = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1)

/**
 * Split a headline into styled spans: the WHAT (industry) and WHERE
 * (location, link endpoints, merchant) carry the emphasis, the tile level
 * demotes to a dim roman numeral, and prices stay plain. Unmatched
 * headlines come back as one plain span.
 */
export function decorateMain(main: string, kind: JournalKind): MainSpan[] {
  if (kind === 'build') {
    const m = /^(built )([a-z]+) Level (\d+)( at )(\w+)( .*)?$/.exec(main)
    if (m) {
      const spans: MainSpan[] = [
        { text: m[1]!, role: 'text' },
        { text: capitalize(m[2]!), role: 'industry' },
        { text: ` (${romanLevel(Number(m[3]!))})`, role: 'level' },
        { text: m[4]!, role: 'text' },
        { text: m[5]!, role: 'place' },
      ]
      if (m[6]) spans.push({ text: m[6], role: 'text' })
      return spans
    }
  }
  if (kind === 'network') {
    const single =
      /^(built a (?:canal|rail) link between )(\w+)( and )(\w+)$/.exec(main)
    if (single) {
      return [
        { text: single[1]!, role: 'text' },
        { text: single[2]!, role: 'place' },
        { text: single[3]!, role: 'text' },
        { text: single[4]!, role: 'place' },
      ]
    }
    const double = /^(built 2 rail links \()([^)]+)(\).*)$/.exec(main)
    if (double) {
      return [
        { text: double[1]!, role: 'text' },
        { text: double[2]!, role: 'place' },
        { text: double[3]!, role: 'text' },
      ]
    }
  }
  if (kind === 'sell') {
    const m = /^(sold )([a-z]+)( at )(\w+)( to merchant at )(\w+)$/.exec(main)
    if (m) {
      return [
        { text: m[1]!, role: 'text' },
        { text: capitalize(m[2]!), role: 'industry' },
        { text: m[3]!, role: 'text' },
        { text: m[4]!, role: 'place' },
        { text: m[5]!, role: 'text' },
        { text: m[6]!, role: 'place' },
      ]
    }
  }
  if (kind === 'flip') {
    const m = /^('s )([a-z]+)( at )(\w+)( flipped.*)$/.exec(main)
    if (m) {
      return [
        { text: m[1]!, role: 'text' },
        { text: capitalize(m[2]!), role: 'industry' },
        { text: m[3]!, role: 'text' },
        { text: m[4]!, role: 'place' },
        { text: m[5]!, role: 'text' },
      ]
    }
  }
  return [{ text: main, role: 'text' }]
}

// Whole-word city/merchant ids → their display names ("stoke" →
// "Stoke-on-Trent"). Longest id first so no prefix can shadow a longer one;
// card ids like "stafford_1" stay untouched (the underscore breaks \b).
const CITY_ID_RE = new RegExp(
  `\\b(${Object.keys(cities)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g',
)

export interface PlaceSegment {
  text: string
  /** Board id when this segment is a city/merchant name; null = plain text. */
  cityId: string | null
}

/**
 * Split raw engine text into plain runs and recognised place names, each
 * place carrying its board id (so the UI can wire hover-to-locate from
 * structured data instead of re-parsing display names). Resolution is by
 * whole-word city ID — the form the engine logs — never by display name.
 */
export function segmentPlaces(text: string): PlaceSegment[] {
  const segments: PlaceSegment[] = []
  let last = 0
  // Fresh regex per call: matchAll seeds from the source regex's lastIndex.
  for (const m of text.matchAll(new RegExp(CITY_ID_RE.source, 'g'))) {
    const at = m.index ?? 0
    if (at > last) segments.push({ text: text.slice(last, at), cityId: null })
    const id = m[0] as keyof typeof cities
    segments.push({ text: cities[id].name, cityId: id })
    last = at + m[0].length
  }
  if (last < text.length)
    segments.push({ text: text.slice(last), cityId: null })
  return segments
}

export function prettifyPlaces(text: string): string {
  return segmentPlaces(text)
    .map((s) => s.text)
    .join('')
}

/* ---------------- entry parser ---------------- */

export function parseJournalEntry(
  entry: LogEntry,
  players: PlayerRef[],
): JournalItem {
  const { message, type } = entry

  if (type === 'system') {
    const system = parseSystemEntry(message)
    if (system) return system
  }
  if (type === 'error') {
    return {
      kind: 'error',
      type,
      actor: null,
      main: message,
      details: [],
      chips: [],
    }
  }

  const { actor, rest } = extractActor(message, players)
  const { head, card } = splitUsing(rest)

  let main = ''
  const chips: JournalChip[] = []
  const details: string[] = []

  for (const segment of topLevelSegments(head)) {
    if (segment.kind === 'text') {
      main += segment.text
      continue
    }
    if (INLINE_GROUP.test(segment.text)) {
      main += `(${segment.text})`
      continue
    }
    const pieces = splitTopLevelCommas(segment.text)
    const leftover: string[] = []
    let anyChip = false
    for (const piece of pieces) {
      const chip = chipFor(piece)
      if (chip) {
        chips.push(chip)
        anyChip = true
      } else {
        leftover.push(piece)
      }
    }
    if (leftover.length > 0) {
      // An untouched group stays verbatim; a group that lost chip pieces
      // keeps the remainder together as one demoted fragment.
      details.push(anyChip ? leftover.join(', ') : segment.text)
    }
  }
  if (card) details.push(card)

  main = main.replace(/\s{2,}/g, ' ').trim()
  const kind = classify(main, type)

  return { kind, type, actor, main, details, chips }
}
