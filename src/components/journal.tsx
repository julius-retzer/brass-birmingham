'use client'

// The journal panel: a skimmable, structured ledger of the game log.
// Parsing lives in journal-model.ts (pure, unit-tested); this file only
// typesets the parsed items — icon per action kind, actor-coloured rail,
// hoisted highlight chips, demoted consumption detail, and real dividers
// at round/era boundaries.
import { type LogEntry, type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'
import {
  BuildIcon,
  DevelopIcon,
  IncomeIcon,
  LaurelIcon,
  LoanIcon,
  NetworkIcon,
  PassIcon,
  PoundIcon,
  ScoutIcon,
  SellIcon,
} from './icons'
import {
  type JournalItem,
  type JournalKind,
  type PlayerRef,
  parseJournalEntry,
} from './journal-model'
import { CollapsiblePanel } from './side-panels'

const KIND_ICONS: Partial<Record<JournalKind, React.ReactNode>> = {
  build: <BuildIcon size={12} />,
  network: <NetworkIcon size={12} />,
  sell: <SellIcon size={12} />,
  develop: <DevelopIcon size={12} />,
  loan: <LoanIcon size={12} />,
  scout: <ScoutIcon size={12} />,
  pass: <PassIcon size={12} />,
  income: <PoundIcon size={12} />,
  flip: <IncomeIcon size={12} />,
  score: <LaurelIcon size={12} />,
}

// Amounts (£, income, VP, levels, resources) get bold parchment inside the
// headline so a scanning eye catches the numbers.
const AMOUNT_RE =
  /£\d+|[+-]\d+ income|\d+ (?:VP|income levels?|beers?|coal|iron|cards?|wilds?|spaces?|industries)|Level \d+|VPs?\b/g

function emphasizeAmounts(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let key = 0
  let last = 0
  for (const m of text.matchAll(AMOUNT_RE)) {
    if (m.index! > last) nodes.push(text.slice(last, m.index))
    nodes.push(
      <b key={key++} style={{ color: 'var(--bb-parchment-bright)' }}>
        {m[0]}
      </b>,
    )
    last = m.index! + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function JournalDivider({ item }: { item: JournalItem }) {
  return (
    <div
      className="bb2-jdivider"
      data-testid="journal-entry"
      data-type={item.type}
      data-kind={item.kind}
    >
      <span className="bb2-jdivlabel">{item.divider}</span>
    </div>
  )
}

function JournalRow({ item }: { item: JournalItem }) {
  const accent = item.actor ? PLAYER_FILL[item.actor.color] : undefined
  return (
    <div
      className="bb2-jrow"
      data-testid="journal-entry"
      data-type={item.type}
      data-kind={item.kind}
      style={
        accent ? ({ '--bb-jaccent': accent } as React.CSSProperties) : undefined
      }
    >
      <span className="bb2-jicon" data-kind={item.kind} aria-hidden>
        {KIND_ICONS[item.kind] ?? <span className="bb2-jdot" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="bb2-jmain">
          {item.actor && (
            <b
              className="bb2-jactor"
              style={{ color: PLAYER_FILL[item.actor.color] }}
            >
              {item.actor.name}
            </b>
          )}
          {/* No space before a possessive ("George's cotton…") */}
          {item.actor && !item.main.startsWith("'") && ' '}
          {emphasizeAmounts(item.main)}
          {item.chips.map((chip, i) => (
            <span key={i}>
              {' '}
              <span className="bb2-jchip" data-tone={chip.tone}>
                {chip.text}
              </span>
            </span>
          ))}
        </div>
        {item.details.length > 0 && (
          <div className="bb2-jdetail">
            {/* Leading space keeps the row's textContent word-separated
                across the line break (copy/paste, text-matching tests). */}
            {' '}
            {/* Merchant bonuses and mid-action tile flips stay demoted but
                glow warmer so they still catch a scanning eye. */}
            {item.details.map((detail, i) => (
              <span
                key={i}
                data-hot={
                  /money \+\d+/.test(detail) ||
                  / flipped/.test(detail) ||
                  undefined
                }
              >
                {i > 0 && <span className="bb2-jdetail-sep"> · </span>}
                {detail}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function JournalPanel({
  logs,
  players = [],
}: {
  logs: LogEntry[]
  players?: PlayerRef[]
}) {
  const recent = logs
    .slice(-60)
    .map((entry) => parseJournalEntry(entry, players))
    .reverse()
  return (
    <CollapsiblePanel
      title="Journal"
      testId="journal-toggle"
      // A floor, so a tall dock can't squeeze the journal to nothing — the
      // aside overflows and scrolls instead. Collapsed it is only its header,
      // so it must not claim the space then.
      openClassName="min-h-[220px] flex-1"
    >
      <div className="bb2-journal min-h-0 flex-1 overflow-y-auto pr-1">
        {recent.map((item, i) =>
          item.divider ? (
            <JournalDivider key={i} item={item} />
          ) : (
            <JournalRow key={i} item={item} />
          ),
        )}
        {recent.length === 0 && (
          <p className="text-[12px]" style={{ color: 'rgba(231,215,177,.4)' }}>
            The journal is empty.
          </p>
        )}
      </div>
    </CollapsiblePanel>
  )
}
