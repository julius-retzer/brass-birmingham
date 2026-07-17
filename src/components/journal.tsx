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
  decorateMain,
  parseJournalEntry,
  segmentPlaces,
} from './journal-model'
import { CityName } from './locate'
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

// Income and VP amounts get bold parchment inside the headline. Prices and
// tile levels are deliberately NOT here — the WHAT (industry) and WHERE
// (place) carry the emphasis via decorateMain; cost is secondary.
const AMOUNT_RE =
  /[+-]\d+ income|\d+ (?:VP|income levels?|beers?|coal|iron|cards?|wilds?|spaces?|industries)|VPs?\b/g

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

/**
 * Raw engine text with each recognised game entity styled: city/merchant names
 * as hover-to-locate CityName (display name + dotted underline + map spotlight),
 * and industry/card-type names as the same bold parchment highlight cities get.
 * Replaces the plain prettifyPlaces() at render time — same words, now styled.
 */
function Places({
  text,
  emphasize = false,
}: {
  text: string
  emphasize?: boolean
}) {
  return (
    <>
      {segmentPlaces(text).map((seg, i) =>
        seg.cityId ? (
          <CityName key={i} cityId={seg.cityId}>
            {seg.text}
          </CityName>
        ) : seg.industry ? (
          <b key={i} className="bb2-jind">
            {seg.text}
          </b>
        ) : (
          <span key={i}>
            {emphasize ? emphasizeAmounts(seg.text) : seg.text}
          </span>
        ),
      )}
    </>
  )
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
          {decorateMain(item.main, item.kind).map((span, i) =>
            span.role === 'industry' ? (
              <b key={i} className="bb2-jind">
                {span.text}
              </b>
            ) : span.role === 'place' ? (
              <b key={i} className="bb2-jind">
                <Places text={span.text} />
              </b>
            ) : span.role === 'level' ? (
              <span key={i} className="bb2-jlevel">
                {span.text}
              </span>
            ) : (
              <span key={i}>
                <Places text={span.text} emphasize />
              </span>
            ),
          )}
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
                across the line break (copy/paste, text-matching tests). */}{' '}
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
                <Places text={detail} />
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
