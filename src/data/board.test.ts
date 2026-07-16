// Pinning tests for the board graph, audited 2026-07-15 against the
// retail game board (official Roxley production component, BGG image
// 4231616, archived as ai-docs/reference/board-retail-day-bgg4231616.jpg)
// and corroborated 100% by the independent TTS-derived transcription in
// npow/brass-brno (js/gameData.js CONNECTIONS).
//
// The audit found NO deviations — these pins freeze the verified state.
// Do not change a slot or connection without re-verifying against the
// component photo.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from '../store/gameStore'
import {
  FARM_BREWERIES,
  cities,
  cityIndustrySlots,
  connections,
  linkConnectedLocations,
} from './board'

const key = (a: string, b: string) => [a, b].sort().join('|')

describe('board graph — pinned to the retail board', () => {
  it('has the 20 named cities, 2 farm breweries and 5 merchants', () => {
    const names = Object.entries(cities)
    expect(names.filter(([, c]) => c.type === 'city')).toHaveLength(22)
    expect(names.filter(([, c]) => c.type === 'merchant')).toHaveLength(5)
    expect([...FARM_BREWERIES].sort()).toStrictEqual([
      'farmBrewery1',
      'farmBrewery2',
    ])
  })

  it('city industry slots match the printed board exactly', () => {
    expect(cityIndustrySlots).toStrictEqual({
      brno: [
        ['cotton', 'manufacturer'],
        ['manufacturer'],
        ['iron'],
        ['manufacturer'],
      ],
      znojmo: [
        ['pottery'],
        ['manufacturer', 'coal'],
        ['iron', 'manufacturer'],
      ],
      olomouc: [
        ['manufacturer', 'brewery'],
        ['cotton', 'coal'],
      ],
      bratislava: [['manufacturer', 'coal'], ['iron']],
      novyjicin: [['manufacturer'], ['manufacturer', 'coal']],
      ostrava: [['iron', 'brewery'], ['iron'], ['coal']],
      karvina: [['coal'], ['iron']],
      frydekmistek: [['cotton', 'coal'], ['cotton']],
      zilina: [['cotton'], ['cotton']],
      jihlava: [['manufacturer', 'brewery'], ['pottery']],
      prerov: [['manufacturer', 'coal'], ['brewery']],
      rosice: [['manufacturer', 'coal'], ['coal']],
      prostejov: [
        ['cotton', 'coal'],
        ['cotton', 'coal'],
      ],
      blansko: [
        ['iron', 'manufacturer'],
        ['manufacturer', 'brewery'],
      ],
      liberec: [
        ['cotton', 'manufacturer'],
        ['cotton', 'coal'],
      ],
      teplice: [
        ['cotton', 'manufacturer'],
        ['pottery', 'iron'],
        ['manufacturer'],
      ],
      pardubice: [
        ['cotton', 'brewery'],
        ['manufacturer', 'coal'],
      ],
      sumperk: [
        ['manufacturer', 'brewery'],
        ['cotton', 'brewery'],
      ],
      tesin: [['cotton', 'manufacturer'], ['coal'], ['pottery']],
      bielsko: [['cotton', 'brewery'], ['cotton', 'manufacturer'], ['iron']],
      farmBrewery1: [['brewery']],
      farmBrewery2: [['brewery']],
      prague: [],
      budapest: [],
      vienna: [],
      lemberg: [],
      krakow: [],
    })
  })

  it('has exactly the 39 printed corridors with their era types', () => {
    const got = new Map(
      connections.map((c) => [
        key(c.from, c.to),
        [...c.types].sort().join('+'),
      ]),
    )
    expect(got.size).toBe(39)

    const RAIL_ONLY: Array<[string, string]> = [
      ['tesin', 'liberec'],
      ['bielsko', 'sumperk'],
      ['pardubice', 'sumperk'],
      ['prerov', 'rosice'],
      ['prostejov', 'blansko'],
      ['brno', 'olomouc'],
      ['brno', 'bratislava'],
      ['znojmo', 'olomouc'],
    ]
    const CANAL_ONLY: Array<[string, string]> = [['prerov', 'blansko']]

    for (const [a, b] of RAIL_ONLY) {
      expect(got.get(key(a, b)), `${a}|${b}`).toBe('rail')
    }
    for (const [a, b] of CANAL_ONLY) {
      expect(got.get(key(a, b)), `${a}|${b}`).toBe('canal')
    }
    // every other corridor carries both eras
    const asymmetric = new Set(
      [...RAIL_ONLY, ...CANAL_ONLY].map(([a, b]) => key(a, b)),
    )
    for (const [k, types] of got) {
      if (!asymmetric.has(k)) expect(types, k).toBe('canal+rail')
    }
  })

  it('the farm-brewery spur and 3-way link are modelled (rules p.5)', () => {
    expect(
      connections.find(
        (c) => key(c.from, c.to) === key('rosice', 'farmBrewery1'),
      )?.types,
    ).toStrictEqual(['canal', 'rail'])
    // the southern farm brewery has NO corridor of its own…
    expect(
      connections.some(
        (c) =>
          (c.from as string) === 'farmBrewery2' ||
          (c.to as string) === 'farmBrewery2',
      ),
    ).toBe(false)
    // …the frydekmistek—zilina tile connects it instead
    expect(linkConnectedLocations('frydekmistek', 'zilina')).toStrictEqual([
      'frydekmistek',
      'zilina',
      'farmBrewery2',
    ])
  })
})

describe('merchants — pinned to the retail board', () => {
  const merchantsFor = (playerCount: number) => {
    const players = ['Ada', 'Brunel', 'Cort', 'Darby']
      .slice(0, playerCount)
      .map((name, i) => ({
        id: String(i + 1),
        name,
        color: (['red', 'blue', 'green', 'yellow'] as const)[i],
        character: name,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {},
      }))
    const actor = createActor(gameStore)
    actor.start()
    actor.send({ type: 'START_GAME', players } as never)
    const merchants = (
      actor.getSnapshot() as unknown as {
        context: {
          merchants: Array<{
            location: string
            bonusType: string
            bonusValue: number
          }>
        }
      }
    ).context.merchants
    actor.stop()
    return merchants
  }

  it('merchant spaces by player count match the printed player marks', () => {
    expect(
      merchantsFor(2)
        .map((m) => m.location)
        .sort(),
    ).toStrictEqual(
      ['budapest', 'budapest', 'vienna', 'vienna', 'krakow'].sort(),
    )
    expect(
      merchantsFor(3)
        .map((m) => m.location)
        .sort(),
    ).toStrictEqual(
      [
        'budapest',
        'budapest',
        'vienna',
        'vienna',
        'krakow',
        'prague',
        'prague',
      ].sort(),
    )
    expect(
      merchantsFor(4)
        .map((m) => m.location)
        .sort(),
    ).toStrictEqual(
      [
        'budapest',
        'budapest',
        'lemberg',
        'lemberg',
        'vienna',
        'vienna',
        'krakow',
        'prague',
        'prague',
      ].sort(),
    )
  })

  it('merchant beer bonuses match the printed board', () => {
    const byLocation = new Map(
      merchantsFor(4).map((m) => [
        m.location,
        `${m.bonusType}:${m.bonusValue}`,
      ]),
    )
    expect(byLocation.get('prague')).toBe('money:5')
    expect(byLocation.get('budapest')).toBe('develop:1')
    expect(byLocation.get('vienna')).toBe('income:2')
    expect(byLocation.get('lemberg')).toBe('victoryPoints:3')
    expect(byLocation.get('krakow')).toBe('victoryPoints:4')
  })
})
