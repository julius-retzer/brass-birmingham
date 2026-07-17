import { describe, expect, test } from 'vitest'
import type { LogEntry, LogEntryType } from '~/store/gameStore'
import {
  type PlayerRef,
  decorateMain,
  parseJournalEntry,
  prettifyPlaces,
  romanLevel,
  segmentPlaces,
} from './journal-model'

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
    const item = parse('Ada took a loan (£30, -3 income) using stafford (blue)')
    expect(item.kind).toBe('loan')
    expect(item.main).toBe('took a loan')
    expect(item.chips).toEqual([
      { text: '£30', tone: 'money' },
      { text: '−3 income', tone: 'penalty' },
    ])
    expect(item.details).toEqual(['using stafford (blue)'])
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

describe('headline decoration', () => {
  test('a build bolds the industry and site, dims the level to a roman numeral', () => {
    expect(
      decorateMain('built coal Level 2 at dudley for £5', 'build'),
    ).toEqual([
      { text: 'built ', role: 'text' },
      { text: 'Coal', role: 'industry' },
      { text: ' (II)', role: 'level' },
      { text: ' at ', role: 'text' },
      { text: 'dudley', role: 'place' },
      { text: ' for £5', role: 'text' },
    ])
  })

  test('a sale bolds the industry, its city and the merchant', () => {
    expect(
      decorateMain('sold cotton at coventry to merchant at oxford', 'sell'),
    ).toEqual([
      { text: 'sold ', role: 'text' },
      { text: 'Cotton', role: 'industry' },
      { text: ' at ', role: 'text' },
      { text: 'coventry', role: 'place' },
      { text: ' to merchant at ', role: 'text' },
      { text: 'oxford', role: 'place' },
    ])
  })

  test('a flip bolds the industry that flipped and where', () => {
    expect(decorateMain("'s cotton at coventry flipped", 'flip')).toEqual([
      { text: "'s ", role: 'text' },
      { text: 'Cotton', role: 'industry' },
      { text: ' at ', role: 'text' },
      { text: 'coventry', role: 'place' },
      { text: ' flipped', role: 'text' },
    ])
  })

  test('a link bolds both endpoints', () => {
    expect(
      decorateMain('built a canal link between dudley and walsall', 'network'),
    ).toEqual([
      { text: 'built a canal link between ', role: 'text' },
      { text: 'dudley', role: 'place' },
      { text: ' and ', role: 'text' },
      { text: 'walsall', role: 'place' },
    ])
  })

  test('a double link bolds its route list', () => {
    expect(
      decorateMain(
        'built 2 rail links (dudley-walsall, walsall-tamworth) for £15 + beer + 2 coal (£4)',
        'network',
      ),
    ).toEqual([
      { text: 'built 2 rail links (', role: 'text' },
      { text: 'dudley-walsall, walsall-tamworth', role: 'place' },
      { text: ') for £15 + beer + 2 coal (£4)', role: 'text' },
    ])
  })

  test('unmatched headlines stay a single text span', () => {
    expect(decorateMain('took a loan', 'loan')).toEqual([
      { text: 'took a loan', role: 'text' },
    ])
  })

  test('roman numerals cover every tile level', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(romanLevel)).toEqual([
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
    ])
    expect(romanLevel(99)).toBe('99') // out of range falls back to digits
  })
})

describe('place-name prettifying', () => {
  test('whole-word city ids become their display names', () => {
    expect(
      prettifyPlaces('built a canal link between dudley and walsall'),
    ).toBe('built a canal link between Dudley and Walsall')
    expect(prettifyPlaces('at stoke for £5')).toBe('at Stoke-on-Trent for £5')
    expect(prettifyPlaces('at burton for £6')).toBe(
      'at Burton upon Trent for £6',
    )
  })

  test('raw card/slot ids resolve to human names', () => {
    // The regression: a bare location-card slot id must never render raw.
    expect(prettifyPlaces('using coventry_1')).toBe('using Coventry')
    expect(prettifyPlaces('using stafford_1')).toBe('using Stafford')
    // Same class of leak for the other card families.
    expect(prettifyPlaces('using iron_4')).toBe('using iron industry')
    expect(prettifyPlaces('using cotton_manufacturer_6')).toBe(
      'using cotton/manufacturer industry',
    )
    expect(prettifyPlaces('using wild_location_2')).toBe('using wild location')
    expect(prettifyPlaces('coalbrookdale')).toBe('Coalbrookdale')
  })

  test('route lists prettify each end', () => {
    expect(prettifyPlaces('(dudley-walsall, walsall-tamworth)')).toBe(
      '(Dudley-Walsall, Walsall-Tamworth)',
    )
  })

  test('merchant mentions in demoted details prettify too', () => {
    expect(
      prettifyPlaces('1 beer from merchant at warrington (money +5)'),
    ).toBe('1 beer from merchant at Warrington (money +5)')
  })
})

describe('place segmentation (hover-to-locate)', () => {
  test('each recognised place carries its board id, plain runs carry null', () => {
    expect(segmentPlaces('built cotton Level 1 at stoke')).toEqual([
      { text: 'built cotton Level 1 at ', cityId: null },
      { text: 'Stoke-on-Trent', cityId: 'stoke' },
    ])
  })

  test('route lists yield one segment per endpoint', () => {
    expect(segmentPlaces('dudley-walsall, walsall-tamworth')).toEqual([
      { text: 'Dudley', cityId: 'dudley' },
      { text: '-', cityId: null },
      { text: 'Walsall', cityId: 'walsall' },
      { text: ', ', cityId: null },
      { text: 'Walsall', cityId: 'walsall' },
      { text: '-', cityId: null },
      { text: 'Tamworth', cityId: 'tamworth' },
    ])
  })

  test('merchant and farm-brewery locations resolve like any city', () => {
    expect(segmentPlaces('to merchant at warrington')).toEqual([
      { text: 'to merchant at ', cityId: null },
      { text: 'Warrington', cityId: 'warrington' },
    ])
    expect(segmentPlaces('beer at farmBrewery1')).toEqual([
      { text: 'beer at ', cityId: null },
      { text: 'Farm Brewery', cityId: 'farmBrewery1' },
    ])
  })

  test('card ids and city-free text come back as one plain segment', () => {
    expect(segmentPlaces('using stafford_1')).toEqual([
      { text: 'using stafford_1', cityId: null },
    ])
    expect(segmentPlaces('took a loan')).toEqual([
      { text: 'took a loan', cityId: null },
    ])
  })

  test('prettifyPlaces is exactly the joined segment text', () => {
    const raw = 'sold cotton at leek to merchant at warrington'
    expect(prettifyPlaces(raw)).toBe(
      segmentPlaces(raw)
        .map((s) => s.text)
        .join(''),
    )
  })
})
