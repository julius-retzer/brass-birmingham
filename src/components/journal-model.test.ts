import { describe, expect, test } from 'vitest'
import type { LogEntry, LogEntryType } from '~/store/gameStore'
import { type PlayerRef, parseJournalEntry } from './journal-model'

const players: PlayerRef[] = [
  { name: 'George', color: 'red' },
  { name: 'Isambard', color: 'blue' },
  { name: 'Eliza', color: 'green' },
  { name: 'Ada', color: 'yellow' },
]

const entry = (message: string, type: LogEntryType = 'action'): LogEntry => ({
  message,
  type,
  timestamp: new Date('2026-07-17T12:00:00Z'),
})

const parse = (message: string, type: LogEntryType = 'action') =>
  parseJournalEntry(entry(message, type), players)

describe('actor extraction', () => {
  test('attributes the entry to the leading player name', () => {
    const item = parse('George passed (discarded stafford (other))')
    expect(item.actor).toEqual({ name: 'George', color: 'red' })
    expect(item.main).toBe('passed')
  })

  test('longest name wins so a prefix player cannot shadow a longer one', () => {
    const withPrefix: PlayerRef[] = [
      { name: 'George', color: 'red' },
      { name: 'Georgeanne', color: 'blue' },
    ]
    const item = parseJournalEntry(
      entry('Georgeanne passed (discarded stafford (other))'),
      withPrefix,
    )
    expect(item.actor).toEqual({ name: 'Georgeanne', color: 'blue' })
  })

  test('a name mid-message does not become the actor', () => {
    const item = parse('Round 3 completed', 'system')
    expect(item.actor).toBeNull()
  })

  test("possessive actor keeps the 's in the main clause", () => {
    const item = parse(
      "George's cotton at coventry flipped (income +2, now 5)",
      'info',
    )
    expect(item.actor).toEqual({ name: 'George', color: 'red' })
    expect(item.main).toBe("'s cotton at coventry flipped")
  })
})

describe('build entries', () => {
  test('a fully-loaded build keeps the headline and demotes consumption', () => {
    const item = parse(
      'George built iron Level 1 at dudley for £5 (consumed 1 coal from connected coal mine (free)) (sold 2 iron to market for £6, sold 2 iron to market for £4) (tile flipped, +3 income) (overbuilt own level 1) using coventry (other)',
    )
    expect(item.kind).toBe('build')
    expect(item.main).toBe('built iron Level 1 at dudley for £5')
    expect(item.chips).toEqual([
      { text: 'flipped', tone: 'flip' },
      { text: '+3 income', tone: 'income' },
      { text: 'overbuilt own level 1', tone: 'neutral' },
    ])
    expect(item.details).toEqual([
      'consumed 1 coal from connected coal mine (free)',
      'sold 2 iron to market for £6, sold 2 iron to market for £4',
      'using coventry (other)',
    ])
  })

  test('a plain build has no chips and only the card detail', () => {
    const item = parse(
      'Eliza built brewery Level 1 at derby for £5 using derby (other)',
    )
    expect(item.kind).toBe('build')
    expect(item.main).toBe('built brewery Level 1 at derby for £5')
    expect(item.chips).toEqual([])
    expect(item.details).toEqual(['using derby (other)'])
  })
})

describe('network entries', () => {
  test('a canal link is all headline', () => {
    const item = parse('George built a canal link between dudley and walsall')
    expect(item.kind).toBe('network')
    expect(item.main).toBe('built a canal link between dudley and walsall')
    expect(item.details).toEqual([])
  })

  test('a rail link demotes its coal consumption', () => {
    const item = parse(
      'George built a rail link between dudley and walsall (consumed 1 coal from market for £3)',
    )
    expect(item.kind).toBe('network')
    expect(item.main).toBe('built a rail link between dudley and walsall')
    expect(item.details).toEqual(['consumed 1 coal from market for £3'])
  })

  test('a double rail keeps the route list and prices inline', () => {
    const item = parse(
      'George built 2 rail links (dudley-walsall, walsall-tamworth) for £15 + beer + 2 coal (£4) (1 coal from connected coal mine (free), consumed 1 coal from market for £4)',
    )
    expect(item.kind).toBe('network')
    expect(item.main).toBe(
      'built 2 rail links (dudley-walsall, walsall-tamworth) for £15 + beer + 2 coal (£4)',
    )
    expect(item.details).toEqual([
      '1 coal from connected coal mine (free), consumed 1 coal from market for £4',
    ])
  })
})

describe('sell entries', () => {
  test('a sale hoists flip and income into chips, keeps beer verbatim', () => {
    const item = parse(
      'George sold cotton at coventry to merchant at oxford (flipped, income +2, 1 beer from merchant at warrington (money +5))',
    )
    expect(item.kind).toBe('sell')
    expect(item.main).toBe('sold cotton at coventry to merchant at oxford')
    expect(item.chips).toEqual([
      { text: 'flipped', tone: 'flip' },
      { text: '+2 income', tone: 'income' },
    ])
    expect(item.details).toEqual([
      '1 beer from merchant at warrington (money +5)',
    ])
  })

  test('the completed-sell summary carries its count as a chip', () => {
    const item = parse(
      'George completed Sell action (2 industries sold) using cotton industry',
    )
    expect(item.kind).toBe('sell')
    expect(item.main).toBe('completed Sell action')
    expect(item.chips).toEqual([{ text: '2 industries sold', tone: 'neutral' }])
    expect(item.details).toEqual(['using cotton industry'])
  })
})

describe('other actions', () => {
  test('a loan surfaces amount and penalty as chips', () => {
    const item = parse('Ada took a loan (£30, -3 income) using stafford_1')
    expect(item.kind).toBe('loan')
    expect(item.main).toBe('took a loan')
    expect(item.chips).toEqual([
      { text: '£30', tone: 'money' },
      { text: '−3 income', tone: 'penalty' },
    ])
    expect(item.details).toEqual(['using stafford_1'])
  })

  test('develop promotes the tile count, demotes the iron', () => {
    const item = parse(
      'George developed (removed 2 tiles, 2 iron from iron works (free)) using tamworth (other)',
    )
    expect(item.kind).toBe('develop')
    expect(item.main).toBe('developed')
    expect(item.chips).toEqual([{ text: 'removed 2 tiles', tone: 'neutral' }])
    expect(item.details).toEqual([
      '2 iron from iron works (free)',
      'using tamworth (other)',
    ])
  })

  test('scout keeps the wild gain visible as a chip', () => {
    const item = parse(
      'George scouted (discarded 3 cards, gained 2 wild cards)',
    )
    expect(item.kind).toBe('scout')
    expect(item.chips).toEqual([
      { text: 'gained 2 wild cards', tone: 'neutral' },
    ])
    expect(item.details).toEqual(['discarded 3 cards'])
  })

  test('pass is a quiet one-liner', () => {
    const item = parse('George passed (discarded iron industry)')
    expect(item.kind).toBe('pass')
    expect(item.main).toBe('passed')
    expect(item.details).toEqual(['discarded iron industry'])
  })
})

describe('settlement and scoring', () => {
  test('collected income', () => {
    const item = parse('George collected £6 income', 'info')
    expect(item.kind).toBe('income')
    expect(item.main).toBe('collected £6 income')
  })

  test('paid negative income with shortfall chip', () => {
    const item = parse('George paid £6 negative income (shortfall: £3)', 'info')
    expect(item.kind).toBe('income')
    expect(item.chips).toEqual([{ text: 'shortfall: £3', tone: 'penalty' }])
  })

  test('a forced tile sale during settlement is income noise, not a sell', () => {
    const item = parse('George sold cotton industry for £4', 'info')
    expect(item.kind).toBe('income')
  })

  test('a tile flip is its own highlighted kind', () => {
    const item = parse(
      "George's cotton at coventry flipped (income +2, now 5)",
      'info',
    )
    expect(item.kind).toBe('flip')
    expect(item.chips).toEqual([{ text: '+2 income', tone: 'income' }])
    expect(item.details).toEqual(['now 5'])
  })

  test('era scoring lines are score entries', () => {
    const item = parse('George scored 12 VPs from link tiles', 'info')
    expect(item.kind).toBe('score')
    expect(item.main).toBe('scored 12 VPs from link tiles')
  })

  test('a VP loss is a score entry too', () => {
    const item = parse('George lost 3 VP due to income shortfall', 'info')
    expect(item.kind).toBe('score')
  })
})

describe('system entries and dividers', () => {
  test('round completion becomes a round divider', () => {
    const item = parse('Round 4 completed', 'system')
    expect(item.kind).toBe('round')
    expect(item.divider).toBe('Round 4 completed')
  })

  test('era boundaries become era dividers with verbatim labels', () => {
    for (const message of [
      'Game started',
      'Canal Era ended',
      'Rail Era started',
      'Rail Era ended',
      'End of canal era scoring',
      'Game Over! Final scores calculated.',
    ]) {
      const item = parse(message, 'system')
      expect(item.kind).toBe('era')
      expect(item.divider).toBe(message)
    }
  })

  test('the winner banner stays an entry with the actor coloured', () => {
    const item = parse('George wins with 30 VPs!', 'system')
    expect(item.kind).toBe('system')
    expect(item.divider).toBeUndefined()
    expect(item.actor).toEqual({ name: 'George', color: 'red' })
    expect(item.main).toBe('wins with 30 VPs!')
  })

  test('era-end detection stays a plain system entry', () => {
    const item = parse(
      'Era end detected: draw deck and all hands exhausted',
      'system',
    )
    expect(item.kind).toBe('system')
    expect(item.divider).toBeUndefined()
  })
})

describe('errors and fallbacks', () => {
  test('errors pass through verbatim', () => {
    const item = parse('Cannot sell: no beer available', 'error')
    expect(item.kind).toBe('error')
    expect(item.main).toBe('Cannot sell: no beer available')
    expect(item.details).toEqual([])
  })

  test('an unrecognised message never loses text', () => {
    const item = parse('George conjured something novel (with a twist)', 'info')
    expect(item.actor).toEqual({ name: 'George', color: 'red' })
    expect(item.main).toBe('conjured something novel')
    expect(item.details).toEqual(['with a twist'])
    expect(item.kind).toBe('info')
  })

  test('no players still parses without an actor', () => {
    const item = parseJournalEntry(entry('George passed'), [])
    expect(item.actor).toBeNull()
    expect(item.main).toBe('George passed')
  })
})
