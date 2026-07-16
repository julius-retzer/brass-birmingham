import { describe, expect, test } from 'vitest'
import type { Player, VpAward } from '~/store/gameStore'
import { annotationsFor, buildBreakdown } from './vp-breakdown'

const player = (vpAwards: VpAward[], victoryPoints?: number) =>
  ({
    id: '1',
    name: 'P1',
    victoryPoints: victoryPoints ?? vpAwards.reduce((t, a) => t + a.vp, 0),
    vpAwards,
  }) as Player

const industry = (vp: number): VpAward => ({
  source: 'industry',
  era: 'canal',
  vp,
  location: 'worcester',
  industryType: 'cotton',
  level: 2,
})

const link = (vp: number): VpAward => ({
  source: 'link',
  era: 'canal',
  vp,
  link: { from: 'worcester', to: 'gloucester', type: 'canal' },
})

describe('buildBreakdown', () => {
  test('groups awards into sections whose subtotals sum to the score', () => {
    const b = buildBreakdown(
      player([
        industry(5),
        industry(5),
        link(3),
        { source: 'merchantBonus', era: 'rail', vp: 4, location: 'shrewsbury' },
        { source: 'incomeShortfall', era: 'rail', vp: -2 },
      ]),
    )

    expect(b.sections.map((s) => s.source)).toEqual([
      'industry',
      'link',
      'merchantBonus',
      'incomeShortfall',
    ])
    expect(b.sections[0]!.subtotal).toBe(10)
    expect(b.sections[1]!.subtotal).toBe(3)
    expect(b.sections[3]!.subtotal).toBe(-2)
    expect(b.total).toBe(15)
    expect(b.reconciles).toBe(true)
  })

  test('labels lines with a readable industry, level and place', () => {
    const b = buildBreakdown(player([industry(5), link(3)]))
    expect(b.sections[0]!.lines[0]).toMatchObject({
      label: 'Cotton Mill II',
      detail: 'Worcester',
    })
    expect(b.sections[1]!.lines[0]).toMatchObject({
      label: 'Canal link',
      detail: 'Worcester – Gloucester',
    })
  })

  test('omits sections with no awards', () => {
    const b = buildBreakdown(player([industry(5)]))
    expect(b.sections).toHaveLength(1)
  })

  test('flags a ledger that disagrees with the scoreboard', () => {
    // A scoring bug must surface, not be papered over.
    const b = buildBreakdown(player([industry(5)], 99))
    expect(b.reconciles).toBe(false)
    expect(b.total).toBe(5)
    expect(b.scoreboardTotal).toBe(99)
  })

  test('an empty ledger reconciles to zero', () => {
    const b = buildBreakdown(player([]))
    expect(b.sections).toEqual([])
    expect(b.reconciles).toBe(true)
  })
})

describe('annotationsFor', () => {
  test('totals VP per city and per link, keyed both directions', () => {
    const a = annotationsFor(player([industry(5), industry(5), link(3)]))
    expect(a.cities.get('worcester')).toBe(10)
    expect(a.links.get('worcester|gloucester')).toBe(3)
    expect(a.links.get('gloucester|worcester')).toBe(3)
  })

  test('drops zero-VP awards so the map shows no empty badges', () => {
    const a = annotationsFor(player([link(0), industry(0)]))
    expect(a.links.size).toBe(0)
    expect(a.cities.size).toBe(0)
  })

  test('merchant bonuses annotate their merchant location', () => {
    const a = annotationsFor(
      player([
        { source: 'merchantBonus', era: 'rail', vp: 4, location: 'shrewsbury' },
      ]),
    )
    expect(a.cities.get('shrewsbury')).toBe(4)
  })
})
